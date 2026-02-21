# ♟️ ChessIQ

ChessIQ is a positional training tool designed for intermediate and advanced chess players who want to improve their ability to visualize, evaluate, and understand chess positions beyond tactics.

Instead of finding a forced move like in traditional tactical puzzles, ChessIQ challenges players to judge the position itself using strategic concepts such as material balance, space, initiative, king safety, and piece activity.

Think of ChessIQ as tactical puzzles for positional thinking.

**Status:** 🚧 Currently in beta, with active development leading up to v1.0.

---

## 🧠 Core Concept

- Analyze a given chess position
- Evaluate the position without engine assistance
- Decide which side stands better using positional understanding
- Receive feedback based on engine evaluations from real games

---

## 🚀 Main Features

### 🎯 Position Guessing Tool (Core Product)

- Real-game positions sourced from Lichess
- Evaluate whether White is better, Black is better, or the position is equal
- Designed to improve evaluation accuracy rather than calculation depth

### 🔮 Upcoming Features

- AI opponents trained on real games
- Difficulty-based positional challenges
- Player accounts and long-term progress tracking

---

## 🕹️ How to Play

1. You will be shown a chess position
2. Analyze the position using positional concepts
3. Submit your evaluation:
   - ♔ Click the White King if White is winning
   - ♚ Click the Black King if Black is winning
   - ⚖️ Click the Equal symbol if the position is roughly equal

---

## 🗂️ Version History and Roadmap

### ✅ Released Versions

#### v0.1 – Initial HTML Update 📱

- Added SVG chess positions
- Python-based evaluation preprocessing

#### v0.2 – Database Update 💻

- Connected evaluations and positions to Firebase
- Removed the need for continuous Python execution
- Frontend dynamically loads data using JavaScript, CSS, and HTML

#### v0.25 – Gamification Update 🎮

- Introduced the guessing mechanic
- Implemented Stockfish-based evaluation thresholds

#### v0.3 – First Fully Working Version 🥇

- Integrated real Lichess game data using Python’s berserk library
- Positions exported to Firebase
- Added a side-to-move indicator for realistic training

#### v0.35 – Accessibility Update ❓

- Added a help menu and startup guide
- Improved onboarding and usability

#### v0.4 – First Public Release 🌍

- Published the application
- Upgraded UI and UX across the entire app
- Added credits and information pages

#### v0.43 - UI fixes, Evaluation display 
 - Added a display of the exact evaluation after the user makes their guess, allowing for more reflection and learning opportunities of positional thinking
 - Upgraded UI across the whole app, including credits, info, and home pages all syncing in similar styles
 - Added a sidebar menu for future other products under ChessIQ

---

### 🔜 Planned Updates

#### v0.45 – Larger Dataset 📈 (2026)

- Expand the position database by 10x
- Increase positional diversity and coverage

#### v0.5 – Difficulty Modes 🧩 (2026)

- Introduce Easy, Medium, and Hard modes
- Backend-based filtering by positional complexity

#### v0.75 – Flopy AI Release 🤖 (2026)

- Experimental AI chess bot trained on thousands of Lichess games
- No brute-force calculation, purely learned positional play

#### v0.85 – Accounts and Scoring 👤 (2026)

- User accounts and authentication
- Score tracking and long-term progress analytics

#### v1.0 – Full Release 🎉 (2026)

- Official launch
- Complete feature set with polished performance and UX

---

## 💡 Future Ideas

- 📚 Positional theme tagging (isolated pawns, bishop pair, space advantage)
- 🎓 Beginner mode with post-guess explanations
- 🔁 Daily challenge positions
- 📊 Accuracy-based rating system
- 🧠 Optional engine explanation after each guess
- 🌙 Dark mode and board theme customization
- 🧪 A/B testing for training effectiveness
- 🏆 Global or friends-only leaderboards
- 📱 Mobile-first UI optimizations

---

## 🙏 Credits

- Idea and Development: Boandme
- Testing: EntyXD
- Icons and Symbols: UXWing
