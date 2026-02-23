var result;
var correct_result;
var answered = false;
var evaluation;

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
});




window.onload = function() {
    // show help modal when the page first loads
    openModal();
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