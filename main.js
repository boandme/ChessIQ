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
var currentUser   = null;
var currentUID    = null;

// Stats tracking
var correctCount  = 0;
var wrongCount    = 0;
var bestStreak    = 0;
var peakPR        = PR_START;
var prHistory     = [];   // array of { pr, ts } snapshots, capped at 50

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
    if (correct && currentStreak > 0)  return 1 + Math.min(currentStreak, 5) * 0.10;
    if (!correct && currentStreak < 0) return 1 + Math.min(Math.abs(currentStreak), 5) * 0.10;
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
import { initializeApp }                         from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, get, set, update }   from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAnalytics }                          from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

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

// ── Auth gate ─────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
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
        const data    = snap.val();
        playerPR      = data.pr           ?? PR_START;
        totalPuzzles  = data.totalPuzzles ?? 0;
        currentStreak = data.streak       ?? 0;
        correctCount  = data.correctCount ?? 0;
        wrongCount    = data.wrongCount   ?? 0;
        bestStreak    = data.bestStreak   ?? 0;
        peakPR        = data.peakPR       ?? playerPR;
        prHistory     = Array.isArray(data.prHistory) ? data.prHistory : [];

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
            const data    = retry.val();
            playerPR      = data.pr           ?? PR_START;
            totalPuzzles  = data.totalPuzzles ?? 0;
            currentStreak = data.streak       ?? 0;
            correctCount  = data.correctCount ?? 0;
            wrongCount    = data.wrongCount   ?? 0;
            bestStreak    = data.bestStreak   ?? 0;
            peakPR        = data.peakPR       ?? PR_START;
            prHistory     = Array.isArray(data.prHistory) ? data.prHistory : [];
            profileUsername = (typeof data.username === 'string' && data.username.trim() !== '')
                             ? data.username.trim()
                             : (user.displayName || 'Player');
        } else {
            // Fallback: login.js write hasn't landed — create a minimal record.
            // Use displayName which MAY be set by the signup flow; otherwise 'Player'.
            profileUsername = user.displayName || 'Player';
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
                createdAt:    Date.now(),
            });
        }
    }

    // ── Self-heal: if DB still has 'Player' but Auth has a real displayName, fix it
    if (profileUsername === 'Player' && user.displayName && user.displayName !== 'Player') {
        profileUsername = user.displayName;
        await update(ref(db, `users/${currentUID}`), { username: user.displayName });
    }

    const nameEl = document.getElementById('header-username');
    if (nameEl) nameEl.textContent = profileUsername;

    renderPR();
    initPositions();
});

// ── Save to Firebase ──────────────────────────────────────────────────────────
async function saveStatsToFirebase() {
    if (!currentUID) return;
    await update(ref(db, `users/${currentUID}`), {
        pr:           playerPR,
        totalPuzzles: totalPuzzles,
        streak:       currentStreak,
        correctCount: correctCount,
        wrongCount:   wrongCount,
        bestStreak:   bestStreak,
        peakPR:       peakPR,
        prHistory:    prHistory,
    });
}

// ── PR update ─────────────────────────────────────────────────────────────────
function updatePR(difficulty, correct) {
    const base = PR_BASE[difficulty];
    if (!base) return;

    const baseValue    = correct ? base.correct : base.wrong;
    const ratingFactor = 1 - (playerPR / 4480);
    const confMult     = confidenceMultiplier();
    const streakMult   = streakMultiplier(correct);
    const delta        = Math.round(baseValue * ratingFactor * confMult * streakMult);

    if (correct) { correctCount++; } else { wrongCount++; }
    updateStreak(correct);
    totalPuzzles++;

    playerPR = Math.min(PR_MAX, Math.max(0, playerPR + delta));

    if (playerPR > peakPR) peakPR = playerPR;
    if (currentStreak > bestStreak) bestStreak = currentStreak;

    prHistory.push({ pr: playerPR, ts: Date.now() });
    if (prHistory.length > 50) prHistory = prHistory.slice(prHistory.length - 50);

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

// ── Render PR display card ────────────────────────────────────────────────────
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
    if (boardEl) boardEl.innerHTML = '<p style="padding:40px;text-align:center;">Loading positions...</p>';
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
    const resultEl = document.getElementById("result");
    resultEl.innerHTML = '<p id="resultText">Click a piece to make your choice</p>';
    resultEl.classList.remove("correct", "incorrect");
    document.getElementById("evaluation-display").innerHTML = "";
};

function sendAnswer(guess) {
    if (answered) return;
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
    const difficulty    = getDifficultyFromPR();
    const pool          = positionsByDiff[difficulty] || [];
    const evaluationRaw = parseFloat(pool[current_position].Eval) / 100;
    const displayEval   = evaluationRaw > 0 ? `+${evaluationRaw}` : `${evaluationRaw}`;
    document.getElementById("evaluation-display").innerHTML = `Evaluation&nbsp;&nbsp;${displayEval}`;
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
    correctCount  = 0;
    wrongCount    = 0;
    bestStreak    = 0;
    peakPR        = PR_START;
    prHistory     = [];

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

// ── Stats modal ───────────────────────────────────────────────────────────────
window.openStats = function() {
    const modal = document.getElementById('stats-modal');
    if (!modal) return;
    populateStatsModal();
    modal.style.display = 'flex';
};

window.closeStats = function() {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.style.display = 'none';
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
    setText('stat-difficulty',  getDifficultyFromPR());
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
        window.closeStats    && window.closeStats();
    }
});