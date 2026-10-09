// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ Ranked — Duel realtime layer
//
//  Everything that makes a 1v1 session work over Firebase Realtime Database:
//  presence, the quick-match queue, challenge links, the waiting room,
//  synchronised start, live opponent progress, and void-on-disconnect.
//
//  Data model (all paths top-level unless noted):
//
//    rankedPresence/{uid}        { name, rating, tier, at }        online roster
//    rankedQueue/{uid}           { uid, name, rating, tier, queuedAt, matchedDuelId }
//    duels/{duelId}
//      status      'waiting' | 'ready' | 'active' | 'complete' | 'void'
//      kind        'link' | 'quick'
//      seed        int            both clients build the same set from this
//      createdAt   ms
//      startAt     ms             server-clock instant both clients begin at
//      host        { uid, name, rating, tier }
//      guest       { uid, name, rating, tier }
//      players/{uid}
//        progress    0..10        index of the puzzle they are on
//        score       int
//        connected   bool         cleared by onDisconnect
//        finishedAt  ms
//        answers/{i} { answer, correct, ms, points }
//      result      { hostScore, guestScore, winnerUid, draw, voidedBy }
//
//  Both clients run the same logic; the host is only privileged in that it
//  writes the seed and the start instant. Scores are written by each player for
//  their own puzzles, and the result is settled by whichever client observes
//  both players finished — the settle write is idempotent so a double-settle
//  from both clients converges on the same values.
// ════════════════════════════════════════════════════════════════════════════

import {
    db, ref, get, set, update, onValue, off, remove,
    runTransaction, onDisconnect, serverTimestamp,
    PUZZLES_PER_SESSION, MAX_SESSION_SCORE,
} from './ranked-core.js';

// A queue entry older than this is stale — the player closed the tab without
// onDisconnect firing, or their claim raced and lost.
const QUEUE_STALE_MS    = 45000;
const PRESENCE_STALE_MS = 60000;
// Gap between both players being ready and the first puzzle appearing. Long
// enough to absorb clock skew and the countdown, short enough not to drag.
const DUEL_START_DELAY_MS = 4000;

// ── Server clock ─────────────────────────────────────────────────────────────
// Both clients must agree on when the session starts. Local clocks drift, so
// everything schedules against the server offset RTDB exposes.
let serverOffset = 0;
let offsetReady = null;

export function initServerClock() {
    if (offsetReady) return offsetReady;
    offsetReady = new Promise(resolve => {
        const offsetRef = ref(db, '.info/serverTimeOffset');
        onValue(offsetRef, snap => {
            const value = Number(snap.val());
            if (Number.isFinite(value)) serverOffset = value;
            resolve(serverOffset);
        }, () => resolve(0));
    });
    return offsetReady;
}

export function serverNow() {
    return Date.now() + serverOffset;
}

// ── Presence ─────────────────────────────────────────────────────────────────
let presenceRef = null;

export async function enterPresence(uid, profileSummary) {
    if (!uid) return;
    presenceRef = ref(db, 'rankedPresence/' + uid);
    try {
        await onDisconnect(presenceRef).remove();
        await set(presenceRef, { ...profileSummary, at: serverTimestamp() });
    } catch (_) {
        // Presence is cosmetic — never let it block entering the page.
    }
}

export async function leavePresence() {
    if (!presenceRef) return;
    try {
        await onDisconnect(presenceRef).cancel();
        await remove(presenceRef);
    } catch (_) {}
    presenceRef = null;
}

// Live count of players on the Ranked page. Entries whose heartbeat is stale
// are ignored rather than trusted, so a crashed tab does not inflate the number.
// The friends list needs to know *who* is online, not just how many, so it can
// mark a friend reachable. Same node, same staleness rule as the counter.
export function watchOnlineUids(callback) {
    const roster = ref(db, 'rankedPresence');
    const handler = onValue(roster, snap => {
        if (!snap.exists()) return callback([]);
        const now = serverNow();
        callback(Object.entries(snap.val())
            .filter(([, entry]) => {
                const at = Number(entry && entry.at);
                return !Number.isFinite(at) || (now - at) < PRESENCE_STALE_MS;
            })
            .map(([uid]) => uid));
    }, () => callback([]));
    return () => off(roster, 'value', handler);
}

export function watchOnlineCount(callback) {
    const roster = ref(db, 'rankedPresence');
    const handler = onValue(roster, snap => {
        if (!snap.exists()) return callback(0);
        const now = serverNow();
        const live = Object.values(snap.val()).filter(entry => {
            const at = Number(entry && entry.at);
            return !Number.isFinite(at) || (now - at) < PRESENCE_STALE_MS;
        });
        callback(live.length);
    }, () => callback(0));
    return () => off(roster, 'value', handler);
}

// ── Duel creation ────────────────────────────────────────────────────────────
function duelRef(duelId) {
    return ref(db, 'duels/' + duelId);
}

function newDuelId() {
    // Short, shareable, and unguessable enough for a link that lives for one
    // session. Not a security boundary — the rules still check membership.
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
}

function summarize(uid, name, profile, tier) {
    return { uid, name: name || 'Player', rating: profile.rating, tier: tier.name };
}

export async function createDuel({ uid, name, profile, tier, kind = 'link' }) {
    await initServerClock();
    const duelId = newDuelId();
    await set(duelRef(duelId), {
        status:    'waiting',
        kind,
        seed:      Math.floor(Math.random() * 4294967296),
        createdAt: serverTimestamp(),
        host:      summarize(uid, name, profile, tier),
        players:   { [uid]: { progress: 0, score: 0, connected: true } },
    });
    await armDisconnect(duelId, uid);
    return duelId;
}

// A player who vanishes mid-duel voids the session for both sides, so the
// remaining player is never charged a loss for someone else's dropped Wi-Fi.
async function armDisconnect(duelId, uid) {
    try {
        await onDisconnect(ref(db, 'duels/' + duelId + '/players/' + uid + '/connected')).set(false);
    } catch (_) {}
}

export async function joinDuel({ duelId, uid, name, profile, tier }) {
    await initServerClock();
    const snap = await get(duelRef(duelId));
    if (!snap.exists()) return { ok: false, error: 'That challenge link has expired.' };

    const duel = snap.val();
    if (duel.host && duel.host.uid === uid) return { ok: true, duel, role: 'host' };
    if (duel.guest && duel.guest.uid === uid) return { ok: true, duel, role: 'guest' };
    if (duel.guest) return { ok: false, error: 'This duel already has two players.' };
    if (duel.status !== 'waiting') return { ok: false, error: 'This duel is no longer open.' };

    // Claim the guest slot transactionally — two people opening the same link at
    // once must not both believe they joined.
    const claim = await runTransaction(duelRef(duelId), current => {
        if (!current || current.guest || current.status !== 'waiting') return current;
        current.guest  = summarize(uid, name, profile, tier);
        current.status = 'ready';
        current.players = current.players || {};
        current.players[uid] = { progress: 0, score: 0, connected: true };
        return current;
    });

    if (!claim.committed || !claim.snapshot.val() || claim.snapshot.val().guest?.uid !== uid) {
        return { ok: false, error: 'Someone else joined that duel first.' };
    }
    await armDisconnect(duelId, uid);
    return { ok: true, duel: claim.snapshot.val(), role: 'guest' };
}

// Host-only: both players are present, so publish the agreed puzzle set and
// fix the instant the session begins. Scheduling it a few seconds out means
// neither client starts before the other, whatever their latency.
export async function startDuel(duelId, puzzleKeys) {
    await initServerClock();
    await update(duelRef(duelId), {
        status:     'active',
        puzzleKeys: puzzleKeys,
        startAt:    serverNow() + DUEL_START_DELAY_MS,
    });
}

export function watchDuel(duelId, callback) {
    const node = duelRef(duelId);
    const handler = onValue(node, snap => callback(snap.exists() ? snap.val() : null));
    return () => off(node, 'value', handler);
}

export async function cancelDuel(duelId, uid) {
    try {
        const snap = await get(duelRef(duelId));
        if (!snap.exists()) return;
        const duel = snap.val();
        // Only tear the node down if nothing has been played yet.
        if (duel.status === 'waiting' && duel.host && duel.host.uid === uid) {
            await remove(duelRef(duelId));
        }
    } catch (_) {}
}

// ── In-session writes ────────────────────────────────────────────────────────
export async function pushDuelAnswer(duelId, uid, index, record, runningScore, progress) {
    const updates = {};
    updates['players/' + uid + '/answers/' + index] = record;
    updates['players/' + uid + '/score']    = runningScore;
    updates['players/' + uid + '/progress'] = progress;
    try { await update(duelRef(duelId), updates); } catch (_) {}
}

export async function markDuelFinished(duelId, uid, finalScore) {
    try {
        await update(duelRef(duelId), {
            ['players/' + uid + '/score']:      finalScore,
            ['players/' + uid + '/progress']:   PUZZLES_PER_SESSION,
            ['players/' + uid + '/finishedAt']: serverTimestamp(),
        });
    } catch (_) {}
}

export async function voidDuel(duelId, reason) {
    try {
        await update(duelRef(duelId), {
            status: 'void',
            result: { voidedBy: reason || 'disconnect', at: serverTimestamp() },
        });
    } catch (_) {}
}

// Settle the duel once both players have finished. Written through a
// transaction and guarded on status so whichever client gets there first wins
// and the second is a no-op — both then read the identical result.
export async function settleDuel(duelId) {
    const outcome = await runTransaction(duelRef(duelId), current => {
        if (!current || current.status === 'complete' || current.status === 'void') return current;
        const hostUid  = current.host && current.host.uid;
        const guestUid = current.guest && current.guest.uid;
        if (!hostUid || !guestUid) return current;

        const players    = current.players || {};
        const hostDone   = players[hostUid] && players[hostUid].finishedAt;
        const guestDone  = players[guestUid] && players[guestUid].finishedAt;
        if (!hostDone || !guestDone) return current;

        const hostScore  = Number(players[hostUid].score) || 0;
        const guestScore = Number(players[guestUid].score) || 0;
        current.status = 'complete';
        current.result = {
            hostScore,
            guestScore,
            draw:      hostScore === guestScore,
            winnerUid: hostScore === guestScore ? null : (hostScore > guestScore ? hostUid : guestUid),
            at:        Date.now(),
        };
        return current;
    });
    return outcome.committed ? outcome.snapshot.val() : null;
}

// ── Quick match ──────────────────────────────────────────────────────────────
// No dedicated matchmaking service: the queue is a node, and pairing is a
// transaction on the waiting player's own entry. Whoever arrives second does
// the claiming, which keeps the write path simple and avoids a lobby daemon.
//
// Returns a handle with { promise, cancel }. The promise resolves to
// { duelId, role } or rejects if cancelled.
export function quickMatch({ uid, name, profile, tier }) {
    let cancelled = false;
    let unsubscribe = null;
    let selfRef = ref(db, 'rankedQueue/' + uid);

    async function cleanup() {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        try { await onDisconnect(selfRef).cancel(); } catch (_) {}
        try { await remove(selfRef); } catch (_) {}
    }

    const promise = (async () => {
        await initServerClock();

        // 1. Look for someone already waiting.
        const queueSnap = await get(ref(db, 'rankedQueue'));
        const now = serverNow();
        const candidates = queueSnap.exists()
            ? Object.values(queueSnap.val()).filter(entry =>
                  entry && entry.uid && entry.uid !== uid && !entry.matchedDuelId &&
                  (now - (Number(entry.queuedAt) || 0)) < QUEUE_STALE_MS)
            : [];
        // Closest rating first, so a Pawn is not thrown at a Grandmaster when
        // several people happen to be waiting.
        candidates.sort((a, b) =>
            Math.abs((a.rating || 0) - profile.rating) - Math.abs((b.rating || 0) - profile.rating));

        for (const candidate of candidates) {
            if (cancelled) throw new Error('cancelled');
            const theirRef = ref(db, 'rankedQueue/' + candidate.uid);
            const duelId = newDuelId();

            // Claim them by stamping our duel id on their entry. If they were
            // already claimed, the transaction aborts and we try the next one.
            const claim = await runTransaction(theirRef, current => {
                if (!current || current.matchedDuelId) return current;
                current.matchedDuelId = duelId;
                return current;
            });
            const claimed = claim.committed && claim.snapshot.val() &&
                            claim.snapshot.val().matchedDuelId === duelId;
            if (!claimed) continue;

            // We are the host of the duel we just created for the pair.
            await set(duelRef(duelId), {
                status:    'ready',
                kind:      'quick',
                seed:      Math.floor(Math.random() * 4294967296),
                createdAt: serverTimestamp(),
                host:  summarize(uid, name, profile, tier),
                guest: {
                    uid:    candidate.uid,
                    name:   candidate.name || 'Player',
                    rating: candidate.rating || 0,
                    tier:   candidate.tier || 'Pawn',
                },
                players: {
                    [uid]:            { progress: 0, score: 0, connected: true },
                    [candidate.uid]:  { progress: 0, score: 0, connected: true },
                },
            });
            await armDisconnect(duelId, uid);
            await cleanup();
            return { duelId, role: 'host' };
        }

        // 2. Nobody waiting — join the queue and wait to be claimed.
        if (cancelled) throw new Error('cancelled');
        await set(selfRef, {
            uid,
            name:     name || 'Player',
            rating:   profile.rating,
            tier:     tier.name,
            queuedAt: serverTimestamp(),
        });
        try { await onDisconnect(selfRef).remove(); } catch (_) {}

        return await new Promise((resolve, reject) => {
            const handler = onValue(selfRef, async snap => {
                if (cancelled) return;
                const value = snap.val();
                if (!value) return;                       // our entry vanished
                if (!value.matchedDuelId) return;         // still waiting
                off(selfRef, 'value', handler);
                await armDisconnect(value.matchedDuelId, uid);
                await cleanup();
                resolve({ duelId: value.matchedDuelId, role: 'guest' });
            }, reject);
            unsubscribe = () => off(selfRef, 'value', handler);
        });
    })();

    return {
        promise,
        async cancel() {
            cancelled = true;
            await cleanup();
        },
    };
}

export { PUZZLES_PER_SESSION, MAX_SESSION_SCORE, DUEL_START_DELAY_MS };
