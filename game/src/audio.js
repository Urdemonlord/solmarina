// Solmarina 3D: procedural WebAudio. No audio files: every sound is
// synthesised (oscillators + filtered noise). M mutes. (browser only)
export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenTimer = 0, sirenHigh = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer() {
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, when) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, filterFreq, vol) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() { muted = !muted; if (engineGain) engineGain.gain.value = 0; return muted; },
    get muted() { return muted; },

    click() { blip(660, 0.07, 'square', 0.08); },
    pickup() { blip(880, 0.09, 'sine', 0.15); blip(1320, 0.12, 'sine', 0.12, 0.08); },
    punch() { noiseBurst(0.12, 900, 0.25); },
    gunshot() { noiseBurst(0.15, 2500, 0.3); blip(120, 0.12, 'sine', 0.25); },
    crash(strength) { noiseBurst(0.25, 700, Math.min(0.4, 0.1 + strength * 0.02)); },
    missionStart() {
      [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.14, 'triangle', 0.14, i * 0.1));
    },
    missionDone() {
      [784, 988, 1175, 1568].forEach((f, i) => blip(f, 0.18, 'triangle', 0.15, i * 0.11));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => blip(f, 0.2, 'sawtooth', 0.08, i * 0.13));
    },
    busted() { [330, 262, 196].forEach((f, i) => blip(f, 0.25, 'sawtooth', 0.1, i * 0.16)); },
    wasted() { [220, 175, 131].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.1, i * 0.18)); },

    // Continuous engine hum: call every frame with speed (units/s) and
    // whether the player is driving; pass null speed to stop.
    engine(speed) {
      if (!ctx || muted) return;
      if (speed === null) {
        if (engineOsc) { try { engineOsc.stop(); } catch (e) {} engineOsc = null; }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
        engineOsc.start();
      }
      const rpm = 50 + Math.abs(speed) * 4;
      engineOsc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(Math.abs(speed) > 0.5 ? 0.05 : 0.02, ctx.currentTime, 0.1);
    },

    // Two-tone police siren while any police unit is near; call every frame.
    siren(dt, active) {
      if (!ctx || muted || !active) return;
      sirenTimer += dt;
      if (sirenTimer > 0.45) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        blip(sirenHigh ? 950 : 700, 0.4, 'square', 0.035);
      }
    },
  };
}
