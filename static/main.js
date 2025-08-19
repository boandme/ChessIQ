var result;
var correct_result;
var answered = false;
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

var positions = [
    {"FEN": 'r1r3k1/5ppp/nR6/3P4/8/P4N2/P4PPP/R5K1 b - - 0 29', 'Evaluation': 284}
]

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
var db = getDatabase(app)






window.onload = function() {
    correct_result = findResult();
    console.log(correct_result);
    
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
        document.getElementById("result").innerHTML = "Incorrect! The correct answer is " + correct_result + ".";
        document.getElementById("result").style.color = "red";
        answered = true;
    }
};
window.sendAnswer = sendAnswer;
    
// This function finds the desired result based on the evaluation score. This result is then compared to the user's guess.
function findResult(){
    

    
    if ((Math.abs(parseFloat(evaluation))/100) <= 1) {
        var result = "equal";
    }
    else if (Math.sign(parseFloat(evaluation)) === 1) {
        var result = "white";
    } else if (Math.sign(parseFloat(evaluation)) === -1) {
        var result = "black";
    }

    return result;
    
};



              
