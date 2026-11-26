// Sound, synthesised live with WebAudio: an engine drone that follows the throttle,
// wind that follows the speed, and short chimes for rings, landings and crashes.
// No audio file is loaded; everything here is an oscillator or filtered noise.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      context = new AudioContext();
    } catch {
      return false;
    }
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter).connect(engineGain).connect(context.destination);
    engineOsc.start();

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    windSource = context.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter).connect(windGain).connect(context.destination);
    windSource.start();
    started = true;
    return true;
  }

  function blip(frequency, duration, type = 'sine', volume = 0.16, when = 0) {
    if (!context || muted) return;
    const time = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  return {
    /** Call from a user gesture: browsers keep audio asleep until then. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
      return muted;
    },
    /** Every frame while flying: drone pitch follows throttle, wind follows speed. */
    update(throttle, speed, airborne) {
      if (!started || muted || !context) return;
      const targetEngine = airborne ? 0.045 + throttle * 0.05 : 0.02 + throttle * 0.02;
      engineGain.gain.setTargetAtTime(targetEngine, context.currentTime, 0.12);
      engineOsc.frequency.setTargetAtTime(48 + throttle * 62 + speed * 0.35, context.currentTime, 0.1);
      windGain.gain.setTargetAtTime(airborne ? Math.min(0.12, speed * 0.0009) : 0, context.currentTime, 0.2);
      windFilter.frequency.setTargetAtTime(500 + speed * 9, context.currentTime, 0.2);
    },
    ring() {
      blip(880, 0.35, 'sine', 0.2);
      blip(1318, 0.5, 'sine', 0.16, 0.09);
    },
    land() {
      blip(196, 0.3, 'triangle', 0.22);
      blip(294, 0.45, 'triangle', 0.18, 0.1);
    },
    crash() {
      blip(70, 0.7, 'sawtooth', 0.25);
      blip(48, 0.9, 'square', 0.18, 0.08);
    },
    mission() {
      [523, 659, 784, 1046].forEach((frequency, index) => blip(frequency, 0.5, 'triangle', 0.18, index * 0.12));
    },
    click() {
      blip(1200, 0.06, 'sine', 0.08);
    },
  };
}
