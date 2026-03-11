/**
 * game.js - Golden Cup Classic Horse Racing Engine
 *
 * Architecture:
 * 1. Horse data model with stats (speed, stamina, burst, etc.)
 * 2. Race simulation engine with delta-time physics
 * 3. UI rendering layer (DOM updates batched in rAF)
 * 4. Sound system (Web Audio API synthesized)
 * 5. Controls (fullscreen, mute, keyboard)
 */

"use strict";

// =====================================================================
// RACE CONFIGURATION
// =====================================================================

const RACE_CONFIG = {
  trackLength: 100,           // percentage-based track
  finishLinePosition: 92,     // % of track width where finish is
  raceTargetDuration: 35000,  // ~35 seconds target race
  numHorses: 8,
  updateInterval: 16,         // ~60fps target
  randomRaceProbability: 0.20,  // chance of no pre-selected winner
  visualScaleFactor: 0.85,      // maps position % to CSS visual range
  maxDeltaMs: 50,             // cap delta to ~3 dropped frames to prevent physics instability
  burstMinFrames: 30,         // minimum frames a speed burst lasts
  burstRangeFrames: 30,       // additional random frames added to burst duration
  winnerNudgeGap: 8,          // position gap (%) that triggers catch-up boost for pre-selected winner
};

// Pre-computed: speed scale factor so horses finish in ~35s
const SPEED_SCALE = RACE_CONFIG.finishLinePosition /
  (RACE_CONFIG.raceTargetDuration / RACE_CONFIG.updateInterval);

// =====================================================================
// HORSE DATA MODEL
// =====================================================================

const HORSE_DATA = [
  {
    id: 1, name: "Thunder Strike", color: "#e63946",
    baseSpeed: 0.92, acceleration: 0.022, stamina: 0.85,
    burstChance: 0.012, burstPower: 1.55, recovery: 0.55,
    consistency: 0.90, style: "front",
  },
  {
    id: 2, name: "Midnight Storm", color: "#1d3557",
    baseSpeed: 0.85, acceleration: 0.025, stamina: 0.92,
    burstChance: 0.010, burstPower: 1.65, recovery: 0.60,
    consistency: 0.85, style: "closer",
  },
  {
    id: 3, name: "Golden Arrow", color: "#f4a236",
    baseSpeed: 0.90, acceleration: 0.020, stamina: 0.88,
    burstChance: 0.015, burstPower: 1.50, recovery: 0.50,
    consistency: 0.92, style: "front",
  },
  {
    id: 4, name: "Crimson Flash", color: "#d62828",
    baseSpeed: 0.82, acceleration: 0.028, stamina: 0.78,
    burstChance: 0.018, burstPower: 1.70, recovery: 0.45,
    consistency: 0.78, style: "mid",
  },
  {
    id: 5, name: "Silver Bullet", color: "#a8dadc",
    baseSpeed: 0.80, acceleration: 0.018, stamina: 0.95,
    burstChance: 0.008, burstPower: 1.45, recovery: 0.65,
    consistency: 0.95, style: "closer",
  },
  {
    id: 6, name: "Desert Wind", color: "#e9c46a",
    baseSpeed: 0.78, acceleration: 0.024, stamina: 0.80,
    burstChance: 0.014, burstPower: 1.60, recovery: 0.50,
    consistency: 0.82, style: "mid",
  },
  {
    id: 7, name: "Iron Will", color: "#457b9d",
    baseSpeed: 0.75, acceleration: 0.020, stamina: 0.90,
    burstChance: 0.010, burstPower: 1.50, recovery: 0.60,
    consistency: 0.88, style: "closer",
  },
  {
    id: 8, name: "Lucky Star", color: "#6a0572",
    baseSpeed: 0.73, acceleration: 0.016, stamina: 0.70,
    burstChance: 0.020, burstPower: 1.80, recovery: 0.35,
    consistency: 0.72, style: "mid",
  },
];

// =====================================================================
// STATE
// =====================================================================

const State = {
  IDLE: "IDLE",
  PRE_RACE: "PRE_RACE",
  COUNTDOWN: "COUNTDOWN",
  RACING: "RACING",
  FINISHING: "FINISHING",
  RESULTS: "RESULTS",
};

let gameState = State.IDLE;
let horses = [];
let finishOrder = [];
let animationFrameId = null;
let raceStartTime = 0;
let lastFrameTime = 0;
let elapsedTime = 0;
let preSelectedWinner = null;
let isMuted = false;
let previousLeaderId = null;  // tracks who led last frame for change-flash
let finalFurlongFired = false; // prevents repeated class toggles

// =====================================================================
// DOM REFERENCES
// =====================================================================

const dom = {
  preRace:        document.getElementById("pre-race"),
  raceScreen:     document.getElementById("race-screen"),
  resultsOverlay: document.getElementById("results-overlay"),
  startBtn:       document.getElementById("start-btn"),
  raceAgainBtn:   document.getElementById("race-again-btn"),
  muteBtn:        document.getElementById("mute-btn"),
  fullscreenBtn:  document.getElementById("fullscreen-btn"),
  timer:          document.getElementById("race-timer"),
  leader:         document.getElementById("race-leader"),
  standingsList:  document.getElementById("standings-list"),
  countdownOverlay: document.getElementById("countdown-overlay"),
  countdownText:  document.getElementById("countdown-text"),
  winnerName:     document.getElementById("winner-name"),
  winnerNum:      document.getElementById("winner-num"),
  winnerTime:     document.getElementById("winner-time"),
  winnerOdds:     document.getElementById("winner-odds"),
  winnerBanner:   document.querySelector(".results__winner-banner"),
  resultsOrder:   document.getElementById("results-order"),
};

// =====================================================================
// SOUND MANAGER (Web Audio API)
// =====================================================================

const SoundManager = {
  ctx: null,
  masterGain: null,
  hoovesInterval: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = isMuted ? 0 : 0.4;
  },

  resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  },

  _tone(freq, duration, type, gainVal) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainVal || 0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },

  playBell() {
    this._tone(880, 0.6, "sine", 0.35);
    setTimeout(() => this._tone(1100, 0.4, "sine", 0.25), 150);
  },

  playCountTick() {
    this._tone(600, 0.15, "square", 0.15);
  },

  playGo() {
    this._tone(880, 0.3, "sine", 0.3);
    setTimeout(() => this._tone(1320, 0.5, "sine", 0.3), 100);
  },

  startHooves() {
    if (!this.ctx) return;
    let tick = 0;
    this.hoovesInterval = setInterval(() => {
      if (isMuted) return;
      const freq = 80 + (tick % 2) * 30;
      this._tone(freq, 0.06, "triangle", 0.08);
      tick++;
    }, 130);
  },

  stopHooves() {
    if (this.hoovesInterval) {
      clearInterval(this.hoovesInterval);
      this.hoovesInterval = null;
    }
  },

  playCrowd() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.02;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    source.connect(filter);
    filter.connect(this.masterGain);
    source.start();
    this._crowdSource = source;
  },

  stopCrowd() {
    if (this._crowdSource) {
      try { this._crowdSource.stop(); } catch (_) { /* already stopped */ }
      this._crowdSource = null;
    }
  },

  playFanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this._tone(freq, 0.5, "sine", 0.25), i * 200);
    });
  },

  toggleMute() {
    isMuted = !isMuted;
    if (this.masterGain) {
      this.masterGain.gain.value = isMuted ? 0 : 0.4;
    }
    dom.muteBtn.textContent = isMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
  },
};

// =====================================================================
// ODDS CALCULATOR
// =====================================================================

function calculateOdds() {
  // Strength score from stats — weight key factors heavily
  const scores = HORSE_DATA.map((h) => {
    return h.baseSpeed * 10 + h.stamina * 6 + h.acceleration * 50 +
           h.burstChance * 80 + h.burstPower * 2 + h.consistency * 4 + h.recovery * 2;
  });
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const range = maxScore - minScore || 1;

  // Common fractional odds for horse racing
  const oddsTable = [
    "2/1", "5/2", "3/1", "7/2", "4/1", "9/2", "5/1",
    "6/1", "7/1", "8/1", "10/1", "12/1", "14/1", "16/1",
  ];

  // Rank horses by score descending, assign odds accordingly
  const indexed = scores.map((s, i) => ({ score: s, idx: i }));
  indexed.sort((a, b) => b.score - a.score);

  indexed.forEach((entry, rank) => {
    const h = HORSE_DATA[entry.idx];
    // Map rank to odds table position, spreading across the table
    const oddsIdx = Math.min(
      oddsTable.length - 1,
      Math.round((rank / (HORSE_DATA.length - 1)) * (oddsTable.length - 1))
    );
    h.oddsDisplay = oddsTable[oddsIdx];
    h.odds = parseInt(oddsTable[oddsIdx]); // display-only numerator; not used in arithmetic
    h.strengthScore = entry.score;
  });

  // Update DOM odds
  document.querySelectorAll(".horse-card").forEach((card) => {
    const id = parseInt(card.dataset.horseId);
    const data = HORSE_DATA.find((h) => h.id === id);
    if (data) {
      card.querySelector("[data-odds]").textContent = data.oddsDisplay;
    }
  });
}

// =====================================================================
// WINNER PRE-SELECTION
// =====================================================================

function preselectWinner() {
  // 20% chance of purely random race (no pre-selected winner)
  if (Math.random() < RACE_CONFIG.randomRaceProbability) {
    preSelectedWinner = null;
    return;
  }
  // Weighted random selection based on inverse odds (stronger = more likely)
  const weights = HORSE_DATA.map((h) => h.strengthScore || 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      preSelectedWinner = HORSE_DATA[i].id;
      return;
    }
  }
  preSelectedWinner = HORSE_DATA[0].id;
}

// =====================================================================
// RACE HORSE RUNTIME OBJECTS
// =====================================================================

function createRaceHorse(data) {
  return {
    id: data.id,
    name: data.name,
    color: data.color,
    position: 0,          // 0-100 percentage
    speed: 0,
    baseSpeed: data.baseSpeed,
    acceleration: data.acceleration,
    stamina: data.stamina,
    currentStamina: 1.0,  // drains over race
    burstChance: data.burstChance,
    burstPower: data.burstPower,
    burstActive: false,
    burstFramesLeft: 0,
    recovery: data.recovery,
    consistency: data.consistency,
    style: data.style,
    finished: false,
    finishTime: 0,
    el: document.querySelector("[data-horse-el='" + data.id + "']"),
  };
}

// =====================================================================
// RACE INIT
// =====================================================================

function initRace() {
  gameState = State.PRE_RACE;
  finishOrder = [];
  elapsedTime = 0;
  preSelectedWinner = null;
  previousLeaderId = null;
  finalFurlongFired = false;

  // Cancel any running animation
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  SoundManager.stopHooves();
  SoundManager.stopCrowd();

  // Remove any lingering state classes from previous race
  dom.raceScreen.classList.remove("final-furlong");

  // Remove any leftover confetti
  document.querySelectorAll(".confetti-container").forEach((el) => el.remove());

  calculateOdds();

  // Reset horse elements
  horses = HORSE_DATA.map(createRaceHorse);
  horses.forEach((h) => {
    if (h.el) {
      h.el.style.setProperty("--horse-x", "0");
      h.el.classList.remove("running", "bursting", "winner");
    }
  });

  // Reset UI
  dom.timer.textContent = "00:00.00";
  dom.leader.textContent = "\u2014";

  // Reset standings to default order
  updateStandings(horses);

  // Show pre-race, hide others
  dom.preRace.classList.remove("screen--hidden");
  dom.raceScreen.classList.add("screen--hidden");
  dom.resultsOverlay.classList.add("screen--hidden");
  dom.countdownOverlay.classList.add("countdown-overlay--hidden");
}

// =====================================================================
// COUNTDOWN
// =====================================================================

function startCountdown() {
  gameState = State.COUNTDOWN;
  SoundManager.init();
  SoundManager.resume();

  // Transition to race screen
  dom.preRace.classList.add("screen--hidden");
  dom.raceScreen.classList.remove("screen--hidden");

  preselectWinner();

  // Countdown sequence: 3 → 2 → 1 → GO
  const steps = ["3", "2", "1", "GO!"];
  let i = 0;

  dom.countdownOverlay.classList.remove("countdown-overlay--hidden");

  function nextStep() {
    if (i >= steps.length) {
      dom.countdownOverlay.classList.add("countdown-overlay--hidden");
      startRace();
      return;
    }
    dom.countdownText.textContent = steps[i];
    // Reset and re-trigger the CSS pop animation by toggling the animation property.
    // Reading offsetWidth forces a synchronous reflow so the browser registers the
    // "none" state before re-applying the animation, ensuring it plays from the start.
    dom.countdownText.style.animation = "none";
    void dom.countdownText.offsetWidth;
    dom.countdownText.style.animation = "";

    if (steps[i] === "GO!") {
      SoundManager.playGo();
    } else {
      SoundManager.playCountTick();
    }

    i++;
    setTimeout(nextStep, i <= 3 ? 900 : 600);
  }

  setTimeout(nextStep, 300);
}

// =====================================================================
// RACE START
// =====================================================================

function startRace() {
  gameState = State.RACING;
  raceStartTime = performance.now();
  lastFrameTime = raceStartTime;

  horses.forEach((h) => {
    if (h.el) h.el.classList.add("running");
  });

  SoundManager.startHooves();
  SoundManager.playCrowd();
  SoundManager.playBell();

  animationFrameId = requestAnimationFrame(raceLoop);
}

// =====================================================================
// RACE LOOP (core physics)
// =====================================================================

function raceLoop(timestamp) {
  if (gameState !== State.RACING && gameState !== State.FINISHING) return;

  const deltaMs = Math.min(timestamp - lastFrameTime, RACE_CONFIG.maxDeltaMs);
  lastFrameTime = timestamp;
  elapsedTime = timestamp - raceStartTime;

  const deltaFactor = deltaMs / RACE_CONFIG.updateInterval;
  const raceProgress = getAverageProgress();

  for (const horse of horses) {
    if (horse.finished) continue;
    updateHorsePhysics(horse, deltaFactor, raceProgress);
  }

  // Check finish line crossings
  for (const horse of horses) {
    if (!horse.finished && horse.position >= RACE_CONFIG.finishLinePosition) {
      horse.finished = true;
      horse.finishTime = elapsedTime;
      horse.position = RACE_CONFIG.finishLinePosition;
      finishOrder.push(horse);
      if (horse.el) {
        horse.el.classList.remove("running", "bursting");
        horse.el.classList.add("winner");
      }
    }
  }

  // Update UI
  updateHorsePositions();
  updateTimer();
  updateLeader();
  updateStandings(horses);

  // Final-furlong emphasis: fires once when the average position reaches 70% of track
  if (!finalFurlongFired && getAverageProgress() / RACE_CONFIG.finishLinePosition >= 0.70) {
    finalFurlongFired = true;
    dom.raceScreen.classList.add("final-furlong");
  }

  // Check if race is complete
  if (finishOrder.length >= RACE_CONFIG.numHorses) {
    endRace();
    return;
  }

  // If first horse finished, enter finishing state — auto-end after 5s
  if (finishOrder.length > 0 && gameState === State.RACING) {
    gameState = State.FINISHING;
    setTimeout(() => {
      if (gameState === State.FINISHING) {
        // Force-finish remaining horses
        horses
          .filter((h) => !h.finished)
          .sort((a, b) => b.position - a.position)
          .forEach((h) => {
            h.finished = true;
            h.finishTime = elapsedTime;
            finishOrder.push(h);
          });
        endRace();
      }
    }, 5000);
  }

  animationFrameId = requestAnimationFrame(raceLoop);
}

// =====================================================================
// HORSE PHYSICS
// =====================================================================

function updateHorsePhysics(horse, deltaFactor, raceProgress) {
  const progressRatio = horse.position / RACE_CONFIG.finishLinePosition;

  // --- Base speed calculation ---
  // Speed curve based on running style
  let styleMultiplier = 1.0;
  if (horse.style === "front") {
    // Fast start, fades late
    styleMultiplier = progressRatio < 0.5 ? 1.12 : 0.92 + (1 - progressRatio) * 0.15;
  } else if (horse.style === "closer") {
    // Slow start, strong finish
    styleMultiplier = progressRatio < 0.3 ? 0.88 : 0.95 + progressRatio * 0.2;
  } else {
    // Mid-pack steady
    styleMultiplier = 1.0 + Math.sin(progressRatio * Math.PI) * 0.06;
  }

  // Acceleration curve: builds up early, plateaus
  const accelCurve = Math.min(1.0, progressRatio * 4) * horse.acceleration * 10;

  // Stamina drain: gets heavier in late race
  const staminaDrain = (1 - horse.stamina) * progressRatio * progressRatio * 0.5;
  horse.currentStamina = Math.max(0.3, 1.0 - staminaDrain);

  // Core speed
  let speed = (horse.baseSpeed + accelCurve) * styleMultiplier * horse.currentStamina;

  // --- Burst logic ---
  if (horse.burstActive) {
    horse.burstFramesLeft -= deltaFactor;
    if (horse.burstFramesLeft <= 0) {
      horse.burstActive = false;
      if (horse.el) horse.el.classList.remove("bursting");
    } else {
      speed *= horse.burstPower;
    }
  } else if (Math.random() < horse.burstChance * deltaFactor) {
    horse.burstActive = true;
    horse.burstFramesLeft = RACE_CONFIG.burstMinFrames + Math.random() * RACE_CONFIG.burstRangeFrames;
    if (horse.el) horse.el.classList.add("bursting");
  }

  // --- Consistency jitter ---
  const jitter = 1 + (Math.random() - 0.5) * (1 - horse.consistency) * 0.3;
  speed *= jitter;

  // --- Pre-selected winner nudge ---
  if (preSelectedWinner === horse.id) {
    // Subtle boost in last 20% of race
    if (progressRatio > 0.8) {
      speed *= 1.06;
    }
    // Keep within striking distance by 70% mark
    if (progressRatio > 0.5 && progressRatio < 0.8) {
      const leaderPos = Math.max(...horses.map((h) => h.position));
      const gap = leaderPos - horse.position;
      if (gap > RACE_CONFIG.winnerNudgeGap) {
        speed *= 1.04;
      }
    }
  }

  horse.speed = speed * SPEED_SCALE * deltaFactor;
  horse.position = Math.min(horse.position + horse.speed, RACE_CONFIG.finishLinePosition);
}

function getAverageProgress() {
  if (horses.length === 0) return 0;
  return horses.reduce((sum, h) => sum + h.position, 0) / horses.length;
}

// =====================================================================
// UI RENDERING
// =====================================================================

function updateHorsePositions() {
  for (const horse of horses) {
    if (!horse.el) continue;
    // Map position (0-92) to visual percentage considering the badge offset
    // The horse starts after the badge, and we scale to fill available track
    const visualPercent = (horse.position / RACE_CONFIG.finishLinePosition) * 100;
    horse.el.style.setProperty("--horse-x", String(visualPercent * RACE_CONFIG.visualScaleFactor));
  }
}

function updateTimer() {
  const totalMs = Math.floor(elapsedTime);
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor((totalMs % 1000) / 10);
  dom.timer.textContent =
    String(mins).padStart(2, "0") + ":" +
    String(secs).padStart(2, "0") + "." +
    String(ms).padStart(2, "0");
}

function updateLeader() {
  const sorted = [...horses].sort((a, b) => b.position - a.position);
  const leader = sorted[0];
  if (leader) {
    if (previousLeaderId !== null && leader.id !== previousLeaderId) {
      // New leader — animate the name to draw the viewer's eye
      dom.leader.classList.remove("leader-change");
      void dom.leader.offsetWidth; // force reflow so animation restarts
      dom.leader.classList.add("leader-change");
    }
    previousLeaderId = leader.id;
    dom.leader.textContent = leader.name;
  } else if (finishOrder.length > 0) {
    dom.leader.textContent = finishOrder[0].name;
  }
}

function updateStandings(horseList) {
  const sorted = [...horseList].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.position - a.position;
  });

  const items = dom.standingsList.querySelectorAll(".standings__item");
  sorted.forEach((horse, idx) => {
    if (!items[idx]) return;
    items[idx].dataset.standing = String(idx + 1);
    items[idx].querySelector(".standings__pos").textContent = String(idx + 1);
    items[idx].querySelector(".standings__swatch").style.background = horse.color;
    items[idx].querySelector(".standings__name").textContent = horse.name;
  });
}

function formatTime(ms) {
  const totalMs = Math.floor(ms);
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const centis = Math.floor((totalMs % 1000) / 10);
  return (
    String(mins).padStart(2, "0") + ":" +
    String(secs).padStart(2, "0") + "." +
    String(centis).padStart(2, "0")
  );
}

// =====================================================================
// END RACE / RESULTS
// =====================================================================

function endRace() {
  gameState = State.RESULTS;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  SoundManager.stopHooves();
  SoundManager.stopCrowd();
  SoundManager.playFanfare();

  // Remove final-furlong urgency styling
  dom.raceScreen.classList.remove("final-furlong");

  // Update final timer
  updateTimer();

  // Show results with delay for dramatic effect
  setTimeout(() => showResults(), 800);
}

function showResults() {
  const winner = finishOrder[0];
  if (!winner) return;

  const winnerData = HORSE_DATA.find((h) => h.id === winner.id);

  dom.winnerName.textContent = winner.name;
  dom.winnerTime.textContent = formatTime(winner.finishTime);
  if (dom.winnerNum)  dom.winnerNum.textContent  = "#" + winner.id;
  if (dom.winnerOdds) dom.winnerOdds.textContent = winnerData?.oddsDisplay || "";
  // Set the colour-accent CSS variable used by the winner banner border
  if (dom.winnerBanner) dom.winnerBanner.style.setProperty("--winner-color", winner.color);

  // Build finishing order list
  dom.resultsOrder.innerHTML = "";
  finishOrder.forEach((horse, idx) => {
    const li = document.createElement("li");
    li.className = "results__order-item";
    li.style.animationDelay = (idx * 0.12) + "s";
    li.innerHTML =
      '<span class="results__order-pos">' + (idx + 1) + '</span>' +
      '<span class="results__order-swatch" style="background:' + horse.color + '"></span>' +
      '<span class="results__order-name">' + horse.name + '</span>' +
      '<span class="results__order-time">' + formatTime(horse.finishTime) + '</span>';
    dom.resultsOrder.appendChild(li);
  });

  dom.resultsOverlay.classList.remove("screen--hidden");

  // Celebratory confetti — uses winner colour as the hero colour
  launchConfetti(winner.color);
}

// =====================================================================
// CONFETTI
// =====================================================================

/**
 * Spawns a brief burst of CSS-animated confetti pieces.
 * @param {string} heroColor - Winner's colour used as the dominant hue.
 */
function launchConfetti(heroColor) {
  const palette = ["#FFD700", "#ffffff", "#ff6b6b", "#4fc3f7", "#a5d6a7", heroColor];
  const container = document.createElement("div");
  container.className = "confetti-container";
  document.body.appendChild(container);

  const PIECES = 90;
  for (let i = 0; i < PIECES; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    const size = 5 + Math.random() * 7;
    const isCircle = Math.random() > 0.45;
    piece.style.cssText = [
      "left:" + (Math.random() * 100) + "%",
      "background:" + palette[Math.floor(Math.random() * palette.length)],
      "width:" + size + "px",
      "height:" + (isCircle ? size : size * 0.4 + 3) + "px",
      "border-radius:" + (isCircle ? "50%" : "2px"),
      "animation-delay:" + (Math.random() * 0.9) + "s",
      "animation-duration:" + (1.6 + Math.random() * 1.6) + "s",
    ].join(";");
    container.appendChild(piece);
  }

  // Auto-remove once all animations have finished.
  // Max piece duration = 1.6s + 1.6s = 3.2s; max delay = 0.9s → ceil at 5s.
  setTimeout(() => container.remove(), 5000);
}

// =====================================================================
// FULLSCREEN
// =====================================================================

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

// =====================================================================
// EVENT LISTENERS
// =====================================================================

dom.startBtn.addEventListener("click", () => {
  if (gameState === State.PRE_RACE) startCountdown();
});

dom.raceAgainBtn.addEventListener("click", () => {
  initRace();
});

dom.muteBtn.addEventListener("click", () => {
  SoundManager.init();
  SoundManager.toggleMute();
});

dom.fullscreenBtn.addEventListener("click", toggleFullscreen);

// Keyboard: space to start
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (gameState === State.PRE_RACE) startCountdown();
  }
});

// Pause audio when tab hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    SoundManager.stopHooves();
  } else if (gameState === State.RACING || gameState === State.FINISHING) {
    SoundManager.startHooves();
  }
});

// Handle window resize — recalculate visual positions
window.addEventListener("resize", () => {
  if (gameState === State.RACING || gameState === State.FINISHING) {
    updateHorsePositions();
  }
});

// =====================================================================
// BOOTSTRAP
// =====================================================================

window.addEventListener("DOMContentLoaded", () => {
  initRace();
});