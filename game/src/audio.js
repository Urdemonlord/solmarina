// Procedural WebAudio: every sound is synthesised, no audio files. The context
// is created on the first user gesture; every function is a no-op until then, so
// headless runs and muted play stay silent without errors.

function noiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudio() {
  let context = null;
  let master = null;
  let noise = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      noise = noiseBuffer(context);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function blip(frequency, duration, type, volume, slideTo) {
    if (!ensure()) return;
    const osc = context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration + 0.02);
  }

  function burst(duration, filterFrequency, volume) {
    if (!ensure()) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(context.currentTime + duration + 0.02);
  }

  return {
    ensure,
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Engine hum follows speed (0..1); 0 silences it. */
    engine(speed01) {
      if (!ensure()) return;
      const target = speed01 > 0.02 ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, context.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(350 + speed01 * 900, context.currentTime, 0.08);
    },
    /** Two-tone siren; call every frame with whether any police car is near. */
    siren(on, dt) {
      if (!ensure()) return;
      if (!on) {
        sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        return;
      }
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setValueAtTime(sirenHigh ? 960 : 720, context.currentTime);
      }
      sirenGain.gain.setTargetAtTime(0.045, context.currentTime, 0.1);
    },
    punch() {
      burst(0.12, 500, 0.5);
      blip(140, 0.1, 'sine', 0.4, 60);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.3);
      setTimeout(() => blip(990, 0.12, 'sine', 0.3), 80);
    },
    gunshot() {
      burst(0.09, 2400, 0.55);
      blip(220, 0.07, 'square', 0.25, 90);
    },
    crash(strength) {
      burst(0.25, 700, Math.min(0.7, 0.25 + strength * 0.5));
      blip(90, 0.2, 'sine', 0.4, 45);
    },
    jingle() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((note, index) => {
        setTimeout(() => blip(note, 0.16, 'triangle', 0.3), index * 110);
      });
    },
    fail() {
      blip(330, 0.18, 'sawtooth', 0.25, 220);
      setTimeout(() => blip(220, 0.25, 'sawtooth', 0.25, 165), 160);
    },
    click() {
      blip(880, 0.05, 'sine', 0.2);
    },
    busted() {
      blip(440, 0.3, 'square', 0.25, 220);
      setTimeout(() => blip(330, 0.4, 'square', 0.25, 180), 220);
    },
  };
}
