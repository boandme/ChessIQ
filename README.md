ChessIQ is a positional training tool for intermediate and above chess players that tests your ability to visualize and evaluate a positions. Players are given a position and have to self analyze it, either by simple material, space, or other positional concepts. Its like tactical puzzles, but it trains your positional play that can be very useful in game! Although the game is in the beta stage right now, there will be many more updates coming soon, leading up to v1.0. 

--> ChessIQ's main product is the positionGuessing tool, but many more products such as AI computers to play against are coming soon!




This game was inspired by tactical puzzles, and the idea to create a way to effectively practice positional thinking.

Version History + Future Updates:
v0.1(Initial HTML update)📱 - Added SVG positions for sample data, and displayed evaluation using python pre-processing

v0.2(database update)💻 - Connected positions and evaluation to a firebase database, eliminating the need for python to run constantly, only once for training. JS, CSS, and HTML updated to import from the database and display positions/eval dynamically. 

v0.25(gamification)🎮 - Added the 'guessing' aspect of the game with the sample data based on stockfish evaluations , allowing for a mini version of the game's functionality

v0.3(First Working Version of ChessIQ!)🥇 - Used python's berserk library to import lichess game data and use that instead of the sample data for the app. Exported this to the firebase database and prepared html, css, and js to function solely from the 
database. Additionally, added a 'to move' marker to make the game more playable for training

v0.35(Accessibility Update)❓ - Added a help menu and a startup menu that appears on load and helps the user understand how to play this game

v0.45(Larger dataset)[2025] - Increase the dataset by 10x, making the positions much more diverse.

v0.5(Difficulty Update)[2025] - Aims to add an Easy, Medium, and Hard mode of positional analyzing for all levels of chess play. Will be done thru the backend

..
v0.75(flopy AI release)[2025] - Potentially add a fully AI powered chess bot to play against - no calculaions, only trained on thousands of lichess games. 

v1.0(Full Release)[2026] - Full app release with features





How To Play:
You will be given a position and have to self-analyze it to find out which side is winning.

-> If you believe White is winning, click the White King

-> If you believe that Black is winning, click the Black King

-> If you believe that the position is close to equal, click the Equal symbol



Credits:
Symbols: UXWing
Some of the code: EntyXD
