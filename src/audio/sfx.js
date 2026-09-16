/**
 * The game's sound vocabulary. Every call site says what happened
 * (`sfx.breach()`), never how it sounds, so the palette can be retuned here
 * without touching game code.
 */
import { rand } from '../core/random.js';
import { tone, noise, throttled } from './synth.js';

export const sfx = {
  /** Rising blip per scoring die, capped so long pools stay in range. */
  tick(index) {
    tone(330 * Math.pow(2, Math.min(index, 24) / 12), 0.07, 'square', 0.08);
  },

  /** A die landing. `strength` is 0..1 from the impact speed. */
  impact(strength) {
    if (!throttled('impact', 35)) return;
    noise(0.09, 0.22 * strength + 0.05, 650);
    tone(70 + rand(0, 30), 0.1, 'sine', 0.3 * strength + 0.05, -30);
  },

  /** Dice knocking together or glancing off a wall. */
  clack() {
    if (!throttled('clack', 40)) return;
    noise(0.03, 0.08, 3200, 0, 'bandpass');
  },

  /** The shake of a handful of dice being thrown. */
  rattle() {
    for (let i = 0; i < 7; i++) {
      noise(0.03, 0.07, 2200 + Math.random() * 2400, i * 0.045 + Math.random() * 0.02, 'bandpass');
    }
  },

  /** Keyclick under the typing console log. */
  key() {
    if (!throttled('key', 45)) return;
    noise(0.012, 0.025, 5000, 0, 'highpass');
  },

  /** A multiplier landing on the scoreboard; `isTimes` for ×Mult. */
  mult(isTimes) {
    tone(isTimes ? 660 : 520, 0.1, 'triangle', 0.13, isTimes ? 500 : 220);
  },

  /** Payoff chord, thicker the closer the hit came to killing the firewall. */
  chord(level) {
    const notes = [220, 261.63, 329.63, 392, 493.88, 587.33];
    const count = 3 + level;
    for (let i = 0; i < count; i++) {
      tone(notes[i], 0.45 + level * 0.18, 'sawtooth', 0.045, 0, i * 0.045);
      tone(notes[i] / 2, 0.55 + level * 0.15, 'triangle', 0.06, 0, i * 0.045);
    }
  },

  /** Hacking power connecting with the firewall. */
  hit() {
    noise(0.16, 0.32, 1300);
    tone(170, 0.16, 'square', 0.1, -110);
  },

  /** The firewall coming apart. */
  breach() {
    noise(0.45, 0.45, 1800);
    tone(300, 0.38, 'square', 0.12, -260);
    noise(0.25, 0.3, 500, 0.06);
  },

  /** Scrap collected, or an item bought or sold. */
  coin() {
    tone(988, 0.06, 'square', 0.09);
    tone(1319, 0.14, 'square', 0.09, 0, 0.06);
  },

  /** Rejection: not enough scrap, no charges, nothing to do. */
  buzz() {
    tone(110, 0.18, 'sawtooth', 0.1);
    tone(117, 0.18, 'sawtooth', 0.1);
  },

  /** An ability firing, or moving on to the next node. */
  zap() {
    tone(200, 0.16, 'sawtooth', 0.08, 1200);
  },

  /** Locking (high) or unlocking (low) a die. */
  lock(locked) {
    tone(locked ? 880 : 440, 0.05, 'square', 0.07);
  },

  /** Security alert: a boss coming online, or a trace completing. */
  alarm() {
    for (let i = 0; i < 4; i++) tone(880, 0.16, 'square', 0.09, -320, i * 0.28);
  },

  /** Startup jingle. */
  boot() {
    [262, 330, 392, 523, 659].forEach((freq, i) => tone(freq, 0.14, 'square', 0.07, 0, i * 0.07));
  },
};
