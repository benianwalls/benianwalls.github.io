/* =====================================================
   Optional sound, off until the visitor turns it on.
   Everything is synthesised with Web Audio (no files):
   tyres on dirt, wind, rain, crickets, the campfire, and
   a few one-shots (coin, hop, plane, card).
   ===================================================== */

export function createSound() {
  let ctx = null, master = null, enabled = false;
  const g = {}; // named gain nodes for the continuous layers
  let nextCrackle = 0;

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* looping noise -> filter -> gain (starts silent) */
  function layer(name, type, freq, q = 0.7) {
    const src = ctx.createBufferSource();
    src.buffer = layer.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(f).connect(gain).connect(master);
    src.start();
    g[name] = gain;
    return f;
  }

  function start() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    layer.noise = noiseBuffer(3);

    layer("tyres", "bandpass", 900, 0.6);
    layer("wind", "lowpass", 380);
    layer("rain", "highpass", 2600);
    layer("fire", "bandpass", 1700, 0.9);

    // crickets: a high tone chopped by a fast tremolo
    const tone = ctx.createOscillator();
    tone.frequency.value = 4300;
    const chop = ctx.createGain();
    chop.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 23;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(chop.gain);
    const crickets = ctx.createGain();
    crickets.gain.value = 0;
    tone.connect(chop).connect(crickets).connect(master);
    tone.start();
    lfo.start();
    g.crickets = crickets;
  }

  const to = (node, value, time = 0.25) => node.gain.setTargetAtTime(value, ctx.currentTime, time);

  function setEnabled(on) {
    enabled = on;
    if (on && !ctx) start();
    if (!ctx) return;
    if (on) ctx.resume();
    to(master, on ? 0.6 : 0, 0.15);
    if (!on) setTimeout(() => { if (!enabled) ctx.suspend(); }, 600);
  }

  /* called every frame with what the world is doing */
  function update({ speed = 0, night = 0, fire = 0, rain = 0, snow = 0 }) {
    if (!enabled || !ctx) return;
    const v = Math.min(1, Math.abs(speed) / 12);
    to(g.tyres, v * 0.16 * (1 - snow * 0.6), 0.12);
    to(g.wind, 0.05 + v * 0.05 + snow * 0.04);
    to(g.rain, rain * 0.13, 0.6);
    to(g.crickets, night * (1 - rain) * (1 - snow) * 0.012, 0.8);
    to(g.fire, fire * 0.05);
    // crackles: short random pops layered on the fire hiss
    if (fire > 0.05 && ctx.currentTime > nextCrackle) {
      nextCrackle = ctx.currentTime + 0.05 + Math.random() * 0.35;
      blip({ type: "square", from: 900 + Math.random() * 2500, to: 300, dur: 0.03, vol: fire * 0.05 });
    }
  }

  function blip({ type = "sine", from, to: end, dur, vol, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    const a = ctx.createGain();
    a.gain.setValueAtTime(0, t);
    a.gain.linearRampToValueAtTime(vol, t + 0.008);
    a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(a).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const ONE_SHOTS = {
    coin() {
      blip({ from: 1175, to: 1175, dur: 0.12, vol: 0.14 });
      blip({ from: 1760, to: 1760, dur: 0.3, vol: 0.14, delay: 0.09 });
    },
    hop() {
      blip({ from: 170, to: 55, dur: 0.22, vol: 0.3 });
    },
    card() {
      blip({ type: "triangle", from: 520, to: 780, dur: 0.09, vol: 0.06 });
    },
    plane() {
      // engines spooling up, then fading as it climbs away
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = layer.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(250, t);
      f.frequency.exponentialRampToValueAtTime(1600, t + 3);
      f.frequency.exponentialRampToValueAtTime(400, t + 7.5);
      const drone = ctx.createOscillator();
      drone.type = "sawtooth";
      drone.frequency.setValueAtTime(60, t);
      drone.frequency.exponentialRampToValueAtTime(150, t + 3.2);
      const droneG = ctx.createGain();
      droneG.gain.value = 0.25;
      const a = ctx.createGain();
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(0.22, t + 2.4);
      a.gain.exponentialRampToValueAtTime(0.0001, t + 8);
      src.connect(f).connect(a);
      drone.connect(droneG).connect(f);
      a.connect(master);
      src.start(t); drone.start(t);
      src.stop(t + 8.2); drone.stop(t + 8.2);
    },
  };

  function play(name) {
    if (enabled && ctx) ONE_SHOTS[name]?.();
  }

  return { setEnabled, update, play, get enabled() { return enabled; } };
}
