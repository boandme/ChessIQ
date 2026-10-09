// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ — Friends UI
//
//  The modal behind the Friends button on ranked.html: add by username, answer
//  incoming requests, see who is online, and challenge a friend straight into
//  a duel. Injects its own markup so ranked.html stays readable.
//
//  Data access lives in friends.js; this file is presentation and wiring only.
// ════════════════════════════════════════════════════════════════════════════

import { tierFor, TIERS } from './ranked-core.js';
import {
    lookupUsername, sendFriendRequest, acceptFriendRequest, declineFriendRequest,
    cancelFriendRequest, removeFriend, watchFriends, watchIncomingRequests,
    watchOutgoingRequests, REQUEST_RESULTS,
} from './friends.js';

const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const state = {
    me: null,
    friends: {},
    incoming: {},
    outgoing: {},
    online: new Set(),
    unsubs: [],
    onChallenge: null,
};

// ── Markup ───────────────────────────────────────────────────────────────────
const MARKUP = `
<div id="rk-friends-modal" class="rk-modal" hidden onclick="if(event.target===this) closeFriends()">
    <div class="rk-modal-card rk-friends-card" role="dialog" aria-modal="true" aria-labelledby="rk-friends-title">
        <button class="rk-modal-close" onclick="closeFriends()" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="rk-modal-eyebrow">Your circle</div>
        <h2 id="rk-friends-title">Friends</h2>

        <form class="rk-add-friend" onsubmit="return submitFriendSearch(event)">
            <input id="rk-friend-input" type="text" autocomplete="off" spellcheck="false"
                   maxlength="24" placeholder="Add by username" aria-label="Friend username">
            <button type="submit" class="rk-btn rk-btn-primary">Send request</button>
        </form>
        <div class="rk-add-status" id="rk-add-status" role="status" aria-live="polite"></div>

        <section class="rk-friends-section" id="rk-incoming-section" hidden>
            <h3>Requests <span class="rk-count" id="rk-incoming-count">0</span></h3>
            <div class="rk-friend-list" id="rk-incoming-list"></div>
        </section>

        <section class="rk-friends-section" id="rk-outgoing-section" hidden>
            <h3>Sent</h3>
            <div class="rk-friend-list" id="rk-outgoing-list"></div>
        </section>

        <section class="rk-friends-section">
            <h3>Friends <span class="rk-count" id="rk-friends-count">0</span></h3>
            <div class="rk-friend-list" id="rk-friends-list"></div>
        </section>
    </div>
</div>`;

function mount() {
    if (document.getElementById('rk-friends-modal')) return;
    document.body.insertAdjacentHTML('beforeend', MARKUP);
}

// ── Rendering ────────────────────────────────────────────────────────────────
function tierChip(rating, tierName) {
    const tier = Number.isFinite(Number(rating))
        ? tierFor(Number(rating))
        : (TIERS.find(t => t.name === tierName) || TIERS[0]);
    const label = tierName || tier.name;
    return `<span class="rk-friend-tier" style="--tier-accent:${tier.accent}">${tier.icon} ${esc(label)}</span>`;
}

function row({ uid, username, rating, tier, online, actions, meta }) {
    return `
    <div class="rk-friend-row${online ? ' is-online' : ''}" data-uid="${esc(uid)}">
        <span class="rk-friend-dot" title="${online ? 'Online now' : 'Offline'}"></span>
        <span class="rk-friend-avatar">${esc(String(username || '?').charAt(0).toUpperCase())}</span>
        <span class="rk-friend-id">
            <span class="rk-friend-name">${esc(username || 'Player')}</span>
            <span class="rk-friend-meta">${meta || tierChip(rating, tier)}</span>
        </span>
        <span class="rk-friend-actions">${actions}</span>
    </div>`;
}

function renderAll() {
    const incomingEntries = Object.entries(state.incoming);
    const outgoingEntries = Object.entries(state.outgoing);
    const friendEntries   = Object.entries(state.friends);

    // Incoming
    const inSection = document.getElementById('rk-incoming-section');
    if (inSection) {
        inSection.hidden = !incomingEntries.length;
        document.getElementById('rk-incoming-count').textContent = String(incomingEntries.length);
        document.getElementById('rk-incoming-list').innerHTML = incomingEntries
            .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
            .map(([uid, data]) => row({
                uid, username: data.username, rating: data.rating, tier: data.tier,
                online: state.online.has(uid),
                actions:
                    `<button class="rk-mini rk-mini-yes" onclick="acceptFriend('${esc(uid)}')">Accept</button>` +
                    `<button class="rk-mini" onclick="declineFriend('${esc(uid)}')">Decline</button>`,
            })).join('');
    }

    // Outgoing
    const outSection = document.getElementById('rk-outgoing-section');
    if (outSection) {
        outSection.hidden = !outgoingEntries.length;
        document.getElementById('rk-outgoing-list').innerHTML = outgoingEntries
            .map(([uid, data]) => row({
                uid, username: data.username, online: state.online.has(uid),
                meta: '<span class="rk-friend-pending">Awaiting reply</span>',
                actions: `<button class="rk-mini" onclick="cancelFriend('${esc(uid)}')">Cancel</button>`,
            })).join('');
    }

    // Friends — online first, then alphabetical.
    const list = document.getElementById('rk-friends-list');
    if (list) {
        document.getElementById('rk-friends-count').textContent = String(friendEntries.length);
        if (!friendEntries.length) {
            list.innerHTML = '<div class="rk-friends-empty">' +
                'No friends yet. Add someone by username above, and you can challenge ' +
                'them to a duel without passing a link around.</div>';
        } else {
            list.innerHTML = friendEntries
                .sort((a, b) => {
                    const onA = state.online.has(a[0]) ? 0 : 1;
                    const onB = state.online.has(b[0]) ? 0 : 1;
                    return onA - onB ||
                        String(a[1].username || '').localeCompare(String(b[1].username || ''));
                })
                .map(([uid, data]) => {
                    const online = state.online.has(uid);
                    return row({
                        uid, username: data.username, online,
                        meta: online
                            ? '<span class="rk-friend-online">Online now</span>'
                            : '<span class="rk-friend-offline">Offline</span>',
                        actions:
                            `<button class="rk-mini rk-mini-go"${online ? '' : ' disabled title="They need to be on the Ranked page"'} ` +
                                `onclick="challengeFriend('${esc(uid)}')">Challenge</button>` +
                            `<button class="rk-mini rk-mini-drop" onclick="dropFriend('${esc(uid)}')" ` +
                                `aria-label="Remove friend" title="Remove friend">&times;</button>`,
                    });
                }).join('');
        }
    }

    updateBadge();
}

// The button in the duel panel carries the pending-request count, so an
// unanswered request is visible without opening anything.
function updateBadge() {
    const badge = document.getElementById('rk-friends-badge');
    if (!badge) return;
    const count = Object.keys(state.incoming).length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
}

function setStatus(message, kind) {
    const node = document.getElementById('rk-add-status');
    if (!node) return;
    node.textContent = message || '';
    node.className = 'rk-add-status' + (kind ? ' is-' + kind : '');
}

// ── Public API ───────────────────────────────────────────────────────────────
export function initFriends({ me, onChallenge }) {
    mount();
    state.me = me;
    state.onChallenge = onChallenge;

    state.unsubs.forEach(fn => fn());
    state.unsubs = [
        watchFriends(me.uid, data => { state.friends = data; renderAll(); }),
        watchIncomingRequests(me.uid, data => { state.incoming = data; renderAll(); }),
        watchOutgoingRequests(me.uid, data => { state.outgoing = data; renderAll(); }),
    ];
    renderAll();
}

// Presence is owned by ranked-duel.js; it pushes the roster in here so the
// friends list and the online counter never disagree.
export function setOnlineUids(uids) {
    state.online = new Set(uids || []);
    renderAll();
}

export function updateMe(me) {
    state.me = { ...state.me, ...me };
}

export function teardownFriends() {
    state.unsubs.forEach(fn => fn());
    state.unsubs = [];
}

// ── Handlers ─────────────────────────────────────────────────────────────────
window.openFriends = function() {
    mount();
    const modal = document.getElementById('rk-friends-modal');
    if (modal) modal.hidden = false;
    setStatus('');
    const input = document.getElementById('rk-friend-input');
    if (input) { input.value = ''; input.focus(); }
};

window.closeFriends = function() {
    const modal = document.getElementById('rk-friends-modal');
    if (modal) modal.hidden = true;
};

window.submitFriendSearch = function(event) {
    event.preventDefault();
    const input = document.getElementById('rk-friend-input');
    const name = input ? input.value.trim() : '';
    if (!name) return false;
    if (!state.me) { setStatus('Sign in first.', 'bad'); return false; }

    setStatus('Looking up ' + name + '…');
    void (async () => {
        const result = await sendFriendRequest(state.me, name);
        const messages = {
            [REQUEST_RESULTS.OK]:        ['Request sent to ' + (result.username || name) + '.', 'good'],
            [REQUEST_RESULTS.NOT_FOUND]: ['No ChessIQ account called "' + name + '".', 'bad'],
            [REQUEST_RESULTS.SELF]:      ['That is you.', 'bad'],
            [REQUEST_RESULTS.ALREADY]:   ['You are already friends.', 'bad'],
            [REQUEST_RESULTS.PENDING]:   ['You have already asked them.', 'bad'],
            [REQUEST_RESULTS.INCOMING]:  ['They already asked you — check Requests above.', 'bad'],
            [REQUEST_RESULTS.FAILED]:    ['Could not send that request.', 'bad'],
        };
        const [message, kind] = messages[result.status] || ['Something went wrong.', 'bad'];
        setStatus(message, kind);
        if (result.status === REQUEST_RESULTS.OK && input) input.value = '';
    })();
    return false;
};

window.acceptFriend  = uid => { void acceptFriendRequest(state.me, uid); };
window.declineFriend = uid => { void declineFriendRequest(state.me, uid); };
window.cancelFriend  = uid => { void cancelFriendRequest(state.me, uid); };

window.dropFriend = function(uid) {
    const name = (state.friends[uid] || {}).username || 'this player';
    if (!window.confirm('Remove ' + name + ' from your friends?')) return;
    void removeFriend(state.me, uid);
};

window.challengeFriend = function(uid) {
    if (typeof state.onChallenge !== 'function') return;
    window.closeFriends();
    state.onChallenge(uid, (state.friends[uid] || {}).username || 'Player');
};

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.closeFriends();
});
