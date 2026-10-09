// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ Ranked — core
//  Firebase wiring, Ranked Rating / tier / season maths, puzzle pool loading,
//  scoring, and session persistence. No DOM work lives here: ranked.js owns the
//  views and ranked-duel.js owns the realtime duel layer. Both import from here
//  so there is exactly one definition of what a point and a rating are worth.
// ════════════════════════════════════════════════════════════════════════════

import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import {
    getDatabase, ref, get, set, update, onValue, off,
    push, remove, runTransaction, onDisconnect, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

const firebaseConfig = {
    apiKey:            "AIzaSyDtGbU8BN06Y_GNDmhV1FJFRhTvD603DN0",
    authDomain:        "positionguessr.firebaseapp.com",
    databaseURL:       "https://positionguessr-default-rtdb.firebaseio.com",
    projectId:         "positionguessr",
    storageBucket:     "positionguessr.firebasestorage.app",
    messagingSenderId: "954415790631",
    appId:             "1:954415790631:web:0a5381589df51fc3abec02",
    measurementId:     "G-M63L8MVR6Z"
};

export const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);
export {
    ref, get, set, update, onValue, off, push, remove,
    runTransaction, onDisconnect, serverTimestamp, onAuthStateChanged,
};

// ── Session shape ────────────────────────────────────────────────────────────
export const PUZZLES_PER_SESSION = 10;
export const COUNTDOWN_SECONDS   = 3;

// Time per puzzle scales inversely with difficulty: harder positions deserve
// breathing room, and a trained player should read an easy one fast.
export const TIME_LIMITS = { Easy: 15, Medium: 22, Hard: 30 };
export function timeLimitFor(difficulty) {
    return TIME_LIMITS[difficulty] ?? TIME_LIMITS.Medium;
}

// ── Scoring ──────────────────────────────────────────────────────────────────
// Accuracy dominates speed by construction. A correct answer is worth 100
// before any bonus; the bonus tops out at 50. Ten slow-but-correct answers
// score 1000, which beats five fast-and-correct (750) — exactly the ordering
// the spec asks for. Wrong and timeout both score zero, never negative, so a
// bad position never feels like it ruins the run.
// 220 + up to 100 = 320 a puzzle, so a flawless ten-puzzle run is exactly
// 3,200 - the same number the rating ladder tops out at. The 2.2:1 ratio of
// base to bonus is unchanged from the old 100/50, so accuracy still dominates
// speed by the same margin: ten slow correct answers (2,200) beat five fast
// ones (1,600).
export const BASE_POINTS       = 220;
export const MAX_TIME_BONUS    = 100;
export const MAX_SESSION_SCORE = PUZZLES_PER_SESSION * (BASE_POINTS + MAX_TIME_BONUS);
// Solo sessions below this many correct answers record normally but move no
// rating, which is what stops spam-clicking from inflating the ladder.
export const SOLO_MIN_CORRECT = 4;

export function scorePuzzle({ correct, msElapsed, timeLimitSeconds }) {
    if (!correct) return { points: 0, base: 0, bonus: 0 };
    const limitMs   = Math.max(1, timeLimitSeconds * 1000);
    const remaining = Math.max(0, Math.min(limitMs, limitMs - msElapsed));
    const bonus     = Math.round(MAX_TIME_BONUS * (remaining / limitMs));
    return { points: BASE_POINTS + bonus, base: BASE_POINTS, bonus };
}

// ── Ranked Rating ────────────────────────────────────────────────────────────
// Deliberately unrelated to PR. PR measures training depth accumulated slowly;
// RR measures whether that understanding survives a 15-second clock. A player
// can legitimately be strong in one and weak in the other.
// The ladder spans 0-3,200, matching the range players already read PR on.
// Everything below is scaled to that span rather than the old 800-2,200 band.
export const RR_START   = 600;
export const RR_FLOOR   = 0;
export const RR_CEILING = 3200;
// K sized for the span: a duel against an even opponent swings about 40 points,
// so a season of real play covers meaningful ground without a single session
// rewriting the ladder.
export const K_DUEL   = 80;
// Solo carries a quarter of a duel's weight. Grinding solo moves the needle,
// but it cannot carry anyone to the top of the ladder on its own.
export const SOLO_WEIGHT = 0.25;
export const K_SOLO      = K_DUEL * SOLO_WEIGHT;

export const TIERS = [
    { name: 'Pawn',        min: 0,    icon: '♟', accent: '#9aa0ad' },
    { name: 'Knight',      min: 800,  icon: '♞', accent: '#6fc3ff' },
    { name: 'Bishop',      min: 1400, icon: '♝', accent: '#b98cff' },
    { name: 'Rook',        min: 1950, icon: '♜', accent: '#ff9a5c' },
    { name: 'Queen',       min: 2450, icon: '♛', accent: '#ffd400' },
    { name: 'Grandmaster', min: 2900, icon: '♚', accent: '#fff1a8' },
];

export function tierFor(rating) {
    let found = TIERS[0];
    for (const tier of TIERS) if ((rating ?? 0) >= tier.min) found = tier;
    return found;
}

export function nextTierFor(rating) {
    return TIERS.find(tier => (rating ?? 0) < tier.min) || null;
}

// Progress through the current tier, for the profile bar. Grandmaster is the
// summit and has no "next", so it always reads full.
export function tierProgress(rating) {
    const current = tierFor(rating);
    const next    = nextTierFor(rating);
    if (!next) return 1;
    const span = next.min - current.min;
    return span > 0 ? Math.max(0, Math.min(1, (rating - current.min) / span)) : 1;
}

// Standard Elo expectation. Used for both modes: a duel compares two players,
// a solo session compares the player against the ladder's expectation of them.
export function expectedScore(myRating, opponentRating) {
    return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
}

// What fraction of the maximum a player at this rating is expected to score in
// a solo session. Anchored so a Pawn is expected to take about a third of the
// points and a Grandmaster nearly all of them.
export function expectedSoloPerformance(rating) {
    const t = (rating - RR_START) / (RR_CEILING - RR_START);
    return Math.max(0.30, Math.min(0.94, 0.36 + 0.58 * t));
}

export function computeSoloDelta({ rating, score, correctCount }) {
    if (correctCount < SOLO_MIN_CORRECT) {
        return { delta: 0, applied: false, reason: 'Needs ' + SOLO_MIN_CORRECT + '/10 correct' };
    }
    const performance = score / MAX_SESSION_SCORE;
    const expected    = expectedSoloPerformance(rating);
    const delta       = Math.round(K_SOLO * (performance - expected) * 2);
    return { delta, applied: true, reason: '' };
}

// Win/loss drives the sign; margin scales the magnitude, so a blowout is worth
// more than squeaking through. Bounded to 0.75x..1.25x so margin never
// outweighs the result itself.
export function computeDuelDelta({ rating, opponentRating, myScore, opponentScore }) {
    const expected = expectedScore(rating, opponentRating);
    const actual   = myScore > opponentScore ? 1 : (myScore === opponentScore ? 0.5 : 0);
    const margin   = Math.min(1, Math.abs(myScore - opponentScore) / MAX_SESSION_SCORE);
    const marginMult = 0.75 + 0.5 * margin;
    const delta = Math.round(K_DUEL * (actual - expected) * marginMult);
    // A decided duel always moves the rating, so a win is never worth nothing.
    if (delta === 0 && actual !== 0.5) return { delta: actual === 1 ? 1 : -1, expected, actual };
    return { delta, expected, actual };
}

// ── Seasons ──────────────────────────────────────────────────────────────────
// The leaderboard ranks on seasonDelta (rating gained since season start) so a
// player joining in week six competes on the same basis as a day-one player.
export const CURRENT_SEASON = {
    id:     'winter-2026',
    name:   'Winter 2026',
    // Close date is announced at least two weeks out; this is the planned end.
    endsAt: Date.UTC(2027, 1, 28),
};
export const SEASON_CARRY = 0.70;   // soft reset keeps 70% at rollover

export function applySeasonRollover(profile) {
    const carried = Math.max(RR_FLOOR, Math.round(profile.rating * SEASON_CARRY));
    return {
        ...profile,
        rating:            carried,
        seasonId:          CURRENT_SEASON.id,
        seasonStartRating: carried,
        seasonDelta:       0,
        seasonPeakRating:  carried,
    };
}

// ── Scale migration ──────────────────────────────────────────────────────────
// v1: 800 start, 100 floor, Grandmaster at 2,200, 1,500 max session score.
// v2: 600 start, 0 floor, Grandmaster at 2,900, 3,200 max session score.
export const RR_SCALE_VERSION = 2;
const V1_START      = 800;
const V1_GM         = 2200;
const V1_MAX_SCORE  = 1500;
const V2_GM         = 2900;

// Anchored on the two points that mean the same thing in both scales: where a
// player starts, and where Grandmaster begins. Everything between is linear,
// so relative standing is preserved exactly.
export function migrateRatingToV2(oldRating) {
    const value = Number(oldRating);
    if (!Number.isFinite(value)) return RR_START;
    const scale = (V2_GM - RR_START) / (V1_GM - V1_START);
    return Math.round(Math.min(RR_CEILING, Math.max(RR_FLOOR, RR_START + (value - V1_START) * scale)));
}

export function migrateScoreToV2(oldScore) {
    const value = Number(oldScore);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(Math.min(MAX_SESSION_SCORE, value * (MAX_SESSION_SCORE / V1_MAX_SCORE)));
}

function applyScaleMigration(profile) {
    const migrated = { ...profile };
    ['rating', 'peakRating', 'seasonStartRating', 'seasonPeakRating'].forEach(key => {
        if (Number.isFinite(Number(migrated[key]))) migrated[key] = migrateRatingToV2(migrated[key]);
    });
    // seasonDelta is a difference, not a point on the scale, so it stretches by
    // the same factor rather than being re-anchored.
    if (Number.isFinite(Number(migrated.seasonDelta))) {
        const scale = (V2_GM - RR_START) / (V1_GM - V1_START);
        migrated.seasonDelta = Math.round(Number(migrated.seasonDelta) * scale);
    }
    migrated.bestSessionScore = migrateScoreToV2(migrated.bestSessionScore);
    migrated.scaleVersion = RR_SCALE_VERSION;
    return migrated;
}

export function blankRankedProfile() {
    return {
        rating:            RR_START,
        peakRating:        RR_START,
        seasonId:          CURRENT_SEASON.id,
        seasonStartRating: RR_START,
        seasonDelta:       0,
        seasonPeakRating:  RR_START,
        soloPlayed:        0,
        duelPlayed:        0,
        duelWins:          0,
        duelLosses:        0,
        duelDraws:         0,
        bestSessionScore:  0,
        badges:            {},
        lastPlayedAt:      0,
        scaleVersion:      RR_SCALE_VERSION,
    };
}

// Reads the stored profile, filling defaults and rolling the season over when
// the stored season is stale. Returns { profile, rolledOver }.
export function normalizeRankedProfile(stored) {
    const base    = blankRankedProfile();
    let profile   = { ...base, ...(stored && typeof stored === 'object' ? stored : {}) };
    profile.rating = Number.isFinite(Number(profile.rating)) ? Number(profile.rating) : RR_START;

    // A stored profile written before the rescale carries v1 numbers. Convert
    // once, then stamp the version so it never runs twice.
    const storedVersion = Number(stored && stored.scaleVersion) || 1;
    const needsMigration = Boolean(stored) && storedVersion < RR_SCALE_VERSION;
    if (needsMigration) profile = applyScaleMigration(profile);

    if (profile.seasonId !== CURRENT_SEASON.id) {
        // Archive the closing season before carrying anything forward. The badge
        // records the peak tier reached and is never earnable again.
        const badges = { ...(profile.badges || {}) };
        if (profile.seasonId && (profile.soloPlayed + profile.duelPlayed) > 0) {
            badges[profile.seasonId] = {
                season:   profile.seasonId,
                tier:     tierFor(profile.seasonPeakRating || profile.rating).name,
                rating:   profile.seasonPeakRating || profile.rating,
                closedAt: Date.now(),
            };
        }
        return { profile: { ...applySeasonRollover(profile), badges }, rolledOver: true };
    }
    return { profile, rolledOver: needsMigration, migrated: needsMigration };
}

export function rankedProfileRef(uid) {
    return ref(db, 'users/' + uid + '/ranked');
}

export async function loadRankedProfile(uid) {
    const snap = await get(rankedProfileRef(uid));
    const { profile, rolledOver } = normalizeRankedProfile(snap.exists() ? snap.val() : null);
    // Persist immediately on a new profile, a season rollover, or a scale
    // migration, so the stored record never disagrees with what is displayed.
    if (rolledOver || !snap.exists()) await update(rankedProfileRef(uid), profile);
    return profile;
}

// Applies a rating delta and keeps every derived field consistent in one place,
// so solo and duel cannot drift apart on how a rating is recorded.
export async function applyRatingDelta(uid, profile, delta, extra = {}) {
    const rating = Math.min(RR_CEILING, Math.max(RR_FLOOR, profile.rating + delta));
    const next = {
        ...profile,
        ...extra,
        rating,
        peakRating:       Math.max(profile.peakRating || rating, rating),
        seasonPeakRating: Math.max(profile.seasonPeakRating || rating, rating),
        seasonDelta:      (profile.seasonDelta || 0) + delta,
        lastPlayedAt:     Date.now(),
    };
    await update(rankedProfileRef(uid), next);
    return next;
}

export async function recordSession(uid, session) {
    const entry = push(ref(db, 'rankedSessions/' + uid));
    await set(entry, { ...session, ts: Date.now() });
    return entry.key;
}

// ── Puzzle pool ──────────────────────────────────────────────────────────────
// Ranked reuses the same positions node as casual training. It is fetched once
// per page load and cached; ranked.js never refetches between sessions.
let _positions = null;
let _positionsPromise = null;

export function loadPositions() {
    if (_positions) return Promise.resolve(_positions);
    if (_positionsPromise) return _positionsPromise;
    _positionsPromise = get(ref(db, 'positions')).then(snap => {
        if (!snap.exists()) throw new Error('No positions available.');
        _positions = Object.entries(snap.val()).map(([key, value]) => ({ ...value, _key: key }));
        return _positions;
    });
    return _positionsPromise;
}

export function getPositionSVG(pos) {
    return (pos && (pos.SVG || (pos.board && pos.board.svg))) || '';
}

export function getPositionThemes(pos) {
    const exp = pos && pos.AIExplanation;
    if (!exp) return [];
    return Array.isArray(exp.themes) ? exp.themes
         : Array.isArray(exp.Themes) ? exp.Themes
         : [];
}

// Mirrors findResult() in main.js: the +/-1.00 pawn band is "Equal".
export function correctAnswerFor(pos) {
    const cp = parseFloat(pos && pos.Eval);
    if (!Number.isFinite(cp)) return 'Equal';
    if (Math.abs(cp) / 100 <= 1) return 'Equal';
    return cp > 0 ? 'White Winning' : 'Black Winning';
}

export function turnLabelFor(pos) {
    const raw = String((pos && pos.Turn) || '').trim();
    if (/black/i.test(raw) || /^b$/i.test(raw)) return 'Black to move';
    if (/white/i.test(raw) || /^w$/i.test(raw)) return 'White to move';
    const active = String((pos && pos.FEN) || '').split(/\s+/)[1];
    if (active === 'b') return 'Black to move';
    if (active === 'w') return 'White to move';
    return raw;
}

// Forced mates are stored as a +/-100000cp sentinel.
export function formatEval(pos) {
    const pawns = parseFloat(pos && pos.Eval) / 100;
    if (!Number.isFinite(pawns)) return '—';
    if (Math.abs(pawns) >= 100) return pawns > 0 ? 'Mate · White' : 'Mate · Black';
    return pawns > 0 ? '+' + pawns.toFixed(2) : pawns.toFixed(2);
}

export function explanationOf(pos) {
    const exp = (pos && pos.AIExplanation) || {};
    const rawBest = exp.bestMove || exp.BestMove || (pos && (pos.BestMove || pos.bestMove));
    let best = null;
    if (typeof rawBest === 'string' && rawBest.trim()) {
        best = { move: rawBest.trim(), reason: '' };
    } else if (rawBest && typeof rawBest === 'object') {
        best = {
            move:   String(rawBest.move || rawBest.Move || '').trim(),
            reason: String(rawBest.reason || rawBest.Reason || '').trim(),
        };
    }
    return {
        why:           String(exp.why || exp.Why || '').trim(),
        commonMistake: String(exp.commonMistake || exp.CommonMistake || '').trim(),
        plan:          String(exp.plan || exp.Plan || '').trim(),
        bestMove:      best,
        themes:        getPositionThemes(pos),
    };
}

// ── Theme index ──────────────────────────────────────────────────────────────
// Only themes with enough positions behind them can anchor a session, otherwise
// the wheel can land on a theme that cannot fill ten puzzles.
export const MIN_THEME_POOL = 12;

export function buildThemeIndex(positions) {
    const index = new Map();
    positions.forEach(pos => {
        const seen = new Set();
        getPositionThemes(pos).forEach(theme => {
            const label = String(theme || '').trim();
            if (!label || seen.has(label)) return;
            seen.add(label);
            if (!index.has(label)) index.set(label, []);
            index.get(label).push(pos);
        });
    });
    return index;
}

export function spinnableThemes(themeIndex) {
    return [...themeIndex.entries()]
        .filter(entry => entry[1].length >= MIN_THEME_POOL)
        .map(entry => entry[0])
        .sort();
}

export function shuffle(list, rng = Math.random) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
}

// Deterministic PRNG so a duel can generate an identical set on both clients
// from one shared seed, instead of shipping the whole set over the wire.
export function seededRandom(seed) {
    let state = (seed >>> 0) || 1;
    return function next() {
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;  state >>>= 0;
        return state / 4294967296;
    };
}

export function seedFromString(str) {
    let hash = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
        hash ^= String(str).charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

// Stratified draw across the three difficulty tiers. Taking the first ten of a
// shuffled pool inherits the pool's skew, and the library is heavily Easy, so
// an unstratified set is mostly 15-second puzzles. Round-robin keeps the mix
// even and makes the difficulty-scaled timers actually mean something.
//
// `count` positions, as close to evenly split as the candidates allow; a tier
// that runs dry simply yields its turn to the others.
export function buildBalancedSet(candidates, count = PUZZLES_PER_SESSION, rng = Math.random) {
    const buckets = { Easy: [], Medium: [], Hard: [] };
    candidates.forEach(pos => { buckets[difficultyOf(pos)].push(pos); });

    const order = ['Easy', 'Medium', 'Hard'];
    order.forEach(tier => { buckets[tier] = shuffle(buckets[tier], rng); });

    // Start the rotation at a random tier so the first puzzle is not always
    // Easy and the leftover slot does not always land on the same tier.
    const offset = Math.floor(rng() * order.length);
    const out = [];
    let exhausted = 0;
    for (let i = 0; out.length < count && exhausted < order.length; i++) {
        const tier = order[(i + offset) % order.length];
        if (buckets[tier].length) {
            out.push(buckets[tier].pop());
            exhausted = 0;
        } else if (i % order.length === order.length - 1) {
            // A full rotation with nothing taken means every tier is empty.
            exhausted = order.every(t => !buckets[t].length) ? order.length : 0;
        }
        if (order.every(t => !buckets[t].length)) break;
    }

    // Shuffle the result so the tiers are not presented in a predictable cycle.
    return shuffle(out, rng).slice(0, count);
}

// Blitz Solo: ten puzzles drawn from the two assigned themes, with an even
// difficulty mix. Falls back to the broad pool if the themes cannot fill a set.
export function buildSoloSet(positions, themeIndex, themes, rng = Math.random) {
    const pool = new Map();
    themes.forEach(theme => (themeIndex.get(theme) || []).forEach(pos => pool.set(pos._key, pos)));
    let candidates = shuffle([...pool.values()], rng);
    if (candidates.length < PUZZLES_PER_SESSION) {
        const filler = shuffle(positions, rng).filter(pos => !pool.has(pos._key));
        candidates = candidates.concat(filler);
    }
    return buildBalancedSet(candidates, PUZZLES_PER_SESSION, rng);
}

// Duel: drawn broadly across the taxonomy with no theme announcement, so
// neither player gains an edge from theme familiarity. Same even mix, and the
// shared seed keeps both clients on the identical set.
export function buildDuelSet(positions, rng = Math.random) {
    return buildBalancedSet(shuffle(positions, rng), PUZZLES_PER_SESSION, rng);
}

export function difficultyOf(pos) {
    const value = String((pos && pos.Difficulty) || 'Medium');
    return TIME_LIMITS[value] ? value : 'Medium';
}

export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
