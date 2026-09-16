import { useStudio, edit, report, setState } from "./store";
import { useEffect, useState } from "react";
import { queueVisual, visualUrl } from "./visualActions";
import { Download } from "lucide-react";
export function CoverDesigner() {
  const s = useStudio(),
    p = s.project!,
    d = p.visuals.cover;
  const images = p.visuals.assets.filter((a) => a.kind !== "video");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let url = "";
    const timer = setTimeout(() => {
      void fetch("/api/projects/" + p.id + "/cover-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
        signal: abort.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error("Cover preview could not be rendered");
          return r.blob();
        })
        .then((blob) => {
          if (!abort.signal.aborted) {
            url = URL.createObjectURL(blob);
            setPreview(url);
          }
        })
        .catch((e) => {
          if (!abort.signal.aborted) report(e);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [p.id, d, p.name, p.artist]);
  return (
    <div className="cover-layout">
      <section className="visual-controls">
        <h2>Cover designer</h2>
        <label className="field">
          <span>Background</span>
          <select
            value={d.backgroundId ?? ""}
            onChange={(e) =>
              edit("Cover background", (p) => {
                p.visuals.cover.backgroundId = e.target.value || null;
              })
            }
          >
            <option value="">Solid color</option>
            {images.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {(["title", "artist", "subtitle"] as const).map((key) => (
          <label className="field" key={key}>
            <span>{key}</span>
            <input
              value={d[key]}
              placeholder={
                key === "title"
                  ? p.name
                  : key === "artist"
                    ? p.artist
                    : "Optional"
              }
              onChange={(e) =>
                edit("Cover " + key, (p) => {
                  p.visuals.cover[key] = e.target.value;
                  if (key === "artist") p.artist = e.target.value;
                })
              }
            />
          </label>
        ))}
        <div className="simple-options">
          <label className="field">
            <span>Font</span>
            <select
              value={d.font}
              onChange={(e) =>
                edit("Cover font", (p) => {
                  p.visuals.cover.font = e.target.value as typeof d.font;
                })
              }
            >
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label className="field">
            <span>Alignment</span>
            <select
              value={d.align}
              onChange={(e) =>
                edit("Cover alignment", (p) => {
                  p.visuals.cover.align = e.target.value as typeof d.align;
                })
              }
            >
              {["left", "center", "right"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        {(
          [
            ["size", "Type size", 20, 240, 1],
            ["textY", "Text position", 0.05, 0.92, 0.01],
            ["tracking", "Letter spacing", -5, 25, 1],
            ["stroke", "Text outline", 0, 6, 1],
            ["overlay", "Background shade", 0, 0.9, 0.01],
            ["scale", "Image zoom", 1, 5, 0.01],
            ["x", "Image horizontal", 0, 1, 0.01],
            ["y", "Image vertical", 0, 1, 0.01],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={d[key]}
              onChange={(e) =>
                edit(label, (p) => {
                  p.visuals.cover[key] = +e.target.value;
                })
              }
            />
          </label>
        ))}
        <div className="simple-options">
          {(["color", "background"] as const).map((key) => (
            <label className="field" key={key}>
              <span>{key === "color" ? "Text color" : "Background color"}</span>
              <input
                type="color"
                value={d[key]}
                onChange={(e) =>
                  edit("Cover color", (p) => {
                    p.visuals.cover[key] = e.target.value;
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={d.shadow}
            onChange={(e) =>
              edit("Type shadow", (p) => {
                p.visuals.cover.shadow = e.target.checked;
              })
            }
          />
          Text shadow
        </label>
        <button
          className="primary wide"
          onClick={() => void queueVisual("cover", { design: d }).catch(report)}
        >
          <Download size={15} />
          Save cover · 2048 × 2048
        </button>
        <small>A new PNG is saved to your media library.</small>
      </section>
      <section className="cover-stage">
        <div className="cover-preview" style={{ background: d.background }}>
          {preview ? (
            <img
              className="rendered-cover-preview"
              src={preview}
              alt="Rendered cover preview"
            />
          ) : (
            <span className="cover-loading">Preparing cover preview…</span>
          )}
        </div>
        <p className="help">
          Rendered preview · title and artist remain editable.
        </p>
        <button onClick={() => setState({ visualsTab: "assets" })}>
          View saved covers
        </button>
      </section>
    </div>
  );
}
