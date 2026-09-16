import type { Project } from "./model";
import type { VideoDesign, VideoScene } from "./visual-model";
export type PreviewMedia = HTMLImageElement | HTMLVideoElement;
export const videoDimensions = {
  "1080p": [1920, 1080, 30],
  "1080p60": [1920, 1080, 60],
  "1440p": [2560, 1440, 30],
  "4k": [3840, 2160, 30],
  vertical: [1080, 1920, 30],
  square: [1080, 1080, 30],
} as const;
const fade = (s: VideoScene, t: number) =>
  s.opacity *
  Math.max(
    0,
    Math.min(
      1,
      (t - s.start) / Math.max(0.001, s.fade),
      (s.end - t) / Math.max(0.001, s.fade),
    ),
  );

/** Preview samples the playing audio. The export compositor uses the original PCM. */
export function drawVideoPreview(
  node: HTMLCanvasElement,
  p: Project,
  t: number,
  media: Map<string, PreviewMedia>,
  analyser: AnalyserNode | null,
  playing: boolean,
  duration: number,
) {
  const d = p.visuals.video,
    [dw, dh] = videoDimensions[d.preset],
    nw = dw > dh ? 960 : 540,
    nh = Math.round((nw * dh) / dw);
  if (node.width !== nw || node.height !== nh) {
    node.width = nw;
    node.height = nh;
  }
  const c = node.getContext("2d")!,
    w = node.width,
    h = node.height;
  c.clearRect(0, 0, w, h);
  c.globalAlpha = 1;
  c.shadowBlur = 0;
  c.fillStyle = d.background;
  c.fillRect(0, 0, w, h);
  const wave = analyser ? new Float32Array(analyser.fftSize) : null,
    fft = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  if (analyser && wave && fft) {
    analyser.smoothingTimeConstant = d.smoothing;
    analyser.getFloatTimeDomainData(wave);
    analyser.getByteFrequencyData(fft);
  }
  const energy = wave
    ? Math.sqrt(wave.reduce((sum, v) => sum + v * v, 0) / wave.length)
    : 0;
  const activeVideos = new Set<HTMLVideoElement>();
  const picture = (
    id: string | null,
    at: number,
    motion: string,
    x = 0.5,
    y = 0.5,
    size = 1,
  ) => {
    const image = id ? media.get(id) : undefined;
    if (!image) return;
    const isVideo = image instanceof HTMLVideoElement;
    const iw = isVideo ? image.videoWidth : image.naturalWidth,
      ih = isVideo ? image.videoHeight : image.naturalHeight;
    if (!iw || !ih) return;
    if (isVideo) {
      activeVideos.add(image);
      const target =
        Number.isFinite(image.duration) && image.duration > 0
          ? Math.max(0, at) % image.duration
          : 0;
      if (Math.abs(image.currentTime - target) > 0.25 && !image.seeking)
        image.currentTime = target;
      if (playing && image.paused) void image.play().catch(() => {});
      else if (!playing && !image.paused) image.pause();
    }
    const phase = Math.min(1, Math.max(0, at / Math.max(1, duration))),
      zoom =
        motion === "zoom" ? 1.02 + 0.06 * phase : motion === "pan" ? 1.08 : 1;
    const sw = w * size,
      sh = h * size,
      ratio = Math.max(sw / iw, sh / ih) * zoom;
    const cw = sw / ratio,
      ch = sh / ratio,
      px = motion === "pan" ? 0.2 + 0.6 * phase : 0.5;
    c.drawImage(
      image,
      (iw - cw) * px,
      (ih - ch) * 0.5,
      cw,
      ch,
      w * x - sw / 2,
      h * y - sh / 2,
      sw,
      sh,
    );
  };
  c.save();
  if (d.beatPulse) {
    const z = 1 + Math.min(0.025, energy * 0.12);
    c.translate(w / 2, h / 2);
    c.scale(z, z);
    c.translate(-w / 2, -h / 2);
  }
  picture(d.backgroundId, t, d.motion);
  for (const s of d.scenes)
    if (s.start <= t && t < s.end) {
      c.globalAlpha = fade(s, t);
      if (s.type === "image" || s.type === "video")
        picture(s.assetId, t - s.start, s.motion, s.x, s.y, s.size);
      else if (s.type === "color") {
        c.fillStyle = s.color;
        c.fillRect(0, 0, w, h);
      }
      c.globalAlpha = 1;
    }
  c.fillStyle = d.template === "minimal" ? "#000a" : "#0005";
  c.fillRect(0, 0, w, h);
  c.restore();
  for (const item of media.values())
    if (
      item instanceof HTMLVideoElement &&
      !activeVideos.has(item) &&
      !item.paused
    )
      item.pause();
  const visualizer = (v: VideoDesign) => {
    if (!wave || !fft || v.visualizer === "none") return;
    c.save();
    c.strokeStyle = v.highlight;
    c.fillStyle = v.highlight;
    c.globalAlpha = v.opacity;
    c.lineWidth = (v.thickness * w) / dw;
    const cx = w * v.visualizerX,
      cy = h * v.visualizerY,
      span = w * v.visualizerSize;
    if (["waveform", "mirrored", "scope"].includes(v.visualizer)) {
      for (const sign of v.visualizer === "mirrored" ? [1, -1] : [1]) {
        c.beginPath();
        for (let i = 0; i < 128; i++) {
          const x = cx - span / 2 + (i * span) / 127,
            y =
              cy -
              wave[Math.floor((i / 128) * wave.length)] *
                h *
                0.24 *
                v.sensitivity *
                sign;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    } else
      for (let i = 0; i < 48; i++) {
        const value = Math.min(
            1,
            (fft[Math.min(fft.length - 1, Math.floor(2 * 500 ** (i / 48)))] /
              255) *
              v.sensitivity,
          ),
          x = cx - span / 2 + (i * span) / 48;
        if (v.visualizer === "bars")
          c.fillRect(
            x,
            cy - value * h * 0.24,
            (span / 48) * 0.65,
            value * h * 0.24 + 1,
          );
        else if (v.visualizer === "circle") {
          const a = (i / 48) * Math.PI * 2,
            r = Math.min(w, h) * 0.16;
          c.beginPath();
          c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          c.lineTo(
            cx + Math.cos(a) * (r + value * h * 0.12),
            cy + Math.sin(a) * (r + value * h * 0.12),
          );
          c.stroke();
        } else {
          c.beginPath();
          c.arc(
            cx + Math.cos(i * 2.39996) * span * 0.45 * Math.sqrt(i / 48),
            cy + Math.sin(i * 2.39996) * h * 0.16,
            1 + value * 6 + energy * 3,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      }
    c.restore();
  };
  visualizer(d);
  const family =
    d.font === "serif" ? "Georgia" : d.font === "mono" ? "monospace" : "Arial";
  const wrapped = (text: string, max: number) => {
    const rows: string[] = [];
    let row = "";
    for (const word of text.split(/\s+/)) {
      const next = (row + " " + word).trim();
      if (row && c.measureText(next).width > max) {
        rows.push(row);
        row = word;
      } else row = next;
    }
    if (row) rows.push(row);
    return rows;
  };
  const lyrics = (v: VideoDesign, x = 0.5) => {
    if (p.visuals.timing.assetId !== v.audioAssetId) return;
    for (const line of p.visuals.timing.lines
      .filter((l) => l.start !== null && l.start <= t && t < l.end!)
      .slice(0, 2)) {
      let size = (v.fontSize * h) / 1080;
      c.font = `${size}px ${family}`;
      let rows = wrapped(line.text, w * 0.84);
      while (rows.length > 3 && size > 9) {
        size *= 0.9;
        c.font = `${size}px ${family}`;
        rows = wrapped(line.text, w * 0.84);
      }
      let y = h * v.lyricY,
        index = 0;
      c.textAlign = "left";
      c.textBaseline = "top";
      c.shadowColor = "#000";
      c.shadowBlur = 3;
      for (const row of rows) {
        let cursor = w * x - c.measureText(row).width / 2;
        for (const word of row.split(/\s+/)) {
          const stamp = line.words[index++];
          c.fillStyle =
            v.kind === "karaoke" && stamp?.start != null && stamp.start <= t
              ? v.highlight
              : v.color;
          c.fillText(word, cursor, y);
          cursor += c.measureText(word + " ").width;
        }
        y += size * 1.3;
      }
      if (v.template === "classic") {
        const next = p.visuals.timing.lines.find(
          (l) => l.start !== null && l.start >= line.end!,
        );
        if (next) {
          c.font = `${size * 0.65}px ${family}`;
          c.fillStyle = "#abb0b8";
          c.textAlign = "center";
          for (const row of wrapped(next.text, w * 0.84)) {
            c.fillText(row, w * x, y + size * 0.3);
            y += size * 0.85;
          }
        }
      }
      c.shadowBlur = 0;
    }
  };
  if (d.kind !== "visualizer" && !d.scenes.some((s) => s.type === "lyrics"))
    lyrics(d);
  for (const s of d.scenes)
    if (s.start <= t && t < s.end) {
      if (s.type === "waveform" || s.type === "spectrum")
        visualizer({
          ...d,
          visualizer: s.type === "waveform" ? "waveform" : "bars",
          visualizerX: s.x,
          visualizerY: s.y,
          visualizerSize: s.size,
          opacity: fade(s, t),
          highlight: s.color,
        });
      else if (s.type === "lyrics") {
        c.save();
        c.globalAlpha = fade(s, t);
        lyrics(
          {
            ...d,
            lyricY: s.y,
            fontSize: Math.max(20, d.fontSize * s.size),
            color: s.color,
          },
          s.x,
        );
        c.restore();
      }
    }
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign,
  ) => {
    c.font = `${size}px ${family}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = "top";
    c.shadowColor = "#000";
    c.shadowBlur = 3;
    c.fillText(value, x, y);
    c.shadowBlur = 0;
  };
  if (d.intro && t >= d.start && t - d.start < 4) {
    text(p.name, w * 0.06, h * 0.07, h * 0.045, d.color, "left");
    text(p.artist, w * 0.06, h * 0.13, h * 0.025, "#ced0d5", "left");
  }
  for (const s of d.scenes)
    if (["text", "title"].includes(s.type) && s.start <= t && t < s.end) {
      c.globalAlpha = fade(s, t);
      text(s.text, w * s.x, h * s.y, h * 0.07 * s.size, s.color, "center");
      c.globalAlpha = 1;
    }
}
