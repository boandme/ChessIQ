var result;
var correct_result;
var answered = false;
var evaluation;

// ── Positional Rating constants ───────────────────────────────────────────────
const PR_MAX   = 3200;
const PR_START = 500;

// ── In-memory player state (loaded from Firebase after auth) ──────────────────
var playerPR      = PR_START;
var totalPuzzles  = 0;
var currentStreak = 0;
var currentUser   = null; // Firebase Auth user object
var currentUID    = null;

// ── PR formula helpers ────────────────────────────────────────────────────────
const PR_BASE = {
    Easy:   { correct: 45,  wrong: -70 },
    Medium: { correct: 61,  wrong: -61 },
    Hard:   { correct: 96,  wrong: -38 },
};

function confidenceMultiplier() {
    return 1 + 1.5 * Math.exp(-totalPuzzles / 15);
}

function streakMultiplier(correct) {
    if (correct && currentStreak > 0) {
        return 1 + Math.min(currentStreak, 5) * 0.10;
    }
    if (!correct && currentStreak < 0) {
        return 1 + Math.min(Math.abs(currentStreak), 5) * 0.10;
    }
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
    if (playerPR < 1066) return "Easy";
    if (playerPR < 2132) return "Medium";
    return "Hard";
}

// ── Firebase imports ──────────────────────────────────────────────────────────
import { initializeApp }                          from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, get, set, update }    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAnalytics }                           from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signOut }  from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

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

// ── Auth gate — must be signed in to use index.html ───────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Not signed in — send to login
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    currentUID  = user.uid;

    // Load player stats from Firebase
    const snap = await get(ref(db, `users/${currentUID}`));
    if (snap.exists()) {
        const data    = snap.val();
        playerPR      = data.pr           ?? PR_START;
        totalPuzzles  = data.totalPuzzles ?? 0;
        currentStreak = data.streak       ?? 0;
    } else {
        // Profile missing — write defaults (shouldn't normally happen)
        await set(ref(db, `users/${currentUID}`), {
            username:     user.displayName || 'Player',
            email:        user.email,
            pr:           PR_START,
            totalPuzzles: 0,
            streak:       0,
            createdAt:    Date.now(),
        });
    }

    // Show username in header
    const nameEl = document.getElementById('header-username');
    if (nameEl) nameEl.textContent = user.displayName || 'Player';

    // Update PR card
    renderPR();

    // Now load positions
    initPositions();
});

// ── Save player stats back to Firebase ───────────────────────────────────────
async function saveStatsToFirebase() {
    if (!currentUID) return;
    await update(ref(db, `users/${currentUID}`), {
        pr:           playerPR,
        totalPuzzles: totalPuzzles,
        streak:       currentStreak,
    });
}

// ── PR update (now saves to Firebase instead of localStorage) ─────────────────
function updatePR(difficulty, correct) {
    const base = PR_BASE[difficulty];
    if (!base) return;

    const baseValue    = correct ? base.correct : base.wrong;
    const ratingFactor = 1 - (playerPR / 4480);
    const confMult     = confidenceMultiplier();
    const streakMult   = streakMultiplier(correct);

    const delta = Math.round(baseValue * ratingFactor * confMult * streakMult);

    updateStreak(correct);
    totalPuzzles++;

    playerPR = Math.min(PR_MAX, Math.max(0, playerPR + delta));

    // Persist to Firebase (fire-and-forget)
    saveStatsToFirebase();

    const sign = delta >= 0 ? '+' : '';
    const streakLabel = currentStreak > 1  ? `x${currentStreak} correct streak`
                      : currentStreak < -1 ? `x${Math.abs(currentStreak)} wrong streak`
                      : 'no streak';
    console.log(
        `PR update | difficulty: ${difficulty} | correct: ${correct} | ` +
        `delta: ${sign}${delta} | confMult: x${confMult.toFixed(2)} | ` +
        `streakMult: x${streakMult.toFixed(2)} (${streakLabel}) | ` +
        `puzzle #${totalPuzzles} | new PR: ${playerPR}`
    );

    renderPR(delta);
}

// ── Render the PR display card ────────────────────────────────────────────────
function renderPR(delta) {
    const valEl   = document.getElementById('pr-value');
    const subEl   = document.getElementById('pr-puzzles');
    const deltaEl = document.getElementById('pr-delta');
    if (!valEl) return;

    valEl.textContent = playerPR;
    subEl.textContent = `${totalPuzzles} puzzle${totalPuzzles !== 1 ? 's' : ''} played`;

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

function initPositions() {
    const boardEl = document.getElementById('board');
    const turnEl  = document.getElementById('turn');

    if (boardEl) boardEl.innerHTML = '<p style="padding:40px;text-align:center;color:#14532d;font-size:1.2rem;">Loading positions...</p>';
    if (turnEl)  turnEl.innerHTML  = 'Loading...';

    get(ref(db, 'positions')).then((snapshot) => {
        if (snapshot.exists()) {
            positions = Object.values(snapshot.val());
            positionsByDiff.Easy   = positions.filter(p => p.Difficulty === "Easy");
            positionsByDiff.Medium = positions.filter(p => p.Difficulty === "Medium");
            positionsByDiff.Hard   = positions.filter(p => p.Difficulty === "Hard");
            if (boardEl) loadPuzzleForPR();
        }
    }).catch((error) => {
        console.error(error);
        if (document.getElementById('board'))
            document.getElementById('board').innerHTML = '<p style="color:red;">Error loading positions</p>';
    });
}

function loadPuzzleForPR() {
    const difficulty = getDifficultyFromPR();
    const pool = positionsByDiff[difficulty] || [];

    if (pool.length) {
        current_position = Math.floor(Math.random() * pool.length);
        const pos = pool[current_position];
        renderSVG(pos.SVG);
        correct_result = findResult(pos.Eval);
        const turnEl = document.getElementById('turn');
        if (turnEl) turnEl.innerHTML = pos.Turn;
        console.log(`Puzzle loaded | PR: ${playerPR} | difficulty: ${difficulty} | index: ${current_position}`);
    } else {
        const boardEl = document.getElementById('board');
        const turnEl  = document.getElementById('turn');
        if (boardEl) boardEl.innerHTML = '<p>No positions available</p>';
        if (turnEl)  turnEl.innerHTML  = '';
    }
}

window.nextPosition = function() {
    const difficulty = getDifficultyFromPR();
    const pool = positionsByDiff[difficulty] || [];

    if (!pool.length) {
        document.getElementById('board').innerHTML = '<p>No positions available</p>';
        document.getElementById('turn').innerHTML  = '';
        return;
    }

    current_position = Math.floor(Math.random() * pool.length);
    const pos = pool[current_position];
    renderSVG(pos.SVG);
    correct_result = findResult(pos.Eval);
    document.getElementById("turn").innerHTML = pos.Turn;
    answered = false;
    document.getElementById("result").innerHTML = "";
    document.getElementById("evaluation-display").innerHTML = "";
    console.log(`Puzzle loaded | PR: ${playerPR} | difficulty: ${difficulty} | index: ${current_position}`);
};

function sendAnswer(guess) {
    if (answered) return;

    if (guess === correct_result) {
        document.getElementById("result").innerHTML = "Correct!";
        document.getElementById("result").style.color = "green";
    } else {
        document.getElementById("result").innerHTML = "Incorrect! The current position is: <br>" + correct_result;
        document.getElementById("result").style.color = "red";
    }
    answered = true;

    const difficulty    = getDifficultyFromPR();
    const pool          = positionsByDiff[difficulty] || [];
    const evaluationRaw = parseFloat(pool[current_position].Eval) / 100;
    const displayEval   = evaluationRaw > 0 ? `+${evaluationRaw}` : `${evaluationRaw}`;
    document.getElementById("evaluation-display").innerHTML = `<strong>Evaluation: ${displayEval}</strong>`;

    updatePR(difficulty, guess === correct_result);
}
window.sendAnswer = sendAnswer;

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
window.openSettings = function() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const prDisplay = document.getElementById('settings-pr-display');
    if (prDisplay) prDisplay.textContent = playerPR;
    cancelResetConfirm();
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

window.confirmResetPR = async function() {
    playerPR      = PR_START;
    totalPuzzles  = 0;
    currentStreak = 0;

    await saveStatsToFirebase();
    renderPR();

    const prDisplay = document.getElementById('settings-pr-display');
    if (prDisplay) {
        prDisplay.textContent = playerPR;
        prDisplay.classList.remove('reset-flash');
        void prDisplay.offsetWidth;
        prDisplay.classList.add('reset-flash');
    }
    cancelResetConfirm();
    console.log(`PR reset | new PR: ${playerPR}`);
};

// ── Sidebar ───────────────────────────────────────────────────────────────────
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
    }
});