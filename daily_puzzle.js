// ChessIQ shared Daily Puzzle module.
// Loaded on non-home pages so the same daily challenge can be opened everywhere.
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUID = null;
let potdData = null;
let potdAnswered = false;
let potdUserAnswer = null;
let voteUnsubscribe = null;

function todayUTC() {
    return new Date().toISOString().slice(0, 10);
}

function answerForEvaluation(evaluation) {
    const centipawns = parseFloat(evaluation);
    if (!Number.isFinite(centipawns) || Math.abs(centipawns) <= 100) return 'Equal';
    return centipawns > 0 ? 'White Winning' : 'Black Winning';
}

function ensurePOTDModal() {
    if (document.getElementById('potd-modal')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div id="potd-modal" onclick="if(event.target===this)closePOTD()" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1010; justify-content:center; align-items:flex-start; padding-top:60px; overflow-y:auto;">
            <div class="modal-content" style="max-width:520px;">
                <button class="modal-close-btn" onclick="closePOTD()" aria-label="Close Daily Puzzle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
                </button>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                    <div class="potd-icon" style="width:36px;height:36px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div>
                        <div class="potd-label">Daily Challenge</div>
                        <h2 style="margin:0;font-size:1.3rem;" id="potd-modal-date">Puzzle of the Day</h2>
                    </div>
                </div>
                <div class="potd-modal-board" id="potd-modal-board"><p style="color:var(--text-faint);font-family:var(--font-mono);font-size:0.8rem;letter-spacing:0.06em;">LOADING...</p></div>
                <div class="potd-turn-badge" id="potd-modal-turn"></div>
                <div class="potd-choices" id="potd-choices">
                    <button class="potd-choice-btn" onclick="submitPOTD('White Winning')" id="potd-btn-white">♔ White</button>
                    <button class="potd-choice-btn" onclick="submitPOTD('Equal')" id="potd-btn-equal">⚖ Equal</button>
                    <button class="potd-choice-btn" onclick="submitPOTD('Black Winning')" id="potd-btn-black">♚ Black</button>
                </div>
                <div class="potd-not-answered" id="potd-signin-notice" style="display:none;"><a href="login.html" style="color:var(--yellow);font-weight:700;">Sign in</a> to submit your answer and see community results.</div>
                <div class="potd-result-box" id="potd-result-box">
                    <div class="potd-result-title" id="potd-result-title"></div>
                    <div class="potd-eval-line" id="potd-eval-line"></div>
                    <div class="potd-community" id="potd-community">
                        <div class="potd-community-label">Community Answers</div>
                        <div class="potd-bar-row"><span class="potd-bar-row-label">♔ White</span><div class="potd-bar-track"><div class="potd-bar-fill white" id="bar-white" style="width:0%"></div></div><span class="potd-bar-pct" id="pct-white">0%</span></div>
                        <div class="potd-bar-row"><span class="potd-bar-row-label">⚖ Equal</span><div class="potd-bar-track"><div class="potd-bar-fill equal" id="bar-equal" style="width:0%"></div></div><span class="potd-bar-pct" id="pct-equal">0%</span></div>
                        <div class="potd-bar-row"><span class="potd-bar-row-label">♚ Black</span><div class="potd-bar-track"><div class="potd-bar-fill black" id="bar-black" style="width:0%"></div></div><span class="potd-bar-pct" id="pct-black">0%</span></div>
                    </div>
                </div>
                <div class="potd-countdown" id="potd-countdown"></div>
                <button class="got-it-btn" onclick="closePOTD()" style="margin-top:16px;">Close</button>
            </div>
        </div>`);
}

function updatePOTDNav() {
    const navBtn = document.getElementById('potd-nav-btn');
    if (!navBtn) return;
    navBtn.classList.toggle('pending', Boolean(potdData) && !potdAnswered);
    navBtn.classList.toggle('done', potdAnswered);
    navBtn.setAttribute('aria-label', potdAnswered ? 'Puzzle of the Day — answered' : 'Puzzle of the Day');
}

function disablePOTDButtons(userAnswer, correctAnswer) {
    const buttons = {
        'White Winning': 'potd-btn-white',
        'Equal': 'potd-btn-equal',
        'Black Winning': 'potd-btn-black',
    };
    Object.entries(buttons).forEach(([option, id]) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.disabled = true;
        if (option === userAnswer) {
            button.className = `potd-choice-btn ${option === correctAnswer ? 'selected-correct' : 'selected-wrong'}`;
        } else if (option === correctAnswer) {
            button.className = 'potd-choice-btn reveal-correct';
        } else {
            button.className = 'potd-choice-btn';
        }
    });
}

function updatePOTDVoteBars(votes = {}) {
    const total = (votes.White || 0) + (votes.Equal || 0) + (votes.Black || 0);
    const percent = value => total ? Math.round((value / total) * 100) : 0;
    const values = { white: percent(votes.White || 0), equal: percent(votes.Equal || 0), black: percent(votes.Black || 0) };
    Object.entries(values).forEach(([name, value]) => {
        const bar = document.getElementById(`bar-${name}`);
        const label = document.getElementById(`pct-${name}`);
        if (bar) bar.style.width = `${value}%`;
        if (label) label.textContent = `${value}%`;
    });
}

function showPOTDResult(userAnswer, correctAnswer, evaluation, votes) {
    const box = document.getElementById('potd-result-box');
    const title = document.getElementById('potd-result-title');
    const evalLine = document.getElementById('potd-eval-line');
    if (!box || !title || !evalLine) return;

    const correct = userAnswer === correctAnswer;
    title.textContent = correct ? '✓ Correct!' : `✗ Incorrect — the answer was ${correctAnswer}`;
    title.className = `potd-result-title ${correct ? 'correct' : 'wrong'}`;
    const evalValue = parseFloat(evaluation);
    evalLine.innerHTML = Number.isFinite(evalValue)
        ? `Engine eval: <span>${evalValue > 0 ? '+' : ''}${(evalValue / 100).toFixed(2)}</span>`
        : 'Engine evaluation unavailable.';
    updatePOTDVoteBars(votes);
    box.classList.add('visible');
}

function renderPOTDCountdown() {
    const element = document.getElementById('potd-countdown');
    if (!element) return;
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const difference = next - now;
    const hours = Math.floor(difference / 3600000);
    const minutes = Math.floor((difference % 3600000) / 60000);
    const seconds = Math.floor((difference % 60000) / 1000);
    element.innerHTML = `Next puzzle in <span>${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}</span>`;
}

function listenForVotes() {
    if (voteUnsubscribe || !potdData) return;
    voteUnsubscribe = onValue(ref(db, `potd/${potdData.date}/votes`), snapshot => {
        if (!snapshot.exists()) return;
        potdData.votes = snapshot.val();
        updatePOTDVoteBars(potdData.votes);
    });
}

function renderPOTDModal() {
    if (!potdData) return;
    const board = document.getElementById('potd-modal-board');
    const turn = document.getElementById('potd-modal-turn');
    const date = document.getElementById('potd-modal-date');
    const choices = document.getElementById('potd-choices');
    const signInNotice = document.getElementById('potd-signin-notice');
    const result = document.getElementById('potd-result-box');

    if (board) board.innerHTML = potdData.svg || '<p>Position unavailable.</p>';
    if (turn) turn.textContent = potdData.turn || '';
    if (date) date.textContent = `Puzzle of the Day — ${potdData.date}`;
    renderPOTDCountdown();

    if (!currentUID) {
        if (signInNotice) signInNotice.style.display = 'block';
        if (choices) choices.style.display = 'none';
        if (result) result.classList.remove('visible');
        return;
    }

    if (signInNotice) signInNotice.style.display = 'none';
    if (potdAnswered) {
        if (choices) choices.style.display = 'grid';
        disablePOTDButtons(potdUserAnswer, potdData.correctAnswer);
        showPOTDResult(potdUserAnswer, potdData.correctAnswer, potdData.eval, potdData.votes || {});
        listenForVotes();
    } else {
        if (choices) choices.style.display = 'grid';
        ['potd-btn-white', 'potd-btn-equal', 'potd-btn-black'].forEach(id => {
            const button = document.getElementById(id);
            if (button) { button.disabled = false; button.className = 'potd-choice-btn'; }
        });
        if (result) result.classList.remove('visible');
    }
}

async function loadPOTD() {
    const today = todayUTC();
    try {
        const dailyRef = ref(db, `potd/${today}`);
        const existing = await get(dailyRef);

        if (existing.exists()) {
            potdData = existing.val();
        } else {
            const positionsSnapshot = await get(ref(db, 'positions'));
            if (!positionsSnapshot.exists()) throw new Error('No puzzle positions are available.');
            const positions = Object.entries(positionsSnapshot.val()).map(([key, value]) => ({ ...value, _key: key }));
            const pick = positions[Math.floor(Math.random() * positions.length)];
            potdData = {
                date: today,
                positionKey: pick.id || pick.key || pick._key,
                svg: pick.SVG,
                turn: pick.Turn,
                eval: pick.Eval,
                correctAnswer: answerForEvaluation(pick.Eval),
                votes: { White: 0, Equal: 0, Black: 0 },
            };
            // Preserve the main page's rule: only authenticated users may establish the shared daily record.
            if (currentUID) await set(dailyRef, potdData);
        }

        potdAnswered = false;
        potdUserAnswer = null;
        if (currentUID) {
            const answerSnapshot = await get(ref(db, `users/${currentUID}/potd/${today}`));
            if (answerSnapshot.exists()) {
                potdAnswered = true;
                potdUserAnswer = answerSnapshot.val().answer;
            }
        }
        updatePOTDNav();
        if (document.getElementById('potd-modal')?.style.display === 'flex') renderPOTDModal();
    } catch (error) {
        console.error('Daily Puzzle could not be loaded:', error);
        const board = document.getElementById('potd-modal-board');
        if (board) board.innerHTML = '<p style="color:var(--bad);">Unable to load today\'s puzzle. Please try again.</p>';
    }
}

window.openPOTD = function() {
    ensurePOTDModal();
    const modal = document.getElementById('potd-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    if (potdData) renderPOTDModal();
    else loadPOTD();
};

window.closePOTD = function() {
    const modal = document.getElementById('potd-modal');
    if (modal) modal.style.display = 'none';
};

window.submitPOTD = async function(answer) {
    if (!currentUID || potdAnswered || !potdData) return;
    const today = todayUTC();
    const key = answer === 'White Winning' ? 'White' : answer === 'Black Winning' ? 'Black' : 'Equal';
    try {
        disablePOTDButtons(answer, potdData.correctAnswer);
        const votesRef = ref(db, `potd/${today}/votes`);
        const voteSnapshot = await get(votesRef);
        const votes = voteSnapshot.exists() ? voteSnapshot.val() : { White: 0, Equal: 0, Black: 0 };
        votes[key] = (votes[key] || 0) + 1;
        await set(votesRef, votes);
        potdData.votes = votes;

        await set(ref(db, `users/${currentUID}/potd/${today}`), {
            answer,
            correct: answer === potdData.correctAnswer,
            ts: Date.now(),
        });

        potdAnswered = true;
        potdUserAnswer = answer;
        showPOTDResult(answer, potdData.correctAnswer, potdData.eval, votes);
        updatePOTDNav();
        listenForVotes();
    } catch (error) {
        console.error('Daily Puzzle answer could not be saved:', error);
        const title = document.getElementById('potd-result-title');
        const result = document.getElementById('potd-result-box');
        if (title && result) {
            title.textContent = 'Your answer could not be saved. Please try again.';
            title.className = 'potd-result-title wrong';
            result.classList.add('visible');
        }
    }
};

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.closePOTD();
});

ensurePOTDModal();
onAuthStateChanged(auth, user => {
    currentUID = user?.uid || null;
    loadPOTD();
});
setInterval(renderPOTDCountdown, 1000);
