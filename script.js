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
    const LOSE_FACE_DURATION = 1800;
    const MESSAGE_CLEAR_DELAY = 1800;
    const CORRECT_GUESS_FADE_DURATION = 700;
    const REVEAL_STAGGER_DELAY = 250;

    // --- Game State Variables ---
    let selectedWords = [];
    let wordElements = {};
    let currentPuzzleData = null;
    let remainingAttempts = TOTAL_ATTEMPTS;
    let solvedGroups = [];
    let incorrectGuesses = new Set();
    let isGameOver = false;
    let messageTimeoutId = null;
    let isAnimating = false;

    // --- Local Storage Key ---
    function getStorageKey(dateStr) {
        return `connectionsGameState_${dateStr}`;
    }

    // --- Date Formatting ---
    function getTodayDateString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // --- Local Storage Functions ---
    function saveGameState() {
        if (!currentPuzzleData || !currentPuzzleData.date) return;

        const currentGridWords = Array.from(activeGridArea.querySelectorAll('.word-button:not(.fading-out):not(.removing)'))
                                      .map(btn => btn.textContent);

        const stateToSave = {
            puzzleDate: currentPuzzleData.date,
            attempts: remainingAttempts,
            solvedCategories: solvedGroups.map(g => g.category),
            gridWords: currentGridWords,
            incorrectGuesses: Array.from(incorrectGuesses),
            isGameOver: isGameOver,
            isWin: isGameOver ? (solvedGroups.length === 4) : null,
            // selectedWords: selectedWords // Optional: Persist selection
        };

        try {
            localStorage.setItem(getStorageKey(currentPuzzleData.date), JSON.stringify(stateToSave));
            console.log(`Game state saved for ${currentPuzzleData.date}`);
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
                // Ensure the loaded state is actually for the requested date
                if (savedState && savedState.puzzleDate === dateStr) {
                    console.log(`Valid game state found in localStorage for ${dateStr}`);
                    return savedState;
                } else if (savedState) {
                    console.log(`Found saved state, but for a different date (${savedState.puzzleDate}). Ignoring.`);
                    // Optional: Clean up stale data if it's for a different date
                    // localStorage.removeItem(key);
                }
            } else {
                console.log(`No game state found in localStorage for ${dateStr}`);
            }
        } catch (error) {
            console.error("Error loading or parsing game state from localStorage:", error);
        }
        return null; // Return null if no valid state found for the specific date
    }

    // --- Core Game Logic ---

    async function loadPuzzleForToday() {
        const todayStr = getTodayDateString();
        console.log(`Attempting to load puzzle data for: ${todayStr}`);

        try {
            // Step 1: Fetch the latest puzzle data file
            const response = await fetch(PUZZLE_FILE);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const allPuzzles = await response.json();

            // Step 2: Find today's puzzle data within the fetched file
            const puzzleGroups = allPuzzles[todayStr];

            if (isValidPuzzleData(puzzleGroups)) {
                console.log("Successfully found and validated puzzle for", todayStr);
                // Set the global puzzle data state *before* attempting to load game state
                currentPuzzleData = { date: todayStr, groups: puzzleGroups };

                // Step 3: Now attempt to load saved game state specific to *today's* puzzle date
                const savedState = loadGameState(todayStr);

                if (savedState) {
                    // Found valid state for today, restore it
                    console.log("Restoring game from saved state for", todayStr);
                    restoreGameFromState(savedState);
                } else {
                    // No valid saved state for today, initialize a fresh game
                    console.log("No valid saved state found for today. Initializing a new game.");
                    initializeGame(false); // false indicates it's not a restore
                }

                // --- GA Event: Game Start (only if not already finished in saved state) ---
                if (currentPuzzleData && !savedState?.isGameOver) {
                     if (typeof gtag === 'function') {
                         gtag('event', 'game_load_today', {
                           'event_category': 'Game',
                           'event_label': currentPuzzleData.date
                         });
                         console.log("GA Event: game_load_today sent");
                     } else {
                         console.warn("gtag function not found for game_load_today event.");
                     }
                 }
                // --- End GA Event ---

            } else {
                // Today's date was not found or invalid in the puzzles file
                console.warn("Puzzle data for", todayStr, "not found or is invalid in puzzles.json.");
                handleLoadError("No puzzle found for today.");
            }
        } catch (error) {
            // Error fetching or parsing the puzzle file
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

    function initializeGame(isRestoring = false) { // isRestoring is now less critical here, but keep for potential future use
        console.log(`Initializing game for ${currentPuzzleData?.date}. Is restoring: ${isRestoring}`);
        isGameOver = false;
        isAnimating = false;
        selectedWords = [];
        wordElements = {};
        remainingAttempts = TOTAL_ATTEMPTS;
        solvedGroups = [];
        incorrectGuesses = new Set();

        activeGridArea.innerHTML = '';
        activeGridArea.classList.remove('game-over', 'game-won-hidden'); // Ensure hidden class is removed
        solvedGroupsArea.innerHTML = '';
        messageArea.textContent = '';
        messageArea.className = 'message';
        loseOverlay.classList.remove('visible');

        updateAttemptsDisplay();
        submitButton.disabled = true;

        if (!currentPuzzleData) {
             console.error("Cannot initialize game without current puzzle data!");
             handleLoadError("Error initializing game.");
             return;
        }

        const allWords = currentPuzzleData.groups.flatMap(group => group.words);
        shuffleArray(allWords);

        populateGrid(allWords);
        enableGameControls();

        if (!isRestoring) {
            // Save the initial state of the fresh game
            saveGameState();
        }
    }


    function restoreGameFromState(savedState) {
        console.log("Restoring game from saved state:", savedState);
        // Assume currentPuzzleData is already set correctly by loadPuzzleForToday
        isGameOver = savedState.isGameOver;
        remainingAttempts = savedState.attempts;
        incorrectGuesses = new Set(savedState.incorrectGuesses || []);
        solvedGroups = currentPuzzleData.groups.filter(group =>
            savedState.solvedCategories.includes(group.category)
        );

        activeGridArea.innerHTML = ''; // Clear grid before repopulating
        solvedGroupsArea.innerHTML = ''; // Clear solved area before repopulating
        wordElements = {}; // Reset word elements map

        // Render solved groups *first*
        renderSolvedGroupsArea(true); // true = skip animation on restore

        // Populate the grid only with words that are *not* in solved groups
        const solvedWordsSet = new Set(solvedGroups.flatMap(g => g.words));
        const wordsForGrid = savedState.gridWords.filter(word => !solvedWordsSet.has(word));

        // If the saved grid words don't match what's expected, fallback might be needed,
        // but for now, trust savedState.gridWords contains the *remaining* words.
        // If savedState.gridWords is empty and it's a win, that's handled later.
        populateGrid(wordsForGrid);

        updateAttemptsDisplay();
        submitButton.disabled = true; // Reset submit button state

        if (isGameOver) {
            disableGameControls();
            activeGridArea.classList.add('game-over');
            if (savedState.isWin) {
                 displayMessage("Congratulations! You found all groups!", "correct");
                 // Hide the grid area if the game was won and all words were logically removed
                 if (wordsForGrid.length === 0) {
                     activeGridArea.classList.add('game-won-hidden');
                 }
                 // Optionally trigger fireworks on load if won?
                 // triggerFireworks();
            } else {
                 displayMessage("Game Over! Better luck next time.", "incorrect");
                 // Optionally reveal remaining groups immediately on load if lost?
                 revealRemainingGroups(true); // true = skip animation
                 // Ensure grid is not hidden on loss restore
                 activeGridArea.classList.remove('game-won-hidden');
            }
        } else {
            // Game is not over, enable controls
            enableGameControls();
            // Restore selection state if it was saved (currently commented out in saveGameState)
            // selectedWords = savedState.selectedWords || [];
            // selectedWords.forEach(word => wordElements[word]?.classList.add('selected'));
            submitButton.disabled = selectedWords.length !== MAX_SELECTED;
        }
    }


    function adjustButtonFontSize(button) {
        button.classList.remove('small-text');
        // Check if the button's content width is wider than the button's actual width
        // Add a small buffer (e.g., 1px) to prevent unnecessary shrinking on exact fits
        if (button.scrollWidth > (button.clientWidth + 1)) {
            button.classList.add('small-text');
        }
    }

    function populateGrid(words) {
        console.log("Populating grid with words:", words);
        // Clear existing buttons just in case
        // activeGridArea.innerHTML = ''; // This should be done before calling populateGrid usually

        const fragment = document.createDocumentFragment();
        words.forEach(word => {
            // Double check it's not somehow already solved (belt-and-suspenders)
             const isSolved = solvedGroups.some(group => group.words.includes(word));
             if (isSolved) {
                 console.warn(`Attempted to add already solved word to grid: ${word}`);
                 return;
             }

            const button = document.createElement('button');
            button.textContent = word;
            button.classList.add('word-button');
            button.addEventListener('click', handleWordClick);
            fragment.appendChild(button);
            wordElements[word] = button; // Add to map
        });

        activeGridArea.appendChild(fragment);

        // Adjust font size *after* buttons are in the DOM and have dimensions
        // Use requestAnimationFrame to ensure layout is calculated
        requestAnimationFrame(() => {
             Object.values(wordElements).forEach(button => {
                 // Ensure the button is still in the active grid (it should be)
                 if(button.parentNode === activeGridArea) {
                    adjustButtonFontSize(button);
                 }
             });
        });
    }


    function handleWordClick(event) {
        if (isGameOver || isAnimating) return;
        const button = event.target;
        const word = button.textContent;

        // Prevent clicking on disabled/fading buttons (redundant check)
        if (button.disabled || button.classList.contains('fading-out') || button.classList.contains('removing')) return;

        if (selectedWords.includes(word)) {
            // Deselect
            selectedWords = selectedWords.filter(w => w !== word);
            button.classList.remove('selected');
        } else {
            // Select (if less than max)
            if (selectedWords.length < MAX_SELECTED) {
                selectedWords.push(word);
                button.classList.add('selected');
            }
        }
        // Update submit button state
        submitButton.disabled = selectedWords.length !== MAX_SELECTED;
        // Don't save state on every click, only on significant actions (guess, shuffle)
    }

    function getGuessId(selection) {
        // Create a sorted, comma-separated string representation of the selection
        // This ensures ["A", "B"] and ["B", "A"] produce the same ID
        return [...selection].sort().join(',');
    }

    function handleSubmitGuess() {
        if (isGameOver || isAnimating || selectedWords.length !== MAX_SELECTED) return;

        isAnimating = true; // Lock UI
        submitButton.disabled = true; // Disable submit during processing

        const submittedSelection = [...selectedWords]; // Copy selection
        const selectedButtons = submittedSelection.map(word => wordElements[word]).filter(Boolean); // Get button elements
        const guessId = getGuessId(submittedSelection);

        // Clear previous non-persistent messages (like 'one away' or 'already guessed')
        if (messageArea.classList.contains('info') || messageArea.classList.contains('correct') && messageArea.textContent !== "Congratulations! You found all groups!") {
           displayMessage("", ""); // Clear ephemeral messages
        }

        // Check if this exact combination was already guessed incorrectly
        if (incorrectGuesses.has(guessId)) {
            displayMessage("Already guessed!", "info");
            clearMessageWithDelay();
            selectedButtons.forEach(button => {
                if (button && !button.classList.contains('fading-out')) {
                    button.classList.add('shake');
                    // Remove shake class after animation
                    setTimeout(() => { if(button) button.classList.remove('shake'); }, 300);
                }
            });
            isAnimating = false; // Unlock UI
            submitButton.disabled = false; // Re-enable submit (selection is still 4)
            return; // Stop processing this guess
        }

        // Find if the selection matches a correct group
        const correctGroup = findCorrectGroup(submittedSelection);

        if (correctGroup) {
            // --- Correct Guess ---
             displayMessage("Correct!", "correct");
             selectedWords = []; // Clear logical selection state *immediately*

             // Animate out the selected buttons
             selectedButtons.forEach(button => {
                 button.classList.remove('selected');
                 button.disabled = true; // Disable interaction immediately
                 button.classList.add('fading-out'); // Start fade animation
             });

             // After the fade-out animation completes...
             setTimeout(() => {
                 // Add the group to the solved list
                 solvedGroups.push(correctGroup);
                 renderSolvedGroupsArea(); // Add & animate the solved group display

                 // Remove the faded buttons from the DOM and the wordElements map
                 submittedSelection.forEach(word => {
                     const button = wordElements[word];
                     if (button) {
                         button.remove(); // Remove from DOM
                         delete wordElements[word]; // Remove from map
                     }
                 });

                 // Check for win condition *after* removing buttons
                 if (solvedGroups.length === 4) {
                     // Hide the active grid area smoothly
                     activeGridArea.classList.add('game-won-hidden');
                     // Delay the final win state processing slightly to allow grid collapse animation
                     setTimeout(() => {
                        endGame(true); // Trigger rest of win sequence
                     }, 100); // Small delay after adding class before win logic
                 } else {
                     // Game continues
                     saveGameState(); // Save progress after successful guess
                     isAnimating = false; // Release lock for next guess
                     // Submit button remains disabled as selection is now empty
                 }
                 clearMessageWithDelay(); // Clear the "Correct!" message

             }, CORRECT_GUESS_FADE_DURATION); // Wait for the fade-out animation

        } else {
            // --- Incorrect Guess ---
            remainingAttempts--;
            updateAttemptsDisplay();
            incorrectGuesses.add(guessId); // Record this specific incorrect combination

            // Add shake animation to the incorrectly guessed buttons
            selectedButtons.forEach(button => {
                if (button && !button.classList.contains('fading-out')) {
                    button.classList.add('shake');
                    setTimeout(() => { if(button) button.classList.remove('shake'); }, 300);
                }
            });

            // Check if it was "one away" from any unsolved group
            let isOneAway = false;
            const unsolvedGroups = currentPuzzleData.groups.filter(group =>
                !solvedGroups.some(solved => solved.category === group.category)
            );
            for (const group of unsolvedGroups) {
                const correctWordsInSelection = submittedSelection.filter(word => group.words.includes(word)).length;
                if (correctWordsInSelection === MAX_SELECTED - 1) {
                    isOneAway = true;
                    break; // Found a "one away" case, no need to check further
                }
            }

            if (isOneAway) {
                displayMessage("One away!", "info");
            } else {
                displayMessage("Incorrect Guess", "incorrect");
            }

            // Check for lose condition
            if (remainingAttempts <= 0) {
                // Delay game over slightly to allow shake animation and message display
                setTimeout(() => {
                   endGame(false); // Trigger lose sequence
                }, 400); // Wait slightly longer than shake animation
            } else {
                 // Game continues, incorrect guess
                 clearMessageWithDelay(); // Clear the "Incorrect/One away" message after a delay
                 saveGameState(); // Save state after incorrect guess (attempts updated)
                 isAnimating = false; // Release UI lock
                 submitButton.disabled = false; // Re-enable submit button as selection is still active
            }
        }
    }


    function findCorrectGroup(selection) {
        const selectionSet = new Set(selection);
        const solvedCategoryNames = new Set(solvedGroups.map(g => g.category));

        // Find a group in the puzzle data that:
        // 1. Has not already been solved
        // 2. Contains exactly the same words as the selection
        return currentPuzzleData.groups.find(group =>
            !solvedCategoryNames.has(group.category) &&        // Not already solved
            group.words.length === selectionSet.size &&        // Same number of words (should always be 4 here)
            group.words.every(word => selectionSet.has(word)) // All words in the group are in the selection set
        ) || null; // Return null if no matching group found
    }

    function renderSolvedGroupsArea(skipAnimation = false) {
        // Sort solved groups by difficulty for consistent display order
        solvedGroups.sort((a, b) => a.difficulty - b.difficulty);
        const currentScrollTop = solvedGroupsArea.scrollTop; // Preserve scroll position

        solvedGroupsArea.innerHTML = ''; // Clear the area
        solvedGroups.forEach((group, index) => {
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('solved-group', `difficulty-${group.difficulty}`);
            groupDiv.innerHTML = `<strong>${group.category}</strong><p>${group.words.join(', ')}</p>`;
            solvedGroupsArea.appendChild(groupDiv);

            // Apply animation for newly added groups unless skipped
            if (!skipAnimation) {
                 // Use double requestAnimationFrame for fade-in/slide-up effect
                 requestAnimationFrame(() => {
                     requestAnimationFrame(() => {
                          groupDiv.classList.add('visible');
                     });
                 });
            } else {
                // If skipping animation (e.g., on load), make visible immediately
                groupDiv.classList.add('visible');
            }
        });
        solvedGroupsArea.scrollTop = currentScrollTop; // Restore scroll position
    }


    function removeAllButtonsFromGrid(skipAnimation = false) {
        // This function might be less necessary now but can be kept for specific scenarios
        const buttons = activeGridArea.querySelectorAll('.word-button');
        console.log(`Removing ${buttons.length} buttons from grid.`);
        buttons.forEach(button => {
             if (wordElements[button.textContent]) {
                delete wordElements[button.textContent]; // Remove from map
             }
             button.remove(); // Remove from DOM
        });
        // We don't automatically hide the grid here; that's handled by game win logic
    }

    function updateAttemptsDisplay() {
        attemptsLeftSpan.textContent = remainingAttempts;
        // Update the visual circles
        attemptCircles.forEach((circle, index) => {
            // Mark circles as 'used' starting from the left
            circle.classList.toggle('used', index < (TOTAL_ATTEMPTS - remainingAttempts));
        });
    }

    function disableGameControls() {
        console.log("Disabling game controls.");
        submitButton.disabled = true;
        deselectAllButton.disabled = true;
        shuffleButton.disabled = true;
        // Disable all word buttons currently in the grid
        Object.values(wordElements).forEach(button => {
            if (button && button.parentNode === activeGridArea) { // Ensure it's still in the grid
               button.disabled = true;
            }
         });
    }

    function enableGameControls() {
        console.log("Enabling game controls.");
        if (!isGameOver && !isAnimating) { // Only enable if game is active and not animating
            deselectAllButton.disabled = false;
            shuffleButton.disabled = false;
             // Enable word buttons
             Object.values(wordElements).forEach(button => {
                  if (button && button.parentNode === activeGridArea) {
                      button.disabled = false;
                  }
              });
              // Set submit button state based on current selection
              submitButton.disabled = selectedWords.length !== MAX_SELECTED;
        } else {
             // If called when game over or animating, ensure controls are disabled
             disableGameControls();
        }
    }

    function endGame(isWin) {
        if (isGameOver) return; // Prevent multiple calls

        console.log(`Ending game. Win: ${isWin}`);
        isGameOver = true;
        isAnimating = true; // Keep UI locked during end game sequence
        disableGameControls(); // Ensure all controls are off
        activeGridArea.classList.add('game-over'); // Apply general game-over styling

        // --- GA Event ---
        const eventName = isWin ? 'game_win' : 'game_loss';
        const eventData = {
            'event_category': 'Game',
            'event_label': currentPuzzleData?.date || 'unknown_date',
            'value': TOTAL_ATTEMPTS - remainingAttempts // Mistakes made
        };
        if (typeof gtag === 'function') {
            gtag('event', eventName, eventData);
            console.log(`GA Event: ${eventName} sent with ${eventData.value} mistakes.`);
        } else {
            console.warn(`gtag function not found for ${eventName} event.`);
        }
        // --- End GA Event ---

        if (isWin) {
            // Grid hiding is now handled before calling endGame
            displayMessage("Congratulations! You found all groups!", "correct");
            triggerFireworks(); // Start confetti celebration
            // UI remains locked, but no more actions needed
            isAnimating = false; // Allow potential future actions if needed, though controls are disabled
        } else {
            // Lose sequence
            displayMessage("Game Over! Better luck next time.", "incorrect");
            loseOverlay.classList.add('visible'); // Show the sad face overlay

            // Hide the overlay after a duration
            setTimeout(() => {
                loseOverlay.classList.remove('visible');
                 // Reveal remaining groups *after* the overlay hides
                 setTimeout(() => {
                      revealRemainingGroups(); // This will eventually set isAnimating to false
                 }, 550); // Delay reveal slightly after overlay fades
            }, LOSE_FACE_DURATION);
        }
        // Save the final game state (win or loss)
         saveGameState();
    }


    function triggerFireworks() {
        if (typeof confetti !== 'function') {
             console.warn("Confetti function not found.");
             return;
         }
        console.log("Triggering fireworks!");
        const duration = 5 * 1000; // 5 seconds
        const animationEnd = Date.now() + duration;
        const brightColors = ['#FF0000','#00FF00','#0000FF','#FFFF00','#FF00FF','#00FFFF','#FFA500','#FF4500','#ADFF2F','#FF69B4','#1E90FF'];
        const defaults = { startVelocity: 45, spread: 360, ticks: 70, zIndex: 100, gravity: 0.8, scalar: 0.9 }; // Ensure zIndex is high enough

        function randomInRange(min, max) { return Math.random() * (max - min) + min; }

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            const particleCount = 60 * (timeLeft / duration);
            // Launch confetti from two points near the top corners
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: brightColors, shapes: ['star', 'circle'] }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: brightColors, shapes: ['star', 'circle'] }));
        }, 250);
    }

    function revealRemainingGroups(skipAnimation = false) {
         console.log("Revealing remaining groups.");
         if (!currentPuzzleData) {
            console.error("Cannot reveal groups, puzzle data missing.");
            isAnimating = false;
            return;
         }

         const solvedCategoryNames = new Set(solvedGroups.map(g => g.category));
         const groupsToReveal = currentPuzzleData.groups
            .filter(group => !solvedCategoryNames.has(group.category))
            .sort((a, b) => a.difficulty - b.difficulty); // Reveal in difficulty order

        if (groupsToReveal.length === 0) {
             console.log("No groups left to reveal.");
             // Ensure grid is hidden if somehow called when all groups are solved (e.g., during loss restore)
             if (activeGridArea.querySelectorAll('.word-button').length === 0) {
                 activeGridArea.classList.add('game-won-hidden');
             }
             isAnimating = false; // Release lock if nothing to do
             return;
         }

         // Make sure remaining buttons on grid are disabled visually
         Object.values(wordElements).forEach(button => {
             if (button && button.parentNode === activeGridArea) {
                 button.disabled = true;
                 button.style.opacity = '0.7'; // Dim them slightly
             }
         });

         // Ensure solved groups area is up-to-date before adding revealed ones
         renderSolvedGroupsArea(true); // Render existing solved groups without animation

         let revealedCount = 0;
         groupsToReveal.forEach((group, index) => {
            const revealDelay = skipAnimation ? 0 : index * REVEAL_STAGGER_DELAY;

            setTimeout(() => {
                // Double-check it wasn't somehow solved between scheduling and execution
                if (!solvedCategoryNames.has(group.category)) {
                     solvedGroups.push(group); // Add to logical solved list
                     solvedCategoryNames.add(group.category); // Update our check set

                     // Create and append the solved group div
                     const groupDiv = document.createElement('div');
                     groupDiv.classList.add('solved-group', `difficulty-${group.difficulty}`);
                     // Add a class to indicate it was revealed, not guessed
                     groupDiv.classList.add('revealed-on-loss');
                     groupDiv.innerHTML = `<strong>${group.category}</strong><p>${group.words.join(', ')}</p>`;
                     solvedGroupsArea.appendChild(groupDiv);

                     // Animate the appearance unless skipped
                     if (!skipAnimation) {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                groupDiv.classList.add('visible');
                            });
                        });
                     } else {
                         groupDiv.classList.add('visible');
                     }
                 }

                 // Remove the corresponding words/buttons from the grid
                 group.words.forEach(word => {
                     const button = wordElements[word];
                     if (button) {
                         button.remove(); // Remove from DOM
                         delete wordElements[word]; // Remove from map
                     }
                 });

                 revealedCount++;
                 // Check if this is the last group being revealed
                 if (revealedCount === groupsToReveal.length) {
                     console.log("Finished revealing all groups.");
                     // After last group, check if grid should be hidden (it should be empty now)
                     if (activeGridArea.querySelectorAll('.word-button').length === 0) {
                          // Use a small delay before hiding to ensure last removal is processed
                         setTimeout(() => {
                             activeGridArea.classList.add('game-won-hidden');
                         }, 50);
                     } else {
                         console.warn("Grid not empty after revealing all groups?");
                     }
                     saveGameState(); // Save the final state after reveal
                     isAnimating = false; // Release the animation lock
                     // Controls remain disabled because game is over
                 }

            }, revealDelay);
         });
     }


    function displayMessage(msg, type) {
        // Clear any pending timeout to hide the message
        if (messageTimeoutId) clearTimeout(messageTimeoutId);

        messageArea.textContent = msg;
        // Reset classes, then add the type if provided
        messageArea.className = 'message'; // Base class
        if (type) {
             messageArea.classList.add(type); // e.g., 'correct', 'incorrect', 'info'
        }
        // Make sure it's visible (remove hidden class if present)
        messageArea.classList.remove('hidden');
    }

    function clearMessageWithDelay() {
        // Clear any existing timeout
        if (messageTimeoutId) clearTimeout(messageTimeoutId);
        // Set a new timeout to hide the message
        messageTimeoutId = setTimeout(() => {
            // Only hide ephemeral messages, not permanent end-game messages
            const isEndGameMessage = messageArea.classList.contains('correct') && messageArea.textContent.startsWith("Congratulations") ||
                                    messageArea.classList.contains('incorrect') && messageArea.textContent.startsWith("Game Over");
            if (!isEndGameMessage) {
                 messageArea.classList.add('hidden'); // Hide by adding class
                 messageArea.textContent = ''; // Clear text content as well
            }
            messageTimeoutId = null; // Clear the timeout ID
        }, MESSAGE_CLEAR_DELAY);
    }

    // Fisher-Yates (Knuth) Shuffle algorithm
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
    }

    function deselectAll() {
        if (isGameOver || isAnimating) return; // Don't allow if game over or busy

        console.log("Deselecting all words.");
        selectedWords.forEach(word => {
            const button = wordElements[word];
            if (button) {
                button.classList.remove('selected'); // Remove visual selection
            }
        });
        selectedWords = []; // Clear the logical selection array
        submitButton.disabled = true; // Disable submit button
        displayMessage("", ""); // Clear any temporary messages
        // No need to save state just for deselecting
    }

    function shuffleGrid() {
        if (isGameOver || isAnimating) return; // Don't allow if game over or busy

        const currentButtons = Array.from(activeGridArea.querySelectorAll('.word-button:not(.fading-out):not(.removing)'));
        if (currentButtons.length === 0) return; // Nothing to shuffle

        console.log("Shuffling grid.");

        // Get the words currently on the grid
        const wordsToShuffle = currentButtons.map(btn => btn.textContent);
        shuffleArray(wordsToShuffle); // Shuffle the words

        // Keep track of which words were selected before shuffling
        const currentSelection = new Set(selectedWords);

        // Clear the grid visually and the mapping (temporarily)
        activeGridArea.innerHTML = '';
        wordElements = {}; // Reset map before repopulating

        // Repopulate the grid with shuffled words
        const fragment = document.createDocumentFragment();
        wordsToShuffle.forEach(word => {
            const button = document.createElement('button');
            button.textContent = word;
            button.classList.add('word-button');
            // Reapply 'selected' class if the word was selected before shuffling
            if (currentSelection.has(word)) {
                 button.classList.add('selected');
            }
            button.addEventListener('click', handleWordClick); // Re-attach listener
            fragment.appendChild(button);
            wordElements[word] = button; // Add back to map
        });

        activeGridArea.appendChild(fragment); // Add shuffled buttons to the grid

        // Adjust font size *after* buttons are in the DOM
         requestAnimationFrame(() => {
             Object.values(wordElements).forEach(button => {
                 if(button.parentNode === activeGridArea) {
                    adjustButtonFontSize(button);
                 }
             });
         });


        // Ensure submit button state is correct (shouldn't change, but good practice)
        submitButton.disabled = selectedWords.length !== MAX_SELECTED;
        saveGameState(); // Save the new grid order
     }

    // --- Event Listeners ---
    submitButton.addEventListener('click', handleSubmitGuess);
    deselectAllButton.addEventListener('click', deselectAll);
    shuffleButton.addEventListener('click', shuffleGrid);

    // --- Initial Load ---
    loadPuzzleForToday(); // Start the process

}); // End of DOMContentLoaded
// END OF FILE script.js