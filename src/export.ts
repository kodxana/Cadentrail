import { exportCapabilities } from "./exportCapabilities";
import { type Project, type Note, type Asset, endBeat, clamp } from "./model";
import { engine, makeGraph, instrument, automationValue } from "./audio";
import { getState, setState, report, notice } from "./store";
import { api } from "./api";
import { audibleTracks } from "./routing";
function wav(buffer: AudioBuffer) {
  const length = buffer.length * 2 * 4 + 44,
    data = new ArrayBuffer(length),
    v = new DataView(data);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, length - 8, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * 8, true);
  v.setUint16(32, 8, true);
  v.setUint16(34, 32, true);
  str(36, "data");
  v.setUint32(40, length - 44, true);
  const l = buffer.getChannelData(0),
    r = buffer.getChannelData(1);
  for (let i = 0; i < buffer.length; i++) {
    v.setFloat32(44 + i * 8, l[i], true);
    v.setFloat32(48 + i * 8, r[i], true);
  }
  return new Blob([data], { type: "audio/wav" });
}
export async function browserRender(options: {
  format: string;
  sampleRate: number;
  bitDepth: number;
  master: boolean;
  lufs: number;
  region: boolean;
  saveToProject?: boolean;
  tailSeconds?: number;
}) {
  const p = getState().project;
  if (!p) return;
  const bps = p.tempo / 60,
    start = options.region ? p.loopStart : 0,
    end = options.region ? p.loopEnd : endBeat(p),
    duration = (end - start) / bps;
  const tail=options.tailSeconds ?? 3;
  const checks=exportCapabilities(p,options.region,tail);
  if(checks.browser.length)throw new Error(checks.browser.join(" "));
  setState({ busy: "Preparing offline mix…" });
  let disposeGraph: (()=>void) | undefined;
  try {
    const ctx = new OfflineAudioContext(
        2,
        Math.ceil((duration + tail) * 48000),
        48000,
      ),
      graph = makeGraph(ctx, p, ctx.destination);
    disposeGraph = graph.dispose;
    const active = audibleTracks(p.tracks);
    for (const t of p.tracks) {
      const channel = graph.channels.get(t.id)!;
      const muted = !active.has(t.id);
      channel.volume.gain.value = muted ? 0 : t.volume;
      channel.pan.pan.value = t.pan;
      for (const a of t.automation) {
        if (!a.enabled || !a.points.length) continue;
        const param =
          a.parameter === "volume" ? channel.volume.gain : channel.pan.pan;
        if (a.parameter === "volume" && muted) continue;
        param.setValueAtTime(
          automationValue(
            a.points,
            start,
            a.parameter === "volume" ? t.volume : t.pan,
            a.interpolation === "step",
          ),
          0,
        );
        for (const point of a.points)
          if (point.beat > start && point.beat <= end) {
            if (a.interpolation === "step")
              param.setValueAtTime(point.value, (point.beat - start) / bps);
            else
              param.linearRampToValueAtTime(
                point.value,
                (point.beat - start) / bps,
              );
          }
      }
      for (const c of t.clips) {
        if (c.muted || c.beat + c.duration <= start || c.beat >= end) continue;
        setState({ busy: "Rendering " + t.name + " · " + c.name });
        if (c.assetId) {
          const clipSeconds = c.duration / bps;
          for (let local = 0; local < clipSeconds; local += 8) {
            const len = Math.min(8, clipSeconds - local),
              when = (c.beat - start) / bps + local;
            if (when + len <= 0 || when >= duration) continue;
            const buffer = await engine.buffer(
              c.assetId,
              c.reverse
                ? c.offset + clipSeconds - local - len
                : c.offset + local,
              len,
              c.reverse,
            );
            const skip = Math.max(0, -when),
              at = Math.max(0, when),
              available = Math.min(
                buffer.duration - skip,
                len - skip,
                duration - at,
              );
            if (available <= 0) continue;
            const source = ctx.createBufferSource(),
              gain = ctx.createGain();
            source.buffer = buffer;
            source.connect(gain).connect(channel.input);
            const envelope = (sec: number) =>
              c.gain *
              Math.max(
                0,
                Math.min(
                  1,
                  c.fadeIn ? sec / (c.fadeIn / bps) : 1,
                  c.fadeOut ? (clipSeconds - sec) / (c.fadeOut / bps) : 1,
                ),
              );
            gain.gain.setValueAtTime(envelope(local + skip), at);
            for (let dt = 0.01; dt < available; dt += 0.01)
              gain.gain.linearRampToValueAtTime(
                envelope(local + skip + dt),
                at + dt,
              );
            source.start(at, skip, available);
          }
        } else {
          for (
            let repeat = 0;
            repeat < (c.loop ? Math.ceil(c.duration / c.loopBeats) : 1);
            repeat++
          )
            for (const n of c.notes) {
              const nb = c.beat + n.beat + repeat * c.loopBeats,
                when = (nb - start) / bps;
              if (
                nb >= c.beat + c.duration ||
                nb + n.duration <= start ||
                nb >= end
              )
                continue;
              instrument(
                ctx,
                n,
                t,
                Math.max(0, when),
                (Math.min(nb + n.duration, end, c.beat + c.duration) -
                  Math.max(nb, start)) /
                  bps,
                channel.input,
                c.gain,
              );
            }
        }
      }
    }
    setState({ busy: "Rendering offline audio…" });
    const buffer = await ctx.startRendering();
    disposeGraph();disposeGraph=undefined;
    const body = new FormData();
    body.append(
      "file",
      new File([wav(buffer)], "mix.wav", { type: "audio/wav" }),
    );
    body.append(
      "options",
      JSON.stringify({
        ...options,
        projectRevision: p.revision,
        sourceAssetIds: [
          ...new Set(
            p.tracks.flatMap((t) =>
              t.clips.map((c) => c.assetId).filter(Boolean),
            ),
          ),
        ],
      }),
    );
    setState({ busy: "Encoding and mastering…" });
    const result = await api<{ filename: string; asset?: Asset }>(
      "/projects/" + p.id + "/rendered",
      { method: "POST", body },
    );
    if (options.saveToProject) return result.asset;
    const a = document.createElement("a");
    a.download = p.name + "." + options.format;
    a.href = "/api/exports/" + result.filename + "?download_name=" + encodeURIComponent(a.download);
    a.click();
    notice("Audio rendered. Your download is ready: " + a.download);
  } finally {
    disposeGraph?.();
    setState({ busy: null });
  }
}
