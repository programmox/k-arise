// K-Arise - chronometre reutilisable (compte a rebours par phases) + bips et vibration

let cfg = { sound: true, vibration: true };
export function setTimerConfig(c) { cfg = Object.assign(cfg, c || {}); }

let audioCtx = null;
function beep(freq = 880, dur = 0.12, vol = 0.2) {
  if (!cfg.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio non dispo, on ignore */ }
}

function vibrate(pattern) {
  if (!cfg.vibration) return;
  if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) {}
}

/*
 PhaseTimer : enchaine une liste de phases { kind, name, seconds, ... }
 callbacks : onTick(remaining, phase, index), onPhaseStart(phase, index), onDone()
*/
export class PhaseTimer {
  constructor(phases, callbacks = {}) {
    this.phases = phases;
    this.cb = callbacks;
    this.index = 0;
    this.remaining = phases.length ? phases[0].seconds : 0;
    this.running = false;
    this._int = null;
    this.paused = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this._emitPhaseStart();
    this._int = setInterval(() => this._step(), 1000);
  }

  pause() {
    this.paused = true;
    this.running = false;
    clearInterval(this._int);
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this._int = setInterval(() => this._step(), 1000);
  }

  toggle() { this.paused ? this.resume() : this.pause(); }

  skip() {
    clearInterval(this._int);
    this._next(true);
    if (!this.paused) { this._int = setInterval(() => this._step(), 1000); }
  }

  stop() {
    clearInterval(this._int);
    this.running = false;
    this.paused = true;
  }

  _step() {
    this.remaining--;
    if (this.remaining <= 3 && this.remaining > 0) beep(660, 0.08, 0.12);
    if (this.cb.onTick) this.cb.onTick(this.remaining, this.phases[this.index], this.index);
    if (this.remaining <= 0) {
      beep(990, 0.18, 0.25);
      vibrate(120);
      clearInterval(this._int);
      this._next(false);
      if (!this.paused && this.running) this._int = setInterval(() => this._step(), 1000);
    }
  }

  _next(manual) {
    this.index++;
    if (this.index >= this.phases.length) {
      this.running = false;
      this.paused = true;
      beep(1200, 0.3, 0.3); vibrate([120, 80, 200]);
      if (this.cb.onDone) this.cb.onDone();
      return;
    }
    this.remaining = this.phases[this.index].seconds;
    this._emitPhaseStart();
  }

  _emitPhaseStart() {
    const p = this.phases[this.index];
    if (p.kind === "rest") beep(440, 0.12, 0.18); else beep(880, 0.12, 0.2);
    if (this.cb.onPhaseStart) this.cb.onPhaseStart(p, this.index);
    if (this.cb.onTick) this.cb.onTick(this.remaining, p, this.index);
  }
}

export function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
