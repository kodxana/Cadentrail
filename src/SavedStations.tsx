import { useEffect, useRef, useState } from "react";
import { Bookmark, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { api } from "./api";

export type StationSettings = {
  description: string;
  model: string;
  vocals: string;
  quality: string;
  length: string;
  language: string;
};
type Preset = {
  id: string;
  name: string;
  settings: StationSettings;
  revision: number;
  updatedAt: number;
};
export function SavedStations({
  settings,
  onChoose,
  live,
  disabled = false,
}: {
  settings: StationSettings;
  onChoose: (value: StationSettings) => void;
  live: boolean;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<Preset[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [editor, setEditor] = useState<Preset | null>(null),
    [name, setName] = useState(""),
    [replace, setReplace] = useState(false),
    [removing, setRemoving] = useState<Preset | null>(null);
  const alive = useRef(true),
    readSequence = useRef(0);
  const reload = async () => {
    const sequence = ++readSequence.current;
    try {
      const next = await api<Preset[]>("/radio/presets");
      if (alive.current && sequence === readSequence.current) setItems(next);
    } catch (e) {
      if (alive.current && sequence === readSequence.current)
        setError((e as Error).message);
    }
  };
  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, []);
  const edit = (preset?: Preset) => {
    setEditor(
      preset ?? {
        id: crypto.randomUUID().replaceAll("-", ""),
        name: "",
        settings: { ...settings },
        revision: 0,
        updatedAt: 0,
      },
    );
    setName(preset?.name ?? "");
    setReplace(false);
    setRemoving(null);
    setError("");
    setMessage("");
  };
  const save = async () => {
    if (!editor) return;
    setBusy(true);
    setError("");
    try {
      await api(`/radio/presets/${editor.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          settings:
            replace || editor.revision === 0 ? settings : editor.settings,
          revision: editor.revision,
        }),
      });
      setEditor(null);
      setMessage("Station saved. Generated songs stay temporary.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError("");
    try {
      await api(`/radio/presets/${removing.id}?revision=${removing.revision}`, {
        method: "DELETE",
      });
      setRemoving(null);
      setMessage("Saved station removed. Live playback is unchanged.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <details
      className="radio-presets"
      onToggle={(e) => {
        if (e.currentTarget.open) void reload();
      }}
    >
      <summary>
        <Bookmark size={16} /> Saved stations <span>{items.length}</span>
      </summary>
      <div className="radio-presets-actions">
        <button
          type="button"
          disabled={disabled || busy || settings.description.trim().length < 3}
          onClick={() => edit()}
        >
          <Plus size={15} />
          Save current settings
        </button>
        <button
          type="button"
          aria-label="Reload saved stations"
          disabled={disabled || busy}
          onClick={() => {
            setError("");
            void reload();
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="radio-note">
        Names and settings stay on this workstation. Songs are never saved here.
      </p>
      {items.length === 0 && !error && (
        <p className="radio-note">
          Save a station to return to its sound later.
        </p>
      )}
      <ul className="radio-preset-list">
        {items.map((preset) => (
          <li key={preset.id}>
            <button
              className="radio-preset-use"
              type="button"
              disabled={disabled || busy}
              aria-label={`Use station ${preset.name}`}
              onClick={() => {
                onChoose({ ...preset.settings });
                setMessage(
                  live
                    ? `Review ${preset.name}, then apply its direction.`
                    : `${preset.name} loaded. Start Radio when ready.`,
                );
              }}
            >
              <strong>{preset.name}</strong>
              <span>{preset.settings.description}</span>
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              aria-label={`Edit saved station ${preset.name}`}
              onClick={() => edit(preset)}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              aria-label={`Remove saved station ${preset.name}`}
              onClick={() => {
                setRemoving(preset);
                setEditor(null);
                setError("");
              }}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      {editor && (
        <form
          className="radio-preset-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="saved-station-name">Station name</label>
          <input
            id="saved-station-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            autoComplete="off"
          />
          {editor.revision > 0 && (
            <label className="radio-preset-replace">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Replace settings with the current direction
            </label>
          )}
          <div className="radio-retune-actions">
            <button
              className="primary"
              type="submit"
              disabled={
                busy ||
                !name.trim() ||
                (replace && settings.description.trim().length < 3)
              }
            >
              Save station
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => setEditor(null)}
            >
              Cancel save
            </button>
          </div>
        </form>
      )}
      {removing && (
        <div className="radio-preset-remove">
          <p>Remove “{removing.name}” from saved stations?</p>
          <div className="radio-retune-actions">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void remove()}
            >
              Remove station
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => setRemoving(null)}
            >
              Keep station
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="radio-note">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="radio-note">
          {message}
        </p>
      )}
    </details>
  );
}
