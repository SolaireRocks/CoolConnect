// START OF FILE script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const activeGridArea = document.getElementById('active-grid-area');
    const solvedGroupsArea = document.getElementById('solved-groups-area');
    const submitButton = document.getElementById('submit-guess');
    const messageArea = document.getElementById('message-area');
    const attemptsLeftSpan = document.getElementById('attempts-left');
    const attemptCircles = document.querySelectorAll('#attempt-circles span');
    const deselectAllButton = document.getElementById('deselect-all-button');
    const shuffleButton = document.getElementById('shuffle-button');
    const loseOverlay = document.getElementById('lose-overlay');

    // --- Constants ---
    const MAX_SELECTED = 4;
    const TOTAL_ATTEMPTS = 4;
    const PUZZLE_FILE = 'puzzles.json';
    const LOSE_FACE_DURATION = 2000; // How long the frowny face stays (in ms)
    const MESSAGE_CLEAR_DELAY = 1500; // How long messages stay before clearing

    // --- Game State Variables ---
    let selectedWords = [];         // Words currently selected by the user
    let wordElements = {};          // Map word -> button element
    let currentPuzzleData = null;   // { groups: [], date: "YYYY-MM-DD" }
    let remainingAttempts = TOTAL_ATTEMPTS;
    let solvedGroups = [];          // Array of correctly guessed group objects
    let incorrectGuesses = new Set(); // Stores stringified, sorted incorrect guesses
    let isGameOver = false;         // Flag to prevent actions after game end
    let messageTimeoutId = null;    // To clear previous message timeouts

    // --- Local Storage Key ---
    function getStorageKey(dateStr) {
        return `connectionsGameState_${dateStr}`;
    }

    // --- Date Formatting ---
    function getTodayDateString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // --- Local Storage Functions ---
    function saveGameState() {
        if (!currentPuzzleData || !currentPuzzleData.date) return;

        const currentGridWords = Array.from(activeGridArea.querySelectorAll('.word-button:not(.removing)'))
                                      .map(btn => btn.textContent);

        const stateToSave = {
            puzzleDate: currentPuzzleData.date,
            attempts: remainingAttempts,
            solvedCategories: solvedGroups.map(g => g.category),
            gridWords: currentGridWords,
            incorrectGuesses: Array.from(incorrectGuesses), // Convert Set to Array for JSON
            isGameOver: isGameOver,
            isWin: isGameOver ? (solvedGroups.length === 4) : null,
        };

        try {
            localStorage.setItem(getStorageKey(currentPuzzleData.date), JSON.stringify(stateToSave));
            console.log("Game state saved for", currentPuzzleData.date);
        } catch (error) {
            console.error("Error saving game state to localStorage:", error);
        }
    }

    function loadGameState(dateStr) {
        const key = getStorageKey(dateStr);
        try {
            const savedStateJSON = localStorage.getItem(key);
            if (savedStateJSON) {
                const savedState = JSON.parse(savedStateJSON);
                if (savedState && savedState.puzzleDate === dateStr) {
                    console.log("Found saved game state for", dateStr);
                    return savedState;
                } else {
                    console.log("Saved state found, but for a different date. Ignoring.");
                    localStorage.removeItem(key);
                }
            }
        } catch (error) {
            console.error("Error loading or parsing game state from localStorage:", error);
        }
        return null;
    }

    // --- Core Game Logic ---

    async function loadPuzzleForToday() {
        const todayStr = getTodayDateString();
        console.log(`Attempting to load puzzle data for: ${todayStr}`);
        const savedState = loadGameState(todayStr);

        try {
            const response = await fetch(PUZZLE_FILE);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const allPuzzles = await response.json();
            const puzzleGroups = allPuzzles[todayStr];

            if (isValidPuzzleData(puzzleGroups)) {
                console.log("Successfully found and validated puzzle for", todayStr);
                currentPuzzleData = { date: todayStr, groups: puzzleGroups };

                if (savedState) {
                    restoreGameFromState(savedState);
                } else {
                    initializeGame(false);
                }
            } else {
                console.warn("Puzzle data for", todayStr, "not found or is invalid in puzzles.json.");
                handleLoadError("No puzzle found for today.");
            }
        } catch (error) {
            console.error('Error loading or parsing puzzle data:', error);
            handleLoadError("Failed to load puzzle data.");
        }
    }

    function isValidPuzzleData(puzzleGroups) {
       return puzzleGroups && Array.isArray(puzzleGroups) && puzzleGroups.length === 4 &&
              puzzleGroups.every(g => g && typeof g.category === 'string' && Array.isArray(g.words) && g.words.length === 4 && typeof g.difficulty === 'number');
    }

    function handleLoadError(message) {
        displayMessage(message, "error");
        activeGridArea.innerHTML = "<p>Please try again later.</p>";
        disableGameControls();
    }

    function initializeGame(isRestoring = false) {
        isGameOver = false;
        selectedWords = [];
        wordElements = {};
        remainingAttempts = TOTAL_ATTEMPTS;
        solvedGroups = [];
        incorrectGuesses = new Set(); // Reset incorrect guesses for a new game

        activeGridArea.innerHTML = '';
        activeGridArea.classList.remove('game-over', 'game-won-hidden');
        solvedGroupsArea.innerHTML = '';
        messageArea.textContent = '';
        messageArea.className = 'message';
        loseOverlay.classList.remove('visible');

        updateAttemptsDisplay();
        submitButton.disabled = true;

        const allWords = currentPuzzleData.groups.flatMap(group => group.words);
        shuffleArray(allWords);

        populateGrid(allWords);
        enableGameControls();

        if (!isRestoring) {
            saveGameState();
        }
    }

    function restoreGameFromState(savedState) {
        console.log("Restoring game from saved state:", savedState);
        isGameOver = savedState.isGameOver;
        remainingAttempts = savedState.attempts;
        incorrectGuesses = new Set(savedState.incorrectGuesses || []); // Restore incorrect guesses

        solvedGroups = currentPuzzleData.groups.filter(group =>
            savedState.solvedCategories.includes(group.category)
        );
        solvedGroups.sort((a, b) => a.difficulty - b.difficulty);
        renderSolvedGroupsArea();

        activeGridArea.innerHTML = '';
        wordElements = {};
        populateGrid(savedState.gridWords);

        updateAttemptsDisplay();
        submitButton.disabled = true;
        selectedWords = [];

        if (isGameOver) {
            disableGameControls();
            activeGridArea.classList.add('game-over');
            if (savedState.isWin) {
                displayMessage("Congratulations! You found all groups!", "correct");
                if (activeGridArea.querySelectorAll('.word-button').length === 0) {
                   activeGridArea.classList.add('game-won-hidden');
                } else {
                     removeAllButtonsFromGrid();
                }
                triggerFireworks();
            } else {
                 displayMessage("Game Over! Better luck next time.", "incorrect");
                 revealRemainingGroups();
            }
        } else {
            enableGameControls();
             const solvedWords = new Set(solvedGroups.flatMap(g => g.words));
             savedState.gridWords.forEach(word => {
                if (solvedWords.has(word) && wordElements[word]) {
                    wordElements[word].disabled = true;
                }
             });
        }
    }

    function populateGrid(words) {
        words.forEach(word => {
            const isSolved = solvedGroups.some(group => group.words.includes(word));
            if (isSolved) return;

            const button = document.createElement('button');
            button.textContent = word;
            button.classList.add('word-button');
            button.addEventListener('click', handleWordClick);
            activeGridArea.appendChild(button);
            wordElements[word] = button;
        });
    }


    function handleWordClick(event) {
        if (isGameOver) return;
        const button = event.target;
        const word = button.textContent;

        if (button.disabled || button.classList.contains('removing')) return;

        if (selectedWords.includes(word)) {
            selectedWords = selectedWords.filter(w => w !== word);
            button.classList.remove('selected');
        } else {
            if (selectedWords.length < MAX_SELECTED) {
                selectedWords.push(word);
                button.classList.add('selected');
            }
        }
        submitButton.disabled = selectedWords.length !== MAX_SELECTED;
    }

    // Helper to create a unique, sorted representation of a guess
    function getGuessId(selection) {
        return [...selection].sort().join(','); // Sort alphabetically and join
    }

    function handleSubmitGuess() {
        if (isGameOver || selectedWords.length !== MAX_SELECTED) return;

        const submittedSelection = [...selectedWords];
        const selectedButtons = submittedSelection.map(word => wordElements[word]).filter(Boolean);

        // --- Check for Repeated Guess ---
        const guessId = getGuessId(submittedSelection);
        if (incorrectGuesses.has(guessId)) {
            displayMessage("Already guessed!", "info");
            clearMessageWithDelay();
            submitButton.disabled = true; // Disable submit until selection changes
            // Shake buttons for feedback
            selectedButtons.forEach(button => {
                if (button && !button.classList.contains('removing')) {
                    button.classList.add('shake');
                    setTimeout(() => { if(button) button.classList.remove('shake'); }, 300);
                }
            });
            return; // Stop processing this guess
        }

        // --- Process as New Guess ---
        const correctGroup = findCorrectGroup(submittedSelection);

        if (correctGroup) {
             // --- Correct Guess ---
             displayMessage("Correct!", "correct");
             solvedGroups.push(correctGroup);
             solvedGroups.sort((a, b) => a.difficulty - b.difficulty);
             renderSolvedGroupsArea();
             removeSolvedButtonsFromGrid(correctGroup.words);

             selectedButtons.forEach(button => button.classList.remove('selected'));
             selectedWords = [];
             submitButton.disabled = true;

             if (solvedGroups.length === 4) {
                 endGame(true);
             } else {
                 saveGameState();
             }
        } else {
            // --- Incorrect Guess ---
            remainingAttempts--;
            updateAttemptsDisplay();
            incorrectGuesses.add(guessId); // Add this incorrect guess to the set

            let isOneAway = false;
            const unsolvedGroups = currentPuzzleData.groups.filter(group =>
                !solvedGroups.some(solved => solved.category === group.category)
            );
            for (const group of unsolvedGroups) {
                const correctWordsInSelection = submittedSelection.filter(word => group.words.includes(word)).length;
                if (correctWordsInSelection === MAX_SELECTED - 1) {
                    isOneAway = true;
                    break;
                }
            }

            if (isOneAway) {
                displayMessage("One away!", "info");
            } else {
                displayMessage("Incorrect Guess", "incorrect");
            }

            selectedButtons.forEach(button => {
                if (button && !button.classList.contains('removing')) {
                    button.classList.add('shake');
                    setTimeout(() => { if(button) button.classList.remove('shake'); }, 300);
                }
            });

             submitButton.disabled = true; // Disable submit until user changes selection

             if (remainingAttempts <= 0) {
                endGame(false);
            } else {
                 clearMessageWithDelay();
                 saveGameState();
            }
        }
    }

    function findCorrectGroup(selection) {
        const selectionSet = new Set(selection);
        const solvedCategoryNames = new Set(solvedGroups.map(g => g.category));

        return currentPuzzleData.groups.find(group =>
            !solvedCategoryNames.has(group.category) &&
            group.words.length === selectionSet.size &&
            group.words.every(word => selectionSet.has(word))
        ) || null;
    }

    function renderSolvedGroupsArea() {
        solvedGroups.sort((a, b) => a.difficulty - b.difficulty);
        solvedGroupsArea.innerHTML = '';
        solvedGroups.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('solved-group', `difficulty-${group.difficulty}`);
            groupDiv.innerHTML = `<strong>${group.category}</strong><p>${group.words.join(', ')}</p>`;
            solvedGroupsArea.appendChild(groupDiv);
        });
    }

    function removeSolvedButtonsFromGrid(wordsToRemove) {
        let buttonsAnimatedOut = 0;
        const totalToRemove = wordsToRemove.length;
        let gridHidden = false;

        wordsToRemove.forEach(word => {
            const button = wordElements[word];
            if (button) {
                button.disabled = true;
                button.classList.add('removing');

                const handleRemoval = () => {
                    button.remove();
                    buttonsAnimatedOut++;

                    if (buttonsAnimatedOut === totalToRemove && solvedGroups.length === 4 && !gridHidden) {
                       if (activeGridArea.querySelectorAll('.word-button:not(.removing)').length === 0) {
                            activeGridArea.classList.add('game-won-hidden');
                            gridHidden = true;
                       }
                    }
                };

                button.addEventListener('transitionend', (event) => {
                     if (event.propertyName === 'opacity' || event.propertyName === 'height') {
                        handleRemoval();
                    }
                }, { once: true });

                 setTimeout(() => {
                     if (button.parentNode === activeGridArea) {
                         console.warn(`Fallback removal for button: ${button.textContent}`);
                         handleRemoval();
                     }
                 }, 450);

                delete wordElements[word];
            } else {
                 buttonsAnimatedOut++;
                  if (buttonsAnimatedOut === totalToRemove && solvedGroups.length === 4 && !gridHidden) {
                       if (activeGridArea.querySelectorAll('.word-button:not(.removing)').length === 0) {
                           activeGridArea.classList.add('game-won-hidden');
                            gridHidden = true;
                       }
                  }
            }
        });
    }

    function removeAllButtonsFromGrid() {
        const buttons = activeGridArea.querySelectorAll('.word-button');
        buttons.forEach(button => {
             if (wordElements[button.textContent]) {
                delete wordElements[button.textContent];
             }
             button.remove();
        });
        activeGridArea.classList.add('game-won-hidden');
    }

    function updateAttemptsDisplay() {
        attemptsLeftSpan.textContent = remainingAttempts;
        attemptCircles.forEach((circle, index) => {
            circle.classList.toggle('used', index < (TOTAL_ATTEMPTS - remainingAttempts));
        });
    }

    function disableGameControls() {
        submitButton.disabled = true;
        deselectAllButton.disabled = true;
        shuffleButton.disabled = true;
        Object.values(wordElements).forEach(button => {
            if (button && !button.classList.contains('removing')) {
               button.disabled = true;
            }
         });
    }

    function enableGameControls() {
        deselectAllButton.disabled = false;
        shuffleButton.disabled = false;
         Object.values(wordElements).forEach(button => {
              if (button && !button.classList.contains('removing')) {
                  button.disabled = false;
              }
          });
        // Submit button state depends on selection count, handled in handleWordClick/handleSubmitGuess
    }

    function endGame(isWin) {
        if (isGameOver) return;

        isGameOver = true;
        disableGameControls();
        activeGridArea.classList.add('game-over');

        if (isWin) {
            displayMessage("Congratulations! You found all groups!", "correct");
            triggerFireworks();
        } else {
            displayMessage("Game Over! Better luck next time.", "incorrect");
            loseOverlay.classList.add('visible');
            setTimeout(() => {
                loseOverlay.classList.remove('visible');
                 setTimeout(() => {
                      revealRemainingGroups();
                 }, 500);
            }, LOSE_FACE_DURATION);
        }
         saveGameState(); // Save final state
    }

    // Function to trigger confetti fireworks
    function triggerFireworks() {
        if (typeof confetti !== 'function') {
             console.warn("Confetti function not found.");
             return;
         }

        // --- Modifications Start ---

        const duration = 8 * 1000; // INCREASED DURATION: 8 seconds
        const animationEnd = Date.now() + duration;

        // DEFINE VIBRANT COLORS: Add or change hex codes as desired
        const brightColors = [
            '#FF0000', // Red
            '#00FF00', // Lime
            '#0000FF', // Blue
            '#FFFF00', // Yellow
            '#FF00FF', // Magenta
            '#00FFFF', // Cyan
            '#FFA500', // Orange
            '#FF4500', // OrangeRed
            '#ADFF2F', // GreenYellow
            '#FF69B4', // HotPink
            '#1E90FF', // DodgerBlue
        ];

        const defaults = {
            startVelocity: 45, // INCREASED VELOCITY: Particles shoot out faster
            spread: 360,
            ticks: 70,         // SLIGHTLY LONGER LASTING PARTICLES
            zIndex: 10,
            gravity: 0.8,      // SLIGHTLY LOWER GRAVITY: More floaty
        };

        // --- Modifications End ---


        function randomInRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            // INCREASED PARTICLE COUNT BASE: Launch more particles per burst
            const particleCount = 75 * (timeLeft / duration);

            // Launch confetti bursts from two points
            // Use the defined colors and add shapes
            confetti(Object.assign({}, defaults, {
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
                colors: brightColors, // Use our vibrant color list
                shapes: ['star', 'circle'], // Add stars and circles
            }));
            confetti(Object.assign({}, defaults, {
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
                colors: brightColors, // Use our vibrant color list
                shapes: ['star', 'circle'], // Add stars and circles
            }));
        }, 250); // Interval between bursts remains the same
    }

    function revealRemainingGroups() {
         if (!currentPuzzleData) return;
         const solvedCategoryNames = new Set(solvedGroups.map(g => g.category));
         const groupsToReveal = currentPuzzleData.groups
            .filter(group => !solvedCategoryNames.has(group.category))
            .sort((a, b) => a.difficulty - b.difficulty);

        if (groupsToReveal.length === 0 && solvedGroups.length < 4) return;

         groupsToReveal.forEach(group => {
            if (!solvedCategoryNames.has(group.category)) {
                 solvedGroups.push(group);
                 solvedCategoryNames.add(group.category);
            }
            group.words.forEach(word => {
                const button = wordElements[word];
                if (button) {
                    button.remove();
                    delete wordElements[word];
                }
            });
         });
         renderSolvedGroupsArea();
         if (activeGridArea.querySelectorAll('.word-button:not(.removing)').length === 0) {
            activeGridArea.classList.add('game-won-hidden');
        }
     }

    function displayMessage(msg, type) {
        if (messageTimeoutId) {
            clearTimeout(messageTimeoutId);
            messageTimeoutId = null;
        }
        messageArea.textContent = msg;
        messageArea.className = 'message';
        if (type) {
            messageArea.classList.add(type);
        }
    }

    function clearMessageWithDelay() {
        if (messageTimeoutId) {
            clearTimeout(messageTimeoutId);
        }
        messageTimeoutId = setTimeout(() => {
            if (!isGameOver || (messageArea.textContent !== "Congratulations! You found all groups!" && messageArea.textContent !== "Game Over! Better luck next time.")) {
                 displayMessage("", "");
            }
            messageTimeoutId = null;
        }, MESSAGE_CLEAR_DELAY);
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function deselectAll() {
        if (isGameOver) return;
        selectedWords.forEach(word => {
            const button = wordElements[word];
            if (button) button.classList.remove('selected');
        });
        selectedWords = [];
        submitButton.disabled = true;
        displayMessage("", "");
    }

    function shuffleGrid() {
        if (isGameOver) return;
        const currentButtons = Array.from(activeGridArea.querySelectorAll('.word-button:not(.removing)'));
        if (currentButtons.length === 0) return;

        const wordsToShuffle = currentButtons.map(btn => btn.textContent);
        shuffleArray(wordsToShuffle);

        const fragment = document.createDocumentFragment();
        const newWordElements = {};

        activeGridArea.innerHTML = '';

        wordsToShuffle.forEach(word => {
            const button = document.createElement('button');
            button.textContent = word;
            button.classList.add('word-button');
            if (selectedWords.includes(word)) {
                button.classList.add('selected');
            }
             button.addEventListener('click', handleWordClick);
             fragment.appendChild(button);
             newWordElements[word] = button;
        });

        activeGridArea.appendChild(fragment);
        wordElements = newWordElements;
        submitButton.disabled = selectedWords.length !== MAX_SELECTED;
        saveGameState();
     }

    // --- Event Listeners ---
    submitButton.addEventListener('click', handleSubmitGuess);
    deselectAllButton.addEventListener('click', deselectAll);
    shuffleButton.addEventListener('click', shuffleGrid);

    // --- Initial Load ---
    loadPuzzleForToday();

}); // End of DOMContentLoaded
// END OF FILE script.js