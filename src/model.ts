import type { Visuals, Creative } from "./visual-model";
export type Note = {
  id: string;
  beat: number;
  duration: number;
  pitch: number;
  velocity: number;
  channel: number;
};
export type Chord = {
  id: string;
  beat: number;
  duration: number;
  symbol: string;
};
export type Point = { id: string; beat: number; value: number };
export type Automation = {
  parameter: "volume" | "pan";
  points: Point[];
  enabled: boolean;
  interpolation: "linear" | "step";
};
export type EffectType =
  | "eq"
  | "highpass"
  | "lowpass"
  | "compressor"
  | "limiter"
  | "delay"
  | "reverb"
  | "saturation"
  | "width"
  | "gain"
  | "gate"
  | "chorus";
export type Effect = {
  id: string;
  type: EffectType;
  bypass: boolean;
  params: Record<string, number>;
};
export type Clip = {
  id: string;
  name: string;
  assetId: string | null;
  beat: number;
  duration: number;
  offset: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  reverse: boolean;
  color: string;
  notes: Note[];
  loop: boolean;
  loopBeats: number;
  group: string | null;
  generationId: string | null;
};
export type Track = {
  id: string;
  name: string;
  type: "audio" | "midi" | "ai" | "lyrics" | "chord" | "automation" | "bus";
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  instrument: "poly" | "piano" | "bass" | "pad" | "drums";
  clips: Clip[];
  effects: Effect[];
  automation: Automation[];
  output: string;
};
export type Section = {
  id: string;
  name: string;
  beat: number;
  duration: number;
  lyrics: string;
};
export type HumSource = {
  assetId: string;
  start: number;
  duration: number;
  tempo: number;
  mode: "continue" | "melody";
  influence: number;
};
export type Generation = {
  hum?: HumSource | null;
  musicAdapter?: "auto" | "base" | "instrumental-v1";
  instrumentalSections?: string;
  odeSteps: number;
  temperature: number;
  topP: number;
  topK: number;
  style: string;
  lyrics: string;
  cot: "full" | "melody" | "off";
  seed: number;
  cfgScale: number | null;
  abc: string;
  useScore: boolean;
  role:
    | "auto"
    | "male"
    | "female"
    | "duet"
    | "dialogue"
    | "shared"
    | "instrumental";
};
export type Candidate = {
  id: string;
  name: string;
  assetId: string | null;
  jobId: string;
  seed: number;
  abc: string;
  favorite: boolean;
  rank: number;
  parentId: string | null;
  metadata: Record<string, unknown>;
};
export type Project = {
  schemaVersion: 1 | 2;
  artist: string;
  creative: Creative;
  visuals: Visuals;
  audioEncodings?: {
    id: string;
    sourceAssetId: string;
    resultAssetId: string | null;
    name: string;
    model: string;
    revision: string;
    mertRevision: string;
    createdAt: number;
    start: number;
    duration: number;
    tokens: number;
    settings: Record<string, unknown>;
  }[];
  id: string;
  name: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  tempo: number;
  timeSignature: [number, number];
  key: string;
  tracks: Track[];
  chords: Chord[];
  sections: Section[];
  generation: Generation;
  candidates: Candidate[];
  loopStart: number;
  loopEnd: number;
  masterVolume: number;
  tags: string[];
  favorite: boolean;
  archived: boolean;
};
export type Asset = {
  id: string;
  projectId: string;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  origin: string;
  lineage?: { sourceAssetIds?: string[]; [key: string]: unknown };
  analysis: {
    duration: number;
    peakDb: number;
    truePeakDb: number;
    rmsDb: number[];
    lufs: number | null;
    clippedSamples: number;
    correlation: number;
    bpm: number | null;
    bpmConfidence: number;
    dcOffset: number[];
    silenceFraction: number;
    warnings: string[];
  };
  spectrogram: { minHz: number; maxHz: number; minDb: number; maxDb: number };
  peaks: { levels: { hop: number; length: number; file: string }[] };
};
export type Job = {
  agent?: {id:string;name:string};
  id: string;
  projectId: string;
  kind: string;
  state: string;
  message: string;
  candidateIndex?: number;
  completed: number[];
  abc?: string;
  request: { candidates: number };
  updatedAt: number;
  output?: string;
  progress?: number;
  result?: Record<string, unknown>;
  children?: Record<string, string>;
  name?: string;
  projectName?: string;
  sourceName?: string;
  createdAt?: number;
  startedAt?: number;
  finishedAt?: number;
  stageStartedAt?: number;
  unitsDone?: number;
  unitsTotal?: number;
  unit?: string;
  progressLabel?: string;
  download?: {
    name: string;
    model: string;
    completed: number;
    total: number | null;
    state: string;
  }[];
  priority?: number;
};
export type Peaks = {
  hop: number;
  sampleRate: number;
  channels: number;
  peaks: number[][][];
};
export const id = () => crypto.randomUUID().replaceAll("-", "");
export const palette = [
  "#74cdb0",
  "#91aaf2",
  "#d1a075",
  "#b59ade",
  "#da8298",
  "#9bbc70",
];
export const newNote = (beat = 0, pitch = 60, duration = 1): Note => ({
  id: id(),
  beat,
  pitch,
  duration,
  velocity: 96,
  channel: 0,
});
export const newClip = (v: Partial<Clip> = {}): Clip => ({
  id: id(),
  name: "New clip",
  assetId: null,
  beat: 0,
  duration: 16,
  offset: 0,
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  muted: false,
  reverse: false,
  color: palette[0],
  notes: [],
  loop: false,
  loopBeats: 16,
  group: null,
  generationId: null,
  ...v,
});
export const newTrack = (v: Partial<Track> = {}): Track => ({
  id: id(),
  name: "Audio",
  type: "audio",
  color: palette[0],
  volume: 0.8,
  pan: 0,
  mute: false,
  solo: false,
  instrument: "piano",
  clips: [],
  effects: [],
  automation: [],
  output: "master",
  ...v,
});
export const db = (v: number) =>
  v > 0 ? (20 * Math.log10(v)).toFixed(1) : "−∞";
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const endBeat = (p: Project) =>
  Math.max(
    16,
    ...p.tracks.flatMap((t) => t.clips.map((c) => c.beat + c.duration)),
    ...p.sections.map((s) => s.beat + s.duration),
  );
export const noteName = (p: number) =>
  ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][p % 12] +
  (Math.floor(p / 12) - 1);
export const bars = (p: Project) =>
  (p.timeSignature[0] * 4) / p.timeSignature[1];
export const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input,textarea,select,[contenteditable="true"]');
export const effectDefaults: Record<EffectType, Record<string, number>> = {
  eq: { frequency: 1000, gain: 0, q: 1 },
  highpass: { frequency: 80, q: 0.7 },
  lowpass: { frequency: 14000, q: 0.7 },
  compressor: {
    threshold: -18,
    ratio: 4,
    attack: 0.01,
    release: 0.15,
    knee: 12,
  },
  limiter: { threshold: -1, ratio: 20, attack: 0.003, release: 0.08, knee: 0 },
  delay: { time: 0.3, feedback: 0.25, mix: 0.2 },
  reverb: { decay: 1.8, mix: 0.2 },
  saturation: { drive: 2, mix: 0.4 },
  width: { width: 1 },
  gain: { gain: 1 },
  gate: { threshold: -45, release: 0.1 },
  chorus: { rate: 0.8, depth: 0.004, mix: 0.3 },
};
