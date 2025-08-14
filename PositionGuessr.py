import chess
import chess.engine
import berserk
import pandas as pd
##import stockfish
data = pd.read_csv('positions.csv')
df = pd.DataFrame(data)
def show_position(position):
    board = chess.Board(position)
    print(board)
    #analyse the position using Stockfish
    engine = chess.engine.SimpleEngine.popen_uci("stockfish")
    result = engine.analyse(board, chess.engine.Limit(depth=20))
    score = result["score"].pov(chess.WHITE)
    
    print(f"Score: {float(score.score()/100)}")

show_position(df['FEN'][2])