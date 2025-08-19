
## Welcome to PositionGuessr, a chess position guessing game, where you guess whether the position is winning for white, losing, or equal
## This application will be a successful project and will sell to lichess, chess.com, or any other chess platform, making millions. 

import chess
import chess.engine
import chess.svg
import berserk
import pandas as pd
from flask import Flask, render_template, send_file
import csv
with open("positions.csv", mode="r", newline="", encoding="utf-8") as f:
    # Create a DictReader object
    # DictReader automatically maps each row into a dictionary
    # using the first line of the CSV (the header) as keys
    reader = csv.DictReader(f)

    # Convert the reader into a list of dictionaries
    data = []
    for row in reader:
        data.append(row)

filtered_data = []

##import stockfish

app = Flask(__name__)
board = chess.Board()

## Initialize the Stockfish engine
engine = chess.engine.SimpleEngine.popen_uci("stockfish")


# This function evalutes the FEN position using Stockfish and returns the score
def getEval(position):
    board = chess.Board(position)
    
    #analyse the position using Stockfish
    result = engine.analyse(board, chess.engine.Limit(depth=20))
    score = result["score"].pov(chess.WHITE)
    
    return score, board
## This function loads positions from dataset and returns the SVG text, eval, and board object. 
def loadPositions():
    for row in range(len(data)):
        eval, board = getEval(data[row]['FEN'])
        svg_data = chess.svg.board(board=board)
        filtered_data.append({
            'SVG':svg_data,
            'Eval':eval.score()
        })
    print("Filtration DONE!!!!")
    
    ## Quit the engine to maximize performance
    engine.quit()
    return filtered_data 
    
## This line of code is used to set the route for the Flask application, telling it to associating / path with the index function
@app.route("/")
def index():
    filtered_data = loadPositions()
    print(filtered_data[5]['Eval'])
    
    
    
    return render_template('index.html', filtered_data = filtered_data)
    
if __name__ == "__main__":
    app.run(debug=True, port=8080)
