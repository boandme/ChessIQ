var result;
var correct_result;
var answered = false;
var evaluation;
var positions = [];
var current_position = 0;
// api token for lichess: lip_UkEhwCNzopeUbv4Mznxz
// Firebase Configuration Code : 
// Import the functions you need from the SDKs you need
import { getDatabase, ref, set, onValue, get, update } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
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


get(ref(db, `positions`)).then((snapshot) => {
    if (snapshot.exists()) {
        positions = snapshot.val();
        // Startup code for the first position
        renderSVG(positions[0].SVG)
        correct_result = findResult(positions[0].Eval)
        console.log(correct_result)
        console.log("hi")
        document.getElementById("turn").innerHTML = positions[0].Turn
        
    } 
}).catch((error) => {
    console.error(error);
});




window.onload = function() {
    
    
}; 


window.nextPosition = function() {
    console.log(current_position)
    if (current_position >= positions.length -1){
        current_position = 0;
    }
    else {
        current_position ++;
    }
    renderSVG(positions[current_position].SVG)
    correct_result = findResult(positions[current_position].Eval)
    document.getElementById("turn").innerHTML = positions[current_position].Turn
    answered = false;
    document.getElementById("result").innerHTML = "";
    console.log(correct_result)
    
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