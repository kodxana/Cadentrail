import { IntegrationsButton } from "./IntegrationsButton";
import { AgentsButton } from "./AgentsButton";
import { GenerationNotice } from "./GenerationNotice";
import {
  renderPresetLabel,
  renderingExplanation,
  languageExplanation,
  vocalExplanation,
} from "./generationPresentation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Radio,
  Play,
  Square,
  Volume2,
  VolumeX,
  RotateCcw,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import {
  ExperienceAtmosphere,
  ExperienceSwitch,
  ExperienceWordmark,
} from "./ExperienceChrome";
import { PersonalizationButton } from "./Personalization";
import { HelpButton } from "./Help";
import { useProfile } from "./profile";
import { api, post } from "./api";
import { claimPlayback } from "./playbackFocus";
import { RadioPlayer, type RadioTrack } from "./radioPlayer";
import { setState } from "./store";
import { durationLabel } from "./libraryModel";
import { DownloadCancelled } from "./modelDownloads";
import { VramStatus } from "./VramStatus";
import { SavedStations, type StationSettings } from "./SavedStations";
type Station = {
  id: string;
  state: string;
  message: string;
  progress: number | null;
  error: string | null;
  tracks: RadioTrack[];
  count: number;
  description: string;
  serverTime: number;
  modelResidency: string;
  revision: number;
  language: string;
  effectiveLanguage: string;
  pendingDirection: boolean;
  vocals: string;
  effectiveVocals: string;
  settings: StationSettings;
  directionState: "live" | "ready" | "preparing";
};
type Options = {
  available: boolean;
  model: string;
  models: { id: string; name: string }[];
  languages: { id: string; name: string }[];
};
export function RadioRoom() {
  const profile = useProfile();
  const [description, setDescription] = useState(""),
    [model, setModel] = useState("Qwen/Qwen3-4B"),
    [vocals, setVocals] = useState("auto"),
    [quality, setQuality] = useState("balanced"),
    [length, setLength] = useState("long"),
    [language, setLanguage] = useState("auto");
  const [options, setOptions] = useState<Options | null>(null),
    [station, setStation] = useState<Station | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [editing, setEditing] = useState(false),
    [draftDescription, setDraftDescription] = useState(""),
    [draftLanguage, setDraftLanguage] = useState("auto"),
    [draftVocals, setDraftVocals] = useState("auto"),
    [draftRevision, setDraftRevision] = useState(1),
    [draftSettings, setDraftSettings] = useState<StationSettings | null>(null),
    [connection, setConnection] = useState<
      "connecting" | "connected" | "reconnecting" | "offline"
    >("connecting");
  const root = useRef<HTMLElement>(null),
    audioHost = useRef<HTMLSpanElement>(null),
    sid = useRef<string | null>(null),
    alive = useRef(true),
    epoch = useRef(0),
    refreshLive = useRef<() => void>(() => {}),
    modelChosen = useRef(false);
  const [player] = useState(
    () =>
      new RadioPlayer(
        () => {},
        () => {},
      ),
  );
  const playback = useSyncExternalStore(player.subscribe, player.snapshot);
  const { playing, time, volume, muted } = playback,
    song = playback.track;
  const upcoming = station?.tracks.find(
    (track) => track.number > (song?.number ?? Infinity),
  );
  useEffect(() => {
    alive.current = true;
    const unmount = audioHost.current
      ? player.mount(audioHost.current)
      : () => {};
    const previous = document.activeElement as HTMLElement;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".app > :not(.music-dock):not(dialog)",
      ),
    ).map((el) => ({ el, inert: el.inert }));
    background.forEach(({ el }) => {
      el.inert = true;
    });
    root.current?.focus({ preventScroll: true });
    claimPlayback("radio");
    void api<Options>("/radio/options")
      .then((available) => {
        if (!alive.current) return;
        setOptions(available);
        if (!modelChosen.current) setModel(available.model);
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
    const leaving = () => player.pause();
    window.addEventListener("pagehide", leaving);
    return () => {
      alive.current = false;
      leaving();
      unmount();
      window.removeEventListener("pagehide", leaving);

      background.forEach(({ el, inert }) => {
        el.inert = inert;
      });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (station) player.sync(station.tracks, station.serverTime);
  }, [station]);
  const adopt = (value: Station | null) => {
    if (sid.current !== (value?.id ?? null)) {
      player.clear();
      sid.current = value?.id ?? null;
      setEditing(false);
      if (value) player.listen();
    }
    setStation(value);
    setLoaded(true);
  };
  useEffect(() => {
    let stopped = false,
      sequence = 0,
      timer: ReturnType<typeof setTimeout>,
      controller: AbortController | undefined;
    const poll = async (join = false) => {
      const version = epoch.current,
        request = ++sequence;
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      try {
        const value = await api<Station | null>("/radio/current", {
          signal: controller.signal,
        });
        if (!stopped && request === sequence && version === epoch.current) {
          adopt(value);
          setConnection("connected");
          if (join && value) {
            player.sync(value.tracks, value.serverTime);
            player.listen();
          }
        }
      } catch {
        if (!stopped && request === sequence) {
          setConnection(navigator.onLine ? "reconnecting" : "offline");
          setLoaded(true);
        }
      }
      if (!stopped && request === sequence)
        timer = setTimeout(() => void poll(), navigator.onLine ? 1500 : 5000);
    };
    const rejoin = () => {
      if (!stopped) void poll(true);
    };
    const visible = () => {
      if (document.visibilityState === "visible") rejoin();
    };
    const offline = () => setConnection("offline");
    refreshLive.current = rejoin;
    player.onRejoin = rejoin;
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", visible);
    window.addEventListener("online", rejoin);
    window.addEventListener("offline", offline);
    void poll();
    return () => {
      stopped = true;
      sequence++;
      controller?.abort();
      clearTimeout(timer);
      player.onRejoin = undefined;
      refreshLive.current = () => {};
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", visible);
      window.removeEventListener("online", rejoin);
      window.removeEventListener("offline", offline);
    };
  }, []);
  const start = async () => {
    player.unlock();
    setBusy(true);
    setError("");
    try {
      const value = await post<Station>("/radio", {
        description,
        model,
        vocals,
        quality,
        length,
        language,
      });
      if (alive.current) {
        epoch.current++;
        adopt(value);
        player.listen();
      }
    } catch (e) {
      if (alive.current && !(e instanceof DownloadCancelled)) {
        if ((e as { status?: number }).status === 409) {
          const current = await api<Station | null>("/radio/current").catch(
            (failure) => {
              if (alive.current) setError(failure.message);
              return null;
            },
          );
          if (current) {
            epoch.current++;
            adopt(current);
            player.listen();
          }
        } else setError((e as Error).message);
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const stop = async () => {
    const id = sid.current;
    if (!id) return;
    player.pause();
    setBusy(true);
    epoch.current++;
    try {
      await api(`/radio/${id}`, { method: "DELETE" });
      epoch.current++;
      adopt(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const editDirection = () => {
    if (!station) return;
    setDraftSettings(null);
    setDraftDescription(station.description);
    setDraftLanguage(station.language);
    setDraftVocals(station.vocals);
    setDraftRevision(station.revision);
    setEditing(true);
    setError("");
  };
  const retune = async () => {
    if (!station) return;
    setBusy(true);
    setError("");
    epoch.current++;
    try {
      const value = await post<Station>(`/radio/${station.id}/direction`, {
        ...draftSettings,
        description: draftDescription,
        language: draftLanguage,
        vocals: draftVocals,
        revision: draftRevision,
      });
      if (alive.current) {
        epoch.current++;
        adopt(value);
        setEditing(false);
      }
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        if ((e as { status?: number }).status === 409) {
          const latest = await api<Station | null>("/radio/current").catch(
            (failure) => {
              if (alive.current) setError(failure.message);
              return null;
            },
          );
          if (alive.current && latest?.id === sid.current) {
            adopt(latest);
            setDraftRevision(latest.revision);
          }
        }
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const currentSettings: StationSettings = station?.settings ?? {
    description,
    model,
    vocals,
    quality,
    length,
    language,
  };
  const choosePreset = (value: StationSettings) => {
    setError("");
    if (station) {
      setDraftSettings(value);
      setDraftDescription(value.description);
      setDraftLanguage(value.language);
      setDraftVocals(value.vocals);
      setDraftRevision(station.revision);
      setEditing(true);
      requestAnimationFrame(() =>
        document
          .getElementById("live-station-direction")
          ?.scrollIntoView({ block: "center", behavior: "auto" }),
      );
    } else {
      setDescription(value.description);
      modelChosen.current = true;
      setModel(value.model);
      setVocals(value.vocals);
      setQuality(value.quality);
      setLength(value.length);
      setLanguage(value.language);
    }
  };
  const languages = options?.languages ?? [
    { id: "auto", name: "From station description" },
  ];
  const languageName = (code: string) =>
    languages.find((value) => value.id === code)?.name ?? code;

  return (
    <section
      className="listening-room radio-room"
      aria-label="Radio mode"
      tabIndex={-1}
      ref={root}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (
          e.code === "Space" &&
          !(e.target as HTMLElement).closest(
            "button,input,textarea,select,summary,a",
          )
        ) {
          e.preventDefault();
          player.mute();
        }
        if (
          e.key === "Escape" &&
          !(e.target as HTMLElement).closest("input,textarea,select")
        )
          setState({ radio: false, listening: false });
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <ExperienceAtmosphere />
      <header className="listening-room-header">
        <ExperienceWordmark room="RADIO" />
        <ExperienceSwitch
          listening={false}
          radio
          onCreate={() => setState({ listening: false, radio: false })}
          onListen={() => setState({ listening: true })}
        />
        <div className="radio-utilities">
          <AgentsButton/><IntegrationsButton/><HelpButton context="radio" />
          <PersonalizationButton />
        </div>
      </header>
      <span ref={audioHost} className="radio-audio-host" aria-hidden="true" />
      {connection !== "connected" && connection !== "connecting" && (
        <div className="radio-connection" role="status">
          <span>
            {connection === "offline"
              ? "Connection lost. Buffered music can continue."
              : "Reconnecting to your live station…"}
          </span>
          <button
            type="button"
            onClick={() => {
              player.unlock();
              refreshLive.current();
            }}
          >
            Reconnect
          </button>
        </div>
      )}
      <main className={"radio-body" + (station ? " is-tuned" : "")}>
        {!loaded ? (
          <p role="status" className="radio-note">
            Joining Radio…
          </p>
        ) : !station ? (
          <div className="radio-tune">
            <span className="eyebrow">
              <Radio size={17} /> YOUR OWN FREQUENCY
            </span>
            <h1>
              {profile.name
                ? `What sounds good, ${profile.name}?`
                : "What sounds good today?"}
            </h1>
            <p>
              Describe your station. YuE2 makes the music, with fresh lyrics and
              a new story each time.
            </p>
            <SavedStations
              settings={currentSettings}
              onChoose={choosePreset}
              disabled={busy}
              live={false}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void start();
              }}
            >
              <label htmlFor="station-description">
                The music you want to hear
              </label>
              <textarea
                id="station-description"
                autoComplete="off"
                maxLength={2000}
                required
                minLength={3}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Warm late-night soul, intimate duets, soft drums and stories about finding your way home…"
              />
              <div className="radio-directions" aria-label="Station ideas">
                {[
                  "Late-night jazz & soul",
                  "Sunlit indie folk",
                  "Dreamy electronic pop",
                ].map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => setDescription(idea)}
                  >
                    {idea}
                  </button>
                ))}
              </div>
              <div className="radio-settings">
                <label>
                  Vocal direction
                  <select
                    aria-label="Vocal direction"
                    aria-describedby="radio-vocal-hint"
                    value={vocals}
                    onChange={(e) => setVocals(e.target.value)}
                  >
                    <option value="auto">Automatic</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="duet">Duet</option>
                    <option value="instrumental">Instrumental</option>
                  </select>
                  <small id="radio-vocal-hint" className="field-hint">
                    {vocalExplanation(vocals)}
                  </small>
                </label>
                <label>
                  Lyric language
                  <select
                    aria-label="Lyric language"
                    aria-describedby="radio-language-hint"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={vocals === "instrumental"}
                  >
                    {languages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <small id="radio-language-hint" className="field-hint">
                    {vocals === "instrumental"
                      ? "No written lyrics are requested for an instrumental."
                      : languageExplanation}
                  </small>
                </label>
                <label>
                  Lyric writer
                  <select
                    value={model}
                    onChange={(e) => {
                      modelChosen.current = true;
                      setModel(e.target.value);
                    }}
                  >
                    {(
                      options?.models ?? [{ id: model, name: "Qwen3 · 4B" }]
                    ).map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Rendering preset
                  <select
                    aria-label="Rendering preset"
                    aria-describedby="radio-render-hint"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                  >
                    <option value="balanced">
                      {renderPresetLabel("balanced")}
                    </option>
                    <option value="high">{renderPresetLabel("high")}</option>
                  </select>
                  <small id="radio-render-hint" className="field-hint">
                    {renderingExplanation}
                  </small>
                </label>
                <label>
                  Target song length
                  <select
                    aria-label="Target song length"
                    aria-describedby="radio-length-hint"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                  >
                    <option value="standard">About 3 min</option>
                    <option value="long">About 5 min</option>
                  </select>
                  <small id="radio-length-hint" className="field-hint">
                    Long requests a more developed arrangement. Actual length
                    and endings depend on the take.
                  </small>
                </label>
              </div>
              <button
                className="primary radio-start"
                disabled={
                  busy || !options?.available || description.trim().length < 3
                }
              >
                {busy ? <span className="spinner" /> : <Radio size={18} />}{" "}
                {busy ? "Starting your station…" : "Start station"}
              </button>
            </form>
            {options && !options.available && (
              <p className="radio-note" role="status">
                Radio is available on your Runpod GPU workstation. This device
                can still create projects and play your Library.
              </p>
            )}
            <p className="radio-note">
              Just for this moment. Songs stay out of your Library and are
              removed after they play. Your station keeps broadcasting when you
              close the tab. Press Stop Radio to end it. Optional models ask
              before downloading.
            </p>
          </div>
        ) : (
          <>
            <section className="radio-now" aria-label="Now on your station">
              <span className="eyebrow">
                <Radio size={16} />{" "}
                {song
                  ? `ON YOUR STATION · ${String(song.number).padStart(2, "0")}`
                  : "TUNING IN"}
              </span>
              <div className="radio-record" aria-hidden="true">
                <div className="radio-record-rings" />
                <Radio size={42} />
              </div>
              <h1>{song?.title ?? "Your next discovery is taking shape."}</h1>
              <p className="radio-song-style">
                {song?.style ?? station.description}
              </p>
              <GenerationNotice value={song?.truncated} />
              <div className="radio-controls">
                <div className="listening-progress">
                  <span>{durationLabel(time)}</span>
                  <progress
                    aria-label="Live song progress"
                    max={song?.duration ?? 1}
                    value={Math.min(time, song?.duration ?? 1)}
                  />
                  <span>{durationLabel(song?.duration ?? 0)}</span>
                </div>
                {!playing && song && (
                  <div className="listening-buttons">
                    <button
                      className="radio-join"
                      onClick={() => {
                        player.unlock();
                        refreshLive.current();
                      }}
                    >
                      <Play size={18} fill="currentColor" /> Join live
                    </button>
                  </div>
                )}
                <span className="radio-live-label">
                  {playback.waiting
                    ? "Buffering…"
                    : playback.crossfading
                      ? "Blending into the next song"
                      : playing
                        ? "LIVE"
                        : song
                          ? "Join the live broadcast"
                          : "Preparing the next song"}
                </span>
                <div className="radio-volume">
                  <button
                    aria-label={muted ? "Unmute radio" : "Mute radio"}
                    onClick={() => player.mute()}
                  >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    aria-label="Radio volume"
                    onChange={(e) => player.volume(Number(e.target.value))}
                  />
                </div>
              </div>
            </section>
            <aside className="radio-station">
              <span className="eyebrow">THE STATION</span>
              <p>{station.description}</p>
              <span className="radio-language">
                {station.effectiveVocals === "instrumental" ? (
                  "Instrumental requested"
                ) : (
                  <>
                    Requested lyrics · {languageName(station.effectiveLanguage)}
                    {station.language === "auto" ? " · from description" : ""}
                  </>
                )}
              </span>
              {editing ? (
                <form
                  className="radio-retune"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void retune();
                  }}
                >
                  <label htmlFor="live-station-direction">
                    Shape the next songs
                  </label>
                  <textarea
                    id="live-station-direction"
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    minLength={3}
                    maxLength={2000}
                    rows={4}
                    required
                  />
                  <div
                    className="radio-directions radio-live-ideas"
                    aria-label="New station ideas"
                  >
                    {[
                      {
                        name: "J-pop",
                        description:
                          "Bright Japanese J-pop, lively melodies and fresh stories",
                        language: "ja",
                      },
                      {
                        name: "Classical",
                        description:
                          "Expressive classical orchestral music, strings, woodwinds and piano, instrumental",
                        language: "auto",
                      },
                      {
                        name: "Jazz",
                        description:
                          "Warm late-night jazz, piano trio, brushed drums, instrumental",
                        language: "auto",
                      },
                    ].map((idea) => (
                      <button
                        type="button"
                        key={idea.name}
                        onClick={() => {
                          setDraftDescription(idea.description);
                          setDraftLanguage(idea.language);
                          setDraftVocals("auto");
                        }}
                      >
                        {idea.name}
                      </button>
                    ))}
                  </div>
                  <label htmlFor="live-station-vocals">Vocal direction</label>
                  <select
                    id="live-station-vocals"
                    aria-label="Vocal direction"
                    aria-describedby="live-vocal-hint"
                    value={draftVocals}
                    onChange={(e) => setDraftVocals(e.target.value)}
                  >
                    <option value="auto">Automatic · follows the music</option>
                    <option value="instrumental">Instrumental</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="duet">Duet</option>
                  </select>
                  <p id="live-vocal-hint" className="radio-note">
                    {vocalExplanation(draftVocals)}
                  </p>
                  <label htmlFor="live-station-language">Lyric language</label>
                  <select
                    id="live-station-language"
                    aria-label="Lyric language"
                    aria-describedby="live-language-hint"
                    disabled={draftVocals === "instrumental"}
                    value={draftLanguage}
                    onChange={(e) => setDraftLanguage(e.target.value)}
                  >
                    {languages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {draftVocals !== "instrumental" && (
                    <p id="live-language-hint" className="radio-note">
                      {languageExplanation}
                    </p>
                  )}
                  {draftSettings && (
                    <p className="radio-note">
                      Saved settings: {draftSettings.model.split("/").pop()} ·{" "}
                      {renderPresetLabel(draftSettings.quality)} ·{" "}
                      {draftSettings.length === "long"
                        ? "Long songs"
                        : "Standard songs"}
                      . Missing models ask before downloading.
                    </p>
                  )}
                  <p className="radio-note">
                    The current music keeps playing. Your new direction takes
                    the next available place once it is ready.
                  </p>
                  <div className="radio-retune-actions">
                    <button
                      type="submit"
                      className="primary"
                      disabled={busy || draftDescription.trim().length < 3}
                    >
                      <Check size={16} /> Apply direction
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button className="radio-adjust" onClick={editDirection}>
                  <SlidersHorizontal size={16} /> Adjust station
                </button>
              )}
              <SavedStations
                settings={currentSettings}
                onChoose={choosePreset}
                disabled={busy}
                live
              />
              {station.pendingDirection && (
                <p role="status" className="radio-note">
                  {station.directionState === "ready"
                    ? "New direction is ready for the next transition."
                    : "Preparing your new direction. Current music keeps playing."}
                </p>
              )}
              <div className="radio-progress" role="status">
                <span className={station.error ? "" : "radio-status-dot"} />
                <strong>
                  {station.state === "Ready" && upcoming
                    ? "Next song is ready"
                    : station.state}
                </strong>
                <p>{station.message}</p>
                {station.state !== "Ready" && !station.error && (
                  <progress
                    max={1}
                    value={
                      station.progress === null
                        ? undefined
                        : Math.min(1, Math.max(0, station.progress))
                    }
                    aria-label="Radio generation progress"
                  />
                )}
              </div>
              {upcoming && (
                <div className="radio-up-next">
                  <span className="eyebrow">UP NEXT</span>
                  <strong>{upcoming.title}</strong>
                  <span>{durationLabel(upcoming.duration)}</span>
                </div>
              )}
              {station.error && (
                <div role="alert">
                  <p>{station.error}</p>
                  <button
                    onClick={() => {
                      epoch.current++;
                      void post<Station>(`/radio/${station.id}/retry`)
                        .then(setStation)
                        .catch((e) => setError(e.message));
                    }}
                  >
                    <RotateCcw size={16} /> Retry next song
                  </button>
                </div>
              )}
              <p className="radio-note">
                The next song is prepared while you listen. There may be a wait
                between songs. The station stays live when you leave this screen
                or close the tab. Opening Radio joins the live position. Mute
                silences your audio while the broadcast keeps moving.
              </p>
              <button disabled={busy} onClick={() => void stop()}>
                <Square size={15} /> Stop Radio
              </button>
            </aside>
          </>
        )}
        {(error || playback.error) && (
          <div className="radio-error" role="alert">
            {error || playback.error}
            <button
              onClick={() => {
                setError("");
                player.dismissError();
              }}
              aria-label="Dismiss radio message"
            >
              ×
            </button>
          </div>
        )}
      </main>
      <footer className="radio-footer">
        <span>Original music · YuE2</span>
        <VramStatus />
        <span>Temporary songs. Live until you stop it.</span>
      </footer>
    </section>
  );
}
