
## Welcome to PositionGuessr, a chess position guessing game, where you guess whether the position is winning for white, losing, or equal
## This application will be a successful project and will sell to lichess, chess.com, or any other chess platform, making millions. 

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



games = []
session = berserk.TokenSession("lip_BSfTqQWvUx1kSXEmuNW0")
client = berserk.Client(session = session)
fens = []
selected_fens =[]

## Set 1 of games: Vyom_Joshi, Zhigalko_Sergei
##games = client.games.export_by_player('Vyom_Joshi', max = 100, as_pgn=True)
##games2 = client.games.export_by_player('Zhigalko_Sergei', max = 50, as_pgn=True)


## Set 2 of games: Kurald_Galain, BlueHorseJump5
games3 = client.games.export_by_player('Kurald_Galain', max = 50, as_pgn=True)
games4 = client.games.export_by_player('BlueHorseJump5', max = 100, as_pgn=True)

games = list(games3) + list(games4)

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
engine = chess.engine.SimpleEngine.popen_uci("c:/Users/Vyom/Downloads/stockfish-windows-x86-64-avx2/stockfish/stockfish-windows-x86-64-avx2.exe")



# This function evalutes the FEN position using Stockfish and returns the score
def getEval(position):
    difficulty = ""
    board = chess.Board(position)
    
    #analyse the position using Stockfish
    result = engine.analyse(board, chess.engine.Limit(depth=20), multipv = 3)

    
    # Original handling (kept commented for reference):
    # if "score" in result:
    #     score = result["score"].pov(chess.WHITE)
    #     best_eval = result[0]["score"].white()
    #     second_eval = result[1]["score"].white()
    #
    #     spread = abs(best_eval - second_eval)
    #     print("Score: " + str(score) + ", Spread: " + str(spread))
    #     if spread < 40:
    #         difficulty = "Easy"
    #     elif spread < 120:
    #         difficulty = "Medium"
    #     else:
    #         difficulty = "Hard"
    # else:
    #     print("No score in result for FEN:", board.fen())
    #     score = None

    # New handling: 
    score_obj = None
    spread = 0
    if isinstance(result, list) and len(result) > 0:
        # best line is first entry
        best = result[0]
        if "score" in best:
            score_obj = best["score"].pov(chess.WHITE)

        # helper: convert a Score object to centipawn-like numeric value for spread
        def to_cp(s):
            if s is None:
                return 0
            if s.is_mate():
                return 100000 if s.mate() > 0 else -100000
            return s.score()

        # compute spread between top two PVs (if available)
        best_cp = to_cp(result[0]["score"].pov(chess.WHITE)) if (len(result) > 0 and "score" in result[0]) else 0
        if len(result) > 1 and "score" in result[1]:
            second_cp = to_cp(result[1]["score"].pov(chess.WHITE))
        else:
            second_cp = best_cp

        spread = abs(best_cp - second_cp)
        print("Score: " + str(score_obj) + ", Spread: " + str(spread))
        if spread < 40:
            difficulty = "Easy"
        elif spread < 120:
            difficulty = "Medium"
        else:
            difficulty = "Hard"
    else:
        print("No score in result for FEN:", board.fen())
        score = None 
    

    ## Complex conditional that handles mate error logic, and returns score
    # Use `score_obj` (the engine Score object) and convert to numeric `score`.
    if score_obj is None:
        score = 0
    elif score_obj.is_mate():
        score = 100000 if score_obj.mate() > 0 else -100000
    else:
        score = score_obj.score()
    
    return score, board, difficulty


## This function loads positions from dataset and returns the SVG text, eval, and board object. 
def loadPositions():
    ## Gets selected fens from prefiltration
    turn= ""
    difficulty = ""
    selected_fens = prefiltration()
    for i in range(len(selected_fens)):
        eval, board, difficulty = getEval(selected_fens[i])

        if board.turn:
            turn = "White to move"
        else:
            turn = "Black to move"

        svg_data = chess.svg.board(board=board)
        filtered_data.append({
            'SVG':svg_data,
            'Eval':eval,
            'Turn':turn,
            'Difficulty': difficulty,
        })
        if(len(filtered_data) >= 300): ## change here too, acts as a cap for amount of games
            break
        print(str(eval) + ", " + difficulty)
        

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





