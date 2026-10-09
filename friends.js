// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ — Friends
//
//  The social layer behind Ranked duels: find a player by username, send and
//  answer friend requests, see who is online, and challenge a friend directly
//  without copying a link anywhere.
//
//  Data model (all under the existing user record so no new top-level node and
//  no new read surface is introduced):
//
//    usernames/{lowercase}              -> uid        (already existed, reused)
//    users/{uid}/friends/{friendUid}    { username, since }
//    users/{uid}/friendRequests/in/{fromUid}  { username, rating, tier, at }
//    users/{uid}/friendRequests/out/{toUid}   { username, at }
//    users/{uid}/duelInvites/{duelId}   { from, fromUsername, fromRating,
//                                         fromTier, at }
//
//  Writing into someone else's subtree is deliberate and narrow: a sender may
//  create exactly one request in the recipient's inbox, and an accepting
//  player may create the reciprocal friends entry. Both are constrained in
//  database.rules.json; see the comments there.
// ════════════════════════════════════════════════════════════════════════════

import { db, ref, get, set, update, remove, onValue, off, serverTimestamp } from './ranked-core.js';

// ── Lookup ───────────────────────────────────────────────────────────────────
// Usernames are reserved case-insensitively at signup under usernames/{lower},
// which makes this a single indexed read rather than a scan of every account.
export async function lookupUsername(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    if (!/^[a-z0-9_-]{1,24}$/.test(key)) return null;
    try {
        const snap = await get(ref(db, 'usernames/' + key));
        return snap.exists() ? String(snap.val()) : null;
    } catch (_) {
        return null;
    }
}

export async function readPublicProfile(uid) {
    try {
        const snap = await get(ref(db, 'users/' + uid));
        if (!snap.exists()) return null;
        const data = snap.val();
        const ranked = data.ranked || {};
        return {
            uid,
            username: data.username || 'Player',
            pr:       Number(data.pr) || 0,
            rating:   Number(ranked.rating),
            tier:     ranked.tier || null,
        };
    } catch (_) {
        return null;
    }
}

// ── Requests ─────────────────────────────────────────────────────────────────
export const REQUEST_RESULTS = {
    OK:        'ok',
    NOT_FOUND: 'not-found',
    SELF:      'self',
    ALREADY:   'already-friends',
    PENDING:   'already-pending',
    INCOMING:  'they-asked-you',
    FAILED:    'failed',
};

// Writes both halves in one update so a request can never exist on one side
// only — the sender's "pending" list and the recipient's inbox move together.
export async function sendFriendRequest(me, targetUsername) {
    const targetUid = await lookupUsername(targetUsername);
    if (!targetUid) return { status: REQUEST_RESULTS.NOT_FOUND };
    if (targetUid === me.uid) return { status: REQUEST_RESULTS.SELF };

    const [friendSnap, incomingSnap, outgoingSnap] = await Promise.all([
        get(ref(db, 'users/' + me.uid + '/friends/' + targetUid)),
        get(ref(db, 'users/' + me.uid + '/friendRequests/in/' + targetUid)),
        get(ref(db, 'users/' + me.uid + '/friendRequests/out/' + targetUid)),
    ]);
    if (friendSnap.exists())   return { status: REQUEST_RESULTS.ALREADY, uid: targetUid };
    if (incomingSnap.exists()) return { status: REQUEST_RESULTS.INCOMING, uid: targetUid };
    if (outgoingSnap.exists()) return { status: REQUEST_RESULTS.PENDING, uid: targetUid };

    const target = await readPublicProfile(targetUid);
    const now = Date.now();
    try {
        await update(ref(db), {
            ['users/' + me.uid + '/friendRequests/out/' + targetUid]: {
                username: target ? target.username : targetUsername, at: now,
            },
            ['users/' + targetUid + '/friendRequests/in/' + me.uid]: {
                username: me.username, rating: me.rating ?? null, tier: me.tier ?? null, at: now,
            },
        });
        return { status: REQUEST_RESULTS.OK, uid: targetUid, username: target ? target.username : targetUsername };
    } catch (_) {
        return { status: REQUEST_RESULTS.FAILED };
    }
}

// Accepting writes four paths atomically: both friends entries and the removal
// of both request entries. A partial apply would leave a one-sided friendship.
export async function acceptFriendRequest(me, fromUid) {
    const them = await readPublicProfile(fromUid);
    const now = Date.now();
    try {
        await update(ref(db), {
            ['users/' + me.uid + '/friends/' + fromUid]: {
                username: them ? them.username : 'Player', since: now,
            },
            ['users/' + fromUid + '/friends/' + me.uid]: {
                username: me.username, since: now,
            },
            ['users/' + me.uid + '/friendRequests/in/' + fromUid]: null,
            ['users/' + fromUid + '/friendRequests/out/' + me.uid]: null,
        });
        return true;
    } catch (_) {
        return false;
    }
}

export async function declineFriendRequest(me, fromUid) {
    try {
        await update(ref(db), {
            ['users/' + me.uid + '/friendRequests/in/' + fromUid]: null,
            ['users/' + fromUid + '/friendRequests/out/' + me.uid]: null,
        });
        return true;
    } catch (_) {
        return false;
    }
}

export async function cancelFriendRequest(me, toUid) {
    try {
        await update(ref(db), {
            ['users/' + me.uid + '/friendRequests/out/' + toUid]: null,
            ['users/' + toUid + '/friendRequests/in/' + me.uid]: null,
        });
        return true;
    } catch (_) {
        return false;
    }
}

export async function removeFriend(me, friendUid) {
    try {
        await update(ref(db), {
            ['users/' + me.uid + '/friends/' + friendUid]: null,
            ['users/' + friendUid + '/friends/' + me.uid]: null,
        });
        return true;
    } catch (_) {
        return false;
    }
}

// ── Live views ───────────────────────────────────────────────────────────────
function watchPath(path, callback) {
    const node = ref(db, path);
    const handler = onValue(node, snap => callback(snap.exists() ? snap.val() : {}), () => callback({}));
    return () => off(node, 'value', handler);
}

export function watchFriends(uid, callback) {
    return watchPath('users/' + uid + '/friends', callback);
}

export function watchIncomingRequests(uid, callback) {
    return watchPath('users/' + uid + '/friendRequests/in', callback);
}

export function watchOutgoingRequests(uid, callback) {
    return watchPath('users/' + uid + '/friendRequests/out', callback);
}

export function watchDuelInvites(uid, callback) {
    return watchPath('users/' + uid + '/duelInvites', callback);
}

// ── Direct challenges ────────────────────────────────────────────────────────
// A friend challenge is an ordinary duel plus a pointer dropped in the other
// player's invite list, so they never have to be handed a URL.
export async function inviteFriendToDuel({ duelId, me, friendUid }) {
    try {
        await set(ref(db, 'users/' + friendUid + '/duelInvites/' + duelId), {
            from:         me.uid,
            fromUsername: me.username,
            fromRating:   me.rating ?? null,
            fromTier:     me.tier ?? null,
            at:           serverTimestamp(),
        });
        return true;
    } catch (_) {
        return false;
    }
}

export async function clearDuelInvite(uid, duelId) {
    try {
        await remove(ref(db, 'users/' + uid + '/duelInvites/' + duelId));
        return true;
    } catch (_) {
        return false;
    }
}

// Invites outlive the duel they point at if the host walks away, so anything
// older than this is treated as dead and swept on sight.
export const INVITE_TTL_MS = 10 * 60 * 1000;

export function isInviteFresh(invite) {
    const at = Number(invite && invite.at);
    if (!Number.isFinite(at)) return true;   // serverTimestamp not yet resolved
    return (Date.now() - at) < INVITE_TTL_MS;
}
