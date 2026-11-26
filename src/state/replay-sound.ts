// The sound of a replay, made live with WebAudio: a deep rumble (brown noise, low-passed), the roar of the exhaust
// (white noise through a moving band) and a crackle (the roar chopped by a fast random gate). No sound files; the mix
// comes from replay/sound-mix.ts. Browsers only start audio after a click, so the context wakes on the first gesture.
import { signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { SILENT, type SoundMix } from '../replay/sound-mix';

const KEY = 'orbis.replay.sound';
/** the viewer's choice (default: on) */
export const replaySound = signal(getJSON<boolean>(KEY, 1, (r) => (typeof r === 'boolean' ? r : undefined), true));
export function setReplaySound(on: boolean): void {
  replaySound.value = on;
  setJSON(KEY, 1, on);
  if (!on) silence();
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  rumble: GainNode;
  roar: GainNode;
  roarFilter: BiquadFilterNode;
  crackle: GainNode;
}

let graph: Graph | null = null;
let wakeBound = false;

function noise(ctx: AudioContext, kind: 'white' | 'brown'): AudioBufferSourceNode {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return src;
}

function build(): Graph | null {
  const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  const rumble = ctx.createGain();
  rumble.gain.value = 0;
  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = 'lowpass';
  rumbleLp.frequency.value = 120;
  noise(ctx, 'brown').connect(rumbleLp).connect(rumble).connect(master);

  const roar = ctx.createGain();
  roar.gain.value = 0;
  const roarFilter = ctx.createBiquadFilter();
  roarFilter.type = 'lowpass';
  roarFilter.frequency.value = 800;
  const roarBand = ctx.createBiquadFilter();
  roarBand.type = 'bandpass';
  roarBand.frequency.value = 500;
  roarBand.Q.value = 0.35;
  noise(ctx, 'white').connect(roarBand).connect(roarFilter).connect(roar).connect(master);

  // the crackle: a second noise through a high band, gated by a slow random wobble
  const crackle = ctx.createGain();
  crackle.gain.value = 0;
  const crackleBand = ctx.createBiquadFilter();
  crackleBand.type = 'bandpass';
  crackleBand.frequency.value = 2200;
  crackleBand.Q.value = 0.8;
  const gate = ctx.createGain();
  gate.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.type = 'sawtooth';
  lfo.frequency.value = 23;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth).connect(gate.gain);
  lfo.start();
  noise(ctx, 'white').connect(crackleBand).connect(gate).connect(crackle).connect(master);
  return { ctx, master, rumble, roar, roarFilter, crackle };
}

function bindWake(): void {
  if (wakeBound || typeof window === 'undefined') return;
  wakeBound = true;
  const wake = () => { void graph?.ctx.resume(); };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
}

/** Moves the voices to a mix (smoothly, so a jump of the playhead does not click). */
export function setMix(mix: SoundMix): void {
  if (!replaySound.peek()) return;
  if (!graph) {
    graph = build();
    bindWake();
    if (!graph) return;
  }
  if (graph.ctx.state === 'suspended') void graph.ctx.resume();
  const t = graph.ctx.currentTime;
  const to = (p: AudioParam, v: number, tau = 0.12) => p.setTargetAtTime(v, t, tau);
  to(graph.master.gain, 0.8 * mix.master);
  to(graph.rumble.gain, 0.9 * mix.rumble);
  to(graph.roar.gain, 0.5 * mix.roar);
  to(graph.roarFilter.frequency, mix.roarHz, 0.3);
  to(graph.crackle.gain, 0.22 * mix.crackle * mix.roar);
}

export function silence(): void {
  if (graph) setMix({ ...SILENT, master: 0 });
}

/** Ends the sound for good (the replay is closed). */
export function stopSound(): void {
  if (!graph) return;
  const g = graph;
  graph = null;
  g.master.gain.setTargetAtTime(0, g.ctx.currentTime, 0.05);
  setTimeout(() => { void g.ctx.close(); }, 400);
}
