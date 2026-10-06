// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ Ranked — view controller
//
//  Owns the four sequential states of ranked.html (mode select, pre-session,
//  live session, post-game review) and the session runner shared by Blitz Solo
//  and Duel. Scoring and rating maths live in ranked-core.js; the realtime duel
//  plumbing lives in ranked-duel.js.
// ════════════════════════════════════════════════════════════════════════════

import {
    auth, db, ref, get, onAuthStateChanged,
    PUZZLES_PER_SESSION, COUNTDOWN_SECONDS, MAX_SESSION_SCORE, SOLO_MIN_CORRECT,
    timeLimitFor, scorePuzzle, computeSoloDelta, computeDuelDelta,
    tierFor, tierProgress, nextTierFor, CURRENT_SEASON, TIERS,
    loadRankedProfile, applyRatingDelta, recordSession,
    loadPositions, buildThemeIndex, spinnableThemes, buildSoloSet, buildDuelSet,
    getPositionSVG, correctAnswerFor, turnLabelFor, formatEval, explanationOf,
    difficultyOf, seededRandom, shuffle, escapeHTML,
} from './ranked-core.js';

import {
    initServerClock, serverNow, enterPresence, leavePresence, watchOnlineCount,
    createDuel, joinDuel, startDuel, watchDuel, cancelDuel,
    pushDuelAnswer, markDuelFinished, voidDuel, settleDuel, quickMatch,
} from './ranked-duel.js';

const ANSWERS = ['White Winning', 'Equal', 'Black Winning'];

// ── Page state ───────────────────────────────────────────────────────────────
const state = {
    uid: null,
    username: 'Player',
    profile: null,
    tier: null,
    positions: null,
    themeIndex: null,
    themes: [],
    // Active session
    mode: null,            // 'solo' | 'duel'
    set: [],               // positions in play order
    index: 0,
    score: 0,
    results: [],
    puzzleStartedAt: 0,
    tickTimer: null,
    advanceTimer: null,
    locked: false,
    // Duel
    duelId: null,
    duelRole: null,
    duel: null,
    unwatchDuel: null,
    matchHandle: null,
    unwatchOnline: null,
    settled: false,
};

const el = id => document.getElementById(id);

function showView(name) {
    ['gate', 'select', 'pre', 'session', 'review'].forEach(view => {
        const node = el('view-' + view);
        if (node) node.hidden = (view !== name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Auth ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
    const emailUser = user && user.providerData.some(p => p.providerId === 'password');
    if (!user || (emailUser && !user.emailVerified)) {
        showView('gate');
        return;
    }

    state.uid = user.uid;
    const snap = await get(ref(db, 'users/' + state.uid));
    const record = snap.exists() ? snap.val() : {};
    state.username = (typeof record.username === 'string' && record.username.trim())
        ? record.username.trim()
        : (user.displayName || 'Player');

    state.profile = await loadRankedProfile(state.uid);
    state.tier    = tierFor(state.profile.rating);

    renderIdentity(record);
    showView('select');

    await initServerClock();
    await enterPresence(state.uid, {
        name: state.username, rating: state.profile.rating, tier: state.tier.name,
    });
    state.unwatchOnline = watchOnlineCount(count => {
        const node = el('duel-online');
        if (node) node.textContent = String(Math.max(1, count));
    });

    try {
        state.positions  = await loadPositions();
        state.themeIndex = buildThemeIndex(state.positions);
        state.themes     = spinnableThemes(state.themeIndex);
        setSelectReady(true);
    } catch (err) {
        setSelectError('Could not load positions. Refresh to try again.');
    }

    // A challenge link lands here with ?duel=XXXX.
    const invite = new URLSearchParams(location.search).get('duel');
    if (invite) void acceptInvite(invite.trim().toUpperCase());
});

window.addEventListener('pagehide', () => { void leavePresence(); });

function renderIdentity(record) {
    const pair = el('rating-pair');
    if (pair) pair.style.display = 'flex';
    const badge = el('user-badge');
    const signin = el('signin-btn');
    if (badge) badge.style.display = 'flex';
    if (signin) signin.style.display = 'none';
    const nameEl = el('header-username');
    if (nameEl) nameEl.textContent = state.username;

    const pr = Number(record && record.pr);
    const prEl = el('topbar-pr');
    if (prEl) prEl.textContent = Number.isFinite(pr) ? String(pr) : '—';

    paintRating();
}

// The topbar carries both ratings: PR in the standard treatment, RR with the
// gold glow and tier mark so Ranked reads as the flashier of the two.
function paintRating() {
    if (!state.profile) return;
    state.tier = tierFor(state.profile.rating);

    const rrEl   = el('topbar-rr');
    const markEl = el('topbar-tier-mark');
    const nameEl = el('topbar-tier-name');
    if (rrEl)   rrEl.textContent   = String(state.profile.rating);
    if (markEl) markEl.textContent = state.tier.icon;
    if (nameEl) nameEl.textContent = state.tier.name;

    const wrap = el('topbar-rr-wrap');
    if (wrap) wrap.style.setProperty('--tier-accent', state.tier.accent);

    // Duel panel mirrors the same numbers.
    const panelRating = el('duel-rating');
    if (panelRating) panelRating.textContent = String(state.profile.rating);
    const panelTier = el('duel-tier');
    if (panelTier) {
        panelTier.textContent = state.tier.icon + ' ' + state.tier.name;
        panelTier.style.setProperty('--tier-accent', state.tier.accent);
    }

    const next = nextTierFor(state.profile.rating);
    const fill = el('duel-tier-fill');
    if (fill) fill.style.width = Math.round(tierProgress(state.profile.rating) * 100) + '%';
    const hint = el('duel-tier-hint');
    if (hint) {
        hint.textContent = next
            ? (next.min - state.profile.rating) + ' RR to ' + next.name
            : 'Top of the ladder';
    }
    const season = el('duel-season');
    if (season) season.textContent = CURRENT_SEASON.name;

    renderSeasonBadges();
}

// Closed-season badges. Written once by normalizeRankedProfile at rollover and
// never recomputed, so a badge always reflects the tier actually held when that
// season ended.
const SEASON_NAMES = { 'winter-2026': 'Winter 2026' };
function seasonLabel(id) {
    return SEASON_NAMES[id] || String(id || '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function renderSeasonBadges() {
    const wrap = el('rk-badges');
    const list = el('rk-badges-list');
    if (!wrap || !list) return;

    const badges = Object.values((state.profile && state.profile.badges) || {})
        .filter(badge => badge && badge.season)
        .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));

    wrap.hidden = !badges.length;
    if (!badges.length) return;

    list.innerHTML = badges.map(badge => {
        const tier = TIERS.find(t => t.name === badge.tier) || TIERS[0];
        return '<div class="rk-badge" style="--tier-accent:' + tier.accent + '">' +
            '<span class="rk-badge-icon">' + tier.icon + '</span>' +
            '<span class="rk-badge-text">' +
                '<span class="rk-badge-season">' + escapeHTML(seasonLabel(badge.season)) + '</span>' +
                '<span class="rk-badge-tier">' + escapeHTML(badge.tier || 'Pawn') + '</span>' +
            '</span>' +
        '</div>';
    }).join('');
}

function setSelectReady(ready) {
    ['btn-solo', 'btn-duel-quick', 'btn-duel-link'].forEach(id => {
        const node = el(id);
        if (node) node.disabled = !ready;
    });
    const note = el('select-note');
    if (note) note.textContent = ready ? '' : 'Loading positions…';
}

function setSelectError(message) {
    const note = el('select-note');
    if (note) note.textContent = message;
}

// ════════════════════════════════════════════════════════════════════════════
//  BLITZ SOLO — theme wheel
// ════════════════════════════════════════════════════════════════════════════
// The spin is honest: a uniform draw across every theme with a big enough pool.
// It is deliberately NOT weighted toward the player's weak themes — the moment
// has to feel unpredictable, and a rigged wheel would be noticed.
let wheelAnimation = null;

window.startSolo = function() {
    if (!state.positions || !state.themes.length) return;
    state.mode = 'solo';
    showView('pre');
    el('pre-duel').hidden = true;
    el('pre-wheel').hidden = false;
    spinThemeWheel();
};

function spinThemeWheel() {
    const strip   = el('wheel-strip');
    const resultA = el('wheel-theme-a');
    const resultB = el('wheel-theme-b');
    const resultWrap = el('wheel-result');
    const startBtn = el('wheel-start');
    if (!strip) return;

    resultWrap.hidden = true;
    startBtn.hidden = true;

    const picked = shuffle(state.themes).slice(0, 2);
    state.sessionThemes = picked;

    // Build a long strip of random labels ending on the two winners, then slide
    // it — cheaper and smoother than rotating a real wheel, and it reads the
    // same way.
    const reelLength = 28;
    const labels = [];
    for (let i = 0; i < reelLength; i++) {
        labels.push(state.themes[Math.floor(Math.random() * state.themes.length)]);
    }
    labels[reelLength - 2] = picked[0];
    labels[reelLength - 1] = picked[1];

    strip.innerHTML = labels
        .map(label => '<div class="wheel-cell">' + escapeHTML(label) + '</div>')
        .join('');
    strip.style.transition = 'none';
    strip.style.transform  = 'translateY(0)';

    const cellHeight = 56;
    const travel = (reelLength - 2) * cellHeight;

    if (wheelAnimation) clearTimeout(wheelAnimation);
    requestAnimationFrame(() => {
        strip.style.transition = 'transform 3.2s cubic-bezier(0.12, 0.72, 0.16, 1)';
        strip.style.transform  = 'translateY(-' + travel + 'px)';
    });

    wheelAnimation = setTimeout(() => {
        resultA.textContent = picked[0];
        resultB.textContent = picked[1];
        resultWrap.hidden = false;
        startBtn.hidden = false;
    }, 3300);
}

window.beginSoloSession = function() {
    const themes = state.sessionThemes || [];
    state.set = buildSoloSet(state.positions, state.themeIndex, themes);
    beginSession('solo');
};

// ════════════════════════════════════════════════════════════════════════════
//  DUEL — entry points
// ════════════════════════════════════════════════════════════════════════════
window.startQuickMatch = async function() {
    if (!state.positions) return;
    state.mode = 'duel';
    showView('pre');
    el('pre-wheel').hidden = true;
    el('pre-duel').hidden = false;
    setDuelStage('searching', 'Searching for an opponent…', '');
    el('duel-link-row').hidden = true;

    state.matchHandle = quickMatch({
        uid: state.uid, name: state.username, profile: state.profile, tier: state.tier,
    });

    try {
        const { duelId, role } = await state.matchHandle.promise;
        state.matchHandle = null;
        enterDuel(duelId, role);
    } catch (err) {
        state.matchHandle = null;
        if (String(err && err.message) !== 'cancelled') {
            setDuelStage('error', 'Matchmaking failed.', 'Try again, or send a challenge link instead.');
        }
    }
};

window.createChallengeLink = async function() {
    if (!state.positions) return;
    state.mode = 'duel';
    showView('pre');
    el('pre-wheel').hidden = true;
    el('pre-duel').hidden = false;
    setDuelStage('waiting', 'Waiting for your opponent…', 'Send them this link. The duel starts the moment they join.');

    const duelId = await createDuel({
        uid: state.uid, name: state.username, profile: state.profile,
        tier: state.tier, kind: 'link',
    });
    const url = location.origin + location.pathname + '?duel=' + duelId;
    el('duel-link-input').value = url;
    el('duel-link-row').hidden = false;

    enterDuel(duelId, 'host');
};

async function acceptInvite(duelId) {
    state.mode = 'duel';
    showView('pre');
    el('pre-wheel').hidden = true;
    el('pre-duel').hidden = false;
    el('duel-link-row').hidden = true;
    setDuelStage('joining', 'Joining duel…', '');

    const result = await joinDuel({
        duelId, uid: state.uid, name: state.username,
        profile: state.profile, tier: state.tier,
    });
    if (!result.ok) {
        setDuelStage('error', 'Could not join', result.error);
        return;
    }
    enterDuel(duelId, result.role);
}

window.copyDuelLink = async function() {
    const input = el('duel-link-input');
    if (!input) return;
    try {
        await navigator.clipboard.writeText(input.value);
    } catch (_) {
        input.select();
        document.execCommand('copy');
    }
    const btn = el('duel-link-copy');
    if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = original; }, 1400);
    }
};

window.cancelPreSession = async function() {
    if (state.matchHandle) { await state.matchHandle.cancel(); state.matchHandle = null; }
    if (state.unwatchDuel) { state.unwatchDuel(); state.unwatchDuel = null; }
    if (state.duelId) { await cancelDuel(state.duelId, state.uid); state.duelId = null; }
    showView('select');
};

function setDuelStage(kind, title, detail) {
    el('duel-stage').dataset.kind = kind;
    el('duel-stage-title').textContent = title;
    el('duel-stage-detail').textContent = detail || '';
}

// Both clients watch the duel node. The host starts it once a guest appears;
// both wait for `startAt` and begin together.
function enterDuel(duelId, role) {
    state.duelId   = duelId;
    state.duelRole = role;
    state.settled  = false;

    if (state.unwatchDuel) state.unwatchDuel();
    state.unwatchDuel = watchDuel(duelId, duel => {
        if (!duel) return;
        state.duel = duel;

        if (duel.status === 'void') {
            handleVoid();
            return;
        }

        if (duel.status === 'ready') {
            renderWaitingRoom(duel);
            // The host is the single writer for both the puzzle set and the
            // start instant, so there is no race over either.
            if (role === 'host' && !state.duelSetPublished) {
                state.duelSetPublished = true;
                const rng = seededRandom(Number(duel.seed) || 1);
                const keys = buildDuelSet(state.positions, rng).map(pos => pos._key);
                void startDuel(duelId, keys);
            }
            return;
        }

        if (duel.status === 'active' && !state.sessionRunning) {
            renderWaitingRoom(duel);
            scheduleDuelStart(duel);
            return;
        }

        if (state.sessionRunning) {
            paintOpponentProgress(duel);
            // If the opponent drops mid-session, the session is voided and
            // nobody's rating moves.
            const opponent = opponentOf(duel);
            if (opponent && duel.players && duel.players[opponent.uid] &&
                duel.players[opponent.uid].connected === false) {
                void voidDuel(duelId, 'opponent-disconnect');
            }
        }

        if (duel.status === 'complete' && state.awaitingSettle) {
            state.awaitingSettle = false;
            void finishDuelReview(duel);
        }
    });
}

function opponentOf(duel) {
    if (!duel || !duel.host) return null;
    return duel.host.uid === state.uid ? (duel.guest || null) : duel.host;
}

function renderWaitingRoom(duel) {
    const opponent = opponentOf(duel);
    const panel = el('duel-versus');
    if (!panel) return;
    if (!opponent) { panel.hidden = true; return; }

    panel.hidden = false;
    const myTier = tierFor(state.profile.rating);
    el('vs-me-name').textContent   = state.username;
    el('vs-me-tier').textContent   = myTier.icon + ' ' + myTier.name;
    el('vs-me-rating').textContent = String(state.profile.rating);
    el('vs-op-name').textContent   = opponent.name || 'Player';
    el('vs-op-tier').textContent   = (tierFor(opponent.rating).icon) + ' ' + (opponent.tier || 'Pawn');
    el('vs-op-rating').textContent = String(opponent.rating ?? '—');
    setDuelStage('ready', 'Opponent found', 'Starting shortly…');
    el('duel-link-row').hidden = true;
}

function scheduleDuelStart(duel) {
    if (state.duelStartScheduled) return;

    // Resolve against the key list the host published. Deriving the set from a
    // shared seed alone would rely on both clients enumerating the positions
    // node in identical order, which is not guaranteed — and two players
    // answering different boards is the one bug a duel cannot survive.
    const keys = Array.isArray(duel.puzzleKeys) ? duel.puzzleKeys : null;
    if (!keys || keys.length !== PUZZLES_PER_SESSION) {
        // Host has not published yet; the watcher will call again on the next
        // snapshot once it has.
        return;
    }
    const byKey = new Map(state.positions.map(pos => [pos._key, pos]));
    const resolved = keys.map(key => byKey.get(key)).filter(Boolean);
    if (resolved.length !== PUZZLES_PER_SESSION) {
        setDuelStage('error', 'Could not start duel', 'The puzzle set could not be loaded.');
        void voidDuel(state.duelId, 'set-mismatch');
        return;
    }

    state.duelStartScheduled = true;
    state.set = resolved;

    const delay = Math.max(0, Number(duel.startAt) - serverNow());
    setDuelStage('ready', 'Opponent found', 'Duel begins in a moment\u2026');
    setTimeout(() => { beginSession('duel'); }, delay);
}

function handleVoid() {
    if (!state.sessionRunning && !state.awaitingSettle) return;
    stopTimers();
    state.sessionRunning = false;
    state.awaitingSettle = false;
    state.duelStartScheduled = false;
    showView('review');
    el('review-body').innerHTML =
        '<div class="rk-void">' +
        '<h2>Duel voided</h2>' +
        '<p>A player disconnected, so no rating was applied for either side.</p>' +
        '<button class="rk-btn rk-btn-primary" onclick="backToSelect()">Back to Ranked</button>' +
        '</div>';
}

// ════════════════════════════════════════════════════════════════════════════
//  SESSION RUNNER (shared by Solo and Duel)
// ════════════════════════════════════════════════════════════════════════════
function beginSession(mode) {
    state.mode    = mode;
    state.index   = 0;
    state.score   = 0;
    state.results = [];
    state.locked  = false;
    state.sessionRunning = true;
    state.duelStartScheduled = false;

    el('session-mode').textContent = mode === 'duel' ? 'Duel' : 'Blitz Solo';
    el('session-themes').textContent = mode === 'solo'
        ? (state.sessionThemes || []).join('  ·  ')
        : 'Mixed themes';
    el('duel-progress-wrap').hidden = (mode !== 'duel');

    showView('session');
    renderPuzzle();
}

function renderPuzzle() {
    const pos = state.set[state.index];
    if (!pos) return void endSession();

    const limit = timeLimitFor(difficultyOf(pos));
    state.locked = false;
    state.puzzleStartedAt = performance.now();

    el('session-counter').textContent = (state.index + 1) + ' / ' + PUZZLES_PER_SESSION;
    el('session-score').textContent   = String(state.score);
    el('session-board').innerHTML     = getPositionSVG(pos);
    el('session-turn').textContent    = turnLabelFor(pos);
    el('session-difficulty').textContent = difficultyOf(pos);
    el('session-feedback').textContent = '';
    el('session-feedback').className   = 'rk-feedback';

    setAnswersEnabled(true);
    startTimer(limit);
}

function setAnswersEnabled(enabled) {
    document.querySelectorAll('.rk-answer').forEach(btn => { btn.disabled = !enabled; });
}

// The bar drains and shifts neutral → amber → red, which communicates urgency
// without a ticking number dominating the screen.
function startTimer(limitSeconds) {
    stopTimers();
    const bar   = el('timer-fill');
    const label = el('timer-label');
    const limitMs = limitSeconds * 1000;

    function tick() {
        const elapsed   = performance.now() - state.puzzleStartedAt;
        const remaining = Math.max(0, limitMs - elapsed);
        const fraction  = remaining / limitMs;

        bar.style.width = (fraction * 100) + '%';
        bar.dataset.level = fraction > 0.5 ? 'calm' : (fraction > 0.25 ? 'warn' : 'danger');
        label.textContent = (remaining / 1000).toFixed(1) + 's';

        if (remaining <= 0) { submitAnswer(null); return; }
        state.tickTimer = requestAnimationFrame(tick);
    }
    state.tickTimer = requestAnimationFrame(tick);
}

function stopTimers() {
    if (state.tickTimer) { cancelAnimationFrame(state.tickTimer); state.tickTimer = null; }
    if (state.advanceTimer) { clearInterval(state.advanceTimer); state.advanceTimer = null; }
}

window.answerRanked = function(answer) { submitAnswer(answer); };

function submitAnswer(answer) {
    if (state.locked) return;
    state.locked = true;
    stopTimers();
    setAnswersEnabled(false);

    const pos       = state.set[state.index];
    const expected  = correctAnswerFor(pos);
    const msElapsed = performance.now() - state.puzzleStartedAt;
    const limit     = timeLimitFor(difficultyOf(pos));
    const timedOut  = answer === null;
    const correct   = !timedOut && answer === expected;
    const { points, bonus } = scorePuzzle({ correct, msElapsed, timeLimitSeconds: limit });

    state.score += points;
    const record = {
        key:        pos._key,
        answer:     answer || 'Timeout',
        expected,
        correct,
        timedOut,
        ms:         Math.round(Math.min(msElapsed, limit * 1000)),
        points,
        bonus,
    };
    state.results.push(record);

    // No explanation during play — Ranked tests instinct, not research. The
    // only feedback is whether the answer landed.
    const feedback = el('session-feedback');
    feedback.className = 'rk-feedback ' + (correct ? 'is-correct' : 'is-wrong');
    feedback.textContent = timedOut ? 'Out of time'
                        : correct   ? '+' + points
                        : 'Incorrect';

    el('session-score').textContent = String(state.score);

    if (state.mode === 'duel' && state.duelId) {
        void pushDuelAnswer(state.duelId, state.uid, state.index, record,
                            state.score, state.index + 1);
    }

    state.index++;
    if (state.index >= PUZZLES_PER_SESSION) {
        setTimeout(endSession, 900);
    } else {
        runCountdown();
    }
}

// A three-second beat between puzzles so a new board never lands mid-thought.
function runCountdown() {
    const overlay = el('countdown');
    const value   = el('countdown-value');
    let remaining = COUNTDOWN_SECONDS;

    overlay.hidden = false;
    value.textContent = String(remaining);
    value.classList.remove('pulse');
    void value.offsetWidth;
    value.classList.add('pulse');

    state.advanceTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(state.advanceTimer);
            state.advanceTimer = null;
            overlay.hidden = true;
            renderPuzzle();
            return;
        }
        value.textContent = String(remaining);
        value.classList.remove('pulse');
        void value.offsetWidth;
        value.classList.add('pulse');
    }, 1000);
}

async function endSession() {
    stopTimers();
    state.sessionRunning = false;
    el('countdown').hidden = true;

    if (state.mode === 'duel' && state.duelId) {
        state.awaitingSettle = true;
        await markDuelFinished(state.duelId, state.uid, state.score);
        showView('review');
        el('review-body').innerHTML =
            '<div class="rk-waiting-result"><div class="rk-spinner"></div>' +
            '<p>Waiting for your opponent to finish…</p></div>';
        // Either client may be the one to observe both finished.
        const settled = await settleDuel(state.duelId);
        if (settled && settled.status === 'complete') await finishDuelReview(settled);
        return;
    }

    await finishSoloReview();
}

// ── Solo result ──────────────────────────────────────────────────────────────
async function finishSoloReview() {
    const correctCount = state.results.filter(r => r.correct).length;
    const { delta, applied, reason } =
        computeSoloDelta({ rating: state.profile.rating, score: state.score, correctCount });

    const before = state.profile.rating;
    if (applied && delta !== 0) {
        state.profile = await applyRatingDelta(state.uid, state.profile, delta, {
            soloPlayed:       (state.profile.soloPlayed || 0) + 1,
            bestSessionScore: Math.max(state.profile.bestSessionScore || 0, state.score),
        });
    } else {
        state.profile = await applyRatingDelta(state.uid, state.profile, 0, {
            soloPlayed:       (state.profile.soloPlayed || 0) + 1,
            bestSessionScore: Math.max(state.profile.bestSessionScore || 0, state.score),
        });
    }
    paintRating();

    await recordSession(state.uid, {
        mode: 'solo',
        themes: state.sessionThemes || [],
        score: state.score,
        correctCount,
        ratingDelta: applied ? delta : 0,
        ratingAfter: state.profile.rating,
        puzzles: state.results,
    });

    showView('review');
    el('review-body').innerHTML =
        renderSummary({ delta: applied ? delta : 0, before, correctCount, note: applied ? '' : reason }) +
        renderBreakdown();
}

// ── Duel result ──────────────────────────────────────────────────────────────
async function finishDuelReview(duel) {
    if (state.settled) return;
    state.settled = true;

    const opponent = opponentOf(duel);
    const isHost   = duel.host && duel.host.uid === state.uid;
    const myScore  = isHost ? duel.result.hostScore : duel.result.guestScore;
    const opScore  = isHost ? duel.result.guestScore : duel.result.hostScore;

    const { delta } = computeDuelDelta({
        rating: state.profile.rating,
        opponentRating: (opponent && opponent.rating) || state.profile.rating,
        myScore, opponentScore: opScore,
    });

    const won  = myScore > opScore;
    const draw = myScore === opScore;
    const before = state.profile.rating;

    state.profile = await applyRatingDelta(state.uid, state.profile, delta, {
        duelPlayed:  (state.profile.duelPlayed || 0) + 1,
        duelWins:    (state.profile.duelWins   || 0) + (won ? 1 : 0),
        duelLosses:  (state.profile.duelLosses || 0) + (!won && !draw ? 1 : 0),
        duelDraws:   (state.profile.duelDraws  || 0) + (draw ? 1 : 0),
        bestSessionScore: Math.max(state.profile.bestSessionScore || 0, myScore),
    });
    paintRating();

    await recordSession(state.uid, {
        mode: 'duel',
        duelId: state.duelId,
        opponent: opponent ? opponent.name : 'Opponent',
        score: myScore,
        opponentScore: opScore,
        outcome: draw ? 'draw' : (won ? 'win' : 'loss'),
        ratingDelta: delta,
        ratingAfter: state.profile.rating,
        puzzles: state.results,
    });

    const opponentAnswers = opponent && duel.players && duel.players[opponent.uid]
        ? (duel.players[opponent.uid].answers || {})
        : {};

    showView('review');
    el('review-body').innerHTML =
        renderDuelHeader({ won, draw, myScore, opScore, opponent }) +
        renderSummary({ delta, before, correctCount: state.results.filter(r => r.correct).length, note: '' }) +
        renderBreakdown(opponentAnswers, opponent);
}

// ── Review rendering ─────────────────────────────────────────────────────────
function renderDuelHeader({ won, draw, myScore, opScore, opponent }) {
    const verdict = draw ? 'Draw' : (won ? 'Victory' : 'Defeat');
    const cls     = draw ? 'is-draw' : (won ? 'is-win' : 'is-loss');
    return '' +
    '<section class="rk-duel-result ' + cls + '">' +
        '<div class="rk-duel-verdict">' + verdict + '</div>' +
        '<div class="rk-duel-scores">' +
            '<div class="rk-duel-side"><span class="rk-duel-name">' + escapeHTML(state.username) + '</span>' +
                '<span class="rk-duel-score">' + myScore + '</span></div>' +
            '<span class="rk-duel-dash">—</span>' +
            '<div class="rk-duel-side"><span class="rk-duel-name">' +
                escapeHTML((opponent && opponent.name) || 'Opponent') + '</span>' +
                '<span class="rk-duel-score">' + opScore + '</span></div>' +
        '</div>' +
    '</section>';
}

function renderSummary({ delta, before, correctCount, note }) {
    const accuracy = Math.round((correctCount / PUZZLES_PER_SESSION) * 100);
    const avgMs = state.results.length
        ? state.results.reduce((sum, r) => sum + r.ms, 0) / state.results.length
        : 0;
    const sign = delta > 0 ? '+' : '';
    const deltaCls = delta > 0 ? 'is-gain' : (delta < 0 ? 'is-loss' : 'is-flat');
    const tier = tierFor(state.profile.rating);

    return '' +
    '<section class="rk-summary">' +
        '<div class="rk-summary-grid">' +
            stat('Score', state.score + ' <small>/ ' + MAX_SESSION_SCORE + '</small>') +
            stat('Accuracy', accuracy + '%') +
            stat('Correct', correctCount + ' <small>/ ' + PUZZLES_PER_SESSION + '</small>') +
            stat('Avg time', (avgMs / 1000).toFixed(1) + 's') +
        '</div>' +
        '<div class="rk-rating-change">' +
            '<div class="rk-rating-row">' +
                '<span class="rk-rating-label">Ranked Rating</span>' +
                '<span class="rk-rating-value">' + before +
                    '<span class="rk-rating-arrow">→</span>' + state.profile.rating + '</span>' +
                '<span class="rk-rating-delta ' + deltaCls + '">' + sign + delta + '</span>' +
            '</div>' +
            '<div class="rk-rating-tier" style="--tier-accent:' + tier.accent + '">' +
                tier.icon + ' ' + tier.name + '</div>' +
            (note ? '<p class="rk-rating-note">' + escapeHTML(note) +
                    ' — session recorded, rating unchanged.</p>' : '') +
        '</div>' +
        '<div class="rk-review-actions">' +
            '<button class="rk-btn rk-btn-primary" onclick="backToSelect()">Play again</button>' +
            '<a class="rk-btn rk-btn-ghost" href="leaderboard.html">Leaderboard</a>' +
        '</div>' +
    '</section>';
}

function stat(label, value) {
    return '<div class="rk-stat"><span class="rk-stat-label">' + label +
           '</span><span class="rk-stat-value">' + value + '</span></div>';
}

// The full AI explanation is released here and only here — this is where the
// learning happens, and it is the reason to sit through the review rather than
// bounce off the score.
function renderBreakdown(opponentAnswers, opponent) {
    const cards = state.results.map((record, i) => {
        const pos = state.set[i];
        const exp = explanationOf(pos);
        const verdictCls = record.correct ? 'is-correct' : 'is-wrong';

        const opponentRow = opponentAnswers ? (() => {
            const theirs = opponentAnswers[i];
            const name = escapeHTML((opponent && opponent.name) || 'Opponent');
            if (!theirs) {
                return '<div class="rk-answer-row"><span class="rk-answer-who">' + name +
                       '</span><span class="rk-answer-what">—</span></div>';
            }
            return '<div class="rk-answer-row ' + (theirs.correct ? 'is-correct' : 'is-wrong') + '">' +
                   '<span class="rk-answer-who">' + name + '</span>' +
                   '<span class="rk-answer-what">' + escapeHTML(theirs.answer) + '</span>' +
                   '<span class="rk-answer-time">' + (theirs.ms / 1000).toFixed(1) + 's</span>' +
                   '<span class="rk-answer-pts">' + (theirs.points || 0) + '</span></div>';
        })() : '';

        return '' +
        '<article class="rk-review-card">' +
            '<div class="rk-review-board">' + getPositionSVG(pos) + '</div>' +
            '<div class="rk-review-detail">' +
                '<header class="rk-review-head">' +
                    '<span class="rk-review-index">Position ' + (i + 1) + '</span>' +
                    '<span class="rk-review-eval">' + escapeHTML(formatEval(pos)) + '</span>' +
                    '<span class="rk-review-points ' + verdictCls + '">' + record.points + ' pts</span>' +
                '</header>' +
                '<div class="rk-answer-block">' +
                    '<div class="rk-answer-row ' + verdictCls + '">' +
                        '<span class="rk-answer-who">' + escapeHTML(state.username) + '</span>' +
                        '<span class="rk-answer-what">' + escapeHTML(record.answer) + '</span>' +
                        '<span class="rk-answer-time">' + (record.ms / 1000).toFixed(1) + 's</span>' +
                        '<span class="rk-answer-pts">' + record.points + '</span>' +
                    '</div>' +
                    opponentRow +
                    '<div class="rk-answer-row is-truth">' +
                        '<span class="rk-answer-who">Correct</span>' +
                        '<span class="rk-answer-what">' + escapeHTML(record.expected) + '</span>' +
                    '</div>' +
                '</div>' +
                (exp.themes.length
                    ? '<div class="rk-review-themes">' + exp.themes
                        .map(t => '<span class="rk-theme-tag">' + escapeHTML(t) + '</span>').join('') +
                      '</div>'
                    : '') +
                (exp.why ? block('Why', exp.why) : '') +
                (exp.commonMistake ? block('Common mistake', exp.commonMistake) : '') +
                (exp.bestMove && exp.bestMove.move
                    ? '<div class="rk-review-section"><div class="rk-review-label">Engine’s move</div>' +
                      '<p class="rk-review-text"><span class="rk-move">' + escapeHTML(exp.bestMove.move) +
                      '</span>' + escapeHTML(exp.bestMove.reason) + '</p></div>'
                    : '') +
                (exp.plan ? block('Plan from here', exp.plan) : '') +
            '</div>' +
        '</article>';
    }).join('');

    return '<section class="rk-breakdown"><h3 class="rk-breakdown-title">Position review</h3>' +
           cards + '</section>';
}

function block(label, text) {
    return '<div class="rk-review-section"><div class="rk-review-label">' + label +
           '</div><p class="rk-review-text">' + escapeHTML(text) + '</p></div>';
}

function paintOpponentProgress(duel) {
    const opponent = opponentOf(duel);
    if (!opponent || !duel.players) return;
    const theirs = duel.players[opponent.uid] || {};
    const done = Math.min(PUZZLES_PER_SESSION, Number(theirs.progress) || 0);
    const fill = el('duel-progress-fill');
    if (fill) fill.style.width = (done / PUZZLES_PER_SESSION * 100) + '%';
    const label = el('duel-progress-label');
    // Their position in the set only — never their answers, which would leak
    // the correct one by inference once scores updated.
    if (label) label.textContent = escapeHTML(opponent.name || 'Opponent') +
                                   ' · ' + done + '/' + PUZZLES_PER_SESSION;
}

window.backToSelect = function() {
    if (state.unwatchDuel) { state.unwatchDuel(); state.unwatchDuel = null; }
    state.duelId = null;
    state.duel = null;
    state.settled = false;
    state.duelStartScheduled = false;
    state.duelSetPublished = false;
    history.replaceState(null, '', location.pathname);
    showView('select');
};

window.quitSession = function() {
    stopTimers();
    state.sessionRunning = false;
    if (state.mode === 'duel' && state.duelId) void voidDuel(state.duelId, 'forfeit');
    backToSelect();
};

// Keyboard: 1 / 2 / 3 map to the three verdicts. Under a 15-second clock the
// difference between reaching for the mouse and tapping a key is real.
document.addEventListener('keydown', event => {
    if (!state.sessionRunning || state.locked) return;
    const idx = ['1', '2', '3'].indexOf(event.key);
    if (idx >= 0) { event.preventDefault(); submitAnswer(ANSWERS[idx]); }
});
