import { useEffect, useRef, useState } from "react";
import { HelpLink } from "./Help";
import {
  Image as ImageIcon,
  Film,
  Type,
  Clock,
  FolderOpen,
  Upload,
  Download,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import {
  useStudio,
  getState,
  setState,
  edit,
  save,
  report,
  notice,
  refreshCandidates,
} from "./store";
import { api, post, fileApi } from "./api";
import { type Job } from "./model";
import { Jobs } from "./Jobs";
import { TimingEditor } from "./TimingEditor";
import { QuickVideo } from "./QuickVideo";
import { CoverDesigner } from "./CoverDesigner";
import type { VisualAsset } from "./visual-model";
import {visualUrl,queueVisual} from "./visualActions";
export function Visuals() {
  const s = useStudio(),
    p = s.project!,
    v = p.visuals,
    a = v.artwork;
  const [providers, setProviders] = useState<any>({}),
    [selected, setSelected] = useState<string | null>(v.coverId),
    [preview, setPreview] = useState<VisualAsset | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void api("/providers").then(setProviders).catch(report);
  }, []);
  const image =
    v.assets.find((x) => x.id === selected && x.kind !== "video") ??
    v.assets.filter((x) => x.kind !== "video").at(-1);
  const buildPrompt = () =>
    edit("Artwork prompt from song", (p) => {
      const a = p.visuals.artwork;
      a.prompt = [
        a.style,
        `Cover artwork for “${p.name}”`,
        p.generation.style,
        a.mood && `Mood: ${a.mood}`,
        a.environment && `Environment: ${a.environment}`,
        a.colors && `Colors: ${a.colors}`,
        a.characters === "none"
          ? "No people or characters"
          : "Expressive characters inspired by the song",
        a.composition,
        "No text, no lettering.",
      ]
        .filter(Boolean)
        .join(". ");
    });
  const generate = () =>
    queueVisual(
      "artwork",
      {
        prompt: a.prompt,
        negativePrompt: a.negativePrompt,
        aspect: a.aspect,
        count: a.count,
        seed: a.seed,
        steps: a.steps,
        candidateId: p.creative.selectedCandidateId,
        parentId: selected,
      },
      v.video.audioAssetId,
    ).catch(report);
  const useCover = (asset: VisualAsset) =>
    edit("Set project cover", (p) => {
      p.visuals.coverId = asset.id;
      p.visuals.cover.backgroundId = asset.id;
    });
  return (
    <main className={`visuals-workspace tab-${s.visualsTab}`}>
      <div className="visuals-heading">
        <div>
          <span className="eyebrow">VISUALS</span>
          <h1>
            {
              {
                artwork: "Give your song a world.",
                cover: "Cover designer",
                timing: "Lyric timing",
                video: "Music video",
                assets: "Your visual library",
              }[s.visualsTab]
            }
          </h1>
          <HelpLink topic={{ artwork: "artwork", cover: "artwork", timing: "timing", video: "video", assets: "visuals" }[s.visualsTab]} />
        </div>
        <button onClick={() => file.current?.click()}>
          <Upload size={15} />
          Import image or video
        </button>
        <input
          ref={file}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void (async () => {
                await save();
                if (getState().dirty) throw new Error("Save before importing");
                const result = await fileApi<VisualAsset>(
                  "/projects/" + p.id + "/visuals/import",
                  f,
                );
                await refreshCandidates();
                setSelected(result.id);
              })().catch(report);
            e.target.value = "";
          }}
        />
      </div>
      <nav className="visuals-tabs" aria-label="Visual editors">
        {(
          [
            ["artwork", "Artwork", ImageIcon],
            ["cover", "Cover designer", Type],
            ["timing", "Lyric timing", Clock],
            ["video", "Music video", Film],
            ["assets", "Media library", FolderOpen],
          ] as const
        ).map(([tab, label, Icon]) => (
          <button
            key={tab}
            className={s.visualsTab === tab ? "active" : ""}
            onClick={() => setState({ visualsTab: tab })}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>
      <Jobs kinds={["artwork", "align", "video", "cover", "music-video"]} />
      {s.visualsTab === "artwork" ? (
        <div className="artwork-layout">
          <section className="visual-controls">
            <h2>Artwork direction</h2>
            <label className="field">
              <span>Artwork description</span>
              <textarea
                aria-label="Artwork description"
                value={a.prompt}
                onChange={(e) =>
                  edit("Artwork description", (p) => {
                    p.visuals.artwork.prompt = e.target.value;
                  })
                }
                placeholder="A warm late-night café, orange light spilling onto the street, playful illustrated composition…"
              />
            </label>
            <button className="text-button" onClick={buildPrompt}>
              Build an editable prompt from this song <ArrowUpRight size={13} />
            </button>
            <div className="simple-options">
              <label className="field">
                <span>Visual style</span>
                <select
                  value={a.style}
                  onChange={(e) =>
                    edit("Artwork style", (p) => {
                      p.visuals.artwork.style = e.target.value;
                      p.visuals.artwork.prompt =
                        p.visuals.artwork.prompt.replace(
                          /\nVisual style: [^\n]*$/,
                          "",
                        ) +
                        "\nVisual style: " +
                        e.target.value;
                    })
                  }
                >
                  {[
                    "Editorial illustration",
                    "Analog photography",
                    "Oil painting",
                    "Graphic print",
                    "Cinematic realism",
                    "Minimal abstract",
                  ].map((style) => (
                    <option key={style}>{style}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Aspect ratio</span>
                <select
                  value={a.aspect}
                  onChange={(e) =>
                    edit("Artwork format", (p) => {
                      p.visuals.artwork.aspect = e.target
                        .value as typeof a.aspect;
                    })
                  }
                >
                  {["1:1", "16:9", "9:16", "4:5"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>
            <details className="visual-advanced">
              <summary>Art direction</summary>
              {(["mood", "environment", "colors", "composition"] as const).map(
                (key) => (
                  <label className="field" key={key}>
                    <span>{key}</span>
                    <input
                      value={a[key]}
                      onChange={(e) =>
                        edit("Artwork " + key, (p) => {
                          p.visuals.artwork[key] = e.target.value;
                        })
                      }
                    />
                  </label>
                ),
              )}
              <label className="field">
                <span>Characters</span>
                <select
                  value={a.characters}
                  onChange={(e) =>
                    edit("Artwork characters", (p) => {
                      p.visuals.artwork.characters = e.target
                        .value as typeof a.characters;
                    })
                  }
                >
                  <option value="none">No characters</option>
                  <option value="suggested">
                    Characters inspired by the song
                  </option>
                </select>
              </label>
              <button onClick={buildPrompt}>Update the visible prompt</button>
              <p className="help">
                Artwork is generated without text. Add clean typography in the
                cover designer.
              </p>
              <label className="field">
                <span>Negative prompt</span>
                <textarea
                  value={a.negativePrompt}
                  onChange={(e) =>
                    edit("Negative prompt", (p) => {
                      p.visuals.artwork.negativePrompt = e.target.value;
                    })
                  }
                />
              </label>
              <div className="simple-options">
                <label className="field">
                  <span>Seed</span>
                  <input
                    type="number"
                    value={a.seed}
                    min="0"
                    onChange={(e) =>
                      edit("Artwork seed", (p) => {
                        p.visuals.artwork.seed = +e.target.value;
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Steps</span>
                  <input
                    type="number"
                    value={a.steps}
                    min="15"
                    max="50"
                    onChange={(e) =>
                      edit("Artwork steps", (p) => {
                        p.visuals.artwork.steps = +e.target.value;
                      })
                    }
                  />
                </label>
              </div>
            </details>
            <div className="takes-choice">
              <strong>Images</strong>
              <div className="segmented">
                {([1, 2, 4] as const).map((n) => (
                  <button
                    key={n}
                    className={a.count === n ? "active" : ""}
                    onClick={() =>
                      edit("Artwork count", (p) => {
                        p.visuals.artwork.count = n;
                      })
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="primary wide"
              disabled={!providers.artwork?.available || !a.prompt.trim()}
              onClick={() => void generate()}
            >
              <ImageIcon size={16} />
              Generate artwork
            </button>
            <p className="provider-state">
              {providers.artwork?.message ?? "Checking artwork provider…"}
            </p>
          </section>
          <section className="artwork-gallery">
            {image ? (
              <div className="artwork-selected">
                <img src={visualUrl(p.id, image.id)} alt={image.name} />
                <div>
                  <strong>{image.name}</strong>
                  <button onClick={() => useCover(image)}>Set as cover</button>
                  <button
                    onClick={() => {
                      edit("Design cover", (p) => {
                        p.visuals.cover.backgroundId = image.id;
                      });
                      setState({ visualsTab: "cover" });
                    }}
                  >
                    Add typography
                  </button>
                  <button
                    onClick={() => {
                      edit("Video background", (p) => {
                        p.visuals.video.backgroundId = image.id;
                      });
                      setState({ visualsTab: "video" });
                    }}
                  >
                    Use in video
                  </button>
                  <a
                    className="button"
                    aria-label={"Download " + image.name}
                    href={visualUrl(p.id, image.id)}
                    download
                  >
                    <Download size={14} />
                  </a>
                  <button
                    title="Create variation"
                    onClick={() => {
                      edit("Artwork variation", (p) => {
                        p.visuals.artwork.prompt = image.prompt || a.prompt;
                        p.visuals.artwork.seed = Math.floor(
                          Math.random() * 2 ** 31,
                        );
                      });
                    }}
                  >
                    Variation
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-artwork">
                <ImageIcon size={42} />
                <h2>A cover with a point of view.</h2>
                <p>
                  Create artwork from your song, upload an image, or start with
                  a clean typographic cover.
                </p>
                <button onClick={() => setState({ visualsTab: "cover" })}>
                  Open cover designer
                </button>
              </div>
            )}
            <div className="artwork-thumbnails">
              {v.assets
                .filter((x) => x.kind !== "video")
                .map((x) => (
                  <button
                    key={x.id}
                    className={image?.id === x.id ? "selected" : ""}
                    onClick={() => setSelected(x.id)}
                  >
                    <img
                      src={visualUrl(p.id, x.id)}
                      alt={x.name}
                      loading="lazy"
                    />
                    <span>
                      {x.name}
                      {v.coverId === x.id ? " · cover" : ""}
                    </span>
                  </button>
                ))}
            </div>
          </section>
        </div>
      ) : s.visualsTab === "cover" ? (
        <CoverDesigner />
      ) : s.visualsTab === "timing" ? (
        <TimingEditor
          available={!!providers.alignment?.available}
          upgraded={!!providers.alignment?.voiceDetection}
        />
      ) : s.visualsTab === "video" ? (
        <QuickVideo
          alignmentAvailable={!!providers.alignment?.available}
          artworkAvailable={!!providers.artwork?.available}
          upgradedAlignment={providers.alignment?.provider==="qwen3"}
        />
      ) : (
        <section className="visual-media-library">
          <h2>Everything for this song</h2>
          <div className="media-grid">
            {v.assets.map((x) => (
              <article key={x.id}>
                {x.kind === "video" ? (
                  <button className="video-thumb" onClick={() => setPreview(x)}>
                    <Film size={35} />
                    <span>Play video</span>
                  </button>
                ) : (
                  <img src={visualUrl(p.id, x.id)} alt={x.name} />
                )}
                <input
                  aria-label="Visual asset name"
                  value={x.name}
                  onChange={(e) =>
                    edit("Rename visual", (p) => {
                      p.visuals.assets.find((a) => a.id === x.id)!.name =
                        e.target.value;
                    })
                  }
                />
                <small>
                  {x.width} × {x.height} · {x.model}
                </small>
                <div>
                  <a className="button" href={visualUrl(p.id, x.id)} download>
                    <Download size={13} />
                    Download
                  </a>
                  {x.kind !== "video" && (
                    <button onClick={() => useCover(x)}>Set cover</button>
                  )}
                </div>
                <details>
                  <summary>Source & settings</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        prompt: x.prompt,
                        seed: x.seed,
                        sourceAudio: x.sourceAssetId,
                        parent: x.parentId,
                        ...x.settings,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </article>
            ))}
          </div>
          {!v.assets.length && (
            <p className="help">
              Artwork, covers and videos you create or import appear here.
            </p>
          )}
        </section>
      )}
      {preview && (
        <div className="modal-backdrop">
          <div className="modal video-modal">
            <div className="modal-title">
              <h2>{preview.name}</h2>
              <button onClick={() => setPreview(null)}>Close</button>
            </div>
            <video controls autoPlay src={visualUrl(p.id, preview.id)} />
          </div>
        </div>
      )}
    </main>
  );
}
