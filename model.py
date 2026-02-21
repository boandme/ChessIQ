
## Welcome to PositionGuessr, a chess position guessing game, where you guess whether the position is winning for white, losing, or equal
## This application will be a successful project and will sell to lichess, chess.com, or any other chess platform, making millions. 
"""
import chess
import chess.engine
import chess.svg
import berserk
import pandas as pd
from flask import Flask, render_template, send_file
import csv
import chess.pgn
import io
import random

"""
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

"""


session = berserk.TokenSession("lip_UkEhwCNzopeUbv4Mznxz")
client = berserk.Client(session = session)
fens = []
selected_fens =[]
games = client.games.export_by_player('vyom_joshi', max=100,as_pgn=True)
games = list(games)
filtered_data = []

def prefiltration():
    board2 = chess.Board()
    for i in range(len(games)):
        board2 = chess.Board()
        pgn = io.StringIO(games[i])
        game = chess.pgn.read_game(pgn)
        for move in game.mainline_moves():
            board2.push(move)
            if board2.fullmove_number >= 10:
                
                fens.append(board2.fen())

        
        selected_fens.append(random.choice(fens))
        selected_fens.append(random.choice(fens))

    print("Prefiltration DONE!!!")
    return selected_fens

## Flask Setup
app = Flask(__name__)




board = chess.Board()

## Initialize the Stockfish engine
engine = chess.engine.SimpleEngine.popen_uci("stockfish")



# This function evalutes the FEN position using Stockfish and returns the score
def getEval(position):
    board = chess.Board(position)
    
    #analyse the position using Stockfish
    result = engine.analyse(board, chess.engine.Limit(depth=20))
    if "score" in result:
        score = result["score"].pov(chess.WHITE)
    else:
        print("No score in result for FEN:", board.fen())
        score = None 
    

    ## Complex conditional that handles mate error logic, and returns score
    if score.is_mate():
        score = 100000 if score.mate() > 0 else -100000
    else:
        score = score.score()
    
    return score, board


## This function loads positions from dataset and returns the SVG text, eval, and board object. 
def loadPositions():
    ## Gets selected fens from prefiltration
    turn= ""
    selected_fens = prefiltration()
    for i in range(len(selected_fens)):
        eval, board = getEval(selected_fens[i])
        if board.turn:
            turn = "White to move"
        else:
            turn = "Black to move"

        svg_data = chess.svg.board(board=board)
        filtered_data.append({
            'SVG':svg_data,
            'Eval':eval,
            'Turn':turn
        })
        if(len(filtered_data) >= 100):
            break
        print(eval)
        

    print("Filtration DONE!!!!")
    print(len(filtered_data))
    
   
    
    return filtered_data 

## This line of code is used to set the route for the Flask application, telling it to associating / path with the index function
"""
"""
@app.route("/")
def index():
    filtered_data = loadPositions()
    
    
    
    
    return render_template('index.html', filtered_data = filtered_data)
    
if __name__ == "__main__":
    app.run(debug=True, port=8080)





"""