♟️ ChessIQ

ChessIQ is a Firebase-backed positional training tool for intermediate and advanced chess players who want to improve their ability to visualize, evaluate, and understand chess positions beyond tactics.

Instead of finding a forced move like in traditional tactical puzzles, ChessIQ asks players to judge the position itself using strategic concepts such as material balance, space, initiative, king safety, pawn structure, and piece activity. After every guess, players receive an engine evaluation alongside a pre-generated AI explanation that highlights the key positional ideas, common mistakes, strategic plans, and best-move reasoning—turning every puzzle into a learning opportunity rather than just another rating gain.

Think of ChessIQ as tactical puzzles for positional thinking. The homepage supports adaptive or manual difficulty training, while the Thematic Focus picker lets players combine two or more high-frequency positional themes for targeted practice.

ChessIQ's multiple uses

ChessIQ scales with your level. Beginners start by counting material — learning which side simply has more pieces — and that alone builds a foundation for reading positions. As your rating climbs, the puzzles shift toward what ChessIQ was originally built for: recognizing positional imbalances, space, piece activity, and structural advantages that don't show up in a piece count. One tool, two very different kinds of chess thinking, on a single continuous ladder.

Status: ✅ v1.4 Official Release — actively developed with planned updates through v1.5 and beyond.

🧠 Core Concept

Analyze real chess positions without engine assistance

Evaluate the position using strategic concepts instead of tactical calculation

Decide whether White, Black, or neither holds the advantage

Receive instant Stockfish feedback

Learn from concise AI-generated explanations tailored to every position

Review the engine's best move and strategic plan

Compare your answer with the ChessIQ community

Improve your positional intuition through repeated practice

--

🚀 Main Features

🎯 Position Puzzler(Core Product)

Hundreds of real-game positions imported from Lichess

Evaluate whether White is better, Black is better, or the position is equal

Train positional understanding rather than tactical calculation

Position Rating (PR) matchmaking that scales puzzle difficulty to your playing strength

Instant Stockfish-powered evaluation after every guess

Randomized puzzle selection for endless practice

Thematic Focus training: select two or more of the ten most common positional themes to draw from positions matching any selected theme

Thematic pools respect the selected difficulty and cycle through every matching position before repeating

📊 Personalized Training

Personal Position Rating (PR)

Standalone Analytics page with a theme-accuracy radar, recent PR trend, puzzle log, and a normalized 73-theme training taxonomy

Detailed statistics dashboard

Puzzle history and training log

Rating progression tracking

26 unlockable achievements across performance, progress, consistency, daily-play, leaderboard, and account milestones

Global leaderboard

🤖 AI Position Explanations

Every puzzle includes a pre-generated AI explanation, allowing you to immediately understand why one side is better—not just what Stockfish says.

Each explanation includes:

Why the evaluation favors one side

Key positional themes involved

A common mistake intermediate players often make

The engine's best move with a short explanation

A concise strategic plan for converting the advantage

🌍 Community Results

After completing a puzzle, compare your answer with the rest of the ChessIQ community.

See exactly what percentage of players selected White, Equal, or Black, allowing you to compare your positional intuition against other players around the world. Challenging positions often reveal surprisingly split opinions, making every puzzle feel like part of a larger community experiment.

🧩 Daily Puzzle

Every day, all players receive the same featured positional challenge, accessible from every main ChessIQ page.

Compete against the community on a single position each day while tracking your daily progress and comparing your evaluation with everyone else's.

🕹️ How to Play

Analyze the given chess position.

Evaluate the position using positional concepts such as:

Material

Piece activity

Pawn structure

Space

King safety

Initiative

Submit your evaluation:

♔ White Advantage

⚖️ Equal Position

♚ Black Advantage

Review the engine evaluation and community responses.

Continue improving your Position Rating.

🗂️ Version History and Roadmap

✅ Released Versions

v0.1 – Initial HTML Update 📱

Added SVG chess positions

Python-based evaluation preprocessing

v0.2 – Database Update 💻

Connected evaluations and positions to Firebase

Removed the need for continuous Python execution

Frontend dynamically loads data using JavaScript, CSS, and HTML

v0.2.5 – Gamification Update 🎮

Introduced the guessing mechanic

Implemented Stockfish-based evaluation thresholds

v0.3 – First Fully Working Version 🥇

Integrated real Lichess game data using Python’s berserk library

Positions exported to Firebase

Added a side-to-move indicator for realistic training

v0.3.5 – Accessibility Update ❓

Added a help menu and startup guide

Improved onboarding and usability

v0.4 – First Public Release 🌍

Published the application

Upgraded UI and UX across the entire app

Added credits and information pages

v0.4.3 - UI fixes, Evaluation display

Added a display of the exact evaluation after the user makes their guess, allowing for more reflection and learning opportunities of positional thinking

Upgraded UI across the whole app, including credits, info, and home pages all syncing in similar styles

Added a sidebar menu for future other products under ChessIQ<<<<<<< HEAD

v0.4.5 – Larger Dataset 📈

Expand the position database by almost 10x, from 100 to over 900.

Increase positional diversity and coverage

v0.5 – Difficulty Modes Update 🧩

Introduce Easy, Medium, and Hard modes

Backend filtering by positional complexity using an [algorithm]

v0.6 - Primitive Point System 🥇

Localstorage-based primitive elo system

Complex mechanics and equations for computing elo based on streaks, confidence intervals, etc

v0.8 - Full glow up of main play page

matches a vibrant theme - change-up from green theme to yellow/black blend of modern look.

v0.8.5 - login-free play + UI updates

players can play a bit of puzzles onload before hacing to login/create acc-smoother transitions of main pages

v0.9 – Accounts and Leaderboards Full release👤 (June 2026)

User accounts and authentication - [done]

Score tracking and long-term progress analytics[done]

Global leaderboards of PR(Positional Rating) already instated above in earlier updates[done]

Google integrations for logins[done]

Full statistics overview page[done]

v0.9.5 - Time-based and point system upgrades, Stats page upgrade

More synced multiplayer point systems reliant on what difficulty puzzles, as well as time

Formula-based puzzle calculations

upgrade stats page to have specific logistics/trends based on time OR last 'x' puzzles completed, more specification for training purposes.

v1.0 – Full Release 🎉 (Jun 2026)

Official launch

Complete feature set with polished performance and UX

MAJOR UI POLISH all around, transitios upgrade

security terms & privacy terms -

Lichess & Devpost & Chess.com Release

Last 'x' puzzles training log w/ details in stats page

Puzzle review log

Updated PR(Positional Rating Calculations) out based on relative puzzle difficulty and accuracy

🌍v1.0.5- User experience & Community Results update(Jul 2026)

Better Transitions in UI

Dark mode/light mode toggle

Community results after each puzzle showing how others faired against this puzzle.

Improved settings UI

V1.08 - Adaptive + Manual Difficulty Update(jul 206)

Difficulty override option in Settings, where players can choose which difficulty puzzles they want, for specialized training rather than adaptive PR-based difficulty

Adaptive option still available for long grinds

v1.2 – AI-Based Explanations & UI Revamp (August 2026) 🤖

Added pre-cached AI-generated explanations for every stored position, displayed immediately after each puzzle.

Learn why one side is better through concise positional analysis rather than just seeing the engine evaluation.

AI highlights key positional themes (piece activity, space, pawn structure, king safety, initiative, etc.) to reinforce long-term pattern recognition.

Each explanation includes the best move, common mistakes, and strategic plans to help players improve their positional understanding beyond individual puzzles.

After a puzzle collapsable menu to save UI space

Improved Navbar

v1.3 - Achievements update(Aug 2026)

Users collect achievements as they solve

All collected and notcollected achievements visible on a page

rewards player for Personal Best

v1.3.5 - PR upgrate + Difficulty Selection re-iteration

- Bringing back difficulty selection in the main menu as a third column

- Allowing advanced users to calibrate to their difficulty early on without requiring PR grinding

Improving PR algorithms

v1.4 - Thematic analysis & training update
- allowing users to filter puzzles by positional theme for training
- brand new analytics page with state-of-the-art radar map highlighting user's thematic strengths and weaknesses

🔜 Planned Updates

v1.5 – Adaptive Puzzle Ratings (August 2026) 📈

Introduce adaptive ratings for every puzzle, allowing difficulty to evolve over time based on real player performance.

Initial puzzle ratings are estimated using AI positional analysis and engine-derived complexity, providing a strong starting point from day one.

As more users solve each puzzle, ratings automatically adjust to reflect actual solve rates, accuracy, and player strength.

Puzzles can naturally move between Easy, Medium, and Hard categories as the community calibrates their true difficulty, creating a continually improving training experience.

v1.6 - New gamemode: Regular & blitz-paced modes update - ChessIQ RANKED!

On homescreen, ability to switch between regular, rated play

OR a new gamemode: Rush(3 or 5 min), where you try to get the most amt of puzzles correct in the limited time as possible.

Integrations with global leaderboard - seperate leaderboard for Rush

v1.7 - Friends & Personalization Update(2026) 👱

Ability to add friends

Leaderboards within friends

Personalization such as dark/light mode, super beginner mode

Daily rewards, streaks, etc

IN THE NEAR FUTURE: COMING TO MOBILE DEVICES!!! --> Both Android & Apple

💡 Future Ideas

Position Accuracy heatmap after user guessed; shows the percent of people that put white equal or black after guessing --> good for user retainment

Player recognition + reward for getting a personal best!

Crowdsourcing: Randomly after a certain amount of puzzles completed, survey the player on what convinced them of the answer - material, position, etc --> not for ALL though

Two main modes of the game: Normal rating play, unrated puzzle streak timed(3min, 5min )- see how much you can get

📚 Positional theme tagging (isolated pawns, bishop pair, space advantage)

🎓 Beginner mode with post-guess explanations

🔁 Daily challenge positions → revealed at midnight, distributions also revealed

(1.5+) Evaluation Bar Guesser instead of white/black/equal

Positional theme tagging on puzzles in the model; Will take a while to pre-train

🧠 Optional engine explanation after each guess

🌙 Dark mode and board theme customization

🏆 Add a friend system after multiplayer: → Global or friends-only leaderboards

📱 (2027) → Mobile-first UI optimizations

🙏 Credits

Idea and Development: Boandme

Testing: EntyXD

Icons and Symbols: UXWing

Data: Lichess API

