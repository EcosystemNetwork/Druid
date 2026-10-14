// Procedural Web Audio: every sound is synthesized, so the game ships no audio files.

let ctx = null;
let master = null;
let muted = false;
let musicTimer = null;
let noiseBuf = null;
const last = {};

try {
  muted = localStorage.getItem("sherwood.muted") === "1";
} catch {}

export function initAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.45;
  master.connect(ctx.destination);
}

export const isMuted = () => muted;

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.45;
  try {
    localStorage.setItem("sherwood.muted", muted ? "1" : "0");
  } catch {}
  return muted;
}

function tone(freq, dur, { type = "sine", vol = 0.2, slide = 0, delay = 0, attack = 0.005 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, { vol = 0.2, freq = 1200, q = 0.8, type = "bandpass", delay = 0, slide = 0 } = {}) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

// Drops repeats of the same sound inside `ms` so big fights don't clip.
function busy(key, ms) {
  const now = performance.now();
  if (last[key] && now - last[key] < ms) return true;
  last[key] = now;
  return false;
}

export const sfx = {
  bow() {
    if (busy("bow", 40)) return;
    noise(0.08, { vol: 0.22, freq: 2600, slide: 0.4 });
    tone(170, 0.12, { type: "triangle", vol: 0.14, slide: 0.6 });
  },
  swing() {
    if (busy("swing", 50)) return;
    noise(0.18, { vol: 0.2, freq: 500, q: 0.6, slide: 3 });
  },
  magic() {
    if (busy("magic", 50)) return;
    tone(620, 0.25, { vol: 0.1, slide: 1.8 });
    tone(930, 0.2, { type: "triangle", vol: 0.05, slide: 1.5, delay: 0.03 });
  },
  note() {
    const n = [523, 587, 659, 784, 880][(Math.random() * 5) | 0];
    tone(n, 0.3, { type: "triangle", vol: 0.13 });
    tone(n * 2, 0.15, { vol: 0.04 });
  },
  hit() {
    if (busy("hit", 30)) return;
    noise(0.07, { vol: 0.28, freq: 900, q: 1 });
    tone(120, 0.1, { type: "square", vol: 0.05, slide: 0.5 });
  },
  crit() {
    if (busy("crit", 40)) return;
    noise(0.1, { vol: 0.32, freq: 3000 });
    tone(880, 0.12, { type: "square", vol: 0.05, slide: 0.5 });
  },
  hurt() {
    tone(220, 0.25, { type: "sawtooth", vol: 0.13, slide: 0.5 });
    noise(0.15, { vol: 0.18, freq: 500 });
  },
  kill() {
    if (busy("kill", 50)) return;
    tone(300, 0.18, { type: "triangle", vol: 0.11, slide: 0.4 });
  },
  coin() {
    if (busy("coin", 45)) return;
    tone(1320, 0.07, { type: "square", vol: 0.04 });
    tone(1760, 0.12, { type: "square", vol: 0.04, delay: 0.06 });
  },
  dodge() {
    noise(0.2, { vol: 0.14, freq: 400, slide: 2.5, type: "lowpass" });
  },
  heal() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.3, { vol: 0.09, delay: i * 0.07 }));
  },
  slam() {
    tone(80, 0.4, { vol: 0.4, slide: 0.4 });
    noise(0.3, { vol: 0.3, freq: 300, type: "lowpass" });
  },
  snap() {
    noise(0.05, { vol: 0.35, freq: 3500, q: 2 });
    tone(900, 0.05, { type: "square", vol: 0.06, slide: 0.5 });
  },
  pick() {
    tone(660, 0.08, { type: "triangle", vol: 0.11 });
    tone(990, 0.15, { type: "triangle", vol: 0.11, delay: 0.07 });
  },
  enemyShot() {
    if (busy("es", 60)) return;
    noise(0.06, { vol: 0.14, freq: 1800 });
    tone(240, 0.08, { type: "triangle", vol: 0.07, slide: 0.7 });
  },
  telegraph() {
    if (busy("tg", 120)) return;
    tone(440, 0.12, { vol: 0.04, slide: 1.25 });
  },
  horn() {
    tone(196, 1.2, { type: "sawtooth", vol: 0.1, attack: 0.2 });
    tone(294, 1.0, { type: "sawtooth", vol: 0.07, attack: 0.25, delay: 0.4 });
  },
  clear() {
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.4, { type: "triangle", vol: 0.09, delay: i * 0.1 }));
  },
  death() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, { type: "triangle", vol: 0.11, delay: i * 0.18 }));
  },
  ui() {
    tone(520, 0.05, { type: "triangle", vol: 0.05 });
  },
};

// Sparse lute-like plucks on a pentatonic scale; mood darkens with depth.
const SCALES = [
  [196, 220, 247, 294, 330, 392, 440],
  [174, 196, 220, 262, 294, 349, 392],
  [147, 165, 196, 220, 262, 294, 330],
  [131, 147, 156, 196, 208, 262, 294],
];

export function startMusic(mood = 0) {
  stopMusic();
  const sc = SCALES[mood] ?? SCALES[0];
  let step = 0;
  musicTimer = setInterval(() => {
    if (!ctx || muted) return;
    step++;
    if (Math.random() < 0.5) tone(sc[(Math.random() * sc.length) | 0], 1.2, { type: "triangle", vol: 0.03 });
    if (step % 8 === 0) tone(sc[0] / 2, 2.4, { vol: 0.035, attack: 0.3 });
  }, 380);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
