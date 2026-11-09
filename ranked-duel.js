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

// ── Queue timing ─────────────────────────────────────────────────────────────
// A queued player refreshes heartbeatAt on a timer, so "stale" now means the
// client really has stopped running rather than merely having waited a while.
//
// This is the fix for the bug where someone who had been waiting a few
// minutes became invisible: queuedAt was written once and never refreshed, and
// staleness was measured against it, so every entry aged out of its own queue
// after 45 seconds. The waiting player then had to cancel and rejoin to be
// matchable again. queuedAt is now immutable and used only for ordering;
// freshness is heartbeatAt's job.
const QUEUE_HEARTBEAT_MS = 8000;
const QUEUE_STALE_MS     = 26000;   // ~3 missed heartbeats
// A waiting player rescans on this interval. Pairing used to depend entirely
// on the newcomer noticing the waiter, so two players could sit in the queue
// together indefinitely with neither one looking.
const QUEUE_RESCAN_MS    = 2500;
// How long a claimed player waits for the claimer to publish the duel node
// before releasing the claim and going back to waiting.
const CLAIM_PUBLISH_MS   = 12000;

const PRESENCE_STALE_MS = 60000;
// Gap between both players being ready and the first puzzle appearing. Long
// enough to absorb clock skew and the countdown, short enough not to drag.
const DUEL_START_DELAY_MS = 4000;

// ── Write helpers ────────────────────────────────────────────────────────────
// A single undefined anywhere in an object makes the whole Firebase write
// throw, which previously took a session's result down with it. Strip them.
function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (v !== undefined) out[k] = clean(v);
        }
        return out;
    }
    return value;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Every write in a duel is load-bearing: a dropped one used to leave both
// players waiting on a result that could never arrive. Retry briefly, then
// report the failure to the caller rather than swallowing it.
async function writeWithRetry(label, fn, attempts = 4) {
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
        try {
            await fn();
            return { ok: true };
        } catch (error) {
            lastError = error;
            if (i < attempts - 1) await sleep(250 * Math.pow(2, i));
        }
    }
    console.error('[duel] ' + label + ' failed after ' + attempts + ' attempts', lastError);
    return { ok: false, error: lastError };
}

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
//
// onDisconnect is a one-shot: it fires when the socket drops and is then
// spent. Nothing used to re-arm it or set connected back to true, so a single
// momentary blip marked a player offline for the rest of the duel and the
// opponent voided a session both players were still happily playing. The
// watcher below re-arms and re-asserts on every reconnect.
async function armDisconnect(duelId, uid) {
    try {
        await onDisconnect(ref(db, 'duels/' + duelId + '/players/' + uid + '/connected')).set(false);
    } catch (_) {}
}

let connectionWatcher = null;

export function trackConnection(duelId, uid, onChange) {
    stopTrackingConnection();
    const node = ref(db, '.info/connected');
    const flag = ref(db, 'duels/' + duelId + '/players/' + uid + '/connected');
    const handler = onValue(node, async snap => {
        const online = snap.val() === true;
        if (typeof onChange === 'function') onChange(online);
        if (!online) return;
        // Order matters: arm the next disconnect before clearing the last
        // one's mark, so a drop between the two still leaves us flagged.
        await armDisconnect(duelId, uid);
        try { await set(flag, true); } catch (_) {}
    });
    connectionWatcher = () => off(node, 'value', handler);
    return stopTrackingConnection;
}

export function stopTrackingConnection() {
    if (connectionWatcher) { connectionWatcher(); connectionWatcher = null; }
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
    updates['players/' + uid + '/answers/' + index] = clean(record);
    updates['players/' + uid + '/score']    = runningScore;
    updates['players/' + uid + '/progress'] = progress;
    return writeWithRetry('pushDuelAnswer#' + index,
        () => update(duelRef(duelId), updates), 3);
}

// The single most important write in a duel. finishedAt is what settlement
// waits on, so if this is lost neither player can ever be given a result.
// It used to swallow its own failure; now it retries and tells the caller.
export async function markDuelFinished(duelId, uid, finalScore) {
    return writeWithRetry('markDuelFinished', () => update(duelRef(duelId), {
        ['players/' + uid + '/score']:      finalScore,
        ['players/' + uid + '/progress']:   PUZZLES_PER_SESSION,
        ['players/' + uid + '/finishedAt']: serverNow(),
    }), 6);
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
//
// `force` settles on whatever is recorded even though one side never wrote
// finishedAt. It is passed only once the session's maximum possible duration
// has elapsed, at which point an unfinished opponent cannot still be playing
// and waiting longer just strands both players on a spinner forever. Scoring
// what was actually answered is fairer than voiding, and it cannot be farmed:
// the abandoning player keeps whatever they earned.
export async function settleDuel(duelId, { force = false } = {}) {
    const outcome = await runTransaction(duelRef(duelId), current => {
        if (!current || current.status === 'complete' || current.status === 'void') return current;
        const hostUid  = current.host && current.host.uid;
        const guestUid = current.guest && current.guest.uid;
        if (!hostUid || !guestUid) return current;

        const players    = current.players || {};
        const hostDone   = players[hostUid] && players[hostUid].finishedAt;
        const guestDone  = players[guestUid] && players[guestUid].finishedAt;
        if (!force && (!hostDone || !guestDone)) return current;
        // Even forced, one side must have actually finished, so an abandoned
        // duel that nobody completed is never recorded as a result.
        if (force && !hostDone && !guestDone) return current;

        const hostScore  = Number(players[hostUid] && players[hostUid].score) || 0;
        const guestScore = Number(players[guestUid] && players[guestUid].score) || 0;
        current.status = 'complete';
        current.result = {
            hostScore,
            guestScore,
            draw:      hostScore === guestScore,
            winnerUid: hostScore === guestScore ? null : (hostScore > guestScore ? hostUid : guestUid),
            forced:    Boolean(force && (!hostDone || !guestDone)),
            at:        Date.now(),
        };
        return current;
    });
    if (!outcome.committed) {
        console.warn('[duel] settle transaction did not commit for ' + duelId);
        return null;
    }
    return outcome.snapshot.val();
}

// == Quick match =============================================================
// No dedicated matchmaking service: the queue is a node, and pairing happens
// client side. Four rules make that safe and keep it from stalling.
//
//  1. Heartbeat. A queued player refreshes heartbeatAt on a timer, and
//     freshness is measured against that rather than against the join time.
//     This is the fix for the reported bug: queuedAt was written once and
//     never refreshed, so after QUEUE_STALE_MS every waiting player aged out
//     of the queue they were still sitting in, became invisible to newcomers,
//     and had to cancel and rejoin to be matchable again.
//
//  2. Join before scanning, so a player who arrives while we are mid-scan can
//     see us and claim us, instead of both of us reading an empty queue and
//     both settling down to wait.
//
//  3. Exactly one player of any pair is the claimant, decided by comparing
//     immutable queuedAt values with uid as the tiebreak. Without this,
//     two clients scanning at the same instant each claim the other, each
//     publishes a duel, and the two players end up in different sessions.
//     The later joiner claims, which keeps the common case instant: a
//     newcomer pairs with a waiter on its very first scan.
//
//  4. Everyone rescans on a timer. Pairing used to depend entirely on the
//     newcomer noticing the waiter, so a single missed pairing was permanent.
//
// Returns a handle with { promise, cancel }. The promise resolves to
// { duelId, role } or rejects if cancelled.

function queueRef(uid) {
    return ref(db, 'rankedQueue/' + uid);
}

function queueEntryIsFresh(entry, now) {
    if (!entry || !entry.uid) return false;
    const beat = Number(entry.heartbeatAt);
    if (!Number.isFinite(beat)) {
        // Written by an older client with no heartbeat field. Fall back to
        // queuedAt so those players stay matchable rather than invisible.
        const queued = Number(entry.queuedAt);
        return !Number.isFinite(queued) || (now - queued) < QUEUE_STALE_MS;
    }
    return (now - beat) < QUEUE_STALE_MS;
}

// Deliberately ignores heartbeatAt: it moves, and an ordering that can flip
// between two clients' scans is exactly what lets both of them claim.
function iAmClaimantFor(me, them) {
    const mine   = Number(me.queuedAt) || 0;
    const theirs = Number(them.queuedAt) || 0;
    if (mine !== theirs) return mine > theirs;
    return String(me.uid) > String(them.uid);
}

function queueEntryFor(uid, name, profile, tier, now) {
    return clean({
        uid,
        name:        name || 'Player',
        rating:      profile.rating,
        tier:        tier.name,
        queuedAt:    now,
        heartbeatAt: now,
    });
}

export function quickMatch({ uid, name, profile, tier, onStatus }) {
    let cancelled   = false;
    let heartbeat   = null;
    let unwatchSelf = null;
    // Set by the watcher below the moment a claimant stamps our entry. A plain
    // flag rather than a promise, because a claim can be released and the loop
    // has to be able to go back to waiting for the next one.
    let pendingClaim = null;
    // Duels a claimant stamped on us but never published. Never retried.
    const deadClaims = new Set();

    const selfRef = queueRef(uid);
    const status = text => { if (typeof onStatus === 'function') onStatus(text); };

    async function cleanup() {
        if (heartbeat)   { clearInterval(heartbeat); heartbeat = null; }
        if (unwatchSelf) { unwatchSelf(); unwatchSelf = null; }
        try { await onDisconnect(selfRef).cancel(); } catch (_) {}
        try { await remove(selfRef); } catch (_) {}
    }

    // Scan the queue and, if we are the designated claimant for the best
    // candidate, stamp them and publish the duel. Returns a duelId or null.
    async function tryClaimSomeone() {
        let snap;
        try { snap = await get(ref(db, 'rankedQueue')); } catch (_) { return null; }
        if (!snap.exists()) return null;

        const all  = snap.val();
        const mine = all[uid];
        if (!mine) {
            // Our entry went away under us. Put it back; the next pass scans.
            await set(selfRef, queueEntryFor(uid, name, profile, tier, serverNow()))
                .catch(() => {});
            return null;
        }
        if (mine.matchedDuelId) return null;   // someone is claiming us

        const me  = { uid, queuedAt: Number(mine.queuedAt) || 0 };
        const now = serverNow();
        const candidates = Object.values(all).filter(other =>
            other && other.uid && other.uid !== uid &&
            !other.matchedDuelId &&
            queueEntryIsFresh(other, now) &&
            iAmClaimantFor(me, other));
        // Closest rating first, so a Pawn is not thrown at a Grandmaster when
        // several people happen to be waiting.
        candidates.sort((x, y) =>
            Math.abs((x.rating || 0) - profile.rating) -
            Math.abs((y.rating || 0) - profile.rating));

        for (const candidate of candidates) {
            if (cancelled) return null;
            const duelId   = newDuelId();
            const theirRef = queueRef(candidate.uid);

            // The rules only allow writing matchedDuelId while it is empty,
            // so a claim can never be stolen or overwritten.
            let claim;
            try {
                claim = await runTransaction(theirRef, current => {
                    if (!current || current.matchedDuelId) return current;
                    current.matchedDuelId = duelId;
                    return current;
                });
            } catch (_) { continue; }

            const got = claim.committed && claim.snapshot.val() &&
                        claim.snapshot.val().matchedDuelId === duelId;
            if (!got) continue;

            // Publish immediately. The claimed player is already waiting on
            // this node, so a failure here has to release the claim rather
            // than leave them stranded on a duel that will never exist.
            const published = await writeWithRetry('publishDuel', () =>
                set(duelRef(duelId), clean({
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
                        [uid]:           { progress: 0, score: 0, connected: true },
                        [candidate.uid]: { progress: 0, score: 0, connected: true },
                    },
                })), 3);

            if (!published.ok) {
                await update(theirRef, { matchedDuelId: null }).catch(() => {});
                continue;
            }
            await armDisconnect(duelId, uid);
            return duelId;
        }
        return null;
    }

    const promise = (async () => {
        await initServerClock();
        if (cancelled) throw new Error('cancelled');

        // 1. Join first, so we are visible to anyone scanning right now.
        const joined = await writeWithRetry('joinQueue', () =>
            set(selfRef, queueEntryFor(uid, name, profile, tier, serverNow())));
        if (!joined.ok) throw new Error('Could not join the matchmaking queue.');
        try { await onDisconnect(selfRef).remove(); } catch (_) {}

        // 2. Keep the entry alive. This is what stops a long wait from being
        //    read as a crashed tab.
        heartbeat = setInterval(() => {
            update(selfRef, { heartbeatAt: serverNow() }).catch(() => {});
        }, QUEUE_HEARTBEAT_MS);

        // 3. Notice the instant someone claims us.
        const handler = onValue(selfRef, snap => {
            const value = snap.val();
            if (!value) return;
            const id = value.matchedDuelId ? String(value.matchedDuelId) : null;
            pendingClaim = (id && !deadClaims.has(id)) ? id : null;
        }, () => {});
        unwatchSelf = () => off(selfRef, 'value', handler);

        // 4. Scan, claim, wait, repeat.
        while (!cancelled) {
            if (pendingClaim) {
                const duelId = pendingClaim;
                status('Opponent found');
                if (await waitForDuel(duelId)) {
                    await armDisconnect(duelId, uid);
                    await cleanup();
                    return { duelId, role: 'guest' };
                }
                // Claimed, then abandoned before the duel was published.
                console.warn('[duel] claim ' + duelId + ' never produced a duel; releasing');
                deadClaims.add(duelId);
                pendingClaim = null;
                await update(selfRef, { matchedDuelId: null }).catch(() => {});
                status('Searching for an opponent…');
                await sleep(QUEUE_RESCAN_MS);
                continue;
            }

            const hosted = await tryClaimSomeone();
            if (cancelled) break;
            if (hosted) {
                status('Opponent found');
                await cleanup();
                return { duelId: hosted, role: 'host' };
            }

            await sleep(QUEUE_RESCAN_MS);
        }
        throw new Error('cancelled');
    })();

    return {
        promise,
        async cancel() {
            cancelled = true;
            await cleanup();
        },
    };
}

// A claimed player waits here for the claimant to publish the duel node. The
// old code resolved the moment matchedDuelId appeared, which let the guest try
// to open a duel that did not exist yet.
async function waitForDuel(duelId) {
    const node = duelRef(duelId);
    const deadline = Date.now() + CLAIM_PUBLISH_MS;
    while (Date.now() < deadline) {
        try {
            const snap = await get(node);
            if (snap.exists()) return true;
        } catch (_) {}
        await sleep(400);
    }
    return false;
}

// Sweeps entries whose client has stopped heartbeating. onDisconnect covers a
// clean socket drop; this covers a tab suspended or killed in a way that left
// its entry behind, which otherwise shows as a phantom opponent nobody can
// match with and which skews the "players searching" count.
export async function pruneQueue() {
    try {
        const snap = await get(ref(db, 'rankedQueue'));
        if (!snap.exists()) return 0;
        const now  = serverNow();
        const dead = Object.entries(snap.val())
            .filter(([, entry]) => !queueEntryIsFresh(entry, now));
        await Promise.all(dead.map(([key]) => remove(queueRef(key)).catch(() => {})));
        return dead.length;
    } catch (_) { return 0; }
}

// Live count of players actually searching, used to tell a waiting player
// whether they are alone in the queue instead of leaving them guessing.
export function watchQueueSize(callback) {
    const node = ref(db, 'rankedQueue');
    const handler = onValue(node, snap => {
        if (!snap.exists()) return callback(0);
        const now = serverNow();
        callback(Object.values(snap.val()).filter(e => queueEntryIsFresh(e, now)).length);
    }, () => callback(0));
    return () => off(node, 'value', handler);
}

export { PUZZLES_PER_SESSION, MAX_SESSION_SCORE, DUEL_START_DELAY_MS, QUEUE_RESCAN_MS };
