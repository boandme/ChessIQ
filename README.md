PositionGuessr is a positional training game where _______(do later)


This game was inspired by tactical puzzles, and the idea to create a way to effectively practice positional thinking.

Version History + Future Updates:
v0.1(Initial HTML update)📱 - Added SVG positions for sample data, and displayed evaluation using python pre-processing

v0.2(database update)💻 - Connected positions and evaluation to a firebase database, eliminating the need for python to run constantly, only once for training. JS, CSS, and HTML updated to import from the database and display positions/eval dynamically. 

v0.25(gamification)🎮 - Added the 'guessing' aspect of the game with the sample data based on stockfish evaluations , allowing for a mini version of the game's functionality

v0.3(First Working Version of PositionGuessr!)🥇 - Used python's berserk library to import lichess game data and use that instead of the sample data for the app. Exported this to the firebase database and prepared html, css, and js to function solely from the 
database. Additionally, added a 'to move' marker to make the game more playable for training

v0.35(Accessibility Update)❓ - Added a help menu and a startup modal that appears on load and helps the user understand how to play this game)





How To Play:
You will be given a position and have to self-analyze it to find out which side is winning.

-> If you believe White is winning, click the White King

-> If you believe that Black is winning, click the Black King

-> If you believe that the position is close to equal, click the Equal symbol



Credits:
Symbols: UXWing
Some of the code: EntyXD
