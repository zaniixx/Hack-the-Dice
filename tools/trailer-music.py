#!/usr/bin/env python3
"""
Writes the trailer's soundtrack: a 30-second chiptune bed, cut to the shots.

Everything is synthesised with the standard library — square leads, a triangle
bass, a swept-sine kick and filtered noise — so the track is reproducible and
carries no licensing baggage for a jam submission.

    python3 tools/trailer-music.py press/trailer-music.wav
"""
import math
import struct
import sys
import wave

SR = 44100
LENGTH = 30.0
BPM = 132.0
BEAT = 60.0 / BPM
STEP = BEAT / 4           # a sixteenth

buffer = [0.0] * int(LENGTH * SR)

# A minor, which is where the game's palette already lives.
NOTE = {
    'A1': 55.00, 'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00,
    'A2': 110.0, 'C3': 130.8, 'D3': 146.8, 'E3': 164.8, 'F3': 174.6, 'G3': 196.0,
    'A3': 220.0, 'C4': 261.6, 'D4': 293.7, 'E4': 329.6, 'F4': 349.2, 'G4': 392.0,
    'A4': 440.0, 'C5': 523.3, 'E5': 659.3,
}


def mix(at, samples):
    """Add samples into the buffer at a time in seconds."""
    start = int(at * SR)
    for i, value in enumerate(samples):
        index = start + i
        if 0 <= index < len(buffer):
            buffer[index] += value


def envelope(i, total, attack=0.005, release=0.25):
    """A quick attack and an exponential tail, in samples."""
    attack_samples = max(1, int(attack * SR))
    if i < attack_samples:
        return i / attack_samples
    fade = (i - attack_samples) / max(1, total - attack_samples)
    return math.exp(-fade / max(0.03, release))


def square(freq, dur, vol, duty=0.5, release=0.25, detune=0.0):
    total = int(dur * SR)
    out = []
    for i in range(total):
        t = i / SR
        phase = (t * (freq + detune)) % 1.0
        value = 1.0 if phase < duty else -1.0
        out.append(value * vol * envelope(i, total, release=release))
    return out


def triangle(freq, dur, vol, release=0.4):
    total = int(dur * SR)
    out = []
    for i in range(total):
        phase = ((i / SR) * freq) % 1.0
        value = 4 * abs(phase - 0.5) - 1
        out.append(value * vol * envelope(i, total, release=release))
    return out


def kick(dur, vol, start_hz=150.0, end_hz=42.0):
    total = int(dur * SR)
    out = []
    phase = 0.0
    for i in range(total):
        progress = i / total
        freq = start_hz * math.pow(end_hz / start_hz, progress)
        phase += 2 * math.pi * freq / SR
        out.append(math.sin(phase) * vol * math.exp(-progress * 5.5))
    return out


def noise(dur, vol, release=0.12, tone=0.0):
    """White noise through a one-pole filter; tone 0 is bright, 1 is dull."""
    total = int(dur * SR)
    out = []
    state = 0.0
    seed = 12345
    for i in range(total):
        seed = (1103515245 * seed + 12345) % (1 << 31)
        white = (seed / (1 << 30)) - 1.0
        state = state * tone + white * (1 - tone)
        out.append(state * vol * math.exp(-(i / total) * (1 / max(0.02, release))))
    return out


# ---- Arrangement ------------------------------------------------------------
# Sections line up with the trailer's cuts: title, roll, score, breach, bosses,
# tiers, tournament, end card.

ARP = ['A3', 'C4', 'E4', 'A4', 'E4', 'C4', 'G3', 'C4']
BASS_BY_BAR = ['A1', 'A1', 'F2', 'F2', 'G2', 'G2', 'E2', 'E2']

bar_length = BEAT * 4
total_bars = int(LENGTH / bar_length) + 1

for bar in range(total_bars):
    bar_at = bar * bar_length
    if bar_at > LENGTH:
        break

    # Everything is quiet under the title card, and drops out at the end.
    if bar_at < 2.4:
        intensity = 0.35
    elif bar_at < 11.0:
        intensity = 0.8
    elif bar_at < 15.2:
        intensity = 1.0
    elif bar_at < 26.4:
        intensity = 0.9
    else:
        intensity = 0.55

    bass_note = BASS_BY_BAR[bar % len(BASS_BY_BAR)]
    mix(bar_at, triangle(NOTE[bass_note], bar_length * 0.95, 0.22 * intensity, release=0.9))

    for step in range(16):
        at = bar_at + step * STEP
        if at >= LENGTH:
            break

        # Kick on the beat, with a push on the last sixteenth of a bar.
        if step % 4 == 0:
            mix(at, kick(0.26, 0.55 * intensity))
        if step == 14 and bar % 4 == 3:
            mix(at, kick(0.18, 0.4 * intensity))

        # Hats, offbeat.
        if step % 2 == 1 and bar_at > 2.4:
            mix(at, noise(0.05, 0.07 * intensity, release=0.04, tone=0.1))

        # The lead arpeggio only runs once the game is on screen.
        if bar_at > 2.4 and bar_at < 26.4:
            note = ARP[step % len(ARP)]
            octave = 1.0 if bar % 4 < 2 else 2.0
            mix(at, square(NOTE[note] * octave, STEP * 0.9, 0.10 * intensity,
                           duty=0.25, release=0.09))
            # A second voice, slightly detuned, for width.
            mix(at, square(NOTE[note] * octave, STEP * 0.9, 0.05 * intensity,
                           duty=0.5, release=0.09, detune=1.5))

# Hits on the cuts.
for at, power in [(0.12, 0.8), (2.6, 0.5), (7.0, 0.5), (11.2, 1.0),
                  (15.4, 0.6), (19.8, 0.5), (23.2, 0.5), (26.6, 0.9)]:
    mix(at, noise(0.7 if power > 0.7 else 0.35, 0.30 * power, release=0.25, tone=0.35))
    mix(at, kick(0.5, 0.5 * power, start_hz=220, end_hz=36))

# A riser into the breach, and into the end card.
for start, end in [(9.6, 11.2), (25.4, 26.6)]:
    steps = int((end - start) / 0.06)
    for i in range(steps):
        at = start + i * 0.06
        progress = i / steps
        mix(at, noise(0.08, 0.05 + 0.10 * progress, release=0.05, tone=0.6 - 0.5 * progress))
        mix(at, square(220 + 660 * progress, 0.07, 0.05 + 0.05 * progress, duty=0.5, release=0.04))

# The last chord, left to ring.
for note, vol in [('A2', 0.16), ('C4', 0.11), ('E4', 0.09), ('A4', 0.07)]:
    mix(26.6, square(NOTE[note], 3.2, vol, duty=0.5, release=1.6))

# ---- Master -----------------------------------------------------------------

peak = max(abs(value) for value in buffer) or 1.0
gain = 0.89 / peak

with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'trailer-music.wav', 'wb') as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(SR)
    frames = bytearray()
    for value in buffer:
        # Soft clip, so the hits stay loud without crackling.
        scaled = math.tanh(value * gain * 1.15)
        frames += struct.pack('<h', int(scaled * 32000))
    out.writeframes(bytes(frames))

print(f'wrote {sys.argv[1] if len(sys.argv) > 1 else "trailer-music.wav"}: {LENGTH:.0f}s, peak {peak:.2f}')
