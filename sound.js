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

// ---------------- read-aloud (Web Speech API) ----------------
// Uses the on-device Japanese voice (Kyoko on iOS) — free, offline.
// We always speak the kana reading, never the kanji, so multi-reading
// kanji can't be mispronounced. Respects the 音/静 toggle.

let jaVoice = null;

function pickJaVoice() {
  try {
    const voices = window.speechSynthesis.getVoices();
    jaVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ja')) || null;
  } catch (e) { /* ignore */ }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickJaVoice();
  try { window.speechSynthesis.addEventListener('voiceschanged', pickJaVoice); } catch (e) { /* ignore */ }
}

function speakWord(text) {
  if (!soundOn || !text) return;
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // don't queue up taps
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.rate = 0.9;   // a touch slower — this is a learning app
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) { /* no voice available — stay silent */ }
}
