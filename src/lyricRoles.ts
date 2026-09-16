import type { LyricLine, LyricTiming } from "./visual-model";
export type Voice = NonNullable<LyricLine["voice"]>;
const labels: Record<string, Voice> = {
  a: "a",
  voicea: "a",
  voice1: "a",
  singera: "a",
  male: "a",
  b: "b",
  voiceb: "b",
  voice2: "b",
  singerb: "b",
  female: "b",
  c: "c",
  voicec: "c",
  voice3: "c",
  d: "d",
  voiced: "d",
  voice4: "d",
  both: "together",
  together: "together",
  duet: "together",
};
const voiceLabel = (text: string) =>
  labels[text.toLowerCase().replace(/[\s_.-]/g, "")] ?? null;
export const headingVoice = (text: string) =>
  text
    .split(/[:|/—–-]/)
    .reverse()
    .map(voiceLabel)
    .find(Boolean) ?? null;
export function lineVoice(text: string): { text: string; voice: Voice | null } {
  const match =
    text.match(/^\[([^\]]+)\]\s*(.+)$/) ??
    text.match(
      /^(Voice [ABCD1-4]|Singer [AB]|Male|Female|Together|Both|[ABCD]):\s*(.+)$/i,
    );
  const voice = match ? voiceLabel(match[1]) : null;
  return { text: voice && match ? match[2] : text, voice };
}
export function voiceName(
  voice: LyricLine["voice"],
  timing?: LyricTiming | null,
) {
  return voice === "together"
    ? "Together"
    : voice
      ? timing?.voices?.find((v) => v.id === voice)?.name ||
        "Voice " + voice.toUpperCase()
      : "Unassigned";
}
