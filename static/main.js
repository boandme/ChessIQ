var result;
var answered = false;
window.onload = function() {
    correct_result = findResult();
    console.log(correct_result);
    
};   
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
    
}
// Function to handle user guess and display result
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
        document.getElementById("result").innerHTML = "Incorrect! The correct answer is that " + correct_result + " is winning.";
        document.getElementById("result").style.color = "red";
        answered = true;
    }
}
                  
