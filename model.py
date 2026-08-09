
## Welcome to PositionGuessr, a chess position guessing game, where you guess whether the position is winning for white, losing, or equal
## This application will be a successful project and will sell to lichess, chess.com, or any other chess platform, making millions. 


import chess
import chess.engine
import chess.svg
import berserk
import pandas as pd
import csv
import chess.pgn
import io
import random
import json
from google import genai
import time



GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"  # Replace with your actual Gemini API key

Gclient = genai.Client(api_key=GEMINI_API_KEY)



games = []
session = berserk.TokenSession("apikey")  
berserk_client = berserk.Client(session=session)
fens = []
selected_fens =[]


# Standard games only
games  = berserk_client.games.export_by_player('Vyom_Joshi',        max=100, as_pgn=True)
games2 = berserk_client.games.export_by_player('Zhigalko_Sergei',   max=50,  as_pgn=True )

games3 = berserk_client.games.export_by_player('Kurald_Galain',     max=50,  as_pgn=True )
games4 = berserk_client.games.export_by_player('BlueHorseJump5',    max=100, as_pgn=True)

games5 = berserk_client.games.export_by_player('space_foobar',    max=100, as_pgn=True)
games6 = berserk_client.games.export_by_player('chessmem',          max=50,  as_pgn=True)

games7 = berserk_client.games.export_by_player('nihalsarin2004',    max=50,  as_pgn=True)
games8 = berserk_client.games.export_by_player('flopyfishh',        max=100, as_pgn=True)
games9 = berserk_client.games.export_by_player('DrNykterstein',     max=100, as_pgn=True)


games =  list(games6) + list(games3) + list(games4) + list(games) + list(games2)  + list(games5) + list(games7) + list(games8) + list(games9)

filtered_data = []

def prefiltration():
    selected_fens = []
    fallback_fens = [
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
        "1r3rk1/pp1n1ppb/7p/2pPPq2/2P1NP2/1P3Q2/P5PP/4RRK1 w - - 0 1"
    ]

    if not games:
        print("No games loaded; using fallback FENs")
        return fallback_fens

    for i in range(len(games)):
        board2 = chess.Board()
        game_fens = []          # <-- reset for each game

        pgn = io.StringIO(games[i])
        game = chess.pgn.read_game(pgn)

        if game is None:
            continue

        variant = game.headers.get("Variant", "Standard")

        if variant != "Standard":
            continue

        for move in game.mainline_moves():
            board2.push(move)
            if board2.fullmove_number >= 10:
                game_fens.append(board2.fen())

        if len(game_fens) >= 2:
            selected_fens.append(random.choice(game_fens))
            selected_fens.append(random.choice(game_fens))

    if not selected_fens:
        print("No standard games parsed; using fallback FENs")
        return fallback_fens

    print("Prefiltration DONE!!!")
    return selected_fens

## Flask Setup




board = chess.Board()

## Initialize the Stockfish engine
engine = chess.engine.SimpleEngine.popen_uci("c:/Users/Vyom/Downloads/stockfish-windows-x86-64-avx2/stockfish/stockfish-windows-x86-64-avx2.exe")



# This function evalutes the FEN position using Stockfish and returns the score
def getEval(position):
    difficulty = ""
    board = chess.Board(position)
    
    #analyse the position using Stockfish
    result = engine.analyse(board, chess.engine.Limit(depth=15), multipv = 3)

    
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


## GenerateExplanation
## This function takes in parameters such as fen, eval, turn, difficulty, best_move, and material_diff, and generates a detailed explanation of the chess position using the Gemini API.
def GenerateExplanation(fen, eval, turn, best_move, material_diff):
    side_to_move = "White" if "White" in turn else "Black"
    evaluation_text = f"{eval:+.2f}" if isinstance(eval, (int, float)) else str(eval)

    if isinstance(material_diff, str):
        material_text = material_diff
        try:
            material_value = int(material_diff.split()[2]) if material_diff.startswith("White up") or material_diff.startswith("Black up") else 0
        except (IndexError, ValueError):
            material_value = 0
    else:
        material_value = int(material_diff or 0)
        if material_value == 0:
            material_text = "Equal"
        elif material_value > 0:
            material_text = f"White up {material_value} point{'s' if material_value != 1 else ''}"
        else:
            material_text = f"Black up {abs(material_value)} point{'s' if abs(material_value) != 1 else ''}"

    if not isinstance(material_diff, str) and material_value == 0:
        material_text = "Equal"
    elif not isinstance(material_diff, str) and material_value > 0:
        material_text = f"White up {material_value} point{'s' if material_value != 1 else ''}"
    elif not isinstance(material_diff, str):
        material_text = f"Black up {abs(material_value)} point{'s' if abs(material_value) != 1 else ''}"

    prompt = f"""
You are an expert chess coach specializing in positional chess.

Given the information below, generate a concise educational explanation for why the evaluation favors one side.

Position Information:
FEN: {fen}
Side to Move: {side_to_move}
Stockfish Evaluation: {evaluation_text}
Best Move: {best_move}
Material: {material_text}

Return ONLY valid JSON in exactly this format:
{{
  "why": "...",
  "themes": ["...", "..."],
  "commonMistake": "...",
  "bestMove": {{
    "move": "...",
    "reason": "..."
  }},
  "plan": "...",
  "difficultyRating": 1-10
}}

Requirements:
- Base the explanation primarily on positional concepts (space, piece activity, pawn structure, weak squares, king safety, initiative, open files, bishop pair, outposts, etc.). Mention material only if it is a major factor.
- If the advantage is primarily positional, avoid discussing long tactical variations. Focus on long-term strategic ideas instead.
- Use all of your reasoning skills to judge the position carefully.
- Rate the puzzle from 1 to 10 for difficulty for an average player positionally, where 1 is easiest and 10 is hardest.
- Keep every field concise.
- "why" should be a clear 2–4 sentence explanation of why one side is better.
- "themes" should contain 2–5 short positional concepts.
- "commonMistake" should be one concise sentence describing what intermediate players commonly overlook.
- "bestMove.reason" should briefly explain why the move is best in one sentence.
- "plan" should describe the strongest strategic plan for the side with the advantage in one concise sentence.
- Do not include markdown, code fences, move-by-move analysis, or any text outside the JSON.
"""

    try:
        response = Gclient.models.generate_content(model = "gemini-3.5-flash", contents=prompt)
        response_text = getattr(response, "text", "")
    except Exception as exc:
        print("Gemini generation failed:", exc)
        response_text = ""
    cleaned_text = response_text.strip()

    if cleaned_text.startswith("```json"):
        cleaned_text = cleaned_text[len("```json"):].strip()
    if cleaned_text.startswith("```"):
        cleaned_text = cleaned_text[3:].strip()
    if cleaned_text.endswith("```"):
        cleaned_text = cleaned_text[:-3].strip()

    try:
        return json.loads(cleaned_text)
    except json.JSONDecodeError:
        return {
            "why": "The position is better for the side with the initiative because it controls key squares and has the more active pieces.",
            "themes": ["piece activity", "space", "king safety"],
            "commonMistake": "Overvaluing material instead of the better pawn structure and piece coordination.",
            "bestMove": {
                "move": str(best_move or ""),
                "reason": "It reinforces the strongest positional plan without surrendering the initiative."
            },
            "plan": "Improve piece coordination, expand on the favorable side, and pressure the weak squares.",
            "difficultyRating": 5
        }









## This function loads positions from dataset and returns the SVG text, eval, and board object. 
## It also will use Gemini flash 3.5 api to send specific details about the position to the api, and get a response back with the puzzle explanation. 
def loadPositions():
    turn = ""
    difficulty = ""
    filtered_data = [] 
    try:
        with open("filtered_positions.json", "r", encoding="utf-8") as f:
            filtered_data.extend(json.load(f))
            print(f"Loaded {len(filtered_data)} existing positions")
    except FileNotFoundError:
        print("No existing dataset found. Starting fresh")

    selected_fens = prefiltration()

    # Piece values for material calculation
    piece_values = {
        chess.PAWN: 1,
        chess.KNIGHT: 3,
        chess.BISHOP: 3,
        chess.ROOK: 5,
        chess.QUEEN: 9,
    }

    for i in range(len(selected_fens)):
        eval, board, difficulty = getEval(selected_fens[i])



        if board.turn:
            turn = "White to move"
        else:
            turn = "Black to move"

        svg_data = chess.svg.board(board=board)

        # ---------- NEW: Best move ----------
        # ---------- NEW: Best move ----------
        if board.is_game_over():
            best_move = "Game Over"
        else:
            result = engine.play(board, chess.engine.Limit(depth=20))
            
            if result.move is not None:
                best_move = board.san(result.move)
            else:
                best_move = "No move"

        # ---------- NEW: Material ----------
        white_material = 0
        black_material = 0

        for piece_type, value in piece_values.items():
            white_material += len(board.pieces(piece_type, chess.WHITE)) * value
            black_material += len(board.pieces(piece_type, chess.BLACK)) * value

        diff = white_material - black_material

        if diff == 0:
            material = "Equal"
        elif diff > 0:
            material = f"White up {diff} point{'s' if diff != 1 else ''}"
        else:
            material = f"Black up {abs(diff)} point{'s' if abs(diff) != 1 else ''}"


        display_eval = round(eval / 100, 2)
        try: 
            aiExplanation = GenerateExplanation(
            board.fen(), display_eval, turn, best_move, diff
            )
            time.sleep(7.5)  # Sleep for 2.25 seconds
        except Exception as e:
            print(e)
            continue

        filtered_data.append({
            'SVG': svg_data,
            'MoveNumber': board.fullmove_number,
            'FEN': board.fen(),              # NEW
            'Eval': eval,
            'Turn': turn,
            'Difficulty': difficulty,
            'BestMove': best_move,           # NEW
            'Material': material,
            'MaterialDiff': diff,
            'AIExplanation': aiExplanation          # NEW
        })
        with open("filtered_positions.json", "w", encoding="utf-8") as f:
                json.dump(filtered_data, f, ensure_ascii=False, indent=4)
        
                print("Saved filtered position to JSON!")

        if len(filtered_data) >= 750:
            break

        print(f"{eval}, {difficulty}")

    print("Filtration DONE!!!!")
    print(len(filtered_data))
    if filtered_data:
        print(filtered_data[0])
    else:
        print("No positions generated")

    # Save positions to JSON
    

    return filtered_data


  # Close the engine after processing all positions
"""
"""
## This line of code is used to set the route for the Flask application, telling it to associating / path with the index function
if __name__ == "__main__":
    loadPositions()
    engine.quit()
    print("Finished preprocessing and filtration.")





