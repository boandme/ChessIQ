window.onload = function() {
    var evaluation = document.getElementById('evaluation').innerText;
    console.log(evaluation);
    if (evaluation.includes("+")) {
        var result = "positive";
    } else if (evaluation.includes("-")) {
        var result = "negative";
    }
};                      
