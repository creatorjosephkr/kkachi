import type { SoundPreset } from '../../shared/types';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

function playTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  startOffset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = 'sine'
): void {
  const start = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, start);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, start + duration * 0.7);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export async function playAlertSound(
  preset: SoundPreset = 'kkachi',
  volume = 0.75
): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch {
    return;
  }

  const vol = Math.max(0.05, Math.min(1, volume)) * 0.35;

  if (preset === 'kkachi') {
    // Cheerful two-note magpie-inspired call + bright bell overtone
    playTone(ctx, 1046.5, 1318.5, 0, 0.14, vol, 'triangle');
    playTone(ctx, 1318.5, 1567.98, 0.16, 0.24, vol * 0.9, 'sine');
    playTone(ctx, 2093.0, 2093.0, 0.16, 0.22, vol * 0.25, 'sine');
    return;
  }

  if (preset === 'chime') {
    // Clean crystal triad arpeggio
    playTone(ctx, 783.99, 783.99, 0, 0.22, vol * 0.8, 'sine');
    playTone(ctx, 987.77, 987.77, 0.1, 0.24, vol * 0.85, 'sine');
    playTone(ctx, 1174.66, 1174.66, 0.2, 0.34, vol, 'sine');
    return;
  }

  // 'soft': Warm gentle two-tap notification
  playTone(ctx, 587.33, 587.33, 0, 0.18, vol * 0.7, 'sine');
  playTone(ctx, 880.0, 880.0, 0.11, 0.28, vol * 0.65, 'sine');
}
