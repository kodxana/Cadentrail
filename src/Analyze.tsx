import { useEffect, useRef, useState } from "react";
import { useStudio, setState, selectedClip, placeAsset } from "./store";
import { SongPlayer } from "./SongPlayer";
import { engine } from "./audio";
import { useSize, setupCanvas } from "./Canvas";
import { db, clamp } from "./model";
import { Waveform } from "./Waveform";
import { PerformancePanel } from "./PerformancePanel";
import { RealAudioTools } from "./RealAudioTools";
export function Scope() {
  const canvas = useRef<HTMLCanvasElement>(null),
    [host, size] = useSize<HTMLDivElement>();
  const [mode, setMode] = useState<"spectrum" | "scope" | "stereo">("spectrum");
  useEffect(() => {
    let frame: number,
      last = 0;
    const draw = (time: number) => {
      if (canvas.current && time - last > 32) {
        last = time;
        const ctx = setupCanvas(canvas.current, size.width, 140);
        ctx.fillStyle = "#1c2028";
        ctx.fillRect(0, 0, size.width, 140);
        ctx.strokeStyle = "#343944";
        for (let i = 1; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(0, i * 28);
          ctx.lineTo(size.width, i * 28);
          ctx.stroke();
        }
        if (mode === "stereo") {
          const center = size.width / 2;
          ctx.strokeStyle = "#dad5cb";
          ctx.beginPath();
          (engine.meter.stereo ?? []).forEach(([l, r], i) => {
            const x = center + (l - r) * 65,
              y = 70 - (l + r) * 35;
            if (!i) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.fillStyle = "#d0d0d2";
          ctx.font = "11px DM Sans,system-ui";
          ctx.fillText(
            "Correlation " +
              engine.meter.correlation.toFixed(2) +
              " · L/R " +
              engine.meter.rms.map((v) => db(v)).join(" / ") +
              " dBFS",
            12,
            130,
          );
        } else if (engine.analyser) {
          const analyser = engine.analyser,
            data = new Float32Array(
              mode === "spectrum"
                ? analyser.frequencyBinCount
                : analyser.fftSize,
            );
          if (mode === "spectrum") analyser.getFloatFrequencyData(data);
          else analyser.getFloatTimeDomainData(data);
          ctx.strokeStyle = "#dad5cb";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let x = 0; x < size.width; x++) {
            const index =
              mode === "spectrum"
                ? Math.min(
                    data.length - 1,
                    Math.floor(
                      (20 *
                        Math.pow(
                          engine.ctx!.sampleRate / 2 / 20,
                          x / size.width,
                        )) /
                        (engine.ctx!.sampleRate / analyser.fftSize),
                    ),
                  )
                : Math.floor((x / size.width) * data.length);
            const y =
              mode === "spectrum"
                ? 140 - clamp((data[index] + 100) / 100, 0, 1) * 130
                : 70 - data[index] * 65;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    draw(0);
    return () => cancelAnimationFrame(frame);
  }, [mode, size]);
  return (
    <div className="scope">
      <div className="toolbar compact">
        <span className="eyebrow">LIVE MASTER SIGNAL</span>
        <div className="spacer" />
        <button
          className={mode === "spectrum" ? "active" : ""}
          onClick={() => setMode("spectrum")}
        >
          Spectrum
        </button>
        <button
          className={mode === "scope" ? "active" : ""}
          onClick={() => setMode("scope")}
        >
          Oscilloscope
        </button>
        <button
          className={mode === "stereo" ? "active" : ""}
          onClick={() => setMode("stereo")}
        >
          Stereo scope
        </button>
      </div>
      <div ref={host}>
        <canvas ref={canvas} />
      </div>
      {mode === "spectrum" && (
        <div
          className="spectrum-labels"
          style={{ position: "relative", height: 18 }}
        >
          {[20, 100, 1000, 10000].map((hz) => (
            <span
              key={hz}
              style={{
                position: "absolute",
                left:
                  (100 * Math.log(hz / 20)) /
                    Math.log((engine.ctx?.sampleRate ?? 48000) / 40) +
                  "%",
              }}
            >
              {hz >= 1000 ? hz / 1000 + " kHz" : hz + " Hz"}
            </span>
          ))}
          <span style={{ position: "absolute", right: 0 }}>
            {((engine.ctx?.sampleRate ?? 48000) / 2000).toFixed(1)} kHz
          </span>
        </div>
      )}
    </div>
  );
}
export function Analyze() {
  const s = useStudio(),
    [assetId, setAssetId] = useState(selectedClip()?.assetId ?? ""),
    [zoom, setZoom] = useState(1);
  const asset = s.assets.find((a) => a.id === assetId) ?? s.assets[0],
    a = asset?.analysis;
  return (
    <section className="workspace analysis">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">LISTEN CLOSER</span>
          <h2>Audio analysis</h2>
        </div>
        <select
          aria-label="Analysis asset"
          value={asset?.id ?? ""}
          onChange={(e) => {
            setAssetId(e.target.value);
            const track = s.project?.tracks.find((t) =>
              t.clips.some((c) => c.assetId === e.target.value),
            );
            const clip = track?.clips.find((c) => c.assetId === e.target.value);
            if (track && clip)
              setState({ selectedTrack: track.id, selectedClips: [clip.id] });
          }}
        >
          {s.assets.map((a) => (
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <Scope />
      {asset && selectedClip()?.assetId === asset.id ? (
        <Waveform />
      ) : asset ? (
        <div className="analysis-audio-preview">
          <SongPlayer
            assetId={asset.id}
            name={asset.name}
            duration={asset.duration}
          />
          <button onClick={() => placeAsset(asset)}>
            Add to arrangement to edit this audio
          </button>
        </div>
      ) : null}
      <PerformancePanel />
      {asset && <RealAudioTools asset={asset} />}
      {asset && a ? (
        <>
          <div className="analysis-stats">
            {[
              [
                "Integrated loudness",
                a.lufs === null ? "Silence" : a.lufs.toFixed(1),
                "LUFS",
              ],
              ["True peak", a.truePeakDb.toFixed(1), "dBTP"],
              ["RMS", a.rmsDb.map((n) => n.toFixed(1)).join(" / "), "dBFS"],
              ["Stereo correlation", a.correlation.toFixed(2), "−1 → +1"],
              ["Tempo estimate", a.bpm?.toFixed(1) ?? "—", "BPM"],
              ["Duration", a.duration.toFixed(2), "seconds"],
            ].map(([label, value, unit]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{unit}</small>
              </div>
            ))}
          </div>
          <div className="toolbar">
            <span className="eyebrow">SPECTROGRAM</span>
            <span className="help">Log frequency · −90 to 0 dB</span>
            <div className="spacer" />
            <label>
              Zoom
              <input
                type="range"
                min="1"
                max="8"
                step="0.5"
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
              />
            </label>
          </div>
          <div className="spectrogram">
            <div
              className="freq-labels"
              style={{ position: "relative", height: 245, padding: 0 }}
            >
              {[20000, 5000, 1000, 200, 30].map((hz) => (
                <span
                  key={hz}
                  style={{
                    position: "absolute",
                    left: 5,
                    top: Math.min(
                      231,
                      (245 * Math.log(20000 / hz)) / Math.log(20000 / 30),
                    ),
                  }}
                >
                  {hz >= 1000 ? hz / 1000 + " kHz" : hz + " Hz"}
                </span>
              ))}
            </div>
            <div className="spectrogram-scroll">
              <img
                style={{ width: zoom * 100 + "%", maxWidth: "none" }}
                src={"/api/assets/" + asset.id + "/spectrogram"}
                alt={"Measured spectrogram of " + asset.name}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  void engine.seek(
                    (((e.clientX - r.left) / r.width) *
                      asset.duration *
                      (s.project?.tempo ?? 120)) /
                      60,
                  );
                }}
              />
            </div>
          </div>
          <div className="analysis-notes">
            <h4>Editing notes</h4>
            {a.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <p>
              {a.clippedSamples.toLocaleString()} clipped samples ·{" "}
              {(a.silenceFraction * 100).toFixed(1)}% near-silence · DC{" "}
              {a.dcOffset.map((n) => n.toFixed(5)).join(" / ")}
            </p>
            <p>
              Tempo confidence: {(a.bpmConfidence * 100).toFixed(0)}%. Musical
              quality, lyric intelligibility and vocalist identity require
              listening.
            </p>
            {a.bpm && (
              <button
                onClick={() => {
                  if (s.project) {
                    setState({
                      notice:
                        "Tempo estimates are advisory. Set the project tempo in transport when you have checked the downbeat.",
                    });
                  }
                }}
              >
                About the beat grid
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <strong>Bring in a recording.</strong>
          <p>
            Imported audio and YuE2 takes receive waveform, loudness and
            spectral analysis automatically.
          </p>
        </div>
      )}
    </section>
  );
}
