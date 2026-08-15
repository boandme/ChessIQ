# ♟️ ChessIQ

ChessIQ is a Firebase-backed positional training tool for intermediate and advanced chess players who want to improve their ability to visualize, evaluate, and understand chess positions beyond tactics.

Instead of finding a forced move like in traditional tactical puzzles, ChessIQ asks players to judge the position itself using strategic concepts such as material balance, space, initiative, king safety, pawn structure, and piece activity. After every guess, players receive an engine evaluation alongside a pre-generated AI explanation that highlights the key positional ideas, common mistakes, strategic plans, and best-move reasoning — turning every puzzle into a learning opportunity rather than just another rating gain.

Think of ChessIQ as tactical puzzles for positional thinking. The homepage supports adaptive or manual difficulty training, while the Thematic Focus picker lets players combine two or more high-frequency positional themes for targeted practice.

---

## ChessIQ's Multiple Uses

ChessIQ scales with your level. Beginners start by counting material — learning which side simply has more pieces — and that alone builds a foundation for reading positions. As your rating climbs, the puzzles shift toward what ChessIQ was originally built for: recognizing positional imbalances, space, piece activity, and structural advantages that don't show up in a piece count. One tool, two very different kinds of chess thinking, on a single continuous ladder.

**Status: ✅ v1.5 — actively developed.**

---

## 🧠 Core Concept

- Analyze real chess positions without engine assistance
- Evaluate the position using strategic concepts instead of tactical calculation
- Decide whether White, Black, or neither holds the advantage
- Receive instant Stockfish feedback
- Learn from concise AI-generated explanations tailored to every position
- Review the engine's best move and strategic plan
- Compare your answer with the ChessIQ community
- Improve your positional intuition through repeated practice

---

## 🚀 Main Features

### 🎯 Position Puzzler (Core Product)

- Hundreds of real-game positions imported from Lichess
- Evaluate whether White is better, Black is better, or the position is equal
- Train positional understanding rather than tactical calculation
- Position Rating (PR) matchmaking that scales puzzle difficulty to your playing strength
- Instant Stockfish-powered evaluation after every guess
- Randomized puzzle selection for endless practice
- Thematic Focus training: select two or more of the ten most common positional themes to draw from positions matching any selected theme
- Thematic pools respect the selected difficulty and cycle through every matching position before repeating

### 📊 Personalized Training

- Personal Position Rating (PR) — earned through grinding, not gaming
- Standalone Analytics page with a theme-accuracy radar, recent PR trend, puzzle log, and a normalized 73-theme training taxonomy
- Detailed statistics dashboard
- Puzzle history and training log
- Rating progression tracking
- 26 unlockable achievements across performance, progress, consistency, daily-play, leaderboard, and account milestones
- Global leaderboard

### 🤖 AI Position Explanations

Every puzzle includes a pre-generated AI explanation, allowing you to immediately understand why one side is better — not just what Stockfish says.

Each explanation includes:

- Why the evaluation favors one side
- Key positional themes involved
- A common mistake intermediate players often make
- The engine's best move with a short explanation
- A concise strategic plan for converting the advantage

### 🌍 Community Results

After completing a puzzle, compare your answer with the rest of the ChessIQ community. See exactly what percentage of players selected White, Equal, or Black — challenging positions often reveal surprisingly split opinions, making every puzzle feel like part of a larger community experiment.

### 🧩 Daily Puzzle

Every day, all players receive the same featured positional challenge, accessible from every main ChessIQ page. Compete against the community on a single position each day while tracking your daily progress.

---

## 🕹️ How to Play

1. Analyze the given chess position
2. Evaluate the position using positional concepts such as material, piece activity, pawn structure, space, king safety, and initiative
3. Submit your evaluation: ♔ White Advantage · ⚖️ Equal Position · ♚ Black Advantage
4. Review the engine evaluation and community responses
5. Continue improving your Position Rating

---

## 📈 Position Rating (PR) — How It Works

PR is ChessIQ's core progression system. It is designed to reward genuine, sustained improvement — not a handful of lucky guesses. Reaching the top of the leaderboard requires real grinding.

### Provisional Period (First 10 Puzzles)

New accounts begin in a provisional phase that anchors your starting rating based on your early performance. During this window, puzzles carry larger swings to place you quickly, but wrong answers are weighted more heavily than correct ones. Guessing does not pay off. A perfect provisional run on Hard difficulty reaches approximately PR 2000 — a ceiling that reflects genuine positional ability, not good fortune.

### Post-Provisional Rating

Once the provisional phase ends, PR is governed by a compression curve: the higher your rating, the smaller each individual gain becomes. At PR 1750 you earn roughly half of what you would earn from the same puzzle at PR 500. This means climbing from 2000 to 2500 takes meaningfully more effort than climbing from 500 to 1000. Reaching elite ratings (3000+) requires hundreds of high-accuracy sessions.

A correct-answer streak provides a mild bonus (up to +20%), and a losing streak applies a small additional penalty — but neither is large enough to substitute for accuracy. The system rewards players who are consistently right, not players who get hot for ten puzzles.

### Inactivity Decay

PR decays slowly after a 7-day grace period of inactivity, so ratings on the leaderboard reflect active, current performance.

---

## 🔒 Accounts & Security

ChessIQ supports manual email/password sign-in as well as Google Sign-In. Accounts are required to save PR, appear on the leaderboard, and unlock achievements. Email/password accounts include a verification step before full access is granted.

---

## 🗂️ Version History and Roadmap

### ✅ Released Versions

**v0.1 – Initial HTML Update**
Added SVG chess positions and Python-based evaluation preprocessing.

**v0.2 – Database Update**
Connected evaluations and positions to Firebase. Frontend dynamically loads data using JavaScript, CSS, and HTML.

**v0.2.5 – Gamification Update**
Introduced the guessing mechanic and Stockfish-based evaluation thresholds.

**v0.3 – First Fully Working Version**
Integrated real Lichess game data. Added a side-to-move indicator for realistic training.

**v0.3.5 – Accessibility Update**
Added a help menu and startup guide. Improved onboarding and usability.

**v0.4 – First Public Release**
Published the application. Upgraded UI and UX across the entire app. Added credits and information pages.

**v0.4.3 – UI Fixes, Evaluation Display**
Added a display of the exact evaluation after the user makes their guess. Upgraded UI across the whole app, including credits, info, and home pages. Added a sidebar menu.

**v0.4.5 – Larger Dataset**
Expanded the position database by almost 10×, from 100 to over 900 positions. Increased positional diversity and coverage.

**v0.5 – Difficulty Modes Update**
Introduced Easy, Medium, and Hard modes with backend filtering by positional complexity.

**v0.6 – Primitive Point System**
localStorage-based rating system with streak and confidence interval mechanics.

**v0.8 – Full UI Revamp**
Vibrant yellow/black theme. Modernized look across all pages.

**v0.8.5 – Login-Free Play + UI Updates**
Players can solve a set of puzzles before being prompted to create an account. Smoother page transitions.

**v0.9 – Accounts and Leaderboards (June 2026)**
Full user authentication (email/password and Google). Score tracking, long-term progress analytics, and global PR leaderboard. Complete statistics overview page.

**v0.9.5 – Point System & Stats Page Upgrade**
Formula-based puzzle calculations. Difficulty-weighted scoring. Stats page upgraded with time-based filtering and per-theme trends.

**v1.0 – Full Release (June 2026)**
Official launch. Complete feature set with polished performance and UX. Major UI polish. Security and privacy terms. Lichess, Devpost, and Chess.com release. Puzzle review log. Updated PR calculations.

**v1.0.5 – Community Results & UX Update (July 2026)**
Better UI transitions. Community results after each puzzle. Improved settings UI.

**v1.08 – Adaptive + Manual Difficulty Update (July 2026)**
Difficulty override in settings. Adaptive mode still available for long grinds.

**v1.2 – AI-Based Explanations & UI Revamp (August 2026)**
Pre-cached AI-generated explanations for every stored position, displayed immediately after each puzzle. Explains why one side is better, highlights positional themes, and includes best move, common mistakes, and strategic plans. Collapsible post-puzzle menu. Improved navbar.

**v1.3 – Achievements Update (August 2026)**
26 unlockable achievements across performance, progress, consistency, daily-play, leaderboard, and account milestones. Full achievement gallery page.

**v1.3.5 – PR Upgrade + Difficulty Selection Re-iteration (August 2026)**
Difficulty selection restored to the main menu as a dedicated column. Advanced users can calibrate to their preferred difficulty without PR grinding. Significant improvements to the PR algorithm's accuracy and fairness.

**v1.4 – Thematic Analysis & Training Update (August 2026)**
Filter puzzles by positional theme for targeted practice. Brand-new analytics page with a radar map highlighting thematic strengths and weaknesses across 73 positional categories.

**v1.4.1 – PR Rebalance & Account Security Update (August 2026)**
Complete overhaul of the PR algorithm to make progression meaningful. Provisional ratings now have a hard ceiling and strongly penalize wrong answers. Post-provisional gains are compressed by a steeper curve, requiring consistent performance over many sessions to climb. Streak bonuses and loss penalties are moderated so neither substitutes for accuracy. Account security improvements for email/password sign-in.

---

### 🔜 Planned Updates

**v1.5 - Puzzle ranking & adaptive difficulty - changing scores assigned to individual puzzles **
- some experimentation


**v1.6 – Ranked & Rush Modes / seperate from gameplay" - August 2026
New Rush gamemode: 3 or 5 minutes, maximum puzzles correct. Separate leaderboard for Rush. Ability to switch between regular rated play and Rush on the homescreen.

**v1.7 – Friends & Personalization Update (2026)**
Add friends, friends-only leaderboards, dark/light mode, super beginner mode, daily rewards, and streak tracking. Mobile coming to both Android and Apple.

---

## 💡 Future Ideas

- Position accuracy heatmap after each guess — percentage breakdown of community answers
- Crowdsourcing: periodic survey asking what convinced the player of their answer (material, structure, etc.)
- Evaluation bar guesser as an alternative to White/Equal/Black
- Positional theme tagging on individual puzzles
- Beginner mode with step-by-step post-guess explanations
- Global or friends-only leaderboards
- Board theme customization
- Mobile-first UI optimizations (2027)

---

## 🙏 Credits

- **Idea and Development:** Boandme
- **Testing:** EntyXD
- **Icons and Symbols:** UXWing
- **Data:** Lichess API