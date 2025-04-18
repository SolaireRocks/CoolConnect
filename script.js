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
        if (!currentPuzzleData || !currentPuzzleData.date) return; // Don't save if no puzzle loaded

        const currentGridWords = Array.from(activeGridArea.querySelectorAll('.word-button:not(.removing)'))
                                      .map(btn => btn.textContent);

        const stateToSave = {
            puzzleDate: currentPuzzleData.date,
            attempts: remainingAttempts,
            solvedCategories: solvedGroups.map(g => g.category),
            gridWords: currentGridWords, // Save the current order of words in the grid
            isGameOver: isGameOver,
            isWin: isGameOver ? (solvedGroups.length === 4) : null, // Store win/loss state only if game over
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
                // Validate if the saved state is for the intended date
                if (savedState && savedState.puzzleDate === dateStr) {
                    console.log("Found saved game state for", dateStr);
                    return savedState;
                } else {
                    console.log("Saved state found, but for a different date. Ignoring.");
                    localStorage.removeItem(key); // Clean up old state
                }
            }
        } catch (error) {
            console.error("Error loading or parsing game state from localStorage:", error);
        }
        return null; // No valid saved state found
    }

    // --- Core Game Logic ---

    async function loadPuzzleForToday() {
        const todayStr = getTodayDateString();
        console.log(`Attempting to load puzzle data for: ${todayStr}`);

        // Try loading saved state first
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
                    // Restore game from saved state
                    restoreGameFromState(savedState);
                } else {
                    // Initialize a fresh game
                    initializeGame(false); // false = not restoring from save
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

        activeGridArea.innerHTML = '';
        activeGridArea.classList.remove('game-over', 'game-won-hidden');
        solvedGroupsArea.innerHTML = '';
        messageArea.textContent = '';
        messageArea.className = 'message';
        loseOverlay.classList.remove('visible');

        updateAttemptsDisplay();
        submitButton.disabled = true;

        const allWords = currentPuzzleData.groups.flatMap(group => group.words);
        shuffleArray(allWords); // Shuffle for a new game

        populateGrid(allWords); // Create buttons
        enableGameControls();

        if (!isRestoring) {
            saveGameState(); // Save the initial state of the new game
        }
    }

    // Restores the game state from a loaded object
    function restoreGameFromState(savedState) {
        console.log("Restoring game from saved state:", savedState);
        isGameOver = savedState.isGameOver;
        remainingAttempts = savedState.attempts;

        // Restore solved groups
        solvedGroups = currentPuzzleData.groups.filter(group =>
            savedState.solvedCategories.includes(group.category)
        );
        solvedGroups.sort((a, b) => a.difficulty - b.difficulty); // Ensure correct order
        renderSolvedGroupsArea();

        // Restore grid words (in their saved order)
        activeGridArea.innerHTML = ''; // Clear potential previous content
        wordElements = {}; // Reset word elements map
        populateGrid(savedState.gridWords); // Populate with saved words/order

        // Update UI elements
        updateAttemptsDisplay();
        submitButton.disabled = true; // Always start deselected
        selectedWords = []; // Clear selection on load

        if (isGameOver) {
            disableGameControls();
            activeGridArea.classList.add('game-over');
            if (savedState.isWin) {
                displayMessage("Congratulations! You found all groups!", "correct");
                // Ensure grid is hidden if game was won
                if (activeGridArea.querySelectorAll('.word-button').length === 0) {
                   activeGridArea.classList.add('game-won-hidden');
                } else {
                    // If loading a won state but buttons somehow exist, remove them cleanly
                     removeAllButtonsFromGrid();
                }
                triggerFireworks(); // Show fireworks for a completed game
            } else {
                 displayMessage("Game Over! Better luck next time.", "incorrect");
                 // Optionally briefly show lose overlay on reload? Decided against for now.
                 revealRemainingGroups(); // Show answers immediately if game was lost
            }
        } else {
            enableGameControls();
            // Re-disable buttons that belong to already solved groups
             const solvedWords = new Set(solvedGroups.flatMap(g => g.words));
             savedState.gridWords.forEach(word => {
                if (solvedWords.has(word) && wordElements[word]) {
                    wordElements[word].disabled = true; // Should not happen if gridWords are correct, but safety check
                }
             });
        }
    }

    // Populates the grid with buttons for the given words
    function populateGrid(words) {
        words.forEach(word => {
            // Check if this word belongs to an already solved group (relevant during restore)
            const isSolved = solvedGroups.some(group => group.words.includes(word));
            if (isSolved) return; // Don't create buttons for words in already solved groups

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

    function handleSubmitGuess() {
        if (isGameOver || selectedWords.length !== MAX_SELECTED) return;

        const submittedSelection = [...selectedWords]; // Copy selection
        const selectedButtons = submittedSelection.map(word => wordElements[word]).filter(Boolean);
        const correctGroup = findCorrectGroup(submittedSelection);

        if (correctGroup) {
             // --- Correct Guess ---
             displayMessage("Correct!", "correct");
             solvedGroups.push(correctGroup);
             solvedGroups.sort((a, b) => a.difficulty - b.difficulty); // Sort by difficulty
             renderSolvedGroupsArea();
             removeSolvedButtonsFromGrid(correctGroup.words); // Animate removal

             // Clear selection state
             selectedButtons.forEach(button => button.classList.remove('selected'));
             selectedWords = [];
             submitButton.disabled = true;

             if (solvedGroups.length === 4) {
                 endGame(true); // Win
             } else {
                 saveGameState(); // Save progress after correct guess
             }
        } else {
            // --- Incorrect Guess ---
            remainingAttempts--;
            updateAttemptsDisplay();

            // Check for "One Away"
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
                displayMessage("One away!", "info"); // Use 'info' style for distinction
            } else {
                displayMessage("Incorrect Guess", "incorrect");
            }

            // Shake the incorrectly guessed buttons
            selectedButtons.forEach(button => {
                if (button && !button.classList.contains('removing')) {
                    button.classList.add('shake');
                    // Remove shake class after animation
                    setTimeout(() => { if(button) button.classList.remove('shake'); }, 300);
                }
            });

            // KEEP WORDS SELECTED - Do not deselect here
            // selectedButtons.forEach(button => button.classList.remove('selected'));
            // selectedWords = [];
             submitButton.disabled = true; // Disable submit until user changes selection

             if (remainingAttempts <= 0) {
                endGame(false); // Lose
            } else {
                 // Clear message after delay ONLY if game isn't over
                 clearMessageWithDelay();
                 saveGameState(); // Save progress after incorrect guess
            }
        }
    }

    // Finds the matching group definition for a selection of words
    function findCorrectGroup(selection) {
        const selectionSet = new Set(selection);
        const solvedCategoryNames = new Set(solvedGroups.map(g => g.category));

        return currentPuzzleData.groups.find(group =>
            !solvedCategoryNames.has(group.category) && // Must not be already solved
            group.words.length === selectionSet.size && // Sizes must match (should always be 4)
            group.words.every(word => selectionSet.has(word)) // All words must be in the selection
        ) || null;
    }

    // Renders the solved groups area based on the solvedGroups array
    function renderSolvedGroupsArea() {
        // Sort solved groups by difficulty before rendering
        solvedGroups.sort((a, b) => a.difficulty - b.difficulty);

        solvedGroupsArea.innerHTML = ''; // Clear previous rendering
        solvedGroups.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('solved-group', `difficulty-${group.difficulty}`);
            // Use innerHTML carefully or create elements programmatically for better security
            groupDiv.innerHTML = `<strong>${group.category}</strong><p>${group.words.join(', ')}</p>`;
            solvedGroupsArea.appendChild(groupDiv);
             // Trigger the animation (it's handled by CSS on element insertion)
        });
    }

    // Animates the removal of buttons for a solved group
    function removeSolvedButtonsFromGrid(wordsToRemove) {
        let buttonsAnimatedOut = 0;
        const totalToRemove = wordsToRemove.length;
        let gridHidden = false; // Flag to ensure grid hiding happens only once

        wordsToRemove.forEach(word => {
            const button = wordElements[word];
            if (button) {
                button.disabled = true;
                button.classList.add('removing');

                const handleRemoval = () => {
                    button.remove(); // Remove element from DOM
                    buttonsAnimatedOut++;

                    // Check if all buttons for this group are removed AND if it's the winning move
                    if (buttonsAnimatedOut === totalToRemove && solvedGroups.length === 4 && !gridHidden) {
                       // Check if the grid is now empty
                       if (activeGridArea.querySelectorAll('.word-button:not(.removing)').length === 0) {
                            activeGridArea.classList.add('game-won-hidden');
                            gridHidden = true; // Prevent multiple triggers
                       }
                    }
                };

                // Use transitionend event listener for smoother animation completion detection
                button.addEventListener('transitionend', (event) => {
                     // Make sure we listen for a property that changes during removal (like opacity or height)
                     if (event.propertyName === 'opacity' || event.propertyName === 'height') {
                        handleRemoval();
                    }
                }, { once: true }); // Use once: true to automatically remove listener

                 // Fallback timeout in case transitionend doesn't fire reliably
                 // Set slightly longer than the CSS transition duration
                 setTimeout(() => {
                     // Only run fallback if the button hasn't been removed by transitionend yet
                     if (button.parentNode === activeGridArea) {
                         console.warn(`Fallback removal for button: ${button.textContent}`);
                         handleRemoval();
                     }
                 }, 450);

                delete wordElements[word]; // Remove from our map
            } else {
                 // If button wasn't found (e.g., already removed), count it as removed for win check
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

    // Removes ALL remaining buttons instantly (used on restoring a won game)
    function removeAllButtonsFromGrid() {
        const buttons = activeGridArea.querySelectorAll('.word-button');
        buttons.forEach(button => {
             if (wordElements[button.textContent]) {
                delete wordElements[button.textContent];
             }
             button.remove();
        });
        activeGridArea.classList.add('game-won-hidden'); // Ensure grid is hidden
    }

    function updateAttemptsDisplay() {
        attemptsLeftSpan.textContent = remainingAttempts;
        attemptCircles.forEach((circle, index) => {
            // Mark circles red from left to right as attempts are used
            circle.classList.toggle('used', index < (TOTAL_ATTEMPTS - remainingAttempts));
        });
    }

    function disableGameControls() {
        submitButton.disabled = true;
        deselectAllButton.disabled = true;
        shuffleButton.disabled = true;
        // Disable remaining active grid buttons
        Object.values(wordElements).forEach(button => {
            if (button && !button.classList.contains('removing')) { // Check if button exists
               button.disabled = true;
            }
         });
    }

    function enableGameControls() {
        // Submit enabled state is handled by selection count
        deselectAllButton.disabled = false;
        shuffleButton.disabled = false;
         Object.values(wordElements).forEach(button => {
              if (button && !button.classList.contains('removing')) { // Check if button exists
                  button.disabled = false;
              }
          });
    }

    function endGame(isWin) {
        if (isGameOver) return; // Prevent running multiple times

        isGameOver = true;
        disableGameControls();
        activeGridArea.classList.add('game-over'); // Add general game-over class

        if (isWin) {
            // --- Win Condition ---
            displayMessage("Congratulations! You found all groups!", "correct");
            // Grid hiding is now handled by removeSolvedButtonsFromGrid when last group solved
            triggerFireworks();
        } else {
            // --- Lose Condition ---
            displayMessage("Game Over! Better luck next time.", "incorrect");

            // Show frowny face overlay
            loseOverlay.classList.add('visible');

            // After a delay, hide overlay and then reveal answers
            setTimeout(() => {
                loseOverlay.classList.remove('visible');
                // Use another timeout to wait for the overlay fade-out transition
                 setTimeout(() => {
                      revealRemainingGroups();
                 }, 500); // Match the overlay transition duration in CSS
            }, LOSE_FACE_DURATION);
        }
         saveGameState(); // Save the final game state (win or loss)
    }

    // Function to trigger confetti fireworks (unchanged from original)
    function triggerFireworks() {
        if (typeof confetti !== 'function') {
            console.warn("Confetti function not found.");
            return;
        }
        const duration = 5 * 1000; // 5 seconds
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10 }; // Ensure confetti is above solved groups but maybe below overlay if needed

        function randomInRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            // since particles fall down, start a bit higher than random
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
    }


    // Reveals any remaining unsolved groups when the game ends in a loss
    function revealRemainingGroups() {
         if (!currentPuzzleData) return; // Safety check

         const solvedCategoryNames = new Set(solvedGroups.map(g => g.category));
         const groupsToReveal = currentPuzzleData.groups
            .filter(group => !solvedCategoryNames.has(group.category))
            .sort((a, b) => a.difficulty - b.difficulty); // Reveal in difficulty order

        if (groupsToReveal.length === 0 && solvedGroups.length < 4) {
             console.warn("Attempted to reveal remaining groups, but none were found / mismatch.");
             return; // Avoid errors if state is inconsistent
        }

         groupsToReveal.forEach(group => {
            // Check again before pushing, although filter should handle this
            if (!solvedCategoryNames.has(group.category)) {
                 solvedGroups.push(group); // Add to the list of solved groups
                 solvedCategoryNames.add(group.category); // Update the set for subsequent checks
            }
            // Remove corresponding buttons from grid (they are already disabled)
            // Use a simpler removal here as animation isn't the priority
            group.words.forEach(word => {
                const button = wordElements[word];
                if (button) {
                    button.remove();
                    delete wordElements[word];
                }
            });
         });

         // Re-render the solved groups area to include the newly revealed ones in order
         renderSolvedGroupsArea();

         // If after revealing, the grid should be empty but isn't, hide it.
         if (activeGridArea.querySelectorAll('.word-button:not(.removing)').length === 0) {
            activeGridArea.classList.add('game-won-hidden'); // Use same class to hide grid area
        }
     }

    // Displays a message and sets its type (class)
    function displayMessage(msg, type) {
        // Clear any existing message timeout
        if (messageTimeoutId) {
            clearTimeout(messageTimeoutId);
            messageTimeoutId = null;
        }

        messageArea.textContent = msg;
        messageArea.className = 'message'; // Reset classes
        if (type) {
            messageArea.classList.add(type);
        }
    }

    // Clears the message area after a delay
    function clearMessageWithDelay() {
        // Clear any previous timeout to prevent premature clearing
        if (messageTimeoutId) {
            clearTimeout(messageTimeoutId);
        }
        messageTimeoutId = setTimeout(() => {
             // Only clear if the game isn't over, or if the current message is not the final win/lose message
            if (!isGameOver || (messageArea.textContent !== "Congratulations! You found all groups!" && messageArea.textContent !== "Game Over! Better luck next time.")) {
                 displayMessage("", ""); // Clear message text and type
            }
            messageTimeoutId = null;
        }, MESSAGE_CLEAR_DELAY);
    }


    // --- Helper Functions (shuffleArray, deselectAll, shuffleGrid) ---

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
        displayMessage("", ""); // Clear any messages like "One away"
    }

    function shuffleGrid() {
        if (isGameOver) return;
        // Get only the active, non-removing buttons
        const currentButtons = Array.from(activeGridArea.querySelectorAll('.word-button:not(.removing)'));
        if (currentButtons.length === 0) return;

        // Extract words and shuffle them
        const wordsToShuffle = currentButtons.map(btn => btn.textContent);
        shuffleArray(wordsToShuffle);

        // Create a temporary fragment to minimize reflows
        const fragment = document.createDocumentFragment();
        const newWordElements = {}; // Build a new map for the shuffled state

         // Clear grid temporarily
        activeGridArea.innerHTML = '';

        // Re-add buttons in shuffled order
        wordsToShuffle.forEach(word => {
            const button = document.createElement('button');
            button.textContent = word;
            button.classList.add('word-button');
            // Restore 'selected' state if the word was previously selected
            if (selectedWords.includes(word)) {
                button.classList.add('selected');
            }
             button.addEventListener('click', handleWordClick);
             fragment.appendChild(button);
             newWordElements[word] = button; // Add to new map
        });

        // Append the shuffled buttons back to the grid
        activeGridArea.appendChild(fragment);

        wordElements = newWordElements; // Update the main map

        // Re-evaluate submit button state (should be unchanged if selection count is same)
        submitButton.disabled = selectedWords.length !== MAX_SELECTED;

        saveGameState(); // Save the new grid order
     }

    // --- Event Listeners ---
    submitButton.addEventListener('click', handleSubmitGuess);
    deselectAllButton.addEventListener('click', deselectAll);
    shuffleButton.addEventListener('click', shuffleGrid);

    // --- Initial Load ---
    loadPuzzleForToday();

}); // End of DOMContentLoaded
// END OF FILE script.js