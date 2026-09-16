/**
 * The soundtrack: a step sequencer built on the same two voices as the sound
 * effects, playing on its own quieter bus.
 *
 * Nothing is sampled or streamed. Each mood is a bar of sixteenths — which
 * steps get a kick, a hat, a bass note, an arpeggio note — and the sequencer
 * schedules a little ahead of the audio clock so the timing does not depend on
 * how busy the game loop is.
 *
 * Moods change at the end of a bar rather than immediately, so a boss walking
 * on does not chop the music in half.
 */
import { tone, noise, audioTime, audioReady } from './synth.js';

/** A minor, the key the game's chord stings already use. */
const NOTE = {
  A1: 55.00, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00,
  A2: 110.0, C3: 130.8, E3: 164.8, F3: 174.6, G3: 196.0,
  A3: 220.0, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392.0,
  A4: 440.0, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3,
};

const STEPS_PER_BAR = 16;

/**
 * One bar of music.
 *
 *   kick/hat   step indices that get a drum
 *   bass       note per step index, or a two-entry array to alternate by bar
 *   arp        melody notes by step index
 *   pad        two notes held under the whole bar, the bed of the track
 *   lead       how loud the arpeggio sits
 */
const MOODS = {
  /** The start screen: barely there, just a pulse and a distant arpeggio. */
  menu: {
    bpm: 88,
    kick: [0],
    hat: [],
    bass: { 0: ['A2', 'F2'] },
    arp: { 4: 'E4', 10: 'A4', 14: 'C5' },
    pad: ['A3', 'E4'],
    lead: 0.1,
  },

  /** An ordinary node: steady, not in the way. */
  node: {
    bpm: 112,
    kick: [0, 8],
    hat: [2, 6, 10, 14],
    bass: { 0: ['A2', 'A2'], 8: ['A2', 'G2'] },
    arp: { 3: 'A4', 7: 'C5', 11: 'E4', 15: 'A4' },
    pad: ['A3', 'C4'],
    lead: 0.11,
  },

  /** A boss node: lower, faster, and a tritone that will not resolve. */
  boss: {
    bpm: 128,
    kick: [0, 4, 8, 12],
    hat: [2, 3, 6, 7, 10, 11, 14, 15],
    bass: { 0: ['A1', 'A1'], 6: ['A1', 'G2'], 8: ['G2', 'F2'], 14: ['F2', 'E2'] },
    arp: { 2: 'A4', 10: 'D5', 13: 'E5' },
    pad: ['A3', 'D4'],
    lead: 0.13,
  },

  /** The market: warmer, slower, nothing is chasing you. */
  shop: {
    bpm: 96,
    kick: [0],
    hat: [6, 14],
    bass: { 0: ['C2', 'G2'], 8: ['E2', 'C2'] },
    arp: { 2: 'C4', 6: 'E4', 10: 'G4', 14: 'B4' },
    pad: ['C4', 'G4'],
    lead: 0.1,
  },

  /** One execute left, or a leak still draining: all pulse, no melody. */
  danger: {
    bpm: 140,
    kick: [0, 4, 8, 12],
    hat: [1, 3, 5, 7, 9, 11, 13, 15],
    bass: { 0: ['E2', 'E2'], 4: ['E2', 'E2'], 8: ['F2', 'F2'], 12: ['F2', 'F2'] },
    arp: { 15: 'E5' },
    pad: ['E3', 'A3'],
    lead: 0.12,
  },
};

/** How far ahead of the clock steps are scheduled, and how often we look. */
const SCHEDULE_AHEAD = 0.12;
const TICK_MS = 25;

let timer = null;
/** Voices handed to the synth, so a test can tell whether music is playing. */
let voices = 0;
let mood = 'menu';
let pendingMood = null;
let step = 0;
let bar = 0;
let nextStepTime = 0;

const pattern = () => MOODS[mood] || MOODS.node;
const stepDuration = () => 60 / pattern().bpm / 4;

/** Bass note for a step, alternating between bars where the pattern says to. */
function noteAt(map, index) {
  const value = map[index];
  if (!value) return null;
  return Array.isArray(value) ? value[bar % value.length] : value;
}

function playStep(index, delay) {
  const bars = pattern();
  voices += 1;

  // The bed: two held notes across the whole bar, under everything else.
  if (index === 0 && bars.pad) {
    const length = stepDuration() * STEPS_PER_BAR * 0.95;
    for (const note of bars.pad) {
      tone(NOTE[note], length, 'triangle', 0.075, 0, delay, 'music');
    }
  }

  if (bars.kick.includes(index)) {
    tone(150, 0.18, 'sine', 0.66, -110, delay, 'music');
    noise(0.05, 0.16, 900, delay, 'lowpass', 'music');
  }
  if (bars.hat.includes(index)) {
    noise(0.03, 0.08, 6000, delay, 'highpass', 'music');
  }

  const bassNote = noteAt(bars.bass, index);
  if (bassNote) {
    tone(NOTE[bassNote], stepDuration() * 3.4, 'triangle', 0.42, 0, delay, 'music');
  }

  const arpNote = noteAt(bars.arp, index);
  if (arpNote) {
    tone(NOTE[arpNote], stepDuration() * 1.6, 'square', bars.lead, 0, delay, 'music');
  }

  // A fill at the end of every fourth bar, so a loop does not feel like one.
  if (bar % 4 === 3 && index >= 13) {
    noise(0.06, 0.12, 3200 + (index - 13) * 1200, delay, 'bandpass', 'music');
    if (index === 15) tone(220, 0.12, 'square', 0.18, 180, delay, 'music');
  }
}

function schedule() {
  if (!audioReady()) return;

  const now = audioTime();
  if (!nextStepTime) nextStepTime = now + 0.08;

  while (nextStepTime < now + SCHEDULE_AHEAD) {
    playStep(step, Math.max(0, nextStepTime - now));

    step += 1;
    if (step >= STEPS_PER_BAR) {
      step = 0;
      bar += 1;
      // A new mood waits for the bar line, so nothing is cut in half.
      if (pendingMood) {
        mood = pendingMood;
        pendingMood = null;
      }
    }
    nextStepTime += stepDuration();
  }
}

/**
 * Schedule whole bars at once, starting `startDelay` seconds from now.
 *
 * The live sequencer schedules a fraction of a second ahead; this is the same
 * music written out in one go, for rendering offline.
 */
export function renderBars(count = 4, startDelay = 0) {
  // Nothing is mid-phrase here, so a requested mood takes effect at once.
  if (pendingMood) {
    mood = pendingMood;
    pendingMood = null;
  }

  let at = startDelay;
  for (let barIndex = 0; barIndex < count; barIndex++) {
    bar = barIndex;
    for (let index = 0; index < STEPS_PER_BAR; index++) {
      playStep(index, at);
      at += stepDuration();
    }
  }
  return at;
}

/** Begin playing. Safe to call more than once. */
export function startMusic() {
  if (timer) return;
  nextStepTime = 0;
  timer = setInterval(schedule, TICK_MS);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
  nextStepTime = 0;
}

/**
 * Ask for a mood. It takes effect at the next bar; `'silence'` stops the
 * sequencer outright, for when a run ends.
 */
export function setMood(next) {
  if (next === 'silence') {
    stopMusic();
    return;
  }
  if (!MOODS[next]) return;

  startMusic();
  if (next === mood) {
    pendingMood = null;
    return;
  }
  pendingMood = next;
}

/** The mood currently playing, for tests and for the menu readout. */
export const currentMood = () => mood;

export const MOOD_NAMES = Object.keys(MOODS);

/** How many steps have been scheduled since the page loaded. */
export const stepsPlayed = () => voices;
