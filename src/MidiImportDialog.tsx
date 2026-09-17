import { useState } from "react";
import { X } from "lucide-react";
import { Dialog } from "./Dialog";
import { canUseMidiTiming, hasArrangement } from "./midiImport";
import { confirmMidiImport, setState, useStudio } from "./store";

export function MidiImportDialog() {
  const s = useStudio(),
    pending = s.pendingMidi!,
    p = s.project!;
  const { result } = pending;
  const [useFileTiming, setFileTiming] = useState(
    !hasArrangement(p) && canUseMidiTiming(result),
  );
  const [error, setError] = useState("");
  const close = () => setState({ pendingMidi: null });
  return (
    <Dialog
      titleId="midi-import-title"
      className="midi-import-dialog"
      onClose={close}
    >
      <div className="modal-title">
        <h2 id="midi-import-title">Import MIDI</h2>
        <button aria-label="Cancel MIDI import" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <p className="reference-filename">{pending.fileName}</p>
      <p>
        {result.tracks.length} parts · {Number(result.tempo.toFixed(2))} BPM ·{" "}
        {result.timeSignature.join("/")}
      </p>
      <label className="field">
        <span>Arrangement timing</span>
        <select
          aria-label="Arrangement timing"
          value={useFileTiming ? "file" : "project"}
          onChange={(e) => setFileTiming(e.target.value === "file")}
        >
          <option value="file" disabled={!canUseMidiTiming(result)}>
            Use MIDI tempo and meter
          </option>
          <option value="project">
            Keep project tempo ({Number(p.tempo.toFixed(2))} BPM) and meter
          </option>
        </select>
      </label>
      <p className="help">
        {useFileTiming
          ? "Updates the whole project grid. Existing audio is not time-stretched. Undo restores the previous timing."
          : "Keeps the current grid. Imported notes follow the project tempo, so their speed may differ from the source."}
      </p>
      <details>
        <summary>Parts and playback limitations</summary>
        <ul className="midi-parts">
          {result.tracks.map((t, i) => (
            <li key={i}>
              <span>{t.name}</span>
              <small>{t.notes.length.toLocaleString()} notes</small>
            </li>
          ))}
        </ul>
        {result.warnings.map((w) => (
          <p className="help" key={w}>
            {w}
          </p>
        ))}
      </details>
      <p>
        All parts stay editable in Studio. After importing, choose one melody to
        guide YuE2. Importing alone does not change the model's reference.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="reference-actions">
        <button onClick={close}>Cancel</button>
        <button
          className="primary"
          onClick={() => {
            try {
              confirmMidiImport(useFileTiming);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Import {result.tracks.length} parts
        </button>
      </div>
    </Dialog>
  );
}
