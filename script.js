document.addEventListener('DOMContentLoaded', () => {
    // Element References
    const activeGridArea = document.getElementById('active-grid-area');
    const solvedGroupsArea = document.getElementById('solved-groups-area');
    const submitButton = document.getElementById('submit-guess');
    const messageArea = document.getElementById('message-area');
    const attemptsLeftSpan = document.getElementById('attempts-left');
    const attemptCircles = document.querySelectorAll('#attempt-circles span');
    const deselectAllButton = document.getElementById('deselect-all-button');
    const shuffleButton = document.getElementById('shuffle-button');
    const loseOverlay = document.getElementById('lose-overlay'); // Reference to the overlay

    // Constants
    const MAX_SELECTED = 4;
    const TOTAL_ATTEMPTS = 4;
    const PUZZLE_FILE = 'puzzles.json';
    const LOSE_FACE_DURATION = 2500; // How long the frowny face stays (in ms)

    // Game state variables
    let selectedWords = [];
    let wordElements = {};
    let currentPuzzleData = null;
    let remainingAttempts = TOTAL_ATTEMPTS;
    let solvedGroups = [];
    let isGameOver = false; // Flag to prevent actions after game end

    // --- Core Game Logic ---

    async function loadPuzzleForToday() {
        try {
            const response = await fetch(PUZZLE_FILE);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const allPuzzles = await response.json();
            const today = getDayString();
            console.log(`Attempting to load puzzle data for: ${today}`);
            const puzzleGroups = allPuzzles[today];

            if (isValidPuzzleData(puzzleGroups)) {
                console.log("Successfully found and validated puzzle for", today);
                currentPuzzleData = { day: today, groups: puzzleGroups };
                initializeGame();
            } else {
                console.warn("Puzzle data for", today, "not found or is invalid in puzzles.json.");
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

    function getDayString() {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return days[new Date().getDay()];
    }

    function initializeGame() {
        isGameOver = false; // Reset game over flag
        selectedWords = [];
        wordElements = {};
        remainingAttempts = TOTAL_ATTEMPTS;
        solvedGroups = [];

        activeGridArea.innerHTML = '';
        activeGridArea.classList.remove('game-over', 'game-won-hidden'); // Reset grid state
        solvedGroupsArea.innerHTML = '';
        messageArea.textContent = '';
        messageArea.className = 'message';
        loseOverlay.classList.remove('visible'); // Ensure overlay is hidden

        updateAttemptsDisplay();
        submitButton.disabled = true;

        const allWords = currentPuzzleData.groups.flatMap(group => group.words);
        shuffleArray(allWords);

        allWords.forEach(word => {
            const button = document.createElement('button');
            button.textContent = word;
            button.classList.add('word-button');
            button.addEventListener('click', handleWordClick);
            activeGridArea.appendChild(button);
            wordElements[word] = button;
        });

        enableGameControls();
    }

    function handleWordClick(event) {
        if (isGameOver) return; // Prevent clicks after game end
        const button = event.target;
        const word = button.textContent;

        if (button.disabled) return;

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

        const submittedSelection = [...selectedWords];
        const selectedButtons = submittedSelection.map(word => wordElements[word]).filter(Boolean); // Filter out undefined if button already removed
        const correctGroup = findCorrectGroup(submittedSelection);

        // Deselect visually first
        selectedButtons.forEach(button => button.classList.remove('selected'));
        selectedWords = [];
        submitButton.disabled = true;

        if (correctGroup) {
             displayMessage("Correct!", "correct");
             solvedGroups.push(correctGroup);
             solvedGroups.sort((a, b) => a.difficulty - b.difficulty);
             renderSolvedGroupsArea();
             removeSolvedButtonsFromGrid(correctGroup.words);

             if (solvedGroups.length === 4) {
                 endGame(true); // Win
             }
        } else {
            remainingAttempts--;
            updateAttemptsDisplay();
            displayMessage("Incorrect Guess", "incorrect");

            // Shake the buttons involved
            selectedButtons.forEach(button => {
                if (button && !button.classList.contains('removing')) {
                    button.classList.add('shake');
                    setTimeout(() => { if(button) button.classList.remove('shake'); }, 300);
                }
            });

            if (remainingAttempts <= 0) {
                endGame(false); // Lose
            } else {
                 setTimeout(() => {
                    if(!isGameOver) displayMessage("", ""); // Clear message only if game not over
                 }, 1500);
            }
        }
    }

    function findCorrectGroup(selection) {
        const selectionSet = new Set(selection);
        const foundCategories = new Set(solvedGroups.map(g => g.category));
        return currentPuzzleData.groups.find(group =>
            !foundCategories.has(group.category) &&
            group.words.length === selectionSet.size &&
            group.words.every(word => selectionSet.has(word))
        ) || null;
    }

    function renderSolvedGroupsArea() {
        solvedGroupsArea.innerHTML = '';
        solvedGroups.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.classList.add('solved-group', `difficulty-${group.difficulty}`);
            groupDiv.innerHTML = `<strong>${group.category}</strong><p>${group.words.join(', ')}</p>`;
            solvedGroupsArea.appendChild(groupDiv);
        });
    }

    function removeSolvedButtonsFromGrid(wordsToRemove) {
        let buttonsRemoved = 0;
        const totalToRemove = wordsToRemove.length;

        wordsToRemove.forEach(word => {
            const button = wordElements[word];
            if (button) {
                button.disabled = true; // Prevent further interaction immediately
                button.classList.add('removing');

                const handleRemoval = () => {
                    button.remove();
                    buttonsRemoved++;
                    // If this is the last button of the last group (win condition)
                    // and all buttons have finished animating out, hide the grid container.
                    if (solvedGroups.length === 4 && buttonsRemoved === totalToRemove) {
                       // Check if ALL buttons are gone from the grid
                       if (activeGridArea.querySelectorAll('.word-button:not(.removing)').length === 0) {
                            activeGridArea.classList.add('game-won-hidden');
                       }
                    }
                };

                // Use transitionend event listener
                button.addEventListener('transitionend', handleRemoval, { once: true });

                 // Fallback timeout in case transitionend doesn't fire (e.g., element removed before transition ends)
                setTimeout(handleRemoval, 400); // Slightly longer than CSS transition

                delete wordElements[word];
            }
        });
    }


    function updateAttemptsDisplay() {
        attemptsLeftSpan.textContent = remainingAttempts;
        attemptCircles.forEach((circle, index) => {
            circle.classList.toggle('used', index < TOTAL_ATTEMPTS - remainingAttempts);
        });
    }

    function disableGameControls() {
        submitButton.disabled = true;
        deselectAllButton.disabled = true;
        shuffleButton.disabled = true;
        // Disable remaining active grid buttons if any
        Object.values(wordElements).forEach(button => { button.disabled = true; });
    }
    function enableGameControls() {
        // Submit button enabled based on selection count, handled elsewhere
        deselectAllButton.disabled = false;
        shuffleButton.disabled = false;
         Object.values(wordElements).forEach(button => { button.disabled = false; });
    }


    function endGame(isWin) {
        if (isGameOver) return; // Prevent running multiple times
        isGameOver = true;
        disableGameControls(); // Disable all buttons etc.
        activeGridArea.classList.add('game-over'); // Generic game-over style hook

        if (isWin) {
            // --- Win Condition ---
            displayMessage("Congratulations! You found all groups!", "correct");
            // Hide the (now empty) active grid area cleanly
             // The logic in removeSolvedButtonsFromGrid now handles adding 'game-won-hidden' class
            triggerFireworks(); // Start confetti fireworks

        } else {
            // --- Lose Condition ---
            displayMessage("Game Over! Better luck next time.", "incorrect");
            // Show frowny face overlay
            loseOverlay.classList.add('visible');

            // After a delay, hide overlay and reveal answers
            setTimeout(() => {
                loseOverlay.classList.remove('visible');
                // Reveal remaining groups after the overlay is hidden
                 setTimeout(() => { // Add a tiny delay for the fade-out animation
                      revealRemainingGroups();
                 }, 500); // Match the overlay transition duration

            }, LOSE_FACE_DURATION);
        }
    }

    // Function to trigger confetti fireworks
    function triggerFireworks() {
        const duration = 5 * 1000; // 5 seconds
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

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


    function revealRemainingGroups() {
         if (!currentPuzzleData) return; // Safety check
         const foundCategories = new Set(solvedGroups.map(g => g.category));
         const groupsToReveal = currentPuzzleData.groups
            .filter(group => !foundCategories.has(group.category))
            .sort((a, b) => a.difficulty - b.difficulty);

         groupsToReveal.forEach(group => {
            // Add group to solved list and render (will appear in sorted order)
            if (!foundCategories.has(group.category)) { // Double check category isn't already added
                 solvedGroups.push(group);
            }
            // Remove corresponding buttons from grid (they are already disabled)
            removeSolvedButtonsFromGrid(group.words);
         });
        // Sort and render the updated list including revealed ones
        solvedGroups.sort((a, b) => a.difficulty - b.difficulty);
        renderSolvedGroupsArea();
     }

    function displayMessage(msg, type) {
        messageArea.textContent = msg;
        messageArea.className = 'message';
        if (type) messageArea.classList.add(type);
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
    }

    function shuffleGrid() {
        if (isGameOver) return;
        const currentButtons = Array.from(activeGridArea.querySelectorAll('.word-button:not(.removing)'));
        if (currentButtons.length === 0) return;

        const wordsToShuffle = currentButtons.map(btn => btn.textContent);
        shuffleArray(wordsToShuffle);

        const newWordElements = {};

        currentButtons.forEach((button, index) => {
             const newWord = wordsToShuffle[index];
             button.textContent = newWord;
             newWordElements[newWord] = button;
             button.classList.toggle('selected', selectedWords.includes(newWord));
        });

        wordElements = newWordElements; // Update map only with active buttons
        selectedWords = Array.from(activeGridArea.querySelectorAll('.word-button.selected')).map(btn => btn.textContent);
        submitButton.disabled = selectedWords.length !== MAX_SELECTED;
     }

    // --- Event Listeners ---
    submitButton.addEventListener('click', handleSubmitGuess);
    deselectAllButton.addEventListener('click', deselectAll);
    shuffleButton.addEventListener('click', shuffleGrid);

    // --- Initial Load ---
    loadPuzzleForToday();

}); // End of DOMContentLoaded