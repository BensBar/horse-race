/**
 * game.js – Horse Race Game Logic
 *
 * Architecture overview
 * ─────────────────────
 * 1. Horse data model  – each horse is a plain object holding its state
 *    (position, base speed, burst timer, etc.).
 *
 * 2. Race simulation   – a requestAnimationFrame loop advances every horse
 *    each frame. Horses have a base speed plus occasional random "speed bursts"
 *    to keep the race exciting and unpredictable.
 *
 * 3. Winner detection  – after each frame update the code checks whether any
 *    horse has crossed the finish line and stops the race accordingly.
 *
 * 4. UI updates        – the DOM is mutated only inside the animation loop and
 *    the reset function so the rest of the code stays pure / testable.
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

/** Number of horses competing in every race. */
const NUM_HORSES = 6;

/**
 * Base pixels-per-frame each horse can travel (before bursts).
 * Chosen so a race takes roughly 4–8 seconds at 60 fps.
 */
const BASE_SPEED_MIN = 1.2;
const BASE_SPEED_MAX = 2.2;

/**
 * A random "burst" temporarily adds extra speed to a horse.
 * BURST_CHANCE  – probability (0–1) per frame that a new burst begins.
 * BURST_SPEED   – additional px/frame added during a burst.
 * BURST_FRAMES  – how many frames a single burst lasts.
 */
const BURST_CHANCE  = 0.015;
const BURST_SPEED   = 3.5;
const BURST_FRAMES  = 30;

// ── Horse data model ─────────────────────────────────────────────────────────

/**
 * createHorse(index)
 * Returns a fresh horse object for the given 1-based index.
 *
 * @param {number} index - 1-based lane/horse number
 * @returns {{
 *   id:           string,   // e.g. "horse-1"
 *   el:           Element,  // DOM element reference
 *   position:     number,   // current left offset in pixels
 *   baseSpeed:    number,   // px/frame (constant for a race)
 *   burstFrames:  number,   // frames remaining in current burst (0 = no burst)
 *   finished:     boolean   // true once this horse crossed the finish line
 * }}
 */
function createHorse(index) {
  return {
    id:          `horse-${index}`,
    el:          document.getElementById(`horse-${index}`),
    position:    0,
    baseSpeed:   randomBetween(BASE_SPEED_MIN, BASE_SPEED_MAX),
    burstFrames: 0,
    finished:    false,
  };
}

// ── Race state ───────────────────────────────────────────────────────────────

/** Array of horse objects populated at race start. */
let horses = [];

/** requestAnimationFrame handle – used to cancel the loop on race end. */
let animationId = null;

/**
 * finishLineX – the X position (pixels from track left edge) that a horse
 * must reach to be considered a finisher.  Calculated once per race from the
 * finish-line element's position relative to the track.
 */
let finishLineX = 0;

/** True while a race is actively running. */
let raceRunning = false;

// ── DOM references ───────────────────────────────────────────────────────────

const trackEl      = document.getElementById('track-container');
const finishLineEl = document.getElementById('finish-line');
const statusEl     = document.getElementById('status-bar');
const btnStart     = document.getElementById('btn-start');
const btnAgain     = document.getElementById('btn-again');

// ── Utility helpers ──────────────────────────────────────────────────────────

/**
 * randomBetween(min, max)
 * Returns a random floating-point number in [min, max).
 */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * setStatus(message)
 * Updates the status bar text shown below the track.
 */
function setStatus(message) {
  statusEl.textContent = message;
}

// ── Finish line calculation ──────────────────────────────────────────────────

/**
 * calculateFinishLineX()
 * Determines the pixel offset from the left edge of the track at which a horse
 * is considered to have crossed the finish line.
 *
 * We use the left edge of the finish-line element (relative to the track) so
 * the horse emoji fully reaches the flag before winning is declared.
 */
function calculateFinishLineX() {
  const trackRect  = trackEl.getBoundingClientRect();
  const finishRect = finishLineEl.getBoundingClientRect();
  // Distance from the track's left inner edge to the finish-line's left edge
  return finishRect.left - trackRect.left;
}

// ── Race initialisation ──────────────────────────────────────────────────────

/**
 * initRace()
 * Resets all horse positions and state to prepare for a new race.
 * Called on page load and after "Race Again" is pressed.
 */
function initRace() {
  // Cancel any running animation loop
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  raceRunning = false;

  // (Re-)build the horses array and reset DOM positions
  horses = [];
  for (let i = 1; i <= NUM_HORSES; i++) {
    const horse = createHorse(i);
    horses.push(horse);

    // Move the horse emoji back to the start of its lane
    horse.el.style.transform = 'translateX(0px)';
    horse.el.classList.remove('running', 'winner');
  }

  finishLineX = calculateFinishLineX();

  setStatus('Press "Start Race" to begin!');
  btnStart.disabled = false;
  btnAgain.disabled = true;
}

// ── Animation loop ───────────────────────────────────────────────────────────

/**
 * raceLoop()
 * The core animation loop driven by requestAnimationFrame.
 *
 * Each frame:
 *   1. Advance every non-finished horse by its current speed.
 *   2. Randomly trigger or decrement speed bursts.
 *   3. Check whether the horse has crossed the finish line.
 *   4. Update the horse's DOM transform to reflect its new position.
 *   5. After all horses are updated, check if the race is over.
 */
function raceLoop() {
  // Track how many horses have now crossed the finish line this frame
  let newWinner = null;

  for (const horse of horses) {
    if (horse.finished) continue;

    // ── Speed burst logic ─────────────────────────────────────────────────
    // If no burst is active, randomly start one
    if (horse.burstFrames === 0 && Math.random() < BURST_CHANCE) {
      horse.burstFrames = BURST_FRAMES;
    }

    // Determine the effective speed this frame
    const speed = horse.burstFrames > 0
      ? horse.baseSpeed + BURST_SPEED
      : horse.baseSpeed;

    // Decrement burst counter if active
    if (horse.burstFrames > 0) {
      horse.burstFrames -= 1;
    }

    // ── Advance position ──────────────────────────────────────────────────
    horse.position += speed;

    // ── Finish line detection ─────────────────────────────────────────────
    // A horse wins when its left edge reaches the finish line.
    if (horse.position >= finishLineX) {
      horse.position = finishLineX; // Clamp to the finish line
      horse.finished = true;

      // Only the very first finisher is the race winner
      if (newWinner === null) {
        newWinner = horse;
      }
    }

    // ── Update DOM ────────────────────────────────────────────────────────
    // We use translateX rather than `left` to keep rendering on the GPU
    // compositor thread for smooth animation.
    horse.el.style.transform = `translateX(${horse.position}px)`;
  }

  // ── Winner handling ───────────────────────────────────────────────────────
  if (newWinner !== null) {
    endRace(newWinner);
    return; // Stop the loop
  }

  // Schedule the next frame
  animationId = requestAnimationFrame(raceLoop);
}

// ── Race control ─────────────────────────────────────────────────────────────

/**
 * startRace()
 * Kicks off the race: updates UI state and starts the animation loop.
 */
function startRace() {
  if (raceRunning) return;

  raceRunning  = true;
  btnStart.disabled = true;

  // Mark all horse elements as actively running (enables the trot animation)
  for (const horse of horses) {
    horse.el.classList.add('running');
  }

  setStatus("They're off! 🏁");

  // Recalculate finish line in case the viewport changed since init
  finishLineX = calculateFinishLineX();

  // Begin the animation loop
  animationId = requestAnimationFrame(raceLoop);
}

/**
 * endRace(winner)
 * Called when a horse crosses the finish line.
 * Stops the animation loop, highlights the winner, and updates the UI.
 *
 * @param {{ id: string, el: Element }} winner - The winning horse object
 */
function endRace(winner) {
  cancelAnimationFrame(animationId);
  animationId = null;
  raceRunning  = false;

  // Stop the trot animation on all horses
  for (const horse of horses) {
    horse.el.classList.remove('running');
  }

  // Highlight the winning horse
  winner.el.classList.add('winner');

  // Extract the lane number from the id (e.g. "horse-3" → "3")
  const laneNumber = winner.id.replace('horse-', '');
  setStatus(`🏆 Horse ${laneNumber} wins! Congratulations! 🎉`);

  btnAgain.disabled = false;
}

// ── Event listeners ──────────────────────────────────────────────────────────

btnStart.addEventListener('click', startRace);
btnAgain.addEventListener('click', initRace);

// Recalculate the finish line position if the window is resized mid-race
window.addEventListener('resize', () => {
  finishLineX = calculateFinishLineX();
});

// ── Bootstrap ────────────────────────────────────────────────────────────────

// Wait for the DOM to be fully painted before measuring layout positions
window.addEventListener('load', initRace);
