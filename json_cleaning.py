import json

# ─────────────────────────────────────────────
# CLEANING STEP (already done — commented out)
# ─────────────────────────────────────────────

# FAKE_WHY = "The position favours one side based on superior piece activity and structural factors."

# def clean_positions(input_file, output_file):
#     with open(input_file, "r", encoding="utf-8") as f:
#         positions = json.load(f)
#     original = len(positions)
#     clean = [p for p in positions if p["Explanation"]["why"] != FAKE_WHY]
#     print(f"[{input_file}] Removed {original - len(clean)} positions.")
#     print(f"[{input_file}] Remaining {len(clean)} positions.")
#     with open(output_file, "w", encoding="utf-8") as f:
#         json.dump(clean, f, indent=4, ensure_ascii=False)
#     print(f"Clean file written to {output_file}\n")
#     return clean

# clean_2012 = clean_positions("2012_positions.json", "2012_clean_positions.json")
# clean_2016 = clean_positions("2016_positions.json", "2016_clean_positions.json")
# all_new = clean_2012 + clean_2016

# ─────────────────────────────────────────────
# NORMALIZATION STEP
# Input:  2012_2016_clean.json  (already merged clean file)
# Renames fields to match Firebase schema:
#
#   Firebase field   ←   2012/2016 field
#   AIExplanation    ←   Explanation
#   BestMove         ←   bestMove
#   Eval             ←   evaluation
#   FEN              ←   fen
#   Turn             ←   sideToMove
#   Difficulty       ←   difficulty
# ─────────────────────────────────────────────

with open("all_clean_positions.json", "r", encoding="utf-8") as f:
    all_new = json.load(f)

print(f"Loaded {len(all_new)} positions from 2012_2016_clean.json")

def normalize_to_firebase_schema(positions):
    normalized = []
    for p in positions:
        n = {}

        if "Explanation" in p:
            n["AIExplanation"] = p["Explanation"]
        elif "AIExplanation" in p:
            n["AIExplanation"] = p["AIExplanation"]

        if "bestMove" in p:
            n["BestMove"] = p["bestMove"]
        elif "BestMove" in p:
            n["BestMove"] = p["BestMove"]

        if "difficulty" in p:
            n["Difficulty"] = p["difficulty"]
        elif "Difficulty" in p:
            n["Difficulty"] = p["Difficulty"]

        if "evaluation" in p:
            n["Eval"] = p["evaluation"]
        elif "Eval" in p:
            n["Eval"] = p["Eval"]

        if "fen" in p:
            n["FEN"] = p["fen"]
        elif "FEN" in p:
            n["FEN"] = p["FEN"]

        if "sideToMove" in p:
            n["Turn"] = p["sideToMove"]
        elif "Turn" in p:
            n["Turn"] = p["Turn"]

        # Pass through any remaining fields that don't need renaming
        skip = {"Explanation", "AIExplanation", "bestMove", "BestMove",
                "difficulty", "Difficulty", "evaluation", "Eval",
                "fen", "FEN", "sideToMove", "Turn"}
        for k, v in p.items():
            if k not in skip:
                n[k] = v

        normalized.append(n)
    return normalized

normalized_new = normalize_to_firebase_schema(all_new)

with open("2012_2016_normalized.json", "w", encoding="utf-8") as f:
    json.dump(normalized_new, f, indent=4, ensure_ascii=False)

print(f"Normalized {len(normalized_new)} positions written to 2012_2016_normalized.json")
print("\nSample field check on first normalized position:")
sample = normalized_new[0] if normalized_new else {}
for key in ["FEN", "BestMove", "Eval", "Turn", "Difficulty", "AIExplanation"]:
    print(f"  {key}: {'✓ present' if key in sample else '✗ MISSING'}")

# ─────────────────────────────────────────────
# MERGE STEP (commented out until ready)
# ─────────────────────────────────────────────

# FIREBASE_FILE = "firebase_positions.json"
# NEW_POSITIONS_FILE = "2012_2016_normalized.json"
# OUTPUT_FILE = "merged_positions.json"

# with open(FIREBASE_FILE, "r", encoding="utf-8") as f:
#     firebase_data = json.load(f)

# if isinstance(firebase_data, dict):
#     firebase_list = list(firebase_data.values())
#     print(f"Firebase positions loaded: {len(firebase_list)} (dict format)")
# elif isinstance(firebase_data, list):
#     firebase_list = firebase_data
#     print(f"Firebase positions loaded: {len(firebase_list)} (list format)")
# else:
#     raise ValueError("Unexpected Firebase JSON format — expected dict or list at root.")

# with open(NEW_POSITIONS_FILE, "r", encoding="utf-8") as f:
#     new_positions = json.load(f)

# merged = firebase_list + new_positions
# print(f"Total after merge: {len(merged)} positions.")

# with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
#     json.dump(merged, f, indent=4, ensure_ascii=False)

# print(f"Merged file written to {OUTPUT_FILE}")