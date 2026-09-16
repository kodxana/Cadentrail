import { claimPlayback, registerPlayback, ownsPlayback } from "./playbackFocus";

export type RadioTrack = {
  id: string;
  title: string;
  style: string;
  url: string;
  duration: number;
  number: number;
  truncated: boolean;
  startedAt: number | null;
};
export type RadioPlayback = {
  track: RadioTrack | null;
  playing: boolean;
  time: number;
  volume: number;
  muted: boolean;
  crossfading: boolean;
  waiting: boolean;
  error: string;
};
export function equalPowerCurves(steps = 65) {
  return {
    out: Float32Array.from({ length: steps }, (_, i) =>
      Math.cos(((i / (steps - 1)) * Math.PI) / 2),
    ),
    into: Float32Array.from({ length: steps }, (_, i) =>
      Math.sin(((i / (steps - 1)) * Math.PI) / 2),
    ),
  };
}
export interface RadioMixer {
  resume(): Promise<void>;
  pause(): void;
  close(restoreSession?: boolean): void;
  gain(index: number, value: number): void;
  fade(from: number, to: number, seconds: number): void;
  volume(value: number): void;
  watch?(callback: (state: string) => void): void;
}
function webMixer(audio: HTMLAudioElement[]): RadioMixer {
  const context = new AudioContext({ latencyHint: "playback" }),
    master = context.createGain();
  master.connect(context.destination);
  const gains = audio.map((element) => {
    const gain = context.createGain();
    context.createMediaElementSource(element).connect(gain);
    gain.connect(master);
    return gain;
  });
  const gain = (index: number, value: number) => {
    const param = gains[index].gain;
    param.cancelScheduledValues(context.currentTime);
    param.setValueAtTime(value, context.currentTime);
  };
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  const previousType = session?.type;
  try {
    if (session) session.type = "playback";
  } catch {
    /* Optional browser capability. */
  }
  return {
    watch: (callback) => {
      context.onstatechange = () => callback(context.state);
    },
    resume: () => context.resume(),
    pause: () => {
      void context.suspend().catch(() => {});
    },
    close: (restoreSession = true) => {
      context.onstatechange = null;
      try {
        if (restoreSession && session?.type === "playback" && previousType)
          session.type = previousType;
      } catch {
        /* Optional browser capability. */
      }
      void context.close().catch(() => {});
    },
    gain,
    volume: (value) => {
      master.gain.setTargetAtTime(value, context.currentTime, 0.02);
    },
    fade: (from, to, seconds) => {
      const curves = equalPowerCurves();
      gain(from, 1);
      gain(to, 0);
      gains[from].gain.setValueCurveAtTime(
        curves.out,
        context.currentTime,
        seconds,
      );
      gains[to].gain.setValueCurveAtTime(
        curves.into,
        context.currentTime,
        seconds,
      );
    },
  };
}

/** Two streaming decks follow the station clock; only listening is controlled here. */
export class RadioPlayer {
  private audio: HTMLAudioElement[] = [];
  private mixer?: RadioMixer;
  private slots: (RadioTrack | null)[] = [null, null];
  private current = 0;
  private clock = { server: Date.now() / 1000, local: performance.now() };
  private wanted = false;
  private transition: {
    from: number;
    to: number;
    start: number;
    seconds: number;
  } | null = null;
  private starting = false;
  private interrupted = false;
  private playAttempt = 0;
  onRejoin?: () => void;
  private revision = 0;
  private finished: string[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private release?: () => void;
  private listeners = new Set<() => void>();
  private state: RadioPlayback = {
    track: null,
    playing: false,
    time: 0,
    volume: 0.8,
    muted: false,
    crossfading: false,
    waiting: false,
    error: "",
  };
  constructor(
    private consumed: (id: string) => void,
    private started: (id: string) => void,
    private createAudio = () => new Audio(),
    private createMixer = webMixer,
  ) {}
  snapshot = () => this.state;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  private patch(value: Partial<RadioPlayback>) {
    this.state = { ...this.state, ...value };
    if ("playing" in value || "track" in value || "muted" in value)
      this.mediaControls();
    this.listeners.forEach((cb) => cb());
  }
  private mediaControls(clear = false) {
    if (!ownsPlayback("radio")) return;
    const session =
      typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!session) return;
    // No native transport action may move a live station backwards or forwards.
    const actions: MediaSessionAction[] = [
      "seekto",
      "seekforward",
      "seekbackward",
      "nexttrack",
      "previoustrack",
    ];
    for (const action of actions) {
      try {
        session.setActionHandler(action, clear ? null : () => {});
      } catch {
        /* Browser support varies. */
      }
    }
    try {
      session.setActionHandler(
        "play",
        clear
          ? null
          : () => {
              this.mute(false);
              this.unlock();
              this.requestLive();
            },
      );
      session.setActionHandler("pause", clear ? null : () => this.mute(true));
      session.setPositionState();
      session.playbackState = clear
        ? "none"
        : this.state.playing && !this.state.muted
          ? "playing"
          : "paused";
      session.metadata =
        !clear && typeof MediaMetadata !== "undefined"
          ? new MediaMetadata({
              title: this.state.track?.title ?? "Live Radio",
              artist: "Cadentrail Radio",
            })
          : null;
    } catch {
      /* Older browsers still use the in-app controls. */
    }
  }
  mount(host: HTMLElement) {
    this.audio = [this.createAudio(), this.createAudio()];
    this.audio.forEach((element, index) => {
      element.dataset.player = "radio";
      element.preload = "auto";
      host.appendChild(element);
      element.onloadedmetadata = () => {
        if (index === this.current) this.seekLive(index);
      };
      element.ontimeupdate = () => this.tick(); // Media events also run when background timers are throttled.
      element.onwaiting = () => {
        if (index === this.current) this.patch({ waiting: true });
      };
      element.onplaying = () => {
        claimPlayback("radio", element);
        if (index === this.current) {
          this.patch({ playing: true, waiting: false, error: "" });
          if (this.slots[index]) this.started(this.slots[index]!.id);
        }
      };
      element.onpause = () => {
        if (index === this.current && !this.transition)
          this.patch({ playing: false });
      };
      element.onended = () => {
        if (index !== this.current) return;
        if (this.transition) this.finishFade();
        else this.retire();
      };
      element.onerror = () => {
        if (this.slots[index] && index === this.current)
          this.patch({
            playing: false,
            waiting: false,
            error:
              "Radio audio could not load. Use Join live to reconnect, or stop the station.",
          });
      };
    });
    this.release = registerPlayback("radio", () => this.pause());
    this.timer = setInterval(() => this.tick(), 100);
    return () => this.dispose();
  }
  private sound() {
    if (!this.mixer) {
      this.mixer = this.createMixer(this.audio);
      this.mixer.watch?.((state) => {
        if (!this.wanted) return;
        if (state === "interrupted" || state === "suspended") {
          this.interrupted = true;
          this.patch({
            playing: false,
            error: "Audio was interrupted. Join live to reconnect.",
          });
        } else if (state === "running" && this.interrupted) {
          this.interrupted = false;
          this.requestLive();
        }
      });
      this.mixer.gain(this.current, 1);
      this.mixer.gain(1 - this.current, 0);
      this.mixer.volume(this.state.muted ? 0 : this.state.volume);
    }
    return this.mixer;
  }
  unlock() {
    try {
      void this.sound()
        .resume()
        .catch(() => {});
    } catch {
      /* Play explains an unsupported browser. */
    }
  }
  private requestLive() {
    if (this.onRejoin) this.onRejoin();
    else void this.play();
  }
  listen() {
    this.wanted = true;
    if (this.slots[this.current]) void this.play();
    else this.patch({ waiting: true });
  }
  sync(tracks: RadioTrack[], serverTime = Date.now() / 1000) {
    this.clock = { server: serverTime, local: performance.now() };
    if (!this.audio.length) return;
    // A backgrounded tab may miss several songs. Clear an expired standby
    // deck before retiring the current one, so rejoin cannot play stale audio.
    const standby = 1 - this.current;
    if (
      this.slots[standby] &&
      !tracks.some((t) => t.id === this.slots[standby]?.id)
    ) {
      this.transition = null;
      this.clearSlot(standby);
      this.mixer?.gain(this.current, 1);
      this.patch({ crossfading: false });
    }
    const currentTrack = this.slots[this.current];
    if (currentTrack && !tracks.some((t) => t.id === currentTrack.id)) {
      if (this.transition) this.finishFade();
      else this.retire();
    }
    for (let i = 0; i < 2; i++) {
      const match = tracks.find((t) => t.id === this.slots[i]?.id);
      if (match) this.slots[i] = match;
    }
    const pending = tracks.filter((t) => !this.finished.includes(t.id));
    if (!this.slots[this.current] && pending[0]) {
      this.load(this.current, pending[0]);
      this.patch({ track: pending[0], time: 0, waiting: false });
      if (this.wanted) void this.play();
    }
    const next = pending.find((t) => t.id !== this.slots[this.current]?.id);
    if (
      next &&
      !this.transition &&
      this.slots[1 - this.current]?.id !== next.id
    )
      this.load(1 - this.current, next);
  }
  private liveTime() {
    return this.clock.server + (performance.now() - this.clock.local) / 1000;
  }
  private seekLive(index: number, start = this.slots[index]?.startedAt) {
    const element = this.audio[index],
      track = this.slots[index];
    if (element && track && start != null)
      element.currentTime = Math.max(
        0,
        Math.min(track.duration - 0.05, this.liveTime() - start),
      );
  }
  private load(index: number, track: RadioTrack) {
    const element = this.audio[index];
    element.pause();
    this.slots[index] = track;
    element.src = track.url;
    element.load();
    this.mixer?.gain(index, index === this.current ? 1 : 0);
  }
  private clearSlot(index: number) {
    this.slots[index] = null;
    const element = this.audio[index];
    element.pause();
    element.removeAttribute("src");
    element.load();
    this.mixer?.gain(index, 0);
  }
  async play() {
    this.wanted = true;
    const element = this.audio[this.current];
    if (!element || !this.slots[this.current]) {
      this.patch({ waiting: true });
      return;
    }
    const version = this.revision,
      attempt = ++this.playAttempt,
      trackId = this.slots[this.current]?.id,
      index = this.current;
    const current = () =>
      version === this.revision &&
      attempt === this.playAttempt &&
      this.slots[index]?.id === trackId &&
      index === this.current;
    const bounded = async (promise: Promise<void>, ms: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Audio did not resume")),
              ms,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      claimPlayback("radio", element);
      if (element.error && this.slots[index])
        this.load(index, this.slots[index]!);
      await bounded(this.sound().resume(), 3000);
      if (!current() || !this.wanted) return;
      this.seekLive(this.current);
      await bounded(element.play(), 8000);
      if (!current() || !this.wanted) return;
      if (this.transition)
        await bounded(this.audio[this.transition.to].play(), 8000);
      if (current()) this.patch({ playing: true, waiting: false, error: "" });
    } catch {
      if (current()) {
        this.wanted = false;
        element.pause();
        this.patch({
          playing: false,
          waiting: false,
          error: "Sound could not resume. Choose Join live to reconnect.",
        });
      }
    }
  }

  pause() {
    this.wanted = false;
    this.interrupted = false;
    this.playAttempt++;
    this.revision++;
    this.transition = null;
    this.audio.forEach((a) => a.pause());
    this.mixer?.gain(this.current, 1);
    this.mixer?.gain(1 - this.current, 0);
    this.mixer?.pause();
    this.patch({ playing: false, crossfading: false });
  }
  dismissError() {
    this.patch({ error: "" });
  }
  volume(value: number) {
    this.patch({ volume: Math.max(0, Math.min(1, value)) });
    this.mixer?.volume(this.state.muted ? 0 : this.state.volume);
  }
  mute(value = !this.state.muted) {
    this.patch({ muted: value });
    this.mixer?.volume(this.state.muted ? 0 : this.state.volume);
  }
  tick() {
    const element = this.audio[this.current],
      track = this.slots[this.current];
    if (!element || !track) return;
    this.patch({ time: element.currentTime });
    if (!this.wanted || element.paused) return;
    if (this.transition) {
      if (
        element.currentTime - this.transition.start >=
        this.transition.seconds
      )
        this.finishFade();
      return;
    }
    const remaining =
      (Number.isFinite(element.duration) ? element.duration : track.duration) -
      element.currentTime;
    if (
      remaining <= 4 &&
      remaining > 0.25 &&
      this.slots[1 - this.current] &&
      this.audio[1 - this.current].readyState >= 2 &&
      !this.starting
    )
      void this.beginFade(remaining);
  }
  private async beginFade(seconds: number) {
    const from = this.current,
      to = 1 - from,
      version = this.revision;
    this.starting = true;
    try {
      const outgoing = this.slots[from],
        incoming = this.slots[to];
      this.seekLive(
        to,
        this.slots[to]?.startedAt ??
          (outgoing?.startedAt != null
            ? outgoing.startedAt + outgoing.duration - 4
            : undefined),
      );
      await this.audio[to].play();
      if (
        version !== this.revision ||
        !this.wanted ||
        this.slots[to]?.id !== incoming?.id
      ) {
        if (
          this.slots[to]?.id === incoming?.id &&
          (to !== this.current || !this.wanted)
        )
          this.audio[to].pause();
        return;
      }
      // Network delay can consume part of the outgoing tail. Ramp only over time actually left.
      const left = Math.max(
        0.05,
        Math.min(
          seconds,
          this.audio[from].duration - this.audio[from].currentTime,
        ),
      );
      this.transition = {
        from,
        to,
        start: this.audio[from].currentTime,
        seconds: left,
      };
      this.sound().fade(from, to, left);
      this.patch({ crossfading: true });
    } catch {
      this.audio[to].pause();
      this.mixer?.gain(to, 0);
      this.mixer?.gain(from, 1);
    } finally {
      this.starting = false;
    }
  }
  private finishFade() {
    const fade = this.transition;
    if (!fade) return;
    const old = this.slots[fade.from];
    this.transition = null;
    this.current = fade.to;
    this.clearSlot(fade.from);
    this.mixer?.gain(this.current, 1);
    this.patch({
      track: this.slots[this.current],
      time: this.audio[this.current].currentTime,
      crossfading: false,
      playing: !this.audio[this.current].paused,
      waiting: false,
    });
    if (old) {
      this.finished = [...this.finished, old.id].slice(-32);
      this.consumed(old.id);
    }
    if (this.slots[this.current]) this.started(this.slots[this.current]!.id);
  }
  private retire() {
    const old = this.slots[this.current];
    if (!old) return;
    this.revision++;
    this.clearSlot(this.current);
    this.finished = [...this.finished, old.id].slice(-32);
    this.current = 1 - this.current;
    const next = this.slots[this.current];
    this.mixer?.gain(this.current, 1);
    this.patch({
      track: next,
      time: 0,
      crossfading: false,
      playing: false,
      waiting: this.wanted && !next,
    });
    this.consumed(old.id);
    if (next && this.wanted) void this.play();
  }
  clear() {
    this.pause();
    this.transition = null;
    this.starting = false;
    this.finished = [];
    this.slots = [null, null];
    if (this.audio.length) {
      this.clearSlot(0);
      this.clearSlot(1);
    }
    this.patch({
      track: null,
      time: 0,
      crossfading: false,
      waiting: false,
      error: "",
    });
  }
  dispose() {
    this.clear();
    this.mediaControls(true);
    clearInterval(this.timer);
    this.mixer?.close(ownsPlayback("radio"));
    this.release?.();
    this.audio.forEach((a) => {
      a.onplaying = null;
      a.onpause = null;
      a.onended = null;
      a.onloadedmetadata = null;
      a.onerror = null;
      a.ontimeupdate = null;
      a.onwaiting = null;
      a.remove();
    });
    this.audio = [];
    this.mixer = undefined;
  }
}
