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
<<<<<<< HEAD


#### v0.45 – Larger Dataset 📈
- Expand the position database by almost 10x, from 100 to over 900. 
- Increase positional diversity and coverage

#### v0.5 – Difficulty Modes Update 🧩
- Introduce Easy, Medium, and Hard modes
- Backend filtering by positional complexity using an [algorithm]


### v0.6 - Primitive Point System 🥇
- Localstorage-based primitive elo system
- Complex mechanics and equations for computing elo based on streaks, confidence intervals, etc





#### v0.8 - Full glow up of main play page
 - matches a vibrant theme - change-up from green theme to yellow/black blend of modern look. 


#### v0.85 - login-free play  + UI updates
 - players can play a bit of puzzles onload before hacing to login/create acc
 -smoother transitions of main pages



#### v0.9 – Accounts and Leaderboards Full release👤 (June 2026) 
- User accounts and authentication - [done]
- Score tracking and long-term progress analytics[done]
- Global leaderboards of PR(Positional Rating) already instated above in earlier updates[done]
- Google integrations for logins[done]
- Full statistics overview page[done]

### 🔜 Planned Updates

## v0.95 - Time-based and point system upgrades, Stats page upgrade 🏆[DELAYED to ????]
 - More synced multiplayer point systems reliant on what difficulty puzzles, as well as time
 - Formula-based puzzle calculations
 - upgrade stats page to have specific logistics/trends based on time OR last 'x' puzzles completed, more specification for training purposes. 
#### v1.0 – Full Release 🎉 (2026)

- Official launch
- Complete feature set with polished performance and UX
- MAJOR UI POLISH all around, transitios upgrade
- security terms & privacy terms - prevent issues
- Lichess & Devpost Release
- Further publication
- [optional] - in stats/training page, show the last x positions solved in a log format, their eval, answer, rating change, etc
- Puzzle review log
- Mystery feaatures?
- Updated PR(Positional Rating Calculations) out based on relative puzzle difficulty and accuracy


#### v1.1 - New gamemode: Regular & blitz-paced modes update
 - On homescreen, ability to switch between regular, rated play
 - OR a new gamemode: Rush(3 or 5 min), where you try to get the most amt of puzzles correct in the limited time as possible. 
 - Integrations with global leaderboard - seperate leaderboard for Rush

#### v1.2 - Friends & Personalization Update(2026) 👱
 - Ability to add friends
 - Leaderboards within friends
 - Personalization such as dark/light mode, super beginner mode
 - Daily rewards, streaks, etc

#### v1.3 - AI-based Explanations & Reflections(2026-27) 🤖
- Pre-cached explanations for each stored position in the database
- Good for long-term learning and reflection,  leading to better opportunities for the user to hone positional skill. 

### IN THE NEAR FUTURE: COMING TO MOBILE DEVICES!!! --> Both Android & Apple

## 💡 Future Ideas

- Two main modes of the game: Normal rating play, unrated puzzle streak timed(3min, 5min )- see how much you can get 
- 📚 Positional theme tagging (isolated pawns, bishop pair, space advantage)
- 🎓 Beginner mode with post-guess explanations
- 🔁 Daily challenge positions → revealed at midnight, distributions also revealed
- (1.5+) Evaluation Bar Guesser instead of white/black/equal
- Positional theme tagging on puzzles in the model; Will take a while to pre-train
- (Training specialization) - Last ‘X’ puzzles mistake log → if thematic puzzle tagging added, it becomes a powerful tool(add to STATS page)
- imrpove hompage ux
-lederboard page ux improv a bit
- 🧠 Optional engine explanation after each guess
- 🌙 Dark mode and board theme customization
- 🏆 Add a friend system after multiplayer: →  Global or friends-only leaderboards
- 📱 (2027) → Mobile-first UI optimizations

---

## 🙏 Credits

- Idea and Development: Boandme
- Testing: EntyXD
- Icons and Symbols: UXWing

