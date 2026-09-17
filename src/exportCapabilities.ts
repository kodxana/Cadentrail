import { endBeat, type Project } from "./model";
const serverEffects = new Set([
  "eq",
  "highpass",
  "lowpass",
  "gain",
  "compressor",
  "limiter",
  "width",
]);
export function exportCapabilities(
  project: Project,
  region = false,
  tailSeconds = 3,
) {
  const start = region ? project.loopStart : 0,
    end = region ? project.loopEnd : endBeat(project),
    bps = project.tempo / 60;
  const duration = (end - start) / bps;
  const browser: string[] = [],
    server: string[] = [];
  const hasContent = project.tracks.some((t) => t.clips.some((c) =>
    (c.assetId || c.notes.length) && c.beat < end && c.beat + c.duration > start,
  ));
  if (!hasContent) {
    const message = "Add audio or instrument notes to the Studio timeline in the chosen range before rendering.";
    browser.push(message);
    server.push(message);
  }
  if (!Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30) {
    browser.push("Choose an effect tail between 0 and 30 seconds.");
    server.push("Choose an effect tail between 0 and 30 seconds.");
  }
  if (!(duration > 0)) {
    browser.push("Choose a non-empty region.");
    server.push("Choose a non-empty region.");
  }
  const memory =
    (duration + tailSeconds) * 48000 * 8 +
    project.tracks
      .flatMap((t) => t.clips)
      .filter((c) => c.assetId && !c.muted)
      .reduce(
        (sum, c) =>
          sum +
          (Math.max(
            0,
            Math.min(end, c.beat + c.duration) - Math.max(start, c.beat),
          ) /
            bps) *
            48000 *
            8,
        0,
      );
  if (duration + tailSeconds > 600)
    browser.push(
      "Browser export supports ten minutes including the effect tail. Select a shorter region.",
    );
  if (memory > 768 * 1024 * 1024)
    browser.push(
      "Estimated audio buffers exceed 768 MiB. Select a shorter region or a supported server render.",
    );
  if (duration + tailSeconds > 1200)
    server.push(
      "Server export supports twenty minutes including the effect tail.",
    );
  if (project.tracks.some((t) => t.output !== "master"))
    server.push("Bus routing requires browser export.");
  if (project.tracks.some((t) => t.clips.some((c) => c.notes.length)))
    server.push("Instrument notes require browser export.");
  const unsupported = [
    ...new Set(
      project.tracks.flatMap((t) =>
        t.effects
          .filter((f) => !f.bypass && !serverEffects.has(f.type))
          .map((f) => f.type),
      ),
    ),
  ];
  if (unsupported.length)
    server.push(
      "These inserts require browser export: " + unsupported.join(", ") + ".",
    );
  return {
    browser,
    server,
    memory,
    duration,
    totalDuration: duration + tailSeconds,
  };
}
