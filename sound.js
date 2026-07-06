/**
 * sound.js
 * --------
 * Marimba tap (sampler #7): a warm wooden xylophone note — fundamental
 * sine plus a quick 3.9x partial for the "wood bar" attack. A tiny
 * random pitch variation keeps repeated taps from feeling mechanical.
 * Synthesized live via Web Audio — no audio files, works offline.
 */

let audioCtx = null;
let soundOn = true;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function envGain(ctx, peak, t0, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  return g;
}

function softTap() {
  if (!soundOn) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const base = 440 * (1 + (Math.random() * 0.05 - 0.025)); // ±2.5% wander

    const fundamental = ctx.createOscillator();
    fundamental.frequency.setValueAtTime(base, now);
    fundamental.connect(envGain(ctx, 0.07, now, 0.003, 0.22)).connect(ctx.destination);

    const partial = ctx.createOscillator(); // the woody "knock" of the bar
    partial.frequency.setValueAtTime(base * 3.9, now);
    partial.connect(envGain(ctx, 0.02, now, 0.003, 0.06)).connect(ctx.destination);

    fundamental.start(now); fundamental.stop(now + 0.25);
    partial.start(now); partial.stop(now + 0.08);
  } catch (e) {
    // audio may be blocked until a user gesture — fail silently
  }
}

function toggleSound() {
  soundOn = !soundOn;
  const btn = document.getElementById('soundToggle');
  if (btn) {
    btn.textContent = soundOn ? '音' : '静';
    btn.classList.toggle('muted', !soundOn);
  }
  if (soundOn) softTap();
}
