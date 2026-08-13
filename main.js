var result;
var correct_result;
var answered = false;
var evaluation;

// ── Positional Rating constants ───────────────────────────────────────────────
// No hard cap — growth above PR_ELITE is stunted by 50% globally instead.
const PR_ELITE = 3200;   // threshold where growth halves
const PR_START = 500;
const PROVISIONAL_PUZZLES = 10;

// ── PR Decay constants ────────────────────────────────────────────────────────
const DECAY_GRACE_DAYS   = 7;    // days of inactivity before decay starts
const DECAY_PER_DAY      = 3;    // PR lost per day after grace period
const DECAY_FLOOR        = 300;  // PR never decays below this

// ── In-memory player state (loaded from Firebase after auth) ──────────────────
var playerPR      = PR_START;
var totalPuzzles  = 0;
var currentStreak = 0;
var currentUser   = null;
var currentUID    = null;
var currentUsername = 'Player';
var lastActiveDate  = null;   // 'YYYY-MM-DD' UTC string, updated each session

// Stats tracking
var correctCount  = 0;
var wrongCount    = 0;
var bestStreak    = 0;
var peakPR        = PR_START;
var prHistory     = [];   // array of { pr, ts } snapshots, capped at 50

// Achievement-related state. Definitions live locally; only unlocks and the
// few non-derivable activity counters are stored with the user record.
var unlockedAchievements = {};
var puzzleActivityDays = {};
var playDayStreak = 0;
var lastPuzzleDate = null;
var totalPlaySeconds = 0;
var dailyPuzzleHistory = {};
var leaderboardRank = null;
var lastLeaderboardRankCheck = 0;
var achievementToastQueue = [];
var achievementToastTimer = null;
var sessionAnswers = 0;
var sessionCorrect = 0;
var sessionTrackedSeconds = 0;
var sessionActivityStartedAt = document.hidden ? null : Date.now();

// OG recognition applies to accounts created from August 1, 2025 through
// August 1, 2026 inclusive. The end is exclusive at the following UTC day.
const OG_ACCOUNT_START_AT = Date.UTC(2025, 7, 1);
const OG_ACCOUNT_END_EXCLUSIVE = Date.UTC(2026, 7, 2);
// Account-specific overrides take precedence over the fixed date window.
const OG_MANUAL_EXCLUSIONS = new Set(['ronit', 'entyalt']);
const OG_MANUAL_INCLUSIONS = new Set(['shaurya']);
var accountCreatedAt = null;

// ── PR formula helpers ────────────────────────────────────────────────────────
// Easy:   low risk / low reward — gentle entry point
// Medium: balanced risk / balanced reward
// Hard:   high risk / high reward — meaningful swing, not a PR printer
const PR_BASE = {
    Easy:   { correct: 32,  wrong: -28  },
    Medium: { correct: 61,  wrong: -61  },
    Hard:   { correct: 70,  wrong: -70  },   // fix 1: was 110/-95 — too large, caused 800pt/session exploits
};

const PR_PROVISIONAL_BASE = {
    Easy:   { correct: 180, wrong: -160 },
    Medium: { correct: 285, wrong: -260 },
    Hard:   { correct: 250, wrong: -230 },   // fix 5: was 420/-380 — a perfect provisional Hard run hit PR=3000+
};

function isProvisionalMode() {
    return !isGuest && totalPuzzles < PROVISIONAL_PUZZLES;
}

function renderProvisionalNotice() {
    const notice = document.getElementById('provisional-banner');
    const countEl = document.getElementById('provisional-count');
    if (!notice) return;

    const active = isProvisionalMode();
    notice.style.display = active ? 'flex' : 'none';
    if (countEl) {
        countEl.textContent = `${Math.min(totalPuzzles + 1, PROVISIONAL_PUZZLES)}/${PROVISIONAL_PUZZLES}`;
    }
}

function confidenceMultiplier() {
    // fix 3: was 1 + 1.5·exp(-n/15) — peaked at 1.77 on puzzle 10 and stayed
    // elevated (1.20) well into puzzle 30+, invisibly compounding with Hard+streak.
    // New curve peaks at 1.60 on puzzle 10 and reaches ~1.02 by puzzle 60.
    return 1 + 0.6 * Math.exp(-totalPuzzles / 20);
}

function streakMultiplier(correct) {
    // fix 2: was min(streak,5)*0.10 → max 1.50x. Too punishing/rewarding.
    // Now min(streak,5)*0.05 → max 1.25x. Still meaningful, no longer dominant.
    if (correct && currentStreak > 0)  return 1 + Math.min(currentStreak, 5) * 0.05;
    if (!correct && currentStreak < 0) return 1 + Math.min(Math.abs(currentStreak), 5) * 0.05;
    return 1.0;
}

function updateStreak(correct) {
    if (correct) {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
    } else {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
    }
}

function getDifficultyFromPR() {
    if (playerPR < 1000) return "Easy";
    if (playerPR < 1600) return "Medium";
    return "Hard";
}

// ── Difficulty override ───────────────────────────────────────────────────────
// null = Adaptive (default), 'Easy' / 'Medium' / 'Hard' = manual override.
// Persisted in localStorage so it survives page refreshes without a Firebase write.
var difficultyOverride = localStorage.getItem('chessiq-difficulty') || null;
// Guard against corrupt values
if (!['Easy','Medium','Hard'].includes(difficultyOverride)) difficultyOverride = null;

// Single source of truth for which difficulty pool to use right now.
// Provisional mode always overrides everything.
function getActiveDifficulty() {
    if (isProvisionalMode()) return null;                    // provisional uses full pool
    return difficultyOverride || getDifficultyFromPR();      // override or adaptive
}

window.setDifficultyOverride = function(value) {
    // value: 'Easy' | 'Medium' | 'Hard' | 'Adaptive'
    if (value === 'Adaptive') {
        difficultyOverride = null;
        localStorage.removeItem('chessiq-difficulty');
    } else {
        difficultyOverride = value;
        localStorage.setItem('chessiq-difficulty', value);
    }
    updateSettingsDifficultyUI();
    updateDifficultyPanelUI();   // sync the new inline panel
};

// ── Firebase imports ──────────────────────────────────────────────────────────
import { initializeApp }                         from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, get, set, update }   from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAnalytics }                          from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

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

const app      = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db       = getDatabase(app);
const auth     = getAuth(app);

// ── Guest mode state ───────────────────────────────────────────────────────────
const GUEST_FREE_PUZZLES = 5;   // how many puzzles a signed-out visitor can try
var isGuest         = true;
var guestPuzzleCount = 0;

function showSignedInUI(profileUsername) {
    isGuest = false;
    currentUsername = profileUsername || 'Player';
    const badge   = document.getElementById('user-badge');
    const signin  = document.getElementById('signin-btn');
    const banner  = document.getElementById('guest-banner');
    if (badge)  badge.style.display  = 'flex';
    if (signin) signin.style.display = 'none';
    if (banner) banner.style.display = 'none';

    const nameEl = document.getElementById('header-username');
    if (nameEl) nameEl.textContent = currentUsername;
    renderProvisionalNotice();
}

function showGuestUI() {
    isGuest = true;
    const badge  = document.getElementById('user-badge');
    const signin = document.getElementById('signin-btn');
    const banner = document.getElementById('guest-banner');
    if (badge)  badge.style.display  = 'none';
    if (signin) signin.style.display = 'flex';
    if (banner) banner.style.display = 'flex';
    renderProvisionalNotice();
}

function hydratePlayerState(data) {
    playerPR      = data.pr           ?? PR_START;
    totalPuzzles  = data.totalPuzzles ?? 0;
    currentStreak = data.streak       ?? 0;
    correctCount  = data.correctCount ?? 0;
    wrongCount    = data.wrongCount   ?? 0;
    bestStreak    = data.bestStreak   ?? 0;
    peakPR        = data.peakPR       ?? playerPR;
    prHistory     = Array.isArray(data.prHistory) ? data.prHistory : [];
    lastActiveDate = data.lastActiveDate ?? null;
    const createdAt = Number(data.createdAt);
    accountCreatedAt = Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null;

    const achievementData = data.achievements && typeof data.achievements === 'object'
        ? data.achievements
        : {};
    const activity = achievementData.activity && typeof achievementData.activity === 'object'
        ? achievementData.activity
        : {};

    unlockedAchievements = achievementData.unlocked && typeof achievementData.unlocked === 'object'
        ? achievementData.unlocked
        : {};
    puzzleActivityDays = activity.puzzleDays && typeof activity.puzzleDays === 'object'
        ? activity.puzzleDays
        : {};
    playDayStreak = Number(activity.playDayStreak) || 0;
    lastPuzzleDate = activity.lastPuzzleDate || null;
    totalPlaySeconds = Number(activity.totalPlaySeconds) || 0;
    dailyPuzzleHistory = data.potd && typeof data.potd === 'object' ? data.potd : {};
}

// ── Auth gate ─────────────────────────────────────────────────────────────────
// No longer force-redirects to login.html — guests can browse and play a
// limited number of free puzzles. Only Firebase-backed features (saved PR,
// leaderboard placement, persistent stats) require signing in.
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showGuestUI();
        updateDifficultyPanelUI();
        renderPR();
        initPositions();
        return;
    }

    currentUser = user;
    currentUID  = user.uid;

    const snap = await get(ref(db, `users/${currentUID}`));

    // Always read username from the DB record first — it is the authoritative source.
    // user.displayName can arrive null on the very first onAuthStateChanged fire
    // right after createUserWithEmailAndPassword + updateProfile, so we never
    // fall back to it for an existing record or for new writes.
    let profileUsername = null;
    console.log("AUTH displayName:", user.displayName);
    console.log("AUTH uid:", user.uid);

    if (snap.exists()) {
        const data = snap.val();
        hydratePlayerState(data);

        // DB username is ground truth — fall back to displayName only if DB has none
       profileUsername =
            (typeof data.username === "string" && data.username.trim() !== "")
        ? data.username.trim()
        : null;

        // If DB was missing username (legacy record), patch it in now
        if (!data.username && user.displayName) {
            await update(ref(db, `users/${currentUID}`), { username: user.displayName });
        }
    } else {
        // Brand-new user: snap doesn't exist yet (login.js writes it, but
        // onAuthStateChanged may fire before that write completes).
        // Try a few short retries (backoff) to allow the signup flow to finish
        // and avoid overwriting the canonical record.
        let retry = null;
        const delays = [300, 700, 1200];
        for (const d of delays) {
            await new Promise(r => setTimeout(r, d));
            retry = await get(ref(db, `users/${currentUID}`));
            if (retry.exists()) break;
        }

        if (retry && retry.exists()) {
                        const data = retry.val();
            hydratePlayerState(data);

            profileUsername = (typeof data.username === 'string' && data.username.trim() !== '')
                             ? data.username.trim()
                             : (user.displayName || 'Player');
        } else {
            // Fallback: login.js write hasn't landed — create a minimal record.
            // Use displayName which MAY be set by the signup flow; otherwise 'Player'.
            profileUsername = user.displayName || 'Player';
            const createdAt = Date.now();
            accountCreatedAt = createdAt;
            await set(ref(db, `users/${currentUID}`), {
                username:     profileUsername,
                email:        user.email,
                pr:           PR_START,
                totalPuzzles: 0,
                streak:       0,
                correctCount: 0,
                wrongCount:   0,
                bestStreak:   0,
                                peakPR:       PR_START,
                prHistory:    [],
                achievements: {
                    unlocked: {},
                    activity: { puzzleDays: {}, playDayStreak: 0, lastPuzzleDate: null, totalPlaySeconds: 0 },
                },
                createdAt,

            });
        }
    }

    // ── Apply inactivity decay before showing PR ───────────────────────────────
    applyPRDecay();

    // ── Self-heal: if DB still has 'Player' but Auth has a real displayName, fix it
    if (profileUsername === 'Player' && user.displayName && user.displayName !== 'Player') {
        profileUsername = user.displayName;
        await update(ref(db, `users/${currentUID}`), { username: user.displayName });
    }

    const nameEl = document.getElementById('header-username');
    if (nameEl) nameEl.textContent = profileUsername;
    currentUsername = profileUsername || 'Player';
    showSignedInUI(profileUsername);

    updateDifficultyPanelUI();
    renderPR();
    initPositions();
    // Clear any OG achievement made ineligible by an account-specific exception
    // before reconciling unlocks. The OG account achievement is then the one
    // account-based milestone that should announce itself.
    await reconcileOGAchievement();
    void checkAchievements({ refreshRank: true, silent: true }).then(newUnlocks => {
        const ogUnlock = newUnlocks.find(achievement => achievement.id === 'og_early_member');
        if (ogUnlock) enqueueAchievementToast(ogUnlock);
    });
});

// ── Date helper (UTC) ─────────────────────────────────────────────────────────
function todayUTCDate() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// ── PR Inactivity Decay ───────────────────────────────────────────────────────
// Called once on login. If the user has been inactive for more than DECAY_GRACE_DAYS,
// applies a PR reduction of DECAY_PER_DAY for each day beyond the grace period.
// Never drops below DECAY_FLOOR. Writes the adjusted PR back to Firebase.
function applyPRDecay() {
    if (isGuest || !lastActiveDate) return;

    const today     = todayUTCDate();
    if (lastActiveDate === today) return;  // played today, no decay

    // Calculate days since last active
    const lastMs    = new Date(lastActiveDate).getTime();
    const todayMs   = new Date(today).getTime();
    const daysSince = Math.floor((todayMs - lastMs) / 86400000);

    if (daysSince <= DECAY_GRACE_DAYS) return;  // within grace period

    const decayDays   = daysSince - DECAY_GRACE_DAYS;
    const totalDecay  = decayDays * DECAY_PER_DAY;
    const decayedPR   = Math.max(DECAY_FLOOR, playerPR - totalDecay);

    if (decayedPR < playerPR) {
        const lost = playerPR - decayedPR;
        playerPR   = decayedPR;

        // Show decay banner so user understands the drop
        showDecayBanner(daysSince, lost);

        // Save immediately so the adjusted PR is persisted
        saveStatsToFirebase();

        console.log(
            `PR decay applied | days inactive: ${daysSince} | grace: ${DECAY_GRACE_DAYS} | ` +
            `decay days: ${decayDays} | lost: -${lost} | new PR: ${playerPR}`
        );
    }
}

function showDecayBanner(daysSince, lost) {
    const banner = document.getElementById('decay-banner');
    const lostEl = document.getElementById('decay-lost');
    const daysEl = document.getElementById('decay-days');
    if (!banner) return;
    if (lostEl) lostEl.textContent = lost;
    if (daysEl) daysEl.textContent = daysSince;
    banner.style.display = 'flex';
}

// ── Save to Firebase ──────────────────────────────────────────────────────────
function getCurrentTotalPlaySeconds() {
    const activeSeconds = sessionActivityStartedAt
        ? Math.max(0, Math.floor((Date.now() - sessionActivityStartedAt) / 1000))
        : 0;
    return totalPlaySeconds + sessionTrackedSeconds + activeSeconds;
}

function settleSessionClock() {
    if (!sessionActivityStartedAt) return;
    sessionTrackedSeconds += Math.max(0, Math.floor((Date.now() - sessionActivityStartedAt) / 1000));
    sessionActivityStartedAt = Date.now();
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        settleSessionClock();
        sessionActivityStartedAt = null;
    } else {
        sessionActivityStartedAt = Date.now();
    }
});

window.addEventListener('pagehide', () => {
    settleSessionClock();
});

async function saveStatsToFirebase() {
    if (!currentUID || isGuest) return;
    await update(ref(db, `users/${currentUID}`), {
        pr:             playerPR,
        totalPuzzles:   totalPuzzles,
        streak:         currentStreak,
        correctCount:   correctCount,
        wrongCount:     wrongCount,
        bestStreak:     bestStreak,
        peakPR:         peakPR,
        prHistory:      prHistory,
        lastActiveDate: todayUTCDate(),
        achievements: {
            unlocked: unlockedAchievements,
            activity: {
                puzzleDays: puzzleActivityDays,
                playDayStreak,
                lastPuzzleDate,
                totalPlaySeconds: getCurrentTotalPlaySeconds(),
            },
        },
    });
}

// ══════════════════════════════════════════════════════════════════════════════
//  ACHIEVEMENTS — definitions are local; user state remains compact in Firebase
// ══════════════════════════════════════════════════════════════════════════════
const ACHIEVEMENT_RARITIES = {
    Common:    '#a5a5b2',
    Rare:      '#78bfff',
    Epic:      '#c995ff',
    Legendary: '#ffd400',
};

const ACHIEVEMENTS = [
    // Performance
    { id: 'session_accuracy_90', category: 'Performance', name: 'Clean Session', description: 'Reach 90% accuracy across 10 session puzzles.', rarity: 'Common', icon: '◎', progressType: 'sessionAccuracy', threshold: 90 },
    { id: 'correct_streak_20', category: 'Performance', name: 'Unbroken Focus', description: 'Get 20 positions correct in a row.', rarity: 'Epic', icon: '↗', progressType: 'correctStreak', threshold: 20 },
    { id: 'puzzles_50', category: 'Performance', name: 'First File', description: 'Solve 50 positions.', rarity: 'Common', icon: '◇', progressType: 'puzzles', threshold: 50 },
    { id: 'puzzles_100', category: 'Performance', name: 'Pattern Builder', description: 'Solve 100 positions.', rarity: 'Rare', icon: '◇', progressType: 'puzzles', threshold: 100 },
    { id: 'puzzles_250', category: 'Performance', name: 'Positional Student', description: 'Solve 250 positions.', rarity: 'Epic', icon: '◇', progressType: 'puzzles', threshold: 250 },
    { id: 'puzzles_500', category: 'Performance', name: 'Board Vision', description: 'Solve 500 positions.', rarity: 'Legendary', icon: '◇', progressType: 'puzzles', threshold: 500 },

    // Leaderboard
    { id: 'leaderboard_top_100', category: 'Leaderboard', name: 'On the Board', description: 'Reach the global Top 100.', rarity: 'Rare', icon: '#', progressType: 'rank', threshold: 100 },
    { id: 'leaderboard_top_25', category: 'Leaderboard', name: 'Contender', description: 'Reach the global Top 25.', rarity: 'Epic', icon: '#', progressType: 'rank', threshold: 25 },
    { id: 'leaderboard_top_10', category: 'Leaderboard', name: 'Elite Table', description: 'Reach the global Top 10.', rarity: 'Epic', icon: '#', progressType: 'rank', threshold: 10 },
    { id: 'leaderboard_rank_1', category: 'Leaderboard', name: 'Number One', description: 'Claim the #1 global rank.', rarity: 'Legendary', icon: '#', progressType: 'rank', threshold: 1 },

    // Account
    { id: 'og_early_member', category: 'Account', name: 'ChessIQ OG', description: 'Created a ChessIQ account between August 2025 and August 1, 2026.', rarity: 'Legendary', icon: '★', progressType: 'ogAccount', threshold: 1 },

    // Dedication
    { id: 'return_7_days', category: 'Dedication', name: 'Steady Return', description: 'Train for 7 consecutive days.', rarity: 'Common', icon: '◌', progressType: 'playDayStreak', threshold: 7 },
    { id: 'return_30_days', category: 'Dedication', name: 'Training Habit', description: 'Train for 30 consecutive days.', rarity: 'Epic', icon: '◌', progressType: 'playDayStreak', threshold: 30 },
    { id: 'play_100_minutes', category: 'Dedication', name: 'Clockwork', description: 'Spend 100 minutes training.', rarity: 'Rare', icon: '◷', progressType: 'playTime', threshold: 6000 },
    { id: 'solve_10_days', category: 'Dedication', name: 'Regular Study', description: 'Solve positions on 10 different days.', rarity: 'Rare', icon: '◐', progressType: 'puzzleDays', threshold: 10 },
    { id: 'solve_50_days', category: 'Dedication', name: 'Long Game', description: 'Solve positions on 50 different days.', rarity: 'Epic', icon: '◐', progressType: 'puzzleDays', threshold: 50 },

    // Position Rating / Progress
    { id: 'pr_1200', category: 'Position Rating', name: 'Club Eye', description: 'Reach 1,200 PR.', rarity: 'Common', icon: '↗', progressType: 'pr', threshold: 1200 },
    { id: 'pr_1500', category: 'Position Rating', name: 'Positional Reader', description: 'Reach 1,500 PR.', rarity: 'Rare', icon: '↗', progressType: 'pr', threshold: 1500 },
    { id: 'pr_1800', category: 'Position Rating', name: 'Strategic Vision', description: 'Reach 1,800 PR.', rarity: 'Epic', icon: '↗', progressType: 'pr', threshold: 1800 },
    { id: 'pr_2000', category: 'Position Rating', name: 'Expert Judgment', description: 'Reach 2,000 PR.', rarity: 'Epic', icon: '↗', progressType: 'pr', threshold: 2000 },
    { id: 'pr_2500', category: 'Position Rating', name: 'Master of Imbalances', description: 'Reach 2,500 PR.', rarity: 'Legendary', icon: '↗', progressType: 'pr', threshold: 2500 },

    // Daily / Consistency
    { id: 'daily_first', category: 'Daily / Consistency', name: 'Daily Debut', description: 'Complete your first Daily Puzzle.', rarity: 'Common', icon: '□', progressType: 'dailyCount', threshold: 1 },
    { id: 'daily_7', category: 'Daily / Consistency', name: 'Weekly Habit', description: 'Complete 7 Daily Puzzles.', rarity: 'Rare', icon: '□', progressType: 'dailyCount', threshold: 7 },
    { id: 'daily_30', category: 'Daily / Consistency', name: 'Monthly Routine', description: 'Complete 30 Daily Puzzles.', rarity: 'Epic', icon: '□', progressType: 'dailyCount', threshold: 30 },
    { id: 'daily_streak_7', category: 'Daily / Consistency', name: 'Seven-Day Streak', description: 'Maintain a 7-day Daily Puzzle streak.', rarity: 'Rare', icon: '⌁', progressType: 'dailyStreak', threshold: 7 },
    { id: 'daily_streak_30', category: 'Daily / Consistency', name: 'Unwavering', description: 'Maintain a 30-day Daily Puzzle streak.', rarity: 'Legendary', icon: '⌁', progressType: 'dailyStreak', threshold: 30 },
];

function dateDistance(first, second) {
    const firstMs = Date.parse(`${first}T00:00:00Z`);
    const secondMs = Date.parse(`${second}T00:00:00Z`);
    return Math.round((secondMs - firstMs) / 86400000);
}

function recordPuzzleActivity() {
    if (isGuest) return;
    const today = todayUTCDate();
    puzzleActivityDays[today] = true;

    if (lastPuzzleDate !== today) {
        playDayStreak = lastPuzzleDate && dateDistance(lastPuzzleDate, today) === 1
            ? playDayStreak + 1
            : 1;
        lastPuzzleDate = today;
    }
}

function getCurrentPlayDayStreak() {
    if (!lastPuzzleDate) return 0;
    return dateDistance(lastPuzzleDate, todayUTCDate()) <= 1 ? playDayStreak : 0;
}

function getDailyPuzzleStreak() {
    const dates = Object.keys(dailyPuzzleHistory || {}).sort().reverse();
    if (!dates.length) return 0;
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
        if (dateDistance(dates[i], dates[i - 1]) === 1) streak++;
        else break;
    }
    return streak;
}

function getAchievementMetric(definition) {
    switch (definition.progressType) {
        case 'puzzles':       return totalPuzzles;
        case 'correctStreak': return Math.max(0, currentStreak);
        case 'puzzleDays':    return Object.keys(puzzleActivityDays).length;
        case 'playDayStreak': return getCurrentPlayDayStreak();
        case 'playTime':      return getCurrentTotalPlaySeconds();
        case 'pr':            return playerPR;
        case 'dailyCount':    return Object.keys(dailyPuzzleHistory || {}).length;
        case 'dailyStreak':   return getDailyPuzzleStreak();
        case 'rank':          return leaderboardRank;
        case 'sessionAccuracy': return sessionAnswers;
        case 'ogAccount':     return isOGAccount() ? 1 : 0;
        default: return 0;
    }
}

function getAchievementProgress(definition) {
    const metric = getAchievementMetric(definition);
    if (definition.progressType === 'rank') {
        const rankKnown = Number.isFinite(metric) && metric > 0;
        const percentage = rankKnown ? Math.min(100, Math.round((definition.threshold / metric) * 100)) : 0;
        return {
            percentage,
            label: rankKnown ? `Rank #${metric} / Top ${definition.threshold}` : `Rank pending / Top ${definition.threshold}`,
        };
    }

    if (definition.progressType === 'playTime') {
        const minutes = Math.floor(metric / 60);
        return {
            percentage: Math.min(100, Math.round((metric / definition.threshold) * 100)),
            label: `${minutes} / ${Math.ceil(definition.threshold / 60)} minutes`,
        };
    }

    if (definition.progressType === 'sessionAccuracy') {
        const accuracy = sessionAnswers ? Math.round((sessionCorrect / sessionAnswers) * 100) : 0;
        return {
            percentage: Math.min(100, Math.round(Math.min(1, sessionAnswers / 10) * (accuracy / definition.threshold) * 100)),
            label: `${sessionCorrect} / ${Math.max(10, sessionAnswers)} correct · ${accuracy}%`,
        };
    }

    if (definition.progressType === 'ogAccount') {
        const eligible = metric >= definition.threshold;
        return {
            percentage: eligible ? 100 : 0,
            label: eligible ? 'Aug 2025 – Aug 1, 2026 account window' : 'Aug 2025 – Aug 1, 2026 accounts only',
        };
    }

    return {
        percentage: Math.min(100, Math.round((metric / definition.threshold) * 100)),
        label: `${Math.min(metric, definition.threshold).toLocaleString()} / ${definition.threshold.toLocaleString()}${definition.progressType === 'pr' ? ' PR' : ''}`,
    };
}

function isAchievementComplete(definition) {
    if (definition.progressType === 'rank') {
        return Number.isFinite(leaderboardRank) && leaderboardRank <= definition.threshold;
    }
    if (definition.progressType === 'sessionAccuracy') {
        return sessionAnswers >= 10 && (sessionCorrect / sessionAnswers) * 100 >= definition.threshold;
    }
    return getAchievementMetric(definition) >= definition.threshold;
}

function getOGAccountKey(username = currentUsername) {
    return String(username || '').trim().toLowerCase();
}

function isOGAccount(username = currentUsername) {
    const accountKey = getOGAccountKey(username);
    if (OG_MANUAL_INCLUSIONS.has(accountKey)) return true;
    if (OG_MANUAL_EXCLUSIONS.has(accountKey)) return false;
    return Number.isFinite(accountCreatedAt)
        && accountCreatedAt >= OG_ACCOUNT_START_AT
        && accountCreatedAt < OG_ACCOUNT_END_EXCLUSIVE;
}

async function reconcileOGAchievement() {
    if (isGuest || !currentUID || isOGAccount() || !unlockedAchievements.og_early_member) return;
    delete unlockedAchievements.og_early_member;
    try {
        await update(ref(db, `users/${currentUID}/achievements/unlocked`), { og_early_member: null });
    } catch (error) {
        console.error('OG achievement reconciliation failed:', error);
    }
}

async function refreshLeaderboardRank() {
    if (isGuest || !currentUID) return null;
    const now = Date.now();
    if (leaderboardRank !== null && now - lastLeaderboardRankCheck < 45000) return leaderboardRank;

    try {
        const snapshot = await get(ref(db, 'users'));
        if (!snapshot.exists()) return null;
        const users = snapshot.val();
        const players = Object.entries(users).map(([uid, data]) => ({
            uid,
            pr: data.pr ?? PR_START,
            totalPuzzles: data.totalPuzzles ?? 0,
        }));
        players.sort((a, b) => b.pr - a.pr || b.totalPuzzles - a.totalPuzzles);
        const index = players.findIndex(player => player.uid === currentUID);
        leaderboardRank = index >= 0 ? index + 1 : null;
        lastLeaderboardRankCheck = now;
        return leaderboardRank;
    } catch (error) {
        console.warn('Achievement rank check failed:', error);
        return leaderboardRank;
    }
}

function enqueueAchievementToast(achievement) {
    achievementToastQueue.push(achievement);
    if (achievementToastTimer) return;
    showNextAchievementToast();
}

function showNextAchievementToast() {
    const achievement = achievementToastQueue.shift();
    if (!achievement) {
        achievementToastTimer = null;
        return;
    }

    const toast = document.getElementById('achievement-toast');
    if (!toast) return;
    const color = ACHIEVEMENT_RARITIES[achievement.rarity] || ACHIEVEMENT_RARITIES.Common;
    const icon = document.getElementById('achievement-toast-icon');
    const rarity = document.getElementById('achievement-toast-rarity');
    const title = document.getElementById('achievement-toast-title');
    const desc = document.getElementById('achievement-toast-desc');

    toast.style.setProperty('--toast-color', color);
    if (icon) icon.textContent = achievement.icon;
    if (rarity) rarity.textContent = `${achievement.rarity} achievement unlocked`;
    if (title) title.textContent = achievement.name;
    if (desc) desc.textContent = achievement.description;

    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    achievementToastTimer = setTimeout(() => {
        toast.classList.remove('show');
        achievementToastTimer = setTimeout(showNextAchievementToast, 380);
    }, 4500);
}

window.dismissAchievementToast = function() {
    const toast = document.getElementById('achievement-toast');
    if (toast) toast.classList.remove('show');
    clearTimeout(achievementToastTimer);
    achievementToastTimer = setTimeout(showNextAchievementToast, 180);
};

function renderAchievementsModal() {
    const countEl = document.getElementById('achievements-count');
    const fillEl = document.getElementById('achievements-overview-fill');
    const pctEl = document.getElementById('achievements-overview-pct');
    const listEl = document.getElementById('achievements-list');
    const signinNote = document.getElementById('achievements-signin-note');
    if (!listEl) return;

    const unlockedCount = ACHIEVEMENTS.filter(achievement => Boolean(unlockedAchievements[achievement.id])).length;
    const overallPercentage = Math.round((unlockedCount / ACHIEVEMENTS.length) * 100);
    if (countEl) countEl.textContent = `${unlockedCount} / ${ACHIEVEMENTS.length}`;
    if (pctEl) pctEl.textContent = `${overallPercentage}%`;
    if (fillEl) {
        fillEl.style.width = '0%';
        fillEl.dataset.progress = String(overallPercentage);
    }
    if (signinNote) signinNote.style.display = isGuest ? 'block' : 'none';

    const categories = [...new Set(ACHIEVEMENTS.map(achievement => achievement.category))];
    listEl.innerHTML = categories.map(category => {
        const achievements = ACHIEVEMENTS.filter(achievement => achievement.category === category);
        const complete = achievements.filter(achievement => Boolean(unlockedAchievements[achievement.id])).length;
        const cards = achievements.map(achievement => {
            const isUnlocked = Boolean(unlockedAchievements[achievement.id]);
            const progress = getAchievementProgress(achievement);
            const color = ACHIEVEMENT_RARITIES[achievement.rarity] || ACHIEVEMENT_RARITIES.Common;
            const cardClasses = [
                'achievement-card',
                isUnlocked ? 'is-unlocked' : 'is-locked',
                achievement.rarity === 'Legendary' ? 'is-legendary' : '',
            ].filter(Boolean).join(' ');

            return `
                <article class="${cardClasses}" style="--rarity-color:${color}">
                    <div class="achievement-icon" aria-hidden="true">${isUnlocked ? achievement.icon : '◇'}</div>
                    <div class="achievement-name">${achievement.name}</div>
                    <div class="achievement-description">${achievement.description}</div>
                    <div class="achievement-meta">
                        <span class="achievement-rarity">${achievement.rarity}</span>
                        <span class="achievement-status">${isUnlocked ? 'Unlocked' : 'Locked'}</span>
                    </div>
                    <div class="achievement-progress">
                        <div class="achievement-progress-top"><span>Progress</span><span class="achievement-progress-value">${progress.label}</span></div>
                        <div class="achievement-progress-track"><span class="achievement-progress-fill" style="width:0%" data-progress="${progress.percentage}"></span></div>
                    </div>
                </article>`;
        }).join('');

        return `
            <section class="achievement-category">
                <div class="achievement-category-header">
                    <div class="achievement-category-title">${category}</div>
                    <div class="achievement-category-count">${complete} / ${achievements.length} unlocked</div>
                </div>
                <div class="achievement-grid">${cards}</div>
            </section>`;
    }).join('');

    requestAnimationFrame(() => {
        if (fillEl) fillEl.style.width = `${fillEl.dataset.progress || 0}%`;
        listEl.querySelectorAll('.achievement-progress-fill[data-progress]').forEach(fill => {
            fill.style.width = `${fill.dataset.progress || 0}%`;
        });
    });
}

window.openAchievements = function() {
    const modal = document.getElementById('achievements-modal');
    if (!modal) return;
    renderAchievementsModal();
    modal.style.display = 'flex';
};

window.closeAchievements = function() {
    const modal = document.getElementById('achievements-modal');
    if (modal) modal.style.display = 'none';
};

async function checkAchievements({ refreshRank = false, silent = false } = {}) {
    if (isGuest || !currentUID) return [];
    if (refreshRank) await refreshLeaderboardRank();

    const newUnlocks = ACHIEVEMENTS.filter(achievement =>
        !unlockedAchievements[achievement.id] && isAchievementComplete(achievement)
    );
    if (!newUnlocks.length) {
        const modal = document.getElementById('achievements-modal');
        if (modal && modal.style.display === 'flex') renderAchievementsModal();
        return [];
    }

    const unlockedAt = Date.now();
    newUnlocks.forEach(achievement => {
        unlockedAchievements[achievement.id] = { unlockedAt };
    });

    try {
        await update(ref(db, `users/${currentUID}/achievements/unlocked`), unlockedAchievements);
    } catch (error) {
        console.error('Achievement unlock save failed:', error);
    }

    const modal = document.getElementById('achievements-modal');
    if (modal && modal.style.display === 'flex') renderAchievementsModal();
    if (!silent) newUnlocks.forEach(enqueueAchievementToast);
    return newUnlocks;
}

// ── PR update ─────────────────────────────────────────────────────────────────
function updatePR(difficulty, correct) {
    const provisional = isProvisionalMode();
    const base = provisional ? PR_PROVISIONAL_BASE[difficulty] : PR_BASE[difficulty];
    if (!base) return;

    const baseValue    = correct ? base.correct : base.wrong;
    const ratingFactor = 1 - (playerPR / 4480);
    const confMult     = provisional ? 1 : confidenceMultiplier();
    const streakMult   = streakMultiplier(correct);
    let   delta        = Math.round(baseValue * ratingFactor * confMult * streakMult);

    // Above PR_ELITE (3200), growth — gains AND losses — is stunted by 50%.
    // There is no longer a hard cap; the rating can climb indefinitely, just slower.
    if (playerPR >= PR_ELITE) {
        delta = Math.round(delta * 0.5);
    }

    if (correct) { correctCount++; } else { wrongCount++; }
    updateStreak(correct);
    totalPuzzles++;

    playerPR = Math.max(0, playerPR + delta);

    if (playerPR > peakPR) peakPR = playerPR;
    if (currentStreak > bestStreak) bestStreak = currentStreak;

    prHistory.push({
        pr:         playerPR,
        delta:      delta,
        correct:    correct,
        difficulty: difficulty,
        provisional: provisional,
        posEval:    null,   // filled in by sendAnswer after calling updatePR
        ts:         Date.now(),
    });
    if (prHistory.length > 50) prHistory = prHistory.slice(prHistory.length - 50);

    if (provisional) {
        const sign = delta >= 0 ? '+' : '';
        const streakLabel = currentStreak > 1  ? `x${currentStreak} correct streak`
                          : currentStreak < -1 ? `x${Math.abs(currentStreak)} wrong streak`
                          : 'no streak';
        console.log(
            `Provisional PR update | puzzle ${totalPuzzles}/${PROVISIONAL_PUZZLES} | ` +
            `difficulty: ${difficulty} | correct: ${correct} | ` +
            `change: ${sign}${delta} | new PR: ${playerPR} | ` +
            `streakMult: x${streakMult.toFixed(2)} (${streakLabel})`
        );
    }

    renderPR(delta);
}

// ── Render PR display card ────────────────────────────────────────────────────
function renderPR(delta) {
    const valEl   = document.getElementById('pr-value');
    const subEl   = document.getElementById('pr-puzzles');
    const deltaEl = document.getElementById('pr-delta');
    if (!valEl) return;

    valEl.textContent = playerPR;
    subEl.textContent = `${totalPuzzles} puzzle${totalPuzzles !== 1 ? 's' : ''} played`;
    renderProvisionalNotice();

    if (delta !== undefined) {
        const sign = delta >= 0 ? '+' : '';
        deltaEl.textContent = `${sign}${delta}`;
        deltaEl.className   = `pr-delta ${delta >= 0 ? 'gain' : 'loss'}`;

        void deltaEl.offsetWidth;
        deltaEl.classList.add('show');

        clearTimeout(renderPR._fadeTimer);
        renderPR._fadeTimer = setTimeout(() => {
            deltaEl.classList.add('fade');
            setTimeout(() => { deltaEl.className = 'pr-delta'; }, 600);
        }, 1400);

        valEl.classList.add('bump');
        setTimeout(() => valEl.classList.remove('bump'), 200);

        // Check PR milestones on every PR-changing update
        if (!isGuest) checkMilestone(playerPR);
    }
}
window.renderPR = renderPR;

// ── Logout ────────────────────────────────────────────────────────────────────
window.logoutUser = async function() {
    await signOut(auth);
    window.location.href = 'login.html';
};

// ── Positions ─────────────────────────────────────────────────────────────────
var positions = [];
var positionsByDiff = { Easy: [], Medium: [], Hard: [] };
var current_position = 0;
var currentPuzzle = null;
var currentPuzzleDifficulty = null;
var currentPuzzleVoteCache = null;  // cached after answer, cleared on next puzzle

function loadPuzzleForPR() {
    const difficulty = isProvisionalMode() ? null : getActiveDifficulty();
    const pool = isProvisionalMode() ? positions : (positionsByDiff[difficulty] || []);
    if (pool.length) {
        current_position = Math.floor(Math.random() * pool.length);
        const pos = pool[current_position];
        currentPuzzle = pos;
        currentPuzzleDifficulty = pos.Difficulty || difficulty;
        renderSVG(pos.SVG);
        correct_result = findResult(pos.Eval);
        const turnEl = document.getElementById('turn');
        if (turnEl) turnEl.innerHTML = pos.Turn;
    } else {
        const boardEl = document.getElementById('board');
        const turnEl  = document.getElementById('turn');
        if (boardEl) boardEl.innerHTML = '<p>No positions available</p>';
        if (turnEl)  turnEl.innerHTML  = '';
    }
}

window.nextPosition = function() {
    if (isGuest && guestPuzzleCount >= GUEST_FREE_PUZZLES) {
        showGuestGate();
        return;
    }
    const difficulty = isProvisionalMode() ? null : getActiveDifficulty();
    const pool = isProvisionalMode() ? positions : (positionsByDiff[difficulty] || []);
    if (!pool.length) {
        document.getElementById('board').innerHTML = '<p>No positions available</p>';
        document.getElementById('turn').innerHTML  = '';
        return;
    }
    current_position = Math.floor(Math.random() * pool.length);
    const pos = pool[current_position];
    currentPuzzle = pos;
    currentPuzzleDifficulty = pos.Difficulty || difficulty;
    renderSVG(pos.SVG);
    correct_result = findResult(pos.Eval);
    document.getElementById("turn").innerHTML = pos.Turn;
    answered = false;
    currentPuzzleVoteCache = null;
    const resultEl = document.getElementById("result");
    resultEl.innerHTML = '<p id="resultText">Click a piece to make your choice</p>';
    resultEl.classList.remove("correct", "incorrect");
    document.getElementById("evaluation-display").innerHTML = "";
    // [COMMUNITY VOTES HIDDEN] const commEl = document.getElementById("community-results");
    // [COMMUNITY VOTES HIDDEN] if (commEl) commEl.innerHTML = "";   // ← re-enable to restore community panel
    hideAIExplanation();
    renderProvisionalNotice();
};

function sendAnswer(guess) {
    if (answered) return;
    if (isGuest && guestPuzzleCount >= GUEST_FREE_PUZZLES) {
        showGuestGate();
        return;
    }
    const resultEl = document.getElementById("result");
    if (guess === correct_result) {
        resultEl.innerHTML = '<p style="color:var(--ok);font-weight:700;">Correct</p>';
        resultEl.classList.remove("incorrect");
        resultEl.classList.add("correct");
    } else {
        resultEl.innerHTML = '<p style="color:var(--bad);font-weight:700;">Incorrect — the position is<br><span style="color:var(--text);">' + correct_result + '</span></p>';
        resultEl.classList.remove("correct");
        resultEl.classList.add("incorrect");
    }
    answered = true;
    const difficulty    = currentPuzzleDifficulty || getActiveDifficulty();
    const evaluationRaw = parseFloat(currentPuzzle.Eval) / 100;
    const displayEval   = evaluationRaw > 0 ? `+${evaluationRaw}` : `${evaluationRaw}`;
    document.getElementById("evaluation-display").innerHTML = `Evaluation&nbsp;&nbsp;${displayEval}`;
    const wasCorrect = guess === correct_result;
    updatePR(difficulty, wasCorrect);

    // Patch posEval into the history entry that updatePR just pushed.
    if (prHistory.length > 0) {
        prHistory[prHistory.length - 1].posEval = evaluationRaw;
    }

    // Achievements are checked only after a completed puzzle can change relevant
    // progress. Definitions are local; this persists just the compact user state.
    if (!isGuest) {
        sessionAnswers++;
        if (wasCorrect) sessionCorrect++;
        recordPuzzleActivity();
        void (async () => {
            try {
                await saveStatsToFirebase();
                await checkAchievements({ refreshRank: true });
            } catch (error) {
                console.error('Could not save achievement progress:', error);
            }
        })();
    }

    if (isGuest) {
        guestPuzzleCount++;
        if (guestPuzzleCount >= GUEST_FREE_PUZZLES) {
            // Let them see this result, then gate on their next "Next Position" click
        }
    }

    // [COMMUNITY VOTES HIDDEN] Submit community vote and render results — async, never blocks the UI
    // submitCommunityVote(guess, correct_result);   // ← re-enable to restore community panel

    // Reveal AI explanation for this puzzle (why + themes only)
    revealAIExplanation(currentPuzzle);
}
window.sendAnswer = sendAnswer;

// ── AI Explanation helpers ────────────────────────────────────────────────────
// Only `why` and `themes` are used in v1.0.
// The section is pre-rendered but kept display:none until after a guess.
function revealAIExplanation(puzzle) {
    const container = document.getElementById('ai-explanation');
    const whyEl     = document.getElementById('ai-exp-why');
    const themesEl  = document.getElementById('ai-exp-themes');
    if (!container || !whyEl || !themesEl) return;

    const exp = puzzle && puzzle.AIExplanation;

    // Populate "why" — fall back gracefully when field is absent
    whyEl.textContent = (exp && exp.why) ? exp.why : '';

    // Populate theme pills
    themesEl.innerHTML = '';
    const themes = (exp && Array.isArray(exp.themes)) ? exp.themes : [];
    themes.forEach(theme => {
        if (!theme || typeof theme !== 'string') return;
        const pill = document.createElement('span');
        pill.className   = 'ai-theme-tag';
        pill.textContent = theme;
        themesEl.appendChild(pill);
    });

    // Only show the block if there's at least something to display
    if ((exp && exp.why) || themes.length) {
        // Re-trigger the entry animation on each reveal
        container.classList.remove('visible');
        // Force reflow so the animation restarts cleanly
        void container.offsetWidth;
        container.classList.add('visible');
    }
}

function hideAIExplanation() {
    const container = document.getElementById('ai-explanation');
    if (container) container.classList.remove('visible');
}

function showGuestGate() {
    const gate = document.getElementById('guest-gate');
    if (gate) gate.style.display = 'flex';
}
window.showGuestGate = showGuestGate;

function findResult(evaluation) {
    if ((Math.abs(parseFloat(evaluation)) / 100) <= 1) return "Equal";
    if (Math.sign(parseFloat(evaluation)) === 1)       return "White Winning";
    return "Black Winning";
}

function renderSVG(svg) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    boardEl.innerHTML = svg;
}

// ── Help modal ────────────────────────────────────────────────────────────────
window.onload = function() {
    const params     = new URLSearchParams(window.location.search);
    const firstVisit = !sessionStorage.getItem('helpSeen');
    if (params.get('welcome') === '1') {
        openModal();
        history.replaceState(null, '', window.location.pathname);
    } else if (firstVisit) {
        openModal();
        sessionStorage.setItem('helpSeen', '1');
    }
};

function closeModal() {
    const el = document.getElementById("modal");
    if (el) el.style.display = "none";
}
window.closeModal = closeModal;

function openModal() {
    const el = document.getElementById("modal");
    if (el) el.style.display = "flex";
}
window.openModal = openModal;

// ── Settings modal ────────────────────────────────────────────────────────────
// ── Difficulty selection UI helpers ───────────────────────────────────────────
function updateSettingsDifficultyUI() {
    const active = difficultyOverride || 'Adaptive';
    document.querySelectorAll('.diff-option-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diff === active);
    });
    // Update the description text
    const desc = document.getElementById('diff-override-desc');
    if (!desc) return;
    const descriptions = {
        Adaptive: 'Puzzles adjust to your current PR, balancing attainable evaluations with positions that stretch your judgment. Recommended for most training sessions.',
        Easy:     'Uses clearer advantages and easier-to-spot imbalances. Ideal for building confidence in the fundamental positional signals that should stand out quickly.',
        Medium:   'Uses strategically richer positions where activity, space, structure, and king safety must be weighed together before making your call.',
        Hard:     'Uses quieter, competing imbalances where the evaluation may depend on long-term coordination, initiative, and recognizing the more durable plan.',
    };
    desc.textContent = descriptions[active] || '';
}

// ── Difficulty panel (wide left training column) ───────────────────────────
function updateDifficultyPanelUI() {
    const active = difficultyOverride || 'Adaptive';
    document.querySelectorAll('.diff-panel-btn').forEach(btn => {
        const isActive = btn.dataset.diff === active;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
    });
    const desc = document.getElementById('diff-panel-desc');
    if (desc) {
        const descriptions = {
            Adaptive: 'Adaptive selects positions around your current Positional Rating, giving you a steady mix of attainable and stretching evaluations. It is the recommended default for most training sessions.',
            Easy:     'Easy positions usually offer clearer structural or material clues. Use this mode to reinforce the basic positional signals that should be visible in your first impression.',
            Medium:   'Medium positions ask you to compare several meaningful factors—activity, space, pawn structure, and king safety—before deciding which side has the better game.',
            Hard:     'Hard positions contain quieter, competing imbalances. Your judgment may depend on long-term coordination, initiative, and recognizing which side has the more durable strategic plan.',
        };
        desc.textContent = descriptions[active] || '';
    }
}
window.updateDifficultyPanelUI = updateDifficultyPanelUI;

window.openSettings = function() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const prDisplay = document.getElementById('settings-pr-display');
    if (prDisplay) prDisplay.textContent = playerPR;
    const usernameInput = document.getElementById('settings-username-input');
    const usernameStatus = document.getElementById('settings-username-status');
    if (usernameInput) {
        usernameInput.value = isGuest ? '' : currentUsername;
        usernameInput.disabled = isGuest;
        usernameInput.placeholder = isGuest ? 'Sign in to change username' : 'Choose a username';
    }
    if (usernameStatus) {
        usernameStatus.textContent = isGuest ? 'Sign in to edit your username.' : '';
        usernameStatus.className = 'settings-status';
    }
    cancelResetConfirm();
    updateSettingsDifficultyUI();
    modal.style.display = 'flex';
};

window.closeSettings = function() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
};

window.showResetConfirm = function() {
    document.getElementById('reset-confirm-area').style.display   = 'none';
    document.getElementById('reset-confirm-prompt').style.display = 'block';
};

window.cancelResetConfirm = function() {
    const area   = document.getElementById('reset-confirm-area');
    const prompt = document.getElementById('reset-confirm-prompt');
    if (area)   area.style.display   = 'block';
    if (prompt) prompt.style.display = 'none';
};

window.saveUsername = async function() {
    const input = document.getElementById('settings-username-input');
    const status = document.getElementById('settings-username-status');
    if (!input || !status) return;

    status.className = 'settings-status';
    if (isGuest || !currentUID || !currentUser) {
        status.textContent = 'Sign in to edit your username.';
        status.classList.add('error');
        return;
    }

    const nextUsername = input.value.trim().replace(/\s+/g, ' ');
    if (nextUsername.length < 3 || nextUsername.length > 18) {
        status.textContent = 'Use 3 to 18 characters.';
        status.classList.add('error');
        return;
    }
    if (!/^[A-Za-z0-9 _.-]+$/.test(nextUsername)) {
        status.textContent = 'Use letters, numbers, spaces, dots, dashes, or underscores.';
        status.classList.add('error');
        return;
    }

    input.disabled = true;
    status.textContent = 'Saving...';

    try {
        await update(ref(db, `users/${currentUID}`), { username: nextUsername });
        await updateProfile(currentUser, { displayName: nextUsername });
        currentUsername = nextUsername;

        const nameEl = document.getElementById('header-username');
        if (nameEl) nameEl.textContent = nextUsername;

        input.value = nextUsername;
        status.textContent = 'Username updated.';
        status.className = 'settings-status success';
    } catch (error) {
        console.error(error);
        status.textContent = 'Could not update username. Try again.';
        status.className = 'settings-status error';
    } finally {
        input.disabled = false;
    }
};

window.confirmResetPR = async function() {
    playerPR      = PR_START;
    totalPuzzles  = 0;
    currentStreak = 0;
    correctCount  = 0;
    wrongCount    = 0;
    bestStreak    = 0;
    peakPR        = PR_START;
    prHistory     = [];

    await saveStatsToFirebase();
    renderPR();
    renderProvisionalNotice();

    const prDisplay = document.getElementById('settings-pr-display');
    if (prDisplay) {
        prDisplay.textContent = playerPR;
        prDisplay.classList.remove('reset-flash');
        void prDisplay.offsetWidth;
        prDisplay.classList.add('reset-flash');
    }
    cancelResetConfirm();
};

// ── Stats modal ───────────────────────────────────────────────────────────────
window.openStats = function() {
    const modal = document.getElementById('stats-modal');
    if (!modal) return;
    populateStatsModal();
    switchStatsTab('overview');   // always open on overview
    modal.style.display = 'flex';
};

window.closeStats = function() {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.style.display = 'none';
};

window.switchStatsTab = function(tab) {
    document.querySelectorAll('.stats-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.stats-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
    if (tab === 'log') renderPuzzleLog();
};

function populateStatsModal() {
    // ── KPI cards ──────────────────────────────────────────────────────────────
    const accuracy = totalPuzzles > 0
        ? Math.round((correctCount / totalPuzzles) * 100) + '%'
        : '—';

    const streakDisplay = currentStreak === 0 ? '—'
        : currentStreak > 0 ? `+${currentStreak} ✓`
        : `${currentStreak} ✗`;

    setText('stat-pr',       playerPR);
    setText('stat-puzzles',  totalPuzzles);
    setText('stat-streak',   streakDisplay);
    setText('stat-accuracy', accuracy);

    // ── Breakdown grid ─────────────────────────────────────────────────────────
    const activeDiff = getActiveDifficulty();
    const diffDisplay = isProvisionalMode()
        ? `Provisional ${Math.min(totalPuzzles + 1, PROVISIONAL_PUZZLES)}/${PROVISIONAL_PUZZLES}`
        : difficultyOverride
        ? difficultyOverride
        : activeDiff;
    setText('stat-difficulty', diffDisplay);
    setText('stat-best-streak', bestStreak > 0 ? `${bestStreak} ✓` : '—');
    setText('stat-correct',     correctCount);
    setText('stat-wrong',       wrongCount);
    setText('stat-peak-pr',     peakPR);

    // PR change over last 10 snapshots
    let recentDeltaEl = document.getElementById('stat-recent-delta');
    if (prHistory.length >= 2) {
        const slice = prHistory.slice(-10);
        const delta = slice[slice.length - 1].pr - slice[0].pr;
        const sign  = delta >= 0 ? '+' : '';
        recentDeltaEl.textContent = `${sign}${delta}`;
        recentDeltaEl.className = 'stats-detail-value ' + (delta >= 0 ? 'positive' : 'negative');
    } else {
        recentDeltaEl.textContent = '—';
        recentDeltaEl.className = 'stats-detail-value';
    }

    // ── PR change badge ────────────────────────────────────────────────────────
    const badge = document.getElementById('stat-pr-change-badge');
    if (badge && prHistory.length >= 2) {
        const allDelta = prHistory[prHistory.length - 1].pr - prHistory[0].pr;
        const sign     = allDelta >= 0 ? '+' : '';
        badge.textContent = `${sign}${allDelta} overall`;
        badge.className   = 'stats-pr-change-badge ' + (allDelta >= 0 ? 'gain' : 'loss');
    } else if (badge) {
        badge.textContent = '';
        badge.className   = 'stats-pr-change-badge';
    }

    // ── Sparkline chart ────────────────────────────────────────────────────────
    renderSparkline();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderSparkline() {
    const svg = document.getElementById('stats-sparkline');
    if (!svg) return;

    // Clear previous content
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = 480, H = 120, PAD = 16;

    if (prHistory.length < 2) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', W / 2);
        text.setAttribute('y', H / 2 + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'rgba(165,165,178,0.7)');
        text.setAttribute('font-size', '13');
        text.setAttribute('font-family', 'JetBrains Mono, monospace');
        text.textContent = 'Play more puzzles to see your trend';
        svg.appendChild(text);
        document.getElementById('chart-label-left').textContent  = '';
        document.getElementById('chart-label-right').textContent = '';
        return;
    }

    const vals   = prHistory.map(p => p.pr);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const range  = maxVal - minVal || 1;

    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;

    // Map data to SVG coords
    const points = vals.map((v, i) => {
        const x = PAD + (i / (vals.length - 1)) * innerW;
        const y = PAD + innerH - ((v - minVal) / range) * innerH;
        return [x, y];
    });

    // Gradient definition
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', 'sparkGrad');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#ffd400');
    stop1.setAttribute('stop-opacity', '0.35');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#ffd400');
    stop2.setAttribute('stop-opacity', '0.02');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Area fill path (closed polygon beneath the line)
    const areaD = `M${points[0][0]},${H - PAD} `
        + points.map(p => `L${p[0]},${p[1]}`).join(' ')
        + ` L${points[points.length - 1][0]},${H - PAD} Z`;
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', areaD);
    area.setAttribute('fill', 'url(#sparkGrad)');
    svg.appendChild(area);

    // Y-axis gridlines (min / mid / max)
    [0, 0.5, 1].forEach(frac => {
        const y = PAD + innerH - frac * innerH;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', PAD); line.setAttribute('x2', W - PAD);
        line.setAttribute('y1', y);   line.setAttribute('y2', y);
        line.setAttribute('stroke', 'rgba(255,212,0,0.12)');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', PAD - 4);
        label.setAttribute('y', y + 4);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('fill', 'rgba(165,165,178,0.6)');
        label.setAttribute('font-size', '9');
        label.setAttribute('font-family', 'JetBrains Mono, monospace');
        label.textContent = Math.round(minVal + frac * range);
        svg.appendChild(label);
    });

    // Line
    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', lineD);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#ffd400');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);

    // Dots on each point
    points.forEach(([x, y]) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', vals.length > 20 ? '0' : '3');
        circle.setAttribute('fill', '#ffd400');
        circle.setAttribute('stroke', '#08080a');
        circle.setAttribute('stroke-width', '1.5');
        svg.appendChild(circle);
    });

    // First and last endpoint highlight (always visible)
    [[points[0], vals[0]], [points[points.length - 1], vals[vals.length - 1]]].forEach(([[x, y], v]) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', '5');
        c.setAttribute('fill', '#ffd400'); c.setAttribute('stroke', '#08080a'); c.setAttribute('stroke-width', '2');
        svg.appendChild(c);
    });

    // Date range labels
    const fmt = ts => {
        const d = new Date(ts);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    const leftLbl  = document.getElementById('chart-label-left');
    const rightLbl = document.getElementById('chart-label-right');
    if (leftLbl)  leftLbl.textContent  = fmt(prHistory[0].ts) + ` (${prHistory[0].pr})`;
    if (rightLbl) rightLbl.textContent = fmt(prHistory[prHistory.length - 1].ts) + ` (${prHistory[prHistory.length - 1].pr})`;
}

// ── Puzzle log tab ────────────────────────────────────────────────────────────
window.renderPuzzleLog = function() { renderPuzzleLog(); };
function renderPuzzleLog() {
    const container = document.getElementById('log-list');
    const netEl     = document.getElementById('log-net-delta');
    const dropdown  = document.getElementById('log-count-select');
    if (!container) return;

    const count  = parseInt(dropdown ? dropdown.value : '10', 10);
    const slice  = prHistory.slice(-count).reverse();  // most recent first

    // Net PR change over the selected window
    if (slice.length >= 2) {
        const net  = slice[0].pr - slice[slice.length - 1].pr;
        const sign = net >= 0 ? '+' : '';
        netEl.textContent = `${sign}${net} PR`;
        netEl.className   = 'log-net-value ' + (net >= 0 ? 'positive' : 'negative');
    } else if (slice.length === 1) {
        netEl.textContent = `${slice[0].delta >= 0 ? '+' : ''}${slice[0].delta} PR`;
        netEl.className   = 'log-net-value ' + (slice[0].delta >= 0 ? 'positive' : 'negative');
    } else {
        netEl.textContent = '—';
        netEl.className   = 'log-net-value';
    }

    if (!slice.length) {
        container.innerHTML = `<div class="log-empty">No puzzles played yet. Start solving to build your history.</div>`;
        return;
    }

    const fmt = ts => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    container.innerHTML = slice.map((entry, i) => {
        const num        = prHistory.length - i;
        const sign       = entry.delta >= 0 ? '+' : '';
        const deltaClass = entry.delta >= 0 ? 'positive' : 'negative';
        const resultClass  = entry.correct ? 'correct' : 'incorrect';
        const resultLabel  = entry.correct ? '✓' : '✗';
        const posEval    = entry.posEval !== null && entry.posEval !== undefined
            ? (entry.posEval > 0 ? `+${entry.posEval.toFixed(2)}` : entry.posEval.toFixed(2))
            : '—';
        const diff = entry.difficulty || '—';
        const time = entry.ts ? fmt(entry.ts) : '—';

        return `
        <div class="log-row ${resultClass}">
            <span class="log-num">#${num}</span>
            <span class="log-result-icon ${resultClass}">${resultLabel}</span>
            <span class="log-pr">${entry.pr}</span>
            <span class="log-delta ${deltaClass}">${sign}${entry.delta}</span>
            <span class="log-eval">${posEval}</span>
            <span class="log-diff diff-${diff.toLowerCase()}">${diff}</span>
            <span class="log-time">${time}</span>
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMMUNITY RESULTS  [HIDDEN — data preserved in Firebase, UI disabled]
//  To restore: uncomment this entire block and the submitCommunityVote() call
//  in sendAnswer(), and the community-results clear in nextPosition().
// ══════════════════════════════════════════════════════════════════════════════

// // Sanitise a Firebase key string — strip chars Firebase disallows in paths
// function safeVoteKey(k) {
//     return k ? String(k).replace(/[.#$/[\]\s]/g, '_') : null;
// }
//
// async function submitCommunityVote(userGuess, correctAnswer) {
//     const container = document.getElementById('community-results');
//     if (!container) return;
//
//     // Show skeleton immediately so there's no blank gap
//     container.innerHTML = buildCommSkeleton();
//
//     const rawKey    = currentPuzzle && currentPuzzle._key ? currentPuzzle._key : null;
//     const puzzleKey = safeVoteKey(rawKey);
//
//     if (!puzzleKey) {
//         // No stable key — can't store votes (shouldn't happen after Object.entries fix)
//         container.innerHTML = '';
//         return;
//     }
//
//     const voteRef  = ref(db, `puzzleVotes/${puzzleKey}`);
//     const voterRef = (!isGuest && currentUID)
//         ? ref(db, `puzzleVotes/${puzzleKey}/voters/${currentUID}`)
//         : null;
//
//     try {
//         // Check dupe vote (signed-in users only)
//         let alreadyVoted = false;
//         if (voterRef) {
//             const voterSnap = await get(voterRef);
//             alreadyVoted = voterSnap.exists();
//         }
//
//         // Fetch current counters
//         const snap  = await get(voteRef);
//         const raw   = snap.exists() ? snap.val() : {};
//         const votes = {
//             white: raw.white || 0,
//             equal: raw.equal || 0,
//             black: raw.black || 0,
//             total: raw.total || 0,
//         };
//
//         // Remember whether anyone had voted before this submission
//         const wasEmpty = votes.total === 0;
//
//         // Write only if signed in and haven't voted on this puzzle yet
//         if (!isGuest && !alreadyVoted && currentUID) {
//             const vk = userGuess === 'White Winning' ? 'white'
//                      : userGuess === 'Black Winning' ? 'black'
//                      : 'equal';
//             votes[vk]++;
//             votes.total++;
//
//             await update(voteRef, {
//                 white: votes.white,
//                 equal: votes.equal,
//                 black: votes.black,
//                 total: votes.total,
//             });
//             // Mark this user as having voted so re-opening won't double-count
//             await set(voterRef, { answer: userGuess, ts: Date.now() });
//         }
//
//         // Cache so reopening the result doesn't re-fetch
//         currentPuzzleVoteCache = { votes, userGuess, correctAnswer, wasEmpty };
//         renderCommunityCard(container, currentPuzzleVoteCache);
//
//     } catch (err) {
//         console.error('Community vote error:', err);
//         container.innerHTML = '';
//     }
// }
//
// function buildCommSkeleton() {
//     return `<div class="comm-card">
//         <div class="comm-header">
//             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
//                  stroke-linecap="round" stroke-linejoin="round">
//                 <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
//                 <circle cx="9" cy="7" r="4"/>
//                 <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
//                 <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
//             </svg>
//             <span>Community Results</span>
//             <div class="comm-skel-chip"></div>
//         </div>
//         <div class="comm-skeleton">
//             <div class="comm-skel-row"><div class="comm-skel-label"></div><div class="comm-skel-bar"></div></div>
//             <div class="comm-skel-row"><div class="comm-skel-label"></div><div class="comm-skel-bar" style="width:65%"></div></div>
//             <div class="comm-skel-row"><div class="comm-skel-label"></div><div class="comm-skel-bar" style="width:45%"></div></div>
//         </div>
//     </div>`;
// }
//
// function renderCommunityCard(container, { votes, userGuess, correctAnswer, wasEmpty }) {
//     if (wasEmpty) {
//         // This user is the first — show friendly first-contributor message
//         container.innerHTML = `<div class="comm-card">
//             <div class="comm-header">
//                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
//                      stroke-linecap="round" stroke-linejoin="round">
//                     <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
//                     <circle cx="9" cy="7" r="4"/>
//                     <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
//                     <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
//                 </svg>
//                 <span>Community Results</span>
//             </div>
//             <p class="comm-empty">No community data yet — you're the first to answer this position!</p>
//         </div>`;
//         return;
//     }
//
//     const total = votes.total || 1; // guard /0; total is always ≥1 here
//     const pct   = v => Math.round((v / total) * 100);
//     const pw = pct(votes.white);
//     const pe = pct(votes.equal);
//     const pb = pct(votes.black);
//
//     const rows = [
//         { key: 'White Winning', label: '♔ White', count: votes.white, p: pw, barCls: 'bar-white' },
//         { key: 'Equal',         label: '⚖ Equal', count: votes.equal, p: pe, barCls: 'bar-equal' },
//         { key: 'Black Winning', label: '♚ Black', count: votes.black, p: pb, barCls: 'bar-black' },
//     ];
//
//     const rowsHTML = rows.map(r => {
//         const isYou     = r.key === userGuess;
//         const isCorrect = r.key === correctAnswer;
//
//         const badge = (isYou && isCorrect) ? `<span class="comm-badge comm-badge--both">✓ You</span>`
//                     : isYou               ? `<span class="comm-badge comm-badge--you">You</span>`
//                     : isCorrect           ? `<span class="comm-badge comm-badge--correct">✓</span>`
//                     : '';
//
//         const rowMod = (isYou || isCorrect) ? ' comm-row--hl' : '';
//         const barMod = isCorrect ? ' bar-correct' : '';
//
//         return `<div class="comm-row${rowMod}">
//             <div class="comm-row-top">
//                 <span class="comm-lbl">${r.label}</span>
//                 <div class="comm-meta">${badge}<span class="comm-pct">${r.p}%</span><span class="comm-count">${r.count}</span></div>
//             </div>
//             <div class="comm-track">
//                 <div class="comm-fill ${r.barCls}${barMod}" style="width:0" data-w="${r.p}%"></div>
//             </div>
//         </div>`;
//     }).join('');
//
//     container.innerHTML = `<div class="comm-card">
//         <div class="comm-header">
//             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
//                  stroke-linecap="round" stroke-linejoin="round">
//                 <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
//                 <circle cx="9" cy="7" r="4"/>
//                 <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
//                 <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
//             </svg>
//             <span>Community Results</span>
//             <span class="comm-total">${total} vote${total !== 1 ? 's' : ''}</span>
//         </div>
//         ${rowsHTML}
//     </div>`;
//
//     // Animate bars — needs two rAF ticks so the browser registers the 0-width start
//     requestAnimationFrame(() => requestAnimationFrame(() => {
//         container.querySelectorAll('.comm-fill[data-w]').forEach(bar => {
//             bar.style.width = bar.getAttribute('data-w');
//         });
//     }));
// }

window.openSidebar = function() {
    const sidebarEl = document.getElementById('sidebar');
    const overlayEl = document.getElementById('sidebar-overlay');
    if (!sidebarEl || !overlayEl) return;
    sidebarEl.classList.add('open');
    overlayEl.classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeSidebar = function() {
    const sidebarEl = document.getElementById('sidebar');
    const overlayEl = document.getElementById('sidebar-overlay');
    if (!sidebarEl || !overlayEl) return;
    sidebarEl.classList.remove('open');
    overlayEl.classList.remove('open');
    document.body.style.overflow = 'auto';
};

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeSidebar();
        window.closeSettings && window.closeSettings();
        window.closeStats    && window.closeStats();
        window.closeAchievements && window.closeAchievements();
        window.closePOTD && window.closePOTD();
    }
});

// ══════════════════════════════════════════════════════════════════════════════
//  DARK / LIGHT THEME TOGGLE
//  Reading the saved theme is handled by experience.js (runs on all pages).
//  This file only needs the toggle function since the button is index-only.
// ══════════════════════════════════════════════════════════════════════════════
window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    if (next === 'dark') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('chessiq-theme', next);
};

// ══════════════════════════════════════════════════════════════════════════════
//  PR MILESTONE TOAST
// ══════════════════════════════════════════════════════════════════════════════
const PR_MILESTONES = [
    { pr: 1000, title: 'Four Digits!',       desc: 'Your PR just crossed 1,000. You\'re finding your footing.' },
    { pr: 1200, title: 'Club Player',         desc: 'PR 1,200 — you\'re reading positions with real intent now.' },
    { pr: 1500, title: 'Intermediate Eye',    desc: 'PR 1,500 — positional patterns are clicking for you.' },
    { pr: 1800, title: 'Advanced Vision',     desc: 'PR 1,800 — most players never see what you\'re seeing.' },
    { pr: 2100, title: 'Expert Level',        desc: 'PR 2,100 — you evaluate like a tournament player.' },
    { pr: 2400, title: 'Master Class',        desc: 'PR 2,400 — elite positional understanding.' },
    { pr: 2700, title: 'Grandmaster Eye',     desc: 'PR 2,700 — you see the board like the best in the world.' },
    { pr: 3000, title: 'Legendary',           desc: 'PR 3,000 — almost no one reaches this.' },
];

var toastTimer = null;
var shownMilestones = new Set(
    JSON.parse(localStorage.getItem('chessiq-milestones') || '[]')
);

function checkMilestone(newPR) {
    for (const m of PR_MILESTONES) {
        if (newPR >= m.pr && !shownMilestones.has(m.pr)) {
            shownMilestones.add(m.pr);
            localStorage.setItem('chessiq-milestones', JSON.stringify([...shownMilestones]));
            showMilestoneToast(m, newPR);
            break; // only one toast at a time
        }
    }
}

function showMilestoneToast(milestone, pr) {
    const toast   = document.getElementById('pr-milestone-toast');
    const titleEl = document.getElementById('toast-title');
    const descEl  = document.getElementById('toast-desc');
    const prEl    = document.getElementById('toast-pr-val');
    if (!toast) return;

    titleEl.textContent = milestone.title;
    descEl.textContent  = milestone.desc;
    prEl.textContent    = pr;

    // Reset animation
    toast.classList.remove('show');
    void toast.offsetWidth;

    // Rebuild progress bar (restart animation)
    const oldBar = toast.querySelector('.toast-progress');
    if (oldBar) oldBar.remove();
    const bar = document.createElement('div');
    bar.className = 'toast-progress';
    toast.appendChild(bar);

    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dismissToast(), 4000);
}

window.dismissToast = function() {
    const toast = document.getElementById('pr-milestone-toast');
    if (toast) toast.classList.remove('show');
    clearTimeout(toastTimer);
};

// Hook into renderPR to check milestones after every PR update

// ══════════════════════════════════════════════════════════════════════════════
//  PUZZLE OF THE DAY
// ══════════════════════════════════════════════════════════════════════════════
// todayUTCDate() is defined above in the decay section — reuse it here
function todayUTC() { return todayUTCDate(); }

var potdData      = null;   // { positionKey, date, eval, turn, svg, correctAnswer }
var potdAnswered  = false;
var potdUserAnswer = null;

// Called once positions are loaded
async function initPOTD() {
    const today    = todayUTC();
    const potdRef  = ref(db, `potd/${today}`);
    const potdSnap = await get(potdRef);

    if (potdSnap.exists()) {
        // Use existing daily puzzle
        potdData = potdSnap.val();
    } else {
        // Generate today's puzzle — pick one position at random from full pool
        if (!positions.length) return;
        const pick = positions[Math.floor(Math.random() * positions.length)];
        const key  = pick.id || pick.key || String(Math.floor(Math.random() * 1e9));
        potdData   = {
            date:          today,
            positionKey:   key,
            svg:           pick.SVG,
            turn:          pick.Turn,
            eval:          pick.Eval,
            correctAnswer: findResult(pick.Eval),
            votes:         { White: 0, Equal: 0, Black: 0 },
        };
        // Only write if signed in to avoid anonymous ballot stuffing
        if (!isGuest) {
            await set(potdRef, potdData);
        }
    }

    updatePOTDCard();

    // Check if this user already answered today
    if (!isGuest && currentUID) {
        const userPOTD = await get(ref(db, `users/${currentUID}/potd/${today}`));
        if (userPOTD.exists()) {
            potdAnswered   = true;
            potdUserAnswer = userPOTD.val().answer;
            updatePOTDCard();
        }
    }
}

function updatePOTDCard() {
    const sub   = document.getElementById('potd-card-sub');
    const badge = document.getElementById('potd-card-badge');
    const today = todayUTC();
    const label = today;

    if (!potdData) {
        if (sub) sub.textContent = 'Loading...';
        return;
    }
    if (sub) sub.textContent = `${label} — ${potdAnswered ? 'Answered' : 'Ready to play'}`;
    if (badge) {
        badge.textContent = potdAnswered ? 'DONE' : 'PLAY';
        badge.className   = 'potd-badge' + (potdAnswered ? ' done' : '');
    }
    // Sync navbar button
    const navBtn = document.getElementById('potd-nav-btn');
    if (navBtn) {
        navBtn.classList.toggle('pending', !potdAnswered);
        navBtn.classList.toggle('done',    potdAnswered);
    }
}

window.openPOTD = function() {
    if (!potdData) return;
    const modal = document.getElementById('potd-modal');
    if (!modal) return;

    // Populate board
    document.getElementById('potd-modal-board').innerHTML = potdData.svg || '<p>Loading...</p>';
    document.getElementById('potd-modal-turn').textContent = potdData.turn || '';
    document.getElementById('potd-modal-date').textContent =
        'Puzzle of the Day — ' + potdData.date;

    // Countdown to next puzzle
    renderPOTDCountdown();

    if (!isGuest) {
        document.getElementById('potd-signin-notice').style.display = 'none';
        const choicesEl = document.getElementById('potd-choices');

        if (potdAnswered) {
            // Show result immediately
            disablePOTDButtons(potdUserAnswer, potdData.correctAnswer);
            showPOTDResult(potdUserAnswer, potdData.correctAnswer, potdData.eval, potdData.votes);
        } else {
            // Re-enable buttons for fresh attempt
            choicesEl.style.display = 'grid';
            ['potd-btn-white','potd-btn-equal','potd-btn-black'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) { btn.disabled = false; btn.className = 'potd-choice-btn'; }
            });
            document.getElementById('potd-result-box').classList.remove('visible');
        }
    } else {
        document.getElementById('potd-signin-notice').style.display = 'block';
        document.getElementById('potd-choices').style.display = 'none';
        document.getElementById('potd-result-box').classList.remove('visible');
    }

    modal.style.display = 'flex';
};

window.closePOTD = function() {
    const modal = document.getElementById('potd-modal');
    if (modal) modal.style.display = 'none';
};

window.submitPOTD = async function(answer) {
    if (potdAnswered || isGuest || !potdData) return;
    const today = todayUTC();

    // Disable buttons immediately
    disablePOTDButtons(answer, potdData.correctAnswer);

    // Increment vote in Firebase
    const votesRef  = ref(db, `potd/${today}/votes`);
    const votesSnap = await get(votesRef);
    const votes = votesSnap.exists() ? votesSnap.val() : { White: 0, Equal: 0, Black: 0 };
    const key = answer === 'White Winning' ? 'White' : answer === 'Black Winning' ? 'Black' : 'Equal';
    votes[key] = (votes[key] || 0) + 1;
    await set(votesRef, votes);
    potdData.votes = votes;

    // Save user's answer.
    const dailyResult = {
        answer:  answer,
        correct: answer === potdData.correctAnswer,
        ts:      Date.now(),
    };
    await set(ref(db, `users/${currentUID}/potd/${today}`), dailyResult);
    dailyPuzzleHistory[today] = dailyResult;

    // A Daily Puzzle also represents a genuine training day, so update the
    // compact activity counters before checking Daily / Consistency milestones.
    recordPuzzleActivity();
    await saveStatsToFirebase();
    await checkAchievements({ refreshRank: false });

    potdAnswered   = true;
    potdUserAnswer = answer;

    showPOTDResult(answer, potdData.correctAnswer, potdData.eval, votes);
    updatePOTDCard();

    // Live-listen for community vote updates
    listenPOTDVotes(today);
};

function disablePOTDButtons(userAnswer, correct) {
    const map = {
        'White Winning': 'potd-btn-white',
        'Equal':         'potd-btn-equal',
        'Black Winning': 'potd-btn-black',
    };
    ['White Winning', 'Equal', 'Black Winning'].forEach(opt => {
        const btn = document.getElementById(map[opt]);
        if (!btn) return;
        btn.disabled = true;
        if (opt === userAnswer) {
            btn.className = 'potd-choice-btn ' + (opt === correct ? 'selected-correct' : 'selected-wrong');
        } else if (opt === correct) {
            btn.className = 'potd-choice-btn reveal-correct';
        } else {
            btn.className = 'potd-choice-btn';
        }
    });
}

function showPOTDResult(userAnswer, correct, evalRaw, votes) {
    const box     = document.getElementById('potd-result-box');
    const titleEl = document.getElementById('potd-result-title');
    const evalEl  = document.getElementById('potd-eval-line');

    const isCorrect = userAnswer === correct;
    titleEl.textContent = isCorrect ? '✓ Correct!' : `✗ Incorrect — the answer was ${correct}`;
    titleEl.className   = 'potd-result-title ' + (isCorrect ? 'correct' : 'wrong');

    const evalVal = parseFloat(evalRaw) / 100;
    evalEl.innerHTML    = `Engine eval: <span>${evalVal > 0 ? '+' : ''}${evalVal.toFixed(2)}</span>`;

    updatePOTDVoteBars(votes);
    box.classList.add('visible');
}

function updatePOTDVoteBars(votes) {
    const total = (votes.White || 0) + (votes.Equal || 0) + (votes.Black || 0);
    const pct = v => total ? Math.round((v / total) * 100) : 0;
    const pw = pct(votes.White || 0);
    const pe = pct(votes.Equal || 0);
    const pb = pct(votes.Black || 0);

    document.getElementById('bar-white').style.width = pw + '%';
    document.getElementById('bar-equal').style.width = pe + '%';
    document.getElementById('bar-black').style.width = pb + '%';
    document.getElementById('pct-white').textContent = pw + '%';
    document.getElementById('pct-equal').textContent = pe + '%';
    document.getElementById('pct-black').textContent = pb + '%';
}

var potdVoteListener = null;
function listenPOTDVotes(today) {
    if (potdVoteListener) return; // already listening
    const { onValue } = window.__fbOnValue || {};
    // We import onValue dynamically since it's not in scope here
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js").then(m => {
        potdVoteListener = m.onValue(ref(db, `potd/${today}/votes`), snap => {
            if (snap.exists()) updatePOTDVoteBars(snap.val());
        });
    });
}

function renderPOTDCountdown() {
    const el = document.getElementById('potd-countdown');
    if (!el) return;
    const now   = new Date();
    const next  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const diff  = next - now;
    const h     = Math.floor(diff / 3600000);
    const m     = Math.floor((diff % 3600000) / 60000);
    const s     = Math.floor((diff % 60000) / 1000);
    el.innerHTML = `Next puzzle in <span>${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}</span>`;
}
setInterval(renderPOTDCountdown, 1000);

// Wire POTD init after positions load — this replaces the original initPositions
function initPositions() {
    const boardEl = document.getElementById('board');
    const turnEl  = document.getElementById('turn');
    if (boardEl) boardEl.innerHTML = '<p style="padding:40px;text-align:center;">Loading positions...</p>';
    if (turnEl)  turnEl.innerHTML  = 'Loading...';

    get(ref(db, 'positions')).then((snapshot) => {
        if (snapshot.exists()) {
            // Preserve Firebase key as _key on each position — used for puzzleVotes path
            positions = Object.entries(snapshot.val()).map(([k, v]) => ({ ...v, _key: k }));
            positionsByDiff.Easy   = positions.filter(p => p.Difficulty === "Easy");
            positionsByDiff.Medium = positions.filter(p => p.Difficulty === "Medium");
            positionsByDiff.Hard   = positions.filter(p => p.Difficulty === "Hard");
            if (boardEl) loadPuzzleForPR();
            initPOTD(); // kick off POTD after positions are ready
        }
    }).catch((error) => {
        console.error(error);
        if (document.getElementById('board'))
            document.getElementById('board').innerHTML = '<p style="color:red;">Error loading positions</p>';
    });
}
// ══════════════════════════════════════════════════════════════════════════
//  GUESS SECTION — COLLAPSE / EXPAND
// ══════════════════════════════════════════════════════════════════════════

var _guessSectionCollapsed = false;

function _setToggleVisible(show) {
    const wrap = document.getElementById('guess-toggle-wrap');
    if (!wrap) return;
    if (show) {
        wrap.style.display = 'flex';
        void wrap.offsetWidth; // force reflow for transition
        wrap.classList.add('visible');
    } else {
        wrap.classList.remove('visible');
        setTimeout(() => { wrap.style.display = 'none'; }, 260);
    }
}

function _updateToggleArrow() {
    const btn = document.getElementById('guess-toggle-btn');
    if (!btn) return;
    btn.classList.toggle('expanded', !_guessSectionCollapsed);
}

function collapseGuessSection() {
    const section = document.getElementById('guess-section');
    if (!section || _guessSectionCollapsed) return;
    _guessSectionCollapsed = true;
    section.classList.add('collapsing');
    void section.offsetWidth;
    section.classList.add('collapsed');
    _setToggleVisible(true);
    _updateToggleArrow();
    setTimeout(() => section.classList.remove('collapsing'), 400);
}

function expandGuessSection(hideToggle) {
    const section = document.getElementById('guess-section');
    if (!section || !_guessSectionCollapsed) return;
    _guessSectionCollapsed = false;
    section.classList.add('expanding');
    void section.offsetWidth;
    section.classList.remove('collapsed');
    setTimeout(() => {
        section.classList.remove('expanding');
        if (hideToggle) {
            _setToggleVisible(false);
        } else {
            _updateToggleArrow();
        }
    }, 400);
    if (!hideToggle) _updateToggleArrow();
}

window.toggleGuessSection = function() {
    if (_guessSectionCollapsed) expandGuessSection(false);
    else collapseGuessSection();
};

// Patch sendAnswer — auto-collapse after result renders
var _origSendAnswer = window.sendAnswer;
window.sendAnswer = function(guess) {
    _origSendAnswer(guess);
    setTimeout(collapseGuessSection, 55);
};

// Patch nextPosition — auto-expand for new puzzle
var _origNextPosition = window.nextPosition;
window.nextPosition = function() {
    if (_guessSectionCollapsed) {
        expandGuessSection(true);
        setTimeout(() => _origNextPosition(), 35);
    } else {
        _setToggleVisible(false);
        _origNextPosition();
    }
};