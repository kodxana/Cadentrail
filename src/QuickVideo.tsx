import { automaticVideoLyrics } from "./automaticVideoLyrics";
import { useState } from "react";
import { Film, Download, SlidersHorizontal, ArrowUpRight } from "lucide-react";
import { useStudio, edit, report, setState } from "./store";
import { queueVisual, visualUrl } from "./visualActions";
import { VideoComposer } from "./VideoComposer";
import type { VisualAsset } from "./visual-model";

export function QuickVideo({
  alignmentAvailable,
  artworkAvailable,
  upgradedAlignment = false,
}: {
  alignmentAvailable: boolean;
  artworkAvailable: boolean;
  upgradedAlignment?: boolean;
}) {
  const s = useStudio(),
    p = s.project!,
    v = p.visuals;
  const [advanced, setAdvanced] = useState(false),
    [style, setStyle] = useState("cinematic"),
    [preset, setPreset] = useState("1080p"),
    [lyricChoices, setLyricChoices] = useState<Record<string, boolean>>({}),
    [alignmentBackend, setAlignmentBackend] = useState("auto"),
    [prompt, setPrompt] = useState(
      v.artwork.prompt ||
        `Cinematic editorial illustration for “${p.name}”. ${p.generation.style}. Beautiful atmospheric lighting, a thoughtful composition. No text or lettering.`,
    );
  const source =
    s.assets.find((a) => a.id === v.video.audioAssetId) ??
    s.assets.find(
      (a) =>
        a.id ===
        p.candidates.find((c) => c.id === p.creative.selectedCandidateId)
          ?.assetId,
    ) ??
    s.assets[0];
  const lyricKey = p.id + ":" + (source?.id ?? "");
  const lyricDefault = automaticVideoLyrics(p, s.assets, source?.id);
  const lyrics = lyricChoices[lyricKey] ?? lyricDefault;
  const cover = v.assets.find(
      (a) => a.id === (v.cover.backgroundId || v.coverId),
    ),
    renders = v.assets.filter((a) => a.kind === "video" && a.jobId),
    last = renders.at(-1);
  const working = s.jobs.some(
    (j) =>
      j.projectId === p.id &&
      j.kind === "music-video" &&
      !["Complete", "Failed", "Cancelled"].includes(j.state),
  );
  const result = s.jobs.find(
    (j) =>
      j.projectId === p.id &&
      j.kind === "music-video" &&
      j.state === "Complete",
  );
  const customize = (asset?: VisualAsset) => {
    if (asset?.settings.design)
      edit("Edit rendered video composition", (p) => {
        p.visuals.video = asset.settings.design as typeof v.video;
      });
    setAdvanced(true);
  };
  if (advanced)
    return (
      <>
        <div className="video-mode-bar">
          <button onClick={() => setAdvanced(false)}>← Automatic video</button>
          <span>Your full video composition</span>
        </div>
        <VideoComposer alignmentAvailable={alignmentAvailable} />
      </>
    );
  return (
    <div className="quick-video">
      <section className="quick-video-controls">
        <span className="eyebrow">ONE SONG. A COMPLETE VIDEO.</span>
        <h2>Let the music lead.</h2>
        <p>
          Artwork, gentle camera movement and visuals that follow your audio.
          Ready to share.
        </p>
        <label className="field">
          <span>Song</span>
          <select
            value={source?.id ?? ""}
            onChange={(e) =>
              edit("Choose video song", (p) => {
                p.visuals.video.audioAssetId = e.target.value;
              })
            }
          >
            {s.assets.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="quick-style-choice">
          {[
            ["cinematic", "Cinematic", "Warm, spacious, slow motion"],
            ["clean", "Clean", "Quiet type, restrained visuals"],
            ["energy", "Energy", "Pulse and a circular spectrum"],
          ].map(([key, label, help]) => (
            <button
              key={key}
              className={style === key ? "active" : ""}
              onClick={() => setStyle(key)}
            >
              <strong>{label}</strong>
              <span>{help}</span>
            </button>
          ))}
        </div>
        <label className="field">
          <span>Made for</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="1080p">YouTube · wide</option>
            <option value="vertical">Shorts, Reels & TikTok · vertical</option>
            <option value="square">Social · square</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={lyrics}
            onChange={(e) =>
              setLyricChoices({ ...lyricChoices, [lyricKey]: e.target.checked })
            }
          />
          Include lyrics when timing is reliable
        </label>
        {!lyricDefault && (
          <small className="field-hint">
            Instrumental takes start with audio-reactive visuals. Your written
            lyrics stay saved.
          </small>
        )}
        {lyrics && (
          <details>
            <summary>Lyric timing options</summary>
            <label className="field">
              <span>Alignment model</span>
              <select
                value={alignmentBackend}
                onChange={(e) => setAlignmentBackend(e.target.value)}
              >
                <option value="auto">
                  Automatic ·{" "}
                  {upgradedAlignment ? "Qwen3 with voice detection" : "Whisper"}
                </option>
                <option value="qwen3" disabled={!upgradedAlignment}>
                  Qwen3 · words and voice detection
                </option>
                <option value="whisper">Whisper · conservative fallback</option>
              </select>
            </label>
            <p className="help">
              Reviewed timing is kept. If new alignment is needed, confirm any
              model downloads before the job starts.
            </p>
          </details>
        )}
        <details>
          <summary>Artwork direction</summary>
          <p className="help">
            {cover
              ? "Uses your project artwork. Change it in Artwork."
              : artworkAvailable
                ? "Two backgrounds will be generated on this GPU."
                : "Uses a clean background. Add artwork any time."}
          </p>
          {!cover && (
            <textarea
              aria-label="Automatic video artwork direction"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          )}
        </details>
        <button
          className="primary wide"
          disabled={!source || working}
          onClick={() =>
            void queueVisual(
              "music-video",
              { style, preset, lyrics, prompt, alignmentBackend },
              source?.id,
            ).catch(report)
          }
        >
          <Film size={17} />
          {working ? "Creating your video…" : "Create my music video"}
        </button>
        <button
          disabled={!source || working}
          onClick={() =>
            void queueVisual(
              "music-video",
              {
                style,
                preset,
                lyrics,
                prompt,
                alignmentBackend,
                preview: true,
              },
              source?.id,
            ).catch(report)
          }
        >
          Render 12-second preview
        </button>
        <small>
          Preview uses existing artwork and reviewed timing at low resolution.
          Full video can generate missing assets. Original audio and previous
          videos are kept.
        </small>
        <button className="customize-video" onClick={() => customize()}>
          <SlidersHorizontal size={16} />
          Customize video
        </button>
      </section>
      <section className="quick-video-stage">
        {last ? (
          <>
            <video
              className="finished-music-video"
              controls
              src={visualUrl(p.id, last.id)}
              preload="metadata"
            />
            <div className="finished-video-actions">
              <div>
                <strong>
                  {(last.settings.design as { preview?: boolean } | undefined)
                    ?.preview
                    ? "Preview · "
                    : ""}
                  {last.name}
                </strong>
                <span>
                  {last.width} × {last.height} ·{" "}
                  {Math.round(last.duration ?? 0)} sec
                </span>
              </div>
              <a
                className="button primary"
                href={visualUrl(p.id, last.id)}
                download
              >
                <Download size={15} />
                Download video
              </a>
              <button onClick={() => customize(last)}>
                Edit this video <ArrowUpRight size={14} />
              </button>
            </div>
            {result?.result?.timingNeedsReview && (
              <div className="timing-required">
                <strong>Your visualizer is ready.</strong>
                <p>
                  A few lyrics need timing corrections before they can be
                  included.
                </p>
                <button onClick={() => setState({ visualsTab: "timing" })}>
                  Correct lyric timing
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={"automatic-video-poster " + style}>
            {cover && (
              <img src={visualUrl(p.id, cover.id)} alt="Project artwork" />
            )}
            <div className="automatic-video-title">
              <span>YOUR MUSIC, IN MOTION</span>
              <h2>{p.name}</h2>
              <p>{p.artist || "An original music video"}</p>
            </div>
            <span className="poster-caption">
              {working
                ? "Your video is being created. You can keep working."
                : "Artwork • camera movement • audio-reactive visuals"}
            </span>
          </div>
        )}
        {renders.length > 1 && (
          <details>
            <summary>Previous videos · {renders.length - 1}</summary>
            <div className="previous-video-list">
              {renders
                .slice(0, -1)
                .reverse()
                .map((a) => (
                  <a key={a.id} href={visualUrl(p.id, a.id)} download>
                    {a.name}
                    <Download size={15} />
                  </a>
                ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
