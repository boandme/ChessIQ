var result;
var correct_result;
var answered = false;
var evaluation;

// ── Positional Rating (PR) ──────────────────────────────────────────────────
const PR_START = 200;

// ── Persistent state from localStorage ──
var playerPR = parseFloat(localStorage.getItem('chessiq_pr'));
if (isNaN(playerPR)) playerPR = PR_START;

// Total puzzles ever answered — drives the confidence window
var totalPuzzles = parseInt(localStorage.getItem('chessiq_total_puzzles')) || 0;

// Streak tracking:
//   positive = current correct streak length
//   negative = current wrong streak length
//   0        = no streak
var currentStreak = parseInt(localStorage.getItem('chessiq_streak')) || 0;

// ── Base point values ──
const PR_BASE = {
    Easy:   { correct: 14,  wrong: -22 },
    Medium: { correct: 19,  wrong: -19 },
    Hard:   { correct: 30,  wrong: -12 },
};

// ── Confidence window ──
// Swings are amplified for new players and settle toward 1.0 after ~40 puzzles.
// Formula: multiplier = 1 + 1.5 * e^(-totalPuzzles / 15)
// At puzzle 0  : ~2.50x  (brand new, big swings)
// At puzzle 15 : ~1.55x
// At puzzle 30 : ~1.18x
// At puzzle 50 : ~1.02x  (effectively settled)
function confidenceMultiplier() {
    return 1 + 1.5 * Math.exp(-totalPuzzles / 15);
}

// ── Streak multiplier ──
// Each step in a streak adds 10%, capped at 50% bonus (streak of 5+).
// Correct streak boosts gains only; wrong streak boosts losses only.
// Streak resets to 1 (or -1) the moment it changes direction.
function streakMultiplier(correct) {
    if (correct && currentStreak > 0) {
        const steps = Math.min(currentStreak, 5);
        return 1 + steps * 0.10;
    }
    if (!correct && currentStreak < 0) {
        const steps = Math.min(Math.abs(currentStreak), 5);
        return 1 + steps * 0.10;
    }
    return 1.0; // streak just broken or no streak yet
}

// ── Update streak state ──
function updateStreak(correct) {
    if (correct) {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
    } else {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
    }
    localStorage.setItem('chessiq_streak', currentStreak);
}

/**
 * Calculate and apply a PR change after a puzzle attempt.
 * @param {string}  difficulty - "Easy" | "Medium" | "Hard"
 * @param {boolean} correct    - whether the player guessed correctly
 */
function updatePR(difficulty, correct) {
    const base = PR_BASE[difficulty];
    if (!base) return;

    const baseValue    = correct ? base.correct : base.wrong;
    const ratingFactor = 1 - (playerPR / 1400);
    const confMult     = confidenceMultiplier();
    const streakMult   = streakMultiplier(correct);

    const delta = Math.round(baseValue * ratingFactor * confMult * streakMult);

    // advance streak AFTER reading multiplier for this puzzle
    updateStreak(correct);
    totalPuzzles++;
    localStorage.setItem('chessiq_total_puzzles', totalPuzzles);

    playerPR = Math.max(0, playerPR + delta);
    localStorage.setItem('chessiq_pr', playerPR);

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

    // Update the on-screen PR card
    renderPR(delta);
}

// ── Render the PR display card ───────────────────────────────────────────────
function renderPR(delta) {
    const valEl      = document.getElementById('pr-value');
    const subEl      = document.getElementById('pr-puzzles');
    const deltaEl    = document.getElementById('pr-delta');
    if (!valEl) return; // not on the game page

    valEl.textContent = playerPR;
    subEl.textContent = `${totalPuzzles} puzzle${totalPuzzles !== 1 ? 's' : ''} played`;

    if (delta !== undefined) {
        const sign = delta >= 0 ? '+' : '';
        deltaEl.textContent  = `${sign}${delta}`;
        deltaEl.className    = `pr-delta ${delta >= 0 ? 'gain' : 'loss'}`;

        // force reflow so CSS transition fires fresh each time
        void deltaEl.offsetWidth;
        deltaEl.classList.add('show');

        clearTimeout(renderPR._fadeTimer);
        renderPR._fadeTimer = setTimeout(() => {
            deltaEl.classList.add('fade');
            setTimeout(() => {
                deltaEl.className = 'pr-delta';
            }, 600);
        }, 1400);

        // brief scale-bump on the number
        valEl.classList.add('bump');
        setTimeout(() => valEl.classList.remove('bump'), 200);
    }
}
window.renderPR = renderPR;
// ────────────────────────────────────────────────────────────────────────────

// all positions loaded from firebase (unfiltered)
var positions = [];
// buckets by difficulty
var positionsByDiff = { Easy: [], Medium: [], Hard: [] };

// the set of positions we're currently cycling through
var filteredPositions = [];

var current_position = 0; // index into filteredPositions
var selectedDifficulty = "Medium"; // default on load

// api token for lichess: lip_UkEhwCNzopeUbv4Mznxz
// Firebase Configuration Code : 
// Import the functions you need from the SDKs you need
import { getDatabase, ref, push, onValue, get, update } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDtGbU8BN06Y_GNDmhV1FJFRhTvD603DN0",
    authDomain: "positionguessr.firebaseapp.com",
    databaseURL: "https://positionguessr-default-rtdb.firebaseio.com",
    projectId: "positionguessr",
    storageBucket: "positionguessr.firebasestorage.app",
    messagingSenderId: "954415790631",
    appId: "1:954415790631:web:0a5381589df51fc3abec02",
    measurementId: "G-M63L8MVR6Z"
  };



// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
var db = getDatabase(app)


// if the template provided data (Flask route) we want to push it into Firebase
if (window.positions && window.positions.length) {

    // Version 1: Clear existing positions in the database before pushing new ones

    // Version 2:Append the supplied array into the `positions` list in the DB
    
    const positionsRef = ref(db, `positions`);
    //window.positions.forEach(pos => {
    //    push(positionsRef, pos).catch(err => console.error("Firebase push failed", err));
    //});
}

// Show loading state immediately
document.getElementById('board').innerHTML = '<p style="padding: 40px; text-align: center; color: #14532d; font-size: 1.2rem;">Loading positions...</p>';
document.getElementById('turn').innerHTML = 'Loading...';

get(ref(db, `positions`)).then((snapshot) => {
    if (snapshot.exists()) {
        // convert object-of-objects to array and bucket by difficulty
        positions = Object.values(snapshot.val());
        positionsByDiff.Easy = positions.filter(p => p.Difficulty === "Easy");
        positionsByDiff.Medium = positions.filter(p => p.Difficulty === "Medium");
        positionsByDiff.Hard = positions.filter(p => p.Difficulty === "Hard");

        // select initial difficulty and render first item
        setDifficulty(selectedDifficulty);
    }
}).catch((error) => {
    console.error(error);
    document.getElementById('board').innerHTML = '<p style="color: red;">Error loading positions</p>';
});




window.onload = function() {
    // Populate PR card immediately from localStorage
    renderPR();

    // show help modal either on the very first page load of this browser session,
    // or when arriving via the Home button (welcome=1 flag).
    const params = new URLSearchParams(window.location.search);
    const firstVisit = !sessionStorage.getItem('helpSeen');

    if (params.get('welcome') === '1') {
        openModal();
        history.replaceState(null, '', window.location.pathname);
    } else if (firstVisit) {
        openModal();
        sessionStorage.setItem('helpSeen', '1');
    }
}; 


window.nextPosition = function() {
    if (current_position >= filteredPositions.length - 1) {
        current_position = 0;
    } else {
        current_position++;
    }
    const pos = filteredPositions[current_position];
    renderSVG(pos.SVG);
    console.log("Current difficulty: " + pos.Difficulty);
    correct_result = findResult(pos.Eval);
    document.getElementById("turn").innerHTML = pos.Turn;
    answered = false;
    document.getElementById("result").innerHTML = "";
    document.getElementById("evaluation-display").innerHTML = "";
};

// THis function is called when the user clicks their guess. It checks if the user is correct or not, and displays the result.
function sendAnswer(guess) {
    if(answered){
        return;
    }
    else if(guess === correct_result) {
        document.getElementById("result").innerHTML = "Correct!"
        document.getElementById("result").style.color = "green";
        answered = true;
    }
    else {
        document.getElementById("result").innerHTML = "Incorrect! The current position is: <br>"+ correct_result;
        document.getElementById("result").style.color = "red";
        answered = true;
    }
    // Display the exact evaluation
    const evaluationRaw = parseFloat(filteredPositions[current_position].Eval) / 100;
    const displayEval = evaluationRaw > 0 ? `+${evaluationRaw}` : `${evaluationRaw}`;
    document.getElementById("evaluation-display").innerHTML = `<strong>Evaluation: ${displayEval}</strong>`;
    // Update Positional Rating
    updatePR(selectedDifficulty, guess === correct_result);
};
 window.sendAnswer = sendAnswer;
    
// This function finds the desired result based on the evaluation score. This result is then compared to the user's guess.
function findResult(evaluation){
    

    
    if ((Math.abs(parseFloat(evaluation))/100) <= 1) {
        var result = "Equal";
    }
    else if (Math.sign(parseFloat(evaluation)) === 1) {
        var result = "White Winning";
    } else if (Math.sign(parseFloat(evaluation)) === -1) {
        var result = "Black Winning";
    }

    return result;
    
};


// set the current active difficulty and update position list accordingly
function setDifficulty(level) {
    selectedDifficulty = level;
    filteredPositions = positionsByDiff[level] || [];
    current_position = 0;

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diff === level);
    });

    if (filteredPositions.length) {
        const pos = filteredPositions[0];
        renderSVG(pos.SVG);
        correct_result = findResult(pos.Eval);
        document.getElementById('turn').innerHTML = pos.Turn;
    } else {
        document.getElementById('board').innerHTML = '<p>No positions available</p>';
        document.getElementById('turn').innerHTML = '';
    }
}

// attach click handlers once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#difficultyButtons .difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => setDifficulty(btn.dataset.diff));
    });
});




              
function renderSVG(svg){
    // This function renders the SVG string into the HTML
    document.getElementById('board').innerHTML = svg;
}

// this function closes the modal
function closeModal(){
    document.getElementById("modal").style.display = "none";
}
window.closeModal = closeModal;

// this function opens the modal
function openModal(){
    document.getElementById("modal").style.display = "flex";
}
window.openModal = openModal;



// Sidebar functions
window.openSidebar = function() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeSidebar = function() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
    document.body.style.overflow = 'auto';
};

// Close sidebar on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeSidebar();
    }
});


// Managing pages - switching etc
function openNav() {
  document.getElementById("sidebar").style.width = "200px";
}

function closeNav() {
  document.getElementById("sidebar").style.width = "0";
}