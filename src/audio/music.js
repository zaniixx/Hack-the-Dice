/**
 * The soundtrack: a step sequencer built on the same two voices as the sound
 * effects, playing on its own quieter bus.
 *
 * Nothing is sampled or streamed. The sequencer schedules a little ahead of the
 * audio clock so the timing does not depend on how busy the game loop is.
 *
 * Two things shape what comes out, and both exist because the first version of
 * this was one bar per mood on an endless loop — under two seconds of material
 * that a player heard several hundred times a run.
 *
 * The first is length. A mood is now an eight-bar chord progression rather than
 * a single bar, with seven melodic motifs stepping against it. Seven and eight
 * being coprime, a bar — its chord and the phrase over it together — does not
 * come back for fifty-six bars: between a minute and a half and two and a half
 * minutes depending on the tempo, against the two seconds a one-bar loop gave
 * you.
 *
 * The second is intensity. The arrangement is a stack of layers — pad, kick,
 * bass, hats, melody, double time — each of which switches in at its own
 * threshold, so the same progression plays sparse while a node is going well
 * and full while it is not. game/soundtrack.js works out the number from what
 * is actually happening in the run.
 *
 * Deciding what to play is kept pure and separate from making the sound, the
 * same way moodFor() is, so the arrangement can be reasoned about and tested
 * without an audio context anywhere near it.
 */
import { tone, noise, audioTime, audioReady } from './synth.js';

/** A minor, the key the game's chord stings already use. */
const NOTE = {
  A1: 55.00, B1: 61.74,
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.0, B2: 123.5,
  C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6, G3: 196.0, A3: 220.0, B3: 246.9,
  C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392.0, A4: 440.0, B4: 493.9,
  C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784.0, A5: 880.0,
};

const STEPS_PER_BAR = 16;

/**
 * The chords the progressions are built from, all diatonic to A minor.
 *
 * `tones` is the melody's vocabulary for that bar — the chord spread over two
 * octaves — so a motif written as scale degrees lands in key whichever chord it
 * is played over. That is what lets one set of motifs serve every mood.
 */
const CHORDS = {
  Am: { bass: 'A1', pad: ['A3', 'E4'], tones: ['A3', 'C4', 'E4', 'A4', 'C5', 'E5'] },
  Dm: { bass: 'D2', pad: ['D3', 'A3'], tones: ['D3', 'F3', 'A3', 'D4', 'F4', 'A4'] },
  Em: { bass: 'E2', pad: ['E3', 'B3'], tones: ['E3', 'G3', 'B3', 'E4', 'G4', 'B4'] },
  E:  { bass: 'E2', pad: ['E3', 'B3'], tones: ['E3', 'A3', 'B3', 'E4', 'A4', 'B4'] },
  F:  { bass: 'F2', pad: ['F3', 'C4'], tones: ['F3', 'A3', 'C4', 'F4', 'A4', 'C5'] },
  G:  { bass: 'G2', pad: ['G3', 'D4'], tones: ['G3', 'B3', 'D4', 'G4', 'B4', 'D5'] },
  C:  { bass: 'C2', pad: ['C3', 'G3'], tones: ['C3', 'E3', 'G3', 'C4', 'E4', 'G4'] },
  // The diatonic diminished, for the moods that want something unresolved,
  // and a seventh for the two that want somewhere to rest. Eight chords
  // rather than seven is what lets every progression below use each of them
  // exactly once, which is what keeps two bars from colliding early.
  Bd: { bass: 'B1', pad: ['D3', 'F3'], tones: ['B2', 'D3', 'F3', 'B3', 'D4', 'F4'] },
  Am7: { bass: 'A1', pad: ['C4', 'G4'], tones: ['A3', 'C4', 'E4', 'G4', 'C5', 'E5'] },
};

/**
 * Melodic motifs, written as [step, degree] against the bar's chord.
 *
 * Seven of them against an eight-bar progression, and that is the whole
 * anti-repetition trick: seven and eight are coprime, so a bar — its chord and
 * the phrase over it together — does not come back for fifty-six of them.
 *
 * Seven rather than six because six shares a factor with eight. An earlier
 * version used six and a multiplied index, and both parts were wrong: the
 * multiplier made the phrase reach for only two of the six motifs, and a chord
 * came back with the same phrase over it after twenty-five bars.
 */
const MOTIFS = [
  [[0, 0], [3, 2], [6, 4], [10, 3], [13, 2]],
  [[2, 4], [5, 3], [8, 2], [11, 4], [14, 5]],
  [[0, 2], [4, 4], [7, 5], [12, 3]],
  [[1, 3], [6, 2], [9, 4], [11, 5], [15, 4]],
  [[0, 4], [2, 3], [5, 4], [8, 5], [10, 4], [13, 2]],
  [[3, 1], [7, 3], [11, 2], [15, 0]],
  [[0, 5], [4, 3], [6, 2], [9, 3], [12, 4], [14, 5]],
];

/** Bass rhythms, rotated by bar so the low end is not a metronome either. */
const BASS_RHYTHMS = [
  [0, 6, 11],
  [0, 8],
  [0, 3, 8, 14],
  [0, 7, 10],
];

/**
 * What each layer costs in intensity to switch on.
 *
 * These are the whole dynamic system. A node that is going well sits around
 * 0.45 and gets pad, kick and bass; one execute from failing pushes past 0.85
 * and everything is playing.
 */
const LAYERS = {
  pad: 0,
  kick: 0.18,
  bass: 0.32,
  hat: 0.46,
  melody: 0.56,
  fourOnFloor: 0.7,
  doubleTime: 0.86,
};

/**
 * A mood: a tempo, eight bars of harmony, and where it sits by default.
 *
 * `base` is the intensity used when nothing has asked for one — what the mood
 * sounds like at rest, and what an offline render gets.
 */
const MOODS = {
  /** The start screen: barely there, a pulse and a distant phrase. */
  menu: {
    bpm: 88,
    progression: ['Am', 'C', 'G', 'Em', 'F', 'Dm', 'Am7', 'E'],
    lead: 0.10,
    base: 0.30,
  },

  /** An ordinary node: steady, not in the way. */
  node: {
    bpm: 112,
    progression: ['Am', 'F', 'C', 'G', 'Dm', 'Em', 'Bd', 'E'],
    lead: 0.11,
    base: 0.50,
  },

  /** A boss node: more movement under it, and a cadence that keeps reopening. */
  boss: {
    bpm: 128,
    progression: ['Am', 'G', 'F', 'E', 'Dm', 'Bd', 'Em', 'C'],
    lead: 0.13,
    base: 0.72,
  },

  /** The market: warmer, slower, nothing is chasing you. */
  shop: {
    bpm: 96,
    progression: ['C', 'G', 'Am7', 'Em', 'F', 'Dm', 'Am', 'E'],
    lead: 0.10,
    base: 0.34,
  },

  /** One execute left, or a leak still draining: all pulse, little melody. */
  danger: {
    bpm: 140,
    progression: ['Em', 'F', 'Am', 'E', 'Dm', 'Bd', 'G', 'C'],
    lead: 0.12,
    base: 0.90,
  },
};

const PHRASE_BARS = 8;

// ---- Planning a bar ---------------------------------------------------------

/**
 * Which motif a bar gets: straight down the list, one per bar.
 *
 * It only gets to be this simple because the two lengths are coprime. Seven
 * motifs stepping against an eight-bar progression means bar 8 takes a
 * different phrase from bar 0 over the same chord, bar 16 a different one
 * again, and the two do not line up until bar 56.
 */
const motifFor = bar => MOTIFS[bar % MOTIFS.length];

const on = (intensity, layer) => intensity >= LAYERS[layer];

/**
 * Everything that happens in one bar, as data.
 *
 * Pure: same mood, bar and intensity in, same events out, no audio context
 * involved. Exported because that makes the arrangement testable — that the
 * harmony really does run eight bars, that a bar's melody changes the next time
 * its chord comes round, and that the layers arrive in the right order.
 *
 * @returns {{bpm: number, chord: string, pad: string[], events: object[]}}
 */
export function planBar(moodName, bar, intensity) {
  const mood = MOODS[moodName] || MOODS.node;
  const chordName = mood.progression[bar % mood.progression.length];
  const chord = CHORDS[chordName];
  const events = [];

  // The bed, held under the whole bar.
  events.push({ step: 0, voice: 'pad', notes: chord.pad });

  if (on(intensity, 'kick')) {
    const beats = on(intensity, 'fourOnFloor') ? [0, 4, 8, 12] : [0, 8];
    for (const step of beats) events.push({ step, voice: 'kick' });
  }

  if (on(intensity, 'bass')) {
    const rhythm = BASS_RHYTHMS[bar % BASS_RHYTHMS.length];
    for (const step of rhythm) events.push({ step, voice: 'bass', note: chord.bass });
  } else {
    // Below the bass layer the root still lands on the downbeat, so the chord
    // change is audible even when almost nothing else is playing.
    events.push({ step: 0, voice: 'bass', note: chord.bass });
  }

  if (on(intensity, 'hat')) {
    const steps = on(intensity, 'doubleTime')
      ? [1, 3, 5, 7, 9, 11, 13, 15]
      : [2, 6, 10, 14];
    for (const step of steps) events.push({ step, voice: 'hat' });
  }

  if (on(intensity, 'melody')) {
    const octave = on(intensity, 'doubleTime') ? 1 : 0;
    for (const [step, degree] of motifFor(bar)) {
      const index = Math.min(chord.tones.length - 1, degree + octave);
      events.push({ step, voice: 'lead', note: chord.tones[index] });
    }
  }

  // A fill on the last bar of the phrase, so the turnaround is heard as one.
  if (bar % PHRASE_BARS === PHRASE_BARS - 1 && on(intensity, 'hat')) {
    for (let step = 12; step < 16; step++) events.push({ step, voice: 'fill', at: step - 12 });
  }

  return { bpm: mood.bpm, chord: chordName, pad: chord.pad, events };
}

/**
 * The frequency of a note name, or undefined.
 *
 * Exported so a test can prove every note the chords can ask for actually
 * exists. A misspelt name does not throw — it reaches the synth as undefined
 * and that voice simply never sounds, which is the one class of mistake here
 * that is completely silent in every sense.
 */
export const frequencyOf = note => NOTE[note];

/** The eight-bar phrase a mood plays, for tests and for reasoning about it. */
export const progressionOf = moodName => (MOODS[moodName] || MOODS.node).progression;

/** Which layers are audible at an intensity, in the order they switch on. */
export const layersAt = intensity =>
  Object.keys(LAYERS).filter(layer => on(intensity, layer));

// ---- Playing it -------------------------------------------------------------

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

/** Where the arrangement is now, and where the run wants it. */
let intensity = MOODS.menu.base;
let targetIntensity = null;

const pattern = () => MOODS[mood] || MOODS.node;
const stepDuration = () => 60 / pattern().bpm / 4;

/** The plan for the current bar, rebuilt only when something about it changes. */
let plan = null;
let planKey = '';
function currentPlan() {
  const key = mood + ':' + bar + ':' + Math.round(intensity * 20);
  if (key !== planKey) {
    plan = planBar(mood, bar, intensity);
    planKey = key;
  }
  return plan;
}

function playEvent(event, delay) {
  /*
   * Intensity is in the volumes as well as in which layers play.
   *
   * Switching layers on alone was not enough to hear: measured against each
   * other, an ordinary node and its last execute came out within about a
   * decibel, because the pad and the bass carry most of the energy and neither
   * was listening. Every voice now leans on intensity, by a different amount —
   * the drums hardest, the pad least, so a quiet passage thins out rather than
   * simply fading.
   */
  const drums = 0.62 + 0.45 * intensity;
  const body = 0.72 + 0.42 * intensity;
  const bed = 0.82 + 0.3 * intensity;

  switch (event.voice) {
    case 'pad': {
      const length = stepDuration() * STEPS_PER_BAR * 0.95;
      for (const note of event.notes) {
        tone(NOTE[note], length, 'triangle', 0.075 * bed, 0, delay, 'music');
      }
      return;
    }
    case 'kick':
      tone(150, 0.18, 'sine', 0.66 * drums, -110, delay, 'music');
      noise(0.05, 0.16 * drums, 900, delay, 'lowpass', 'music');
      return;
    case 'hat':
      noise(0.03, 0.08 * drums, 6000, delay, 'highpass', 'music');
      return;
    case 'bass':
      tone(NOTE[event.note], stepDuration() * 3.4, 'triangle', 0.42 * body, 0, delay, 'music');
      return;
    case 'lead':
      tone(NOTE[event.note], stepDuration() * 1.6, 'square', pattern().lead * body, 0, delay, 'music');
      return;
    case 'fill':
      noise(0.06, 0.12, 3200 + event.at * 1200, delay, 'bandpass', 'music');
      if (event.at === 3) tone(220, 0.12, 'square', 0.18, 180, delay, 'music');
      return;
    default:
  }
}

function playStep(index, delay) {
  voices += 1;
  for (const event of currentPlan().events) {
    if (event.step === index) playEvent(event, delay);
  }
}

/**
 * Cross the bar line: take any pending mood, and ease towards the intensity the
 * run is asking for.
 *
 * Eased rather than set, and only at the bar line, because intensity moves
 * whenever the firewall does — several times a second during an execute. Jumped
 * to directly it would switch layers on and off mid-phrase, which is audible as
 * a fault rather than as the music responding.
 */
function crossBarLine() {
  step = 0;
  bar += 1;

  if (pendingMood) {
    mood = pendingMood;
    pendingMood = null;
    if (targetIntensity === null) intensity = pattern().base;
  }

  if (targetIntensity !== null) {
    intensity += (targetIntensity - intensity) * 0.34;
    if (Math.abs(targetIntensity - intensity) < 0.02) intensity = targetIntensity;
  }
}

function schedule() {
  if (!audioReady()) return;

  const now = audioTime();
  if (!nextStepTime) nextStepTime = now + 0.08;

  while (nextStepTime < now + SCHEDULE_AHEAD) {
    playStep(step, Math.max(0, nextStepTime - now));

    step += 1;
    if (step >= STEPS_PER_BAR) crossBarLine();
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

  /*
   * Take the requested intensity outright rather than easing towards it.
   *
   * The easing exists so the live arrangement does not switch layers in the
   * middle of a phrase, and it happens at the bar line — which an offline
   * render never crosses, because it writes every bar in one go. Leaving that
   * out meant a render came out at whatever intensity the last one finished
   * on, so the file said nothing about the intensity it was asked for. That is
   * a bad enough failure in a tool whose only job is to be listened to.
   */
  intensity = targetIntensity === null ? pattern().base : targetIntensity;

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

/**
 * How hard the arrangement should be working, 0 to 1.
 *
 * Applied at the bar line rather than here; see crossBarLine(). Passing null
 * hands control back to the mood's own resting level.
 */
export function setIntensity(next) {
  targetIntensity = next === null ? null : Math.min(1, Math.max(0, next));
}

/** The mood currently playing, for tests and for the menu readout. */
export const currentMood = () => mood;

/** What the arrangement is actually at, which lags what was asked for. */
export const currentIntensity = () => intensity;

export const MOOD_NAMES = Object.keys(MOODS);

/** How many steps have been scheduled since the page loaded. */
export const stepsPlayed = () => voices;
