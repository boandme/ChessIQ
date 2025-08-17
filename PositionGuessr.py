import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="urllib3")
import chess
import chess.engine
import chess.svg
import berserk
import pandas as pd
from flask import Flask, render_template, send_file
##import stockfish
data = pd.read_csv('positions.csv')
df = pd.DataFrame(data)
app = Flask(__name__)
board = chess.Board()

## Welcome to PositionGuessr, a chess position guessing game, where you guess whether the position is winning for white, losing, or equal
## This application will be a successful project and will sell to lichess, chess.com, or any other chess platform

# This function evalutes the FEN position using Stockfish and returns the score
def getEval(position):
    board = chess.Board(position)
    
    #analyse the position using Stockfish
    engine = chess.engine.SimpleEngine.popen_uci("stockfish")
    result = engine.analyse(board, chess.engine.Limit(depth=20))
    score = result["score"].pov(chess.WHITE)
    
    return score, board


## This line of code is used to set the route for the Flask application, telling it to associating / path with the index function
@app.route("/")
def index():
    eval, board = getEval(df['FEN'][0])
    svg_data = chess.svg.board(board=board)
    
    
    return render_template('index.html', svg_board = svg_data, eval = eval.score())
    
if __name__ == "__main__":
    app.run(debug=True, port=8080)
