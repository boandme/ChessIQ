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

### 🎯 PositionPuzzler (Core Product)

- Real-game positions sourced from Lichess
- Evaluate whether White is better, Black is better, or the position is equal
- Hone your positional skills just as you do tactical skills with regular puzzles
- Designed to improve evaluation accuracy rather than calculation depth

### 🔮 Upcoming Features

- AI opponents trained on real games
- Difficulty-based positional challenges
- Player accounts and long-term progress tracking
- Positional Rating System/ Points for Puzzles based on difficulty
- Precomputed explanations for each position, leading to further learning opportunities

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


### 🔜 Planned Updates

#### v0.45 – Larger Dataset 📈 (2026)

- Expand the position database by almost 10x, from 100 to over 900. 
- Increase positional diversity and coverage

#### v0.5 – Difficulty Modes Update 🧩 (2026)

- Introduce Easy, Medium, and Hard modes
- Backend-based filtering by positional complexity

### v0.6 - Primitive Point System 🥇
- Localstorage-based primitive elo system
- Simple username-password

## v0.75 - Time-based and point system upgrades 🏆
 - More synced multiplayer point systems reliant on what difficulty puzzles, as well as time
 - Formula-based puzzle calculations

#### v0.85 – Accounts and Leaderboards 👤 (2026)

- User accounts and authentication
- Score tracking and long-term progress analytics
- Global leaderboards of PR(Positional Rating) already instated above in earlier updates
- Google integrations for logins

#### v1.0 – Full Release 🎉 (2026)

- Official launch
- Complete feature set with polished performance and UX
- Updated PR(Positional Rating Calculations)

#### v1.2 - Friends & Personalization Update(2026) 👱
 - Ability to add friends
 - Leaderboards within friends
 - Personalization such as dark/light mode, super beginner mode
 - Daily rewards, streaks, etc

#### v1.2 - AI-based Explanations & Reflections(2026-7) 🤖
- Pre-cached explanations for each stored position in the database
- Good for long-term learning and reflection,  leading to better opportunities for the user to hone positional skill. 

### IN THE NEAR FUTURE: COMING TO MOBILE DEVICES!!! --> Both Android & Apple

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
