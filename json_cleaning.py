import json

FAKE_WHY = "The position is better for the side with the initiative because it controls key squares and has the more active pieces."

with open("filtered_positions.json", "r", encoding="utf-8") as f:
    positions = json.load(f)

original = len(positions)

clean = [
    p for p in positions
    if p["AIExplanation"]["why"] != FAKE_WHY
]

print(f"Removed {original - len(clean)} positions.")
print(f"Remaining {len(clean)} positions.")

with open("filtered_positions_clean.json", "w", encoding="utf-8") as f:
    json.dump(clean, f, indent=4, ensure_ascii=False)

print("Clean file written to filtered_positions_clean.json")