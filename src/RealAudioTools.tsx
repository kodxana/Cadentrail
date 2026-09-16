import { useState } from "react";
import { type Asset } from "./model";
import { useStudio, report, placeAsset } from "./store";
import { queueVisual } from "./visualActions";
import { SongPlayer } from "./SongPlayer";
import { Jobs } from "./Jobs";
export function RealAudioTools({ asset }: { asset: Asset }) {
  const s = useStudio(),
    p = s.project!;
  const [start, setStart] = useState(0),
    [duration, setDuration] = useState(30),
    [reconstruct, setReconstruct] = useState(true);
  const encodings = (p.audioEncodings ?? []).filter(
    (e) => e.sourceAssetId === asset.id,
  );
  return (
    <details className="real-audio-tools">
      <summary>
        Real-audio tools <span>Experimental · Mothersuperior v4</span>
      </summary>
      <p>
        Encode a recording into YuE2 semantic tokens and audition a
        reconstructed copy. This is a research tool; reconstruction can change
        the performance. The source audio is preserved. The MERT recording
        encoder is a separate download; you can review its size before
        continuing.
      </p>
      <div className="real-audio-controls">
        <label>
          Start · seconds
          <input
            type="number"
            min="0"
            max={Math.max(0, asset.duration - 1)}
            value={start}
            onChange={(e) => setStart(Math.max(0, +e.target.value))}
          />
        </label>
        <label>
          Length · seconds
          <input
            type="number"
            min="1"
            max="180"
            value={duration}
            onChange={(e) =>
              setDuration(Math.max(1, Math.min(180, +e.target.value)))
            }
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={reconstruct}
            onChange={(e) => setReconstruct(e.target.checked)}
          />
          Reconstruct an audio copy
        </label>
        <button
          disabled={!s.status.available}
          onClick={() =>
            void queueVisual(
              "tokenize",
              {
                start,
                duration,
                reconstruct,
                seed: p.generation.seed,
                odeSteps: 32,
              },
              asset.id,
            ).catch(report)
          }
        >
          {reconstruct ? "Encode & reconstruct" : "Encode recording"}
        </button>
      </div>
      <small>
        YuE2 remains the music engine. Models run sequentially on the GPU.
        Non-commercial model license.
      </small>
      <Jobs kinds={["tokenize"]} />
      {encodings.map((e) => {
        const audio = s.assets.find((a) => a.id === e.resultAssetId);
        return (
          <div className="encoding-result" key={e.id}>
            <strong>
              {e.duration.toFixed(1)} sec · {e.tokens.toLocaleString()} semantic
              tokens
            </strong>
            <a href={"/api/projects/" + p.id + "/encodings/" + e.id} download>
              Download tokens
            </a>
            {audio && (
              <>
                <SongPlayer
                  assetId={audio.id}
                  name={audio.name}
                  duration={audio.duration}
                />
                <button onClick={() => placeAsset(audio)}>
                  Place reconstruction in arrangement
                </button>
              </>
            )}
            <details>
              <summary>Model and lineage</summary>
              <pre>{JSON.stringify(e, null, 2)}</pre>
            </details>
          </div>
        );
      })}
      <a
        href="https://huggingface.co/Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4"
        target="_blank"
        rel="noreferrer"
      >
        Model documentation
      </a>
    </details>
  );
}
