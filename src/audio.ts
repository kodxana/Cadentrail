import { claimPlayback, registerPlayback } from "./playbackFocus";
import {
  type Project,
  type Track,
  type Clip,
  type Effect,
  type Note,
  clamp,
  endBeat,
} from "./model";
import { getState, setState, report, notice } from "./store";
import { audibleTracks, sameStructure, validateRouting } from "./routing";
import { playbackWindows, wrappedBeat } from "./transport";
type Ctx = BaseAudioContext;
type Chain = { input: GainNode; output: AudioNode; dispose: () => void };
type Channel = {
  input: GainNode;
  volume: GainNode;
  pan: StereoPannerNode;
  analyser: AnalyserNode;
  chain: Chain[];
};
export type Meter = {
  peak: number[];
  rms: number[];
  correlation: number;
  stereo?: number[][];
};
const noise = (ctx: Ctx, duration: number, seed = 1234) => {
  const b = ctx.createBuffer(
    2,
    Math.max(1, Math.floor(duration * ctx.sampleRate)),
    ctx.sampleRate,
  );
  for (let c = 0; c < 2; c++) {
    const x = b.getChannelData(c);
    let s = seed + c;
    for (let i = 0; i < x.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      x[i] =
        (s / 2147483648) * Math.exp(-i / (ctx.sampleRate * duration * 0.2));
    }
  }
  return b;
};
export function effectChain(ctx: Ctx, fx: Effect): Chain {
  const input = ctx.createGain(),
    output = ctx.createGain(),
    p = fx.params;
  const nodes: AudioNode[] = [input, output];
  const oscillators: OscillatorNode[] = [];
  const connect = (node: AudioNode) => {
    input.connect(node);
    node.connect(output);
    nodes.push(node);
  };
  if (fx.bypass) {
    input.connect(output);
    return {
      input,
      output,
      dispose: () => nodes.forEach((n) => n.disconnect()),
    };
  }
  switch (fx.type) {
    case "eq":
    case "highpass":
    case "lowpass": {
      const f = ctx.createBiquadFilter();
      f.type = fx.type === "eq" ? "peaking" : fx.type;
      f.frequency.value = clamp(
        p.frequency ?? 1000,
        10,
        ctx.sampleRate / 2 - 1,
      );
      f.Q.value = clamp(p.q ?? 1, 0.01, 30);
      f.gain.value = clamp(p.gain ?? 0, -24, 24);
      connect(f);
      break;
    }
    case "compressor":
    case "limiter": {
      const f = ctx.createDynamicsCompressor();
      f.threshold.value = clamp(p.threshold ?? -18, -100, 0);
      f.ratio.value = clamp(p.ratio ?? 4, 1, 20);
      f.attack.value = clamp(p.attack ?? 0.01, 0, 1);
      f.release.value = clamp(p.release ?? 0.1, 0.001, 1);
      f.knee.value = clamp(p.knee ?? 12, 0, 40);
      connect(f);
      break;
    }
    case "gain": {
      const g = ctx.createGain();
      g.gain.value = clamp(p.gain ?? 1, 0, 4);
      connect(g);
      break;
    }
    case "delay":
    case "reverb":
    case "saturation":
    case "chorus": {
      const dry = ctx.createGain(),
        wet = ctx.createGain();
      dry.gain.value = 1 - clamp(p.mix ?? 0.2, 0, 1);
      wet.gain.value = clamp(p.mix ?? 0.2, 0, 1);
      input.connect(dry).connect(output);
      nodes.push(dry, wet);
      if (fx.type === "delay") {
        const delay = ctx.createDelay(4),
          feedback = ctx.createGain();
        delay.delayTime.value = clamp(p.time ?? 0.3, 0.001, 4);
        feedback.gain.value = clamp(p.feedback ?? 0.25, 0, 0.9);
        input.connect(delay).connect(wet);
        delay.connect(feedback).connect(delay);
        nodes.push(delay, feedback);
      }
      if (fx.type === "reverb") {
        const conv = ctx.createConvolver();
        conv.buffer = noise(ctx, clamp(p.decay ?? 1.8, 0.1, 8));
        input.connect(conv).connect(wet);
        nodes.push(conv);
      }
      if (fx.type === "saturation") {
        const shape = ctx.createWaveShaper();
        const drive = clamp(p.drive ?? 2, 1, 20),
          curve = new Float32Array(8192);
        for (let i = 0; i < curve.length; i++)
          curve[i] =
            Math.tanh(((i * 2) / (curve.length - 1) - 1) * drive) /
            Math.tanh(drive);
        shape.curve = curve;
        shape.oversample = "2x";
        input.connect(shape).connect(wet);
        nodes.push(shape);
      }
      if (fx.type === "chorus") {
        const delay = ctx.createDelay(0.1),
          osc = ctx.createOscillator(),
          depth = ctx.createGain();
        delay.delayTime.value = 0.02;
        osc.frequency.value = clamp(p.rate ?? 0.8, 0.05, 10);
        depth.gain.value = clamp(p.depth ?? 0.004, 0, 0.015);
        osc.connect(depth).connect(delay.delayTime);
        input.connect(delay).connect(wet);
        osc.start();
        oscillators.push(osc);
        nodes.push(delay, depth);
      }
      wet.connect(output);
      break;
    }
    case "width": {
      const split = ctx.createChannelSplitter(2),
        merge = ctx.createChannelMerger(2);
      const width = clamp(p.width ?? 1, 0, 2);
      input.connect(split);
      for (let src = 0; src < 2; src++)
        for (let dest = 0; dest < 2; dest++) {
          const g = ctx.createGain();
          g.gain.value = (src === dest ? 1 + width : 1 - width) / 2;
          split.connect(g, src);
          g.connect(merge, 0, dest);
          nodes.push(g);
        }
      merge.connect(output);
      nodes.push(split, merge);
      break;
    }
    case "gate": {
      // Static expander transfer; labeled as a soft gate, no lookahead.
      const shape = ctx.createWaveShaper(),
        curve = new Float32Array(16384),
        threshold = 10 ** (clamp(p.threshold ?? -45, -90, -6) / 20);
      for (let i = 0; i < curve.length; i++) {
        const x = (i * 2) / (curve.length - 1) - 1;
        curve[i] = x * Math.min(1, Math.abs(x) / threshold) ** 2;
      }
      shape.curve = curve;
      connect(shape);
      break;
    }
  }
  return {
    input,
    output,
    dispose: () => {
      oscillators.forEach((o) => {
        try {
          o.stop();
        } catch {}
      });
      nodes.forEach((n) => n.disconnect());
    },
  };
}
export function makeGraph(ctx: Ctx, p: Project, destination: AudioNode) {
  validateRouting(p.tracks);
  const master = ctx.createGain();
  master.gain.value = p.masterVolume;
  master.connect(destination);
  const channels = new Map<string, Channel>();
  for (const t of p.tracks) {
    const input = ctx.createGain(),
      volume = ctx.createGain(),
      pan = ctx.createStereoPanner(),
      analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const chain = t.effects.map((fx) => effectChain(ctx, fx));
    let last: AudioNode = input;
    for (const fx of chain) {
      last.connect(fx.input);
      last = fx.output;
    }
    last.connect(volume).connect(pan).connect(analyser);
    channels.set(t.id, { input, volume, pan, analyser, chain });
  }
  for (const t of p.tracks)
    channels
      .get(t.id)!
      .analyser.connect(channels.get(t.output)?.input ?? master);
  return {
    channels,
    master,
    dispose: () => {
      master.disconnect();
      channels.forEach((c) => {
        c.input.disconnect();
        c.volume.disconnect();
        c.pan.disconnect();
        c.analyser.disconnect();
        c.chain.forEach((x) => x.dispose());
      });
    },
  };
}
export function instrument(
  ctx: Ctx,
  n: Note,
  t: Track,
  when: number,
  duration: number,
  destination: AudioNode,
  velocityScale = 1,
) {
  const gain = ctx.createGain();
  gain.connect(destination);
  const velocity = (n.velocity / 127) * 0.22 * velocityScale;
  const start = Math.max(ctx.currentTime, when),
    dur = Math.max(0.02, duration),
    attack = t.instrument === "pad" ? 0.08 : 0.004;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(
    velocity,
    start + Math.min(attack, dur / 3),
  );
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, velocity * (t.instrument === "piano" ? 0.08 : 0.7)),
    start + dur,
  );
  gain.gain.linearRampToValueAtTime(0, start + dur + 0.04);
  let source: AudioScheduledSourceNode;
  if (
    t.instrument === "drums" &&
    (n.pitch === 42 || n.pitch === 46 || n.pitch === 38)
  ) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx, n.pitch === 38 ? 0.22 : 0.08, n.pitch);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = n.pitch === 38 ? 800 : 6000;
    src.connect(filter).connect(gain);
    source = src;
    src.onended = () => {
      gain.disconnect();
      filter.disconnect();
    };
  } else {
    const osc = ctx.createOscillator();
    osc.type =
      t.instrument === "bass"
        ? "sawtooth"
        : t.instrument === "pad"
          ? "sine"
          : t.instrument === "poly"
            ? "triangle"
            : "sine";
    osc.frequency.setValueAtTime(
      t.instrument === "drums" ? 140 : 440 * 2 ** ((n.pitch - 69) / 12),
      start,
    );
    if (t.instrument === "drums")
      osc.frequency.exponentialRampToValueAtTime(42, start + 0.12);
    osc.connect(gain);
    source = osc;
    source.onended = () => gain.disconnect();
  }
  source.start(start);
  source.stop(start + dur + 0.05);
  return source;
}
export function automationValue(
  points: { beat: number; value: number }[],
  beat: number,
  fallback: number,
  step = false,
) {
  if (!points.length) return fallback;
  if (beat <= points[0].beat) return points[0].value;
  for (let i = 1; i < points.length; i++)
    if (beat < points[i].beat) {
      const a = points[i - 1],
        b = points[i];
      return step
        ? a.value
        : a.value + ((b.value - a.value) * (beat - a.beat)) / (b.beat - a.beat);
    }
  return points.at(-1)!.value;
}
class Engine {
  ctx: AudioContext | null = null;
  graph: ReturnType<typeof makeGraph> | null = null;
  analyser: AnalyserNode | null = null;
  meter: Meter = { peak: [0, 0], rms: [0, 0], correlation: 0 };
  meterNode: AudioWorkletNode | null = null;
  sources = new Set<AudioScheduledSourceNode>();
  cache = new Map<string, AudioBuffer>();
  pending = new Map<string, Promise<AudioBuffer>>();
  bytes = 0;
  maxBytes = 96 * 1024 * 1024;
  generation = 0;
  scheduled = new Set<string>();
  timer: number | undefined;
  origin = 0;
  startBeat = 0;
  project: Project | null = null;
  preparing = false;
  underruns = 0;
  async init() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    try {
      await this.ctx.audioWorklet.addModule("/meter-worklet.js");
      this.meterNode = new AudioWorkletNode(this.ctx, "studio-meter", {
        outputChannelCount: [2],
      });
      this.meterNode.port.onmessage = (e) => {
        this.meter = e.data;
      };
      this.analyser.connect(this.meterNode).connect(this.ctx.destination);
    } catch {
      this.analyser.connect(this.ctx.destination);
      notice(
        "AudioWorklet meters unavailable in this browser. Audio playback remains available.",
      );
    }
  }
  beat() {
    if (!this.ctx || !getState().playing) return getState().cursor;
    const raw =
      this.startBeat +
      ((this.ctx.currentTime - this.origin) * (this.project?.tempo ?? 120)) /
        60;
    return wrappedBeat(
      raw,
      this.project!.loopStart,
      this.project!.loopEnd,
      getState().loop,
    );
  }
  async buffer(
    assetId: string,
    start: number,
    duration: number,
    reverse = false,
  ) {
    await this.init();
    const key = `${assetId}:${start.toFixed(6)}:${duration.toFixed(6)}:${reverse}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    if (this.pending.has(key)) return this.pending.get(key)!;
    const task = (async () => {
      const res = await fetch(
        `/api/assets/${assetId}/segment?start=${start}&duration=${duration}&reverse=${reverse}`,
      );
      if (!res.ok) throw new Error("Audio segment could not be loaded");
      const b = await this.ctx!.decodeAudioData(await res.arrayBuffer());
      const size = b.length * b.numberOfChannels * 4;
      while (this.bytes + size > this.maxBytes && this.cache.size) {
        const old = this.cache.keys().next().value!;
        const oldBuffer = this.cache.get(old)!;
        this.bytes -= oldBuffer.length * oldBuffer.numberOfChannels * 4;
        this.cache.delete(old);
      }
      this.cache.set(key, b);
      this.bytes += size;
      return b;
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  async play() {
    if (this.preparing) {
      this.pause();
      return;
    }
    if (getState().playing) {
      this.pause();
      return;
    }
    const intent = ++this.generation;
    claimPlayback("studio");
    await this.init();
    await this.ctx!.resume();
    if (intent !== this.generation) return;
    const p = getState().project;
    if (!p) return;
    this.stopSources();
    this.project = p;
    this.startBeat = getState().cursor;
    if (getState().loop && this.startBeat >= p.loopEnd)
      this.startBeat = p.loopStart;
    const gen = intent;
    this.preparing = true;
    setState({ busy: "Buffering playback…" });
    try {
      const bps = p.tempo / 60;
      const preloads: Promise<AudioBuffer>[] = [];
      for (const t of p.tracks)
        for (const c of t.clips) {
          if (
            !c.assetId ||
            c.muted ||
            c.beat + c.duration <= this.startBeat ||
            c.beat > this.startBeat + 6 * bps
          )
            continue;
          const clipSeconds = c.duration / bps;
          const first = Math.max(
            0,
            Math.floor((this.startBeat - c.beat) / bps / 8),
          );
          for (
            let part = first;
            part * 8 < clipSeconds &&
            c.beat + part * 8 * bps < this.startBeat + 6 * bps;
            part++
          ) {
            const local = part * 8,
              len = Math.min(8, clipSeconds - local);
            preloads.push(
              this.buffer(
                c.assetId,
                Math.max(
                  0,
                  c.reverse
                    ? c.offset + clipSeconds - local - len
                    : c.offset + local,
                ),
                len,
                c.reverse,
              ),
            );
          }
        }
      await Promise.all(preloads);
      if (gen !== this.generation) return;
      this.origin = this.ctx!.currentTime + 0.08;
      this.graph = makeGraph(this.ctx!, p, this.analyser!);
      this.scheduled.clear();
    } finally {
      if (gen === this.generation) {
        this.preparing = false;
        setState({ busy: null });
      }
    }
    setState({ playing: true });
    await this.schedule(gen);
    this.timer = window.setInterval(() => {
      void this.schedule(gen).catch((e) => {
        this.pause();
        report(e);
      });
    }, 40);
  }
  pause() {
    if (this.preparing && getState().busy === "Buffering playback…")
      setState({ busy: null });
    this.preparing = false;
    const beat = Math.max(0, this.beat());
    this.generation++;
    window.clearInterval(this.timer);
    this.stopSources();
    setState({ playing: false, cursor: beat });
  }
  stop() {
    this.pause();
    setState({ cursor: 0 });
  }
  async seek(beat: number) {
    const was = getState().playing;
    if (was) this.pause();
    setState({ cursor: Math.max(0, beat) });
    if (was) await this.play();
  }
  stopSources() {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    this.sources.clear();
    this.graph?.dispose();
    this.graph = null;
    this.meter = { peak: [0, 0], rms: [0, 0], correlation: 0 };
  }
  sync(p: Project) {
    if (!getState().playing) return;
    if (!sameStructure(this.project, p)) {
      const beat = this.beat();
      this.pause();
      setState({ cursor: Math.max(0, beat) });
      void this.play().catch(report);
    } else this.project = p;
  }
  updateMix(beat: number) {
    const p = this.project;
    if (!p || !this.graph || !this.ctx) return;
    const active = audibleTracks(p.tracks);
    for (const t of p.tracks) {
      const c = this.graph.channels.get(t.id);
      if (!c) continue;
      const muted = !active.has(t.id);
      const volume = t.automation.find(
          (a) => a.parameter === "volume" && a.enabled,
        ),
        pan = t.automation.find((a) => a.parameter === "pan" && a.enabled);
      c.volume.gain.setTargetAtTime(
        muted
          ? 0
          : automationValue(
              volume?.points ?? [],
              beat,
              t.volume,
              volume?.interpolation === "step",
            ),
        this.ctx.currentTime,
        0.01,
      );
      c.pan.pan.setTargetAtTime(
        automationValue(
          pan?.points ?? [],
          beat,
          t.pan,
          pan?.interpolation === "step",
        ),
        this.ctx.currentTime,
        0.01,
      );
    }
    this.graph.master.gain.setTargetAtTime(
      p.masterVolume,
      this.ctx.currentTime,
      0.01,
    );
  }
  async schedule(gen: number) {
    const p = this.project,
      ctx = this.ctx,
      graph = this.graph;
    if (!p || !ctx || !graph || gen !== this.generation) return;
    const rawBeat =
        this.startBeat + ((ctx.currentTime - this.origin) * p.tempo) / 60,
      beat = this.beat(),
      now = ctx.currentTime,
      bps = p.tempo / 60;
    this.updateMix(Math.max(0, beat));
    const loop = getState().loop;
    if (beat > endBeat(p) + 8 && !loop) {
      this.stop();
      return;
    }
    for (const window of playbackWindows(
      rawBeat,
      this.startBeat,
      p.loopStart,
      p.loopEnd,
      loop,
      6 * bps,
    )) {
      const {
        epoch,
        start: windowStart,
        end: windowEnd,
        beat: windowBeat,
        horizon,
      } = window;
      const windowOrigin = this.origin + window.offset / bps;
      for (const t of p.tracks)
        for (const c of t.clips) {
          if (c.muted || c.beat + c.duration < windowStart || c.beat >= horizon)
            continue;
          const input = graph.channels.get(t.id)?.input;
          if (!input) continue;
          if (c.assetId) {
            const clipSeconds = c.duration / bps;
            for (
              let part = Math.max(
                0,
                Math.floor(
                  (Math.max(windowStart, windowBeat) - c.beat) / bps / 8,
                ),
              );
              part * 8 < clipSeconds && c.beat + part * 8 * bps < horizon;
              part++
            ) {
              const key = epoch + ":" + c.id + ":" + part;
              if (this.scheduled.has(key)) continue;
              this.scheduled.add(key);
              const local = part * 8,
                len = Math.min(8, clipSeconds - local),
                target = windowOrigin + (c.beat - windowStart) / bps + local;
              const sourceStart = c.reverse
                ? c.offset + clipSeconds - local - len
                : c.offset + local;
              void this.buffer(
                c.assetId,
                Math.max(0, sourceStart),
                len,
                c.reverse,
              )
                .then((buffer) => {
                  if (gen !== this.generation) return;
                  const late = Math.max(0, ctx.currentTime - target),
                    skip = Math.max(
                      late,
                      (windowStart - c.beat) / bps - local,
                      0,
                    );
                  if (skip >= len) return;
                  if (
                    late >
                    Math.max(0, (windowStart - c.beat) / bps - local) + 0.08
                  ) {
                    this.underruns++;
                    if (this.underruns === 1)
                      notice(
                        "Audio buffering delayed a segment. Pause briefly to preload, then retry.",
                      );
                  }
                  const src = ctx.createBufferSource(),
                    gain = ctx.createGain();
                  src.buffer = buffer;
                  src.connect(gain).connect(input);
                  const start = Math.max(ctx.currentTime, target + skip),
                    duration = Math.min(
                      len - skip,
                      buffer.duration - skip,
                      (windowEnd - c.beat) / bps - local - skip,
                    );
                  if (duration <= 0) return;
                  const envelope = (seconds: number) =>
                    c.gain *
                    Math.min(
                      1,
                      c.fadeIn ? seconds / (c.fadeIn / bps) : 1,
                      c.fadeOut
                        ? (clipSeconds - seconds) / (c.fadeOut / bps)
                        : 1,
                    );
                  gain.gain.setValueAtTime(
                    Math.max(0, envelope(local + skip)),
                    start,
                  );
                  for (let s = 0.02; s < duration; s += 0.02)
                    gain.gain.linearRampToValueAtTime(
                      Math.max(0, envelope(local + skip + s)),
                      start + s,
                    );
                  gain.gain.linearRampToValueAtTime(
                    Math.max(0, envelope(local + skip + duration)),
                    start + duration,
                  );
                  src.start(start, skip, duration);
                  this.sources.add(src);
                  src.onended = () => {
                    this.sources.delete(src);
                    gain.disconnect();
                  };
                })
                .catch((e) => {
                  if (gen === this.generation) {
                    this.pause();
                    report(e);
                  }
                });
            }
          } else {
            const repeats = c.loop ? Math.ceil(c.duration / c.loopBeats) : 1;
            for (let r = 0; r < repeats; r++)
              for (const n of c.notes) {
                const noteBeat = c.beat + n.beat + r * c.loopBeats;
                if (
                  noteBeat >= c.beat + c.duration ||
                  noteBeat >= horizon ||
                  noteBeat + n.duration <= windowStart
                )
                  continue;
                const key = epoch + ":" + c.id + ":" + n.id + ":" + r;
                if (this.scheduled.has(key)) continue;
                this.scheduled.add(key);
                const when =
                  windowOrigin +
                  (Math.max(noteBeat, windowStart) - windowStart) / bps;
                const duration =
                  (Math.min(
                    noteBeat + n.duration,
                    c.beat + c.duration,
                    windowEnd,
                  ) -
                    Math.max(noteBeat, windowStart)) /
                    bps -
                  Math.max(0, now - when);
                if (duration <= 0) continue;
                const src = instrument(
                  ctx,
                  n,
                  t,
                  Math.max(now, when),
                  duration,
                  input,
                  c.gain,
                );
                this.sources.add(src);
                src.addEventListener("ended", () => this.sources.delete(src));
              }
          }
        }
      if (getState().metronome) {
        const unit = 4 / p.timeSignature[1];
        for (
          let b =
            Math.max(
              Math.ceil(windowStart / unit),
              Math.ceil(windowBeat / unit),
            ) * unit;
          b < horizon;
          b += unit
        ) {
          const key = epoch + ":click:" + b;
          if (this.scheduled.has(key)) continue;
          this.scheduled.add(key);
          const t = { instrument: "piano" } as Track;
          const src = instrument(
            ctx,
            {
              pitch: Math.round(b / unit) % p.timeSignature[0] ? 84 : 96,
              velocity: 80,
            } as Note,
            t,
            windowOrigin + (b - windowStart) / bps,
            0.02,
            graph.master,
            0.35,
          );
          this.sources.add(src);
          src.addEventListener("ended", () => this.sources.delete(src));
        }
      }
    }
  }
  async audition(pitch: number, velocity = 96, duration = 0.3) {
    await this.init();
    await this.ctx!.resume();
    claimPlayback("studio");
    const t =
      getState().project?.tracks.find(
        (t) => t.id === getState().selectedTrack,
      ) ?? ({ instrument: "piano" } as Track);
    instrument(
      this.ctx!,
      { pitch, velocity } as Note,
      t,
      this.ctx!.currentTime,
      duration,
      this.analyser!,
    );
  }
  trackMeter(trackId: string) {
    const node = this.graph?.channels.get(trackId)?.analyser;
    if (!node) return { peak: 0, rms: 0 };
    const data = new Float32Array(node.fftSize);
    node.getFloatTimeDomainData(data);
    let peak = 0,
      sum = 0;
    for (const x of data) {
      peak = Math.max(peak, Math.abs(x));
      sum += x * x;
    }
    return { peak, rms: Math.sqrt(sum / data.length) };
  }
}
export const engine = new Engine();
registerPlayback("studio", () => engine.pause());
