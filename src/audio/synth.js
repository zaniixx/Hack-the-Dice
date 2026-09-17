/**
 * A tiny Web Audio synth: one oscillator voice and one noise voice, both fired
 * and forgotten. There are no samples in this game — every sound is generated,
 * which keeps the whole thing a single page with no assets.
 *
 * The context cannot start until the player interacts with the document, so
 * `initAudio` is called from the first pointer or key event and is safe to call
 * repeatedly.
 */
import { settings } from '../core/settings.js';

const MASTER_VOLUME = 0.95;
/** Music sits under the sound effects, never over them. */
const MUSIC_VOLUME = 0.30;
/** Near-silence: gain ramps must stay above zero to be exponential. */
const SILENT = 0.0001;

let context = null;
let master = null;
let music = null;
let noiseBuffer = null;
const lastPlayed = {};

/**
 * Start the audio graph.
 *
 * Pass a context to build the graph on that instead of a live one — an
 * OfflineAudioContext, say, which is how tools/audio-test.html renders the
 * music and measures it without needing a sound card.
 */
export function initAudio(customContext = null) {
  if (context && !customContext) {
    if (context.state === 'suspended') context.resume();
    return;
  }
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    context = customContext || new AudioCtor();

    master = context.createGain();
    master.connect(context.destination);

    // A separate bus, so the soundtrack can be quiet without muffling the game.
    music = context.createGain();
    music.connect(context.destination);
    setMuted();

    // One second of white noise, reused by every percussive sound.
    const length = context.sampleRate;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  } catch {
    context = null; // no audio in this browser or context: stay silent
  }
}

/**
 * Put the volumes on the two buses.
 *
 * Mute stays a switch of its own rather than a volume of zero: the button in
 * the top bar is a panic button, and it should not have to remember and put
 * back the levels somebody chose in the settings.
 *
 * @param {boolean} [muted] silence both buses regardless of the saved setting —
 *        how tools/audio-test.html renders with and without sound.
 */
export function setMuted(muted = settings.muted) {
  if (master) master.gain.value = muted ? 0 : MASTER_VOLUME * settings.sfxVolume;
  if (music) music.gain.value = muted ? 0 : MUSIC_VOLUME * settings.musicVolume;
}

/** The saved volumes, after the settings screen has changed one. */
export const applyVolumes = () => setMuted();

/** True once the context exists and sound would actually be heard. */
export const audioReady = () => !!context && !settings.muted;

/** The audio clock, for scheduling a sequence ahead of time. */
export const audioTime = () => (context ? context.currentTime : 0);

/** The context itself, for offline rendering in tests. */
export const audioContext = () => context;

/** Which bus a voice plays on. */
const busFor = bus => (bus === 'music' ? music : master);

/** True when a sound would actually be heard. */
function audible() {
  return context && !settings.muted;
}

/**
 * Rate-limit a sound that can be triggered many times per frame — dice
 * clattering into each other, for instance. Returns false when the caller
 * should skip this one.
 */
export function throttled(key, ms) {
  const now = performance.now();
  if (lastPlayed[key] && now - lastPlayed[key] < ms) return false;
  lastPlayed[key] = now;
  return true;
}

/**
 * A pitched blip.
 *
 * @param {number} freq   starting frequency in Hz
 * @param {number} dur    seconds
 * @param {string} type   oscillator waveform
 * @param {number} vol    peak gain
 * @param {number} slide  Hz to bend towards over the note's life
 * @param {number} delay  seconds to wait before playing
 * @param {string} bus    'sfx' (default) or 'music'
 */
export function tone(freq, dur, type = 'square', vol = 0.15, slide = 0, delay = 0, bus = 'sfx') {
  if (!audible()) return;
  const start = context.currentTime + delay;

  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), start + dur);
  }

  gain.gain.setValueAtTime(SILENT, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(SILENT, start + dur);

  osc.connect(gain);
  gain.connect(busFor(bus));
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

/**
 * A burst of filtered noise: impacts, static, explosions.
 *
 * @param {number} dur    seconds
 * @param {number} vol    peak gain
 * @param {number} freq   filter cutoff or center in Hz
 * @param {number} delay  seconds to wait before playing
 * @param {string} type   biquad filter type
 * @param {string} bus    'sfx' (default) or 'music'
 */
export function noise(dur, vol = 0.2, freq = 2000, delay = 0, type = 'lowpass', bus = 'sfx') {
  if (!audible()) return;
  const start = context.currentTime + delay;

  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.playbackRate.value = 0.8 + Math.random() * 0.4;

  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;

  const gain = context.createGain();
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(SILENT, start + dur);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(busFor(bus));
  source.start(start, Math.random() * 0.5); // random offset: no audible loop
  source.stop(start + dur + 0.03);
}
