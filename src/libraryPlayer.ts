import { useSyncExternalStore } from "react";
import { claimPlayback, registerPlayback, ownsPlayback } from "./playbackFocus";
import type { LibraryTrack } from "./libraryModel";
export type RepeatMode = "off" | "all" | "one";
export type PlayerState = {
  queue: LibraryTrack[];
  index: number;
  playing: boolean;
  loading: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  error: string | null;
};
export class LibraryPlayer {
  private state: PlayerState = {
    queue: [],
    index: -1,
    playing: false,
    loading: false,
    time: 0,
    duration: 0,
    volume: 0.8,
    muted: false,
    repeat: "off",
    shuffle: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private audio?: HTMLAudioElement;
  private intent = 0;
  private pendingSeek = 0;
  private history: number[] = [];
  private visited = new Set<number>();
  private lastStored = 0;
  private restored = false;
  constructor(
    private createAudio: () => HTMLAudioElement = () => new Audio(),
    private random: () => number = Math.random,
  ) {}
  snapshot = () => this.state;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  };
  current = () => this.state.queue[this.state.index];
  private patch(value: Partial<PlayerState>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((fn) => fn());
    this.persist();
    this.mediaControls();
  }
  private mediaIdentity = "";
  private mediaControls() {
    if(!ownsPlayback("library") || typeof navigator === "undefined" || !navigator.mediaSession || !this.current()) return;
    const session=navigator.mediaSession, track=this.current();
    const handlers:Partial<Record<MediaSessionAction,MediaSessionActionHandler>>={play:()=>this.play(),pause:()=>this.pause(),previoustrack:()=>this.previous(),nexttrack:()=>this.next(),seekto:d=>{if(d.seekTime!==undefined)this.seek(d.seekTime);},seekbackward:d=>this.seek(this.state.time-(d.seekOffset||10)),seekforward:d=>this.seek(this.state.time+(d.seekOffset||10))};
    for(const [action,handler] of Object.entries(handlers)){try{session.setActionHandler(action as MediaSessionAction,handler);}catch{}}
    try {
      const identity=JSON.stringify([track.id,track.title,track.artist,track.coverUrl]);
      if((identity!==this.mediaIdentity || !session.metadata) && typeof MediaMetadata!=="undefined") {
        session.metadata=new MediaMetadata({title:track.title,artist:track.artist||"Cadentrail",album:track.version,artwork:track.coverUrl?[{src:new URL(track.coverUrl,location.href).href}]:[]});this.mediaIdentity=identity;
      }
      session.playbackState=this.state.playing?"playing":"paused";
      if(this.state.duration>0)session.setPositionState({duration:this.state.duration,playbackRate:1,position:Math.max(0,Math.min(this.state.time,this.state.duration))});
    } catch { /* OS media controls are optional; the in-app player remains available. */ }
  }
  private persist() {
    if (typeof localStorage === "undefined" || !this.current()) return;
    if (Date.now() - this.lastStored < 1000 && this.state.playing) return;
    this.lastStored = Date.now();
    try {
      localStorage.setItem(
        "cadentrail:player",
        JSON.stringify({
          ids: this.state.queue.slice(0, 500).map((t) => t.id),
          currentId: this.current().id,
          index: this.state.index,
          time: this.state.time,
          volume: this.state.volume,
          muted: this.state.muted,
          repeat: this.state.repeat,
          shuffle: this.state.shuffle,
        }),
      );
    } catch {}
  }
  restore(tracks: LibraryTrack[]) {
    if (this.restored) return;
    this.restored = true;
    try {
      const saved = JSON.parse(
        localStorage.getItem("cadentrail:player") || "null",
      );
      if (!saved) return;
      const ids: Array<string> = Array.isArray(saved.ids)
        ? saved.ids.slice(0, 500)
        : [];
      const byId = new Map(tracks.map((t) => [t.id, t]));
      const queue = ids
        .map((id) => byId.get(id))
        .filter((t): t is LibraryTrack => !!t);
      const restoredIndex = ids
        .slice(0, Number.isInteger(saved.index) ? saved.index : 0)
        .filter((id) => byId.has(id)).length;
      const index =
        queue[restoredIndex]?.id === saved.currentId
          ? restoredIndex
          : queue.findIndex((t) => t.id === saved.currentId);
      if (index < 0) return;
      this.visited = new Set([index]);
      this.patch({
        queue,
        index,
        time: Math.min(
          queue[index].duration,
          Math.max(0, Number(saved.time) || 0),
        ),
        duration: queue[index].duration,
        volume: Math.max(
          0,
          Math.min(1, Number.isFinite(saved.volume) ? saved.volume : 0.8),
        ),
        muted: !!saved.muted,
        repeat: ["off", "all", "one"].includes(saved.repeat)
          ? saved.repeat
          : "off",
        shuffle: !!saved.shuffle,
      });
    } catch {}
  }
  private element() {
    if (this.audio) return this.audio;
    const a = (this.audio = this.createAudio());
    a.preload = "metadata";
    a.dataset.player = "library";
    a.id = "library-audio";
    const valid = () =>
      !!this.current() &&
      (!a.currentSrc || a.currentSrc.endsWith(this.current().url));
    a.onloadedmetadata = () => {
      if (!valid()) return;
      const duration = Number.isFinite(a.duration)
        ? a.duration
        : this.current().duration;
      a.currentTime = Math.min(this.pendingSeek, Math.max(0, duration - 0.05));
      this.patch({ duration, time: a.currentTime, loading: false });
    };
    a.ontimeupdate = () => {
      if (valid() && a.readyState > 0) this.patch({ time: a.currentTime });
    };
    a.onplaying = () => {
      if (valid() && !a.paused)
        this.patch({ playing: true, loading: false, error: null });
    };
    a.onpause = () => {
      if (a.paused) this.patch({ playing: false, loading: false });
    };
    a.onwaiting = () => {
      if (valid() && !a.paused) this.patch({ loading: true });
    };
    a.onended = () => {
      if (valid()) this.next(true);
    };
    a.onerror = () => {
      if (valid())
        this.patch({
          playing: false,
          loading: false,
          error:
            "This audio could not be loaded. Check your connection or sign in again.",
        });
    };
    return a;
  }
  mount(host: HTMLElement) {
    host.appendChild(this.element());
    return () => {
      this.pause();
      this.audio?.remove();
    };
  }
  playQueue(queue: LibraryTrack[], index = 0, position = 0, autoplay = true) {
    if (!queue[index]) return;
    this.history = [];
    this.visited = new Set([index]);
    this.patch({ queue: [...queue], index });
    this.load(position, autoplay);
  }
  private load(position = 0, autoplay = true) {
    if (!this.current()) return;
    const a = this.element();
    ++this.intent;
    a.pause();
    this.pendingSeek = Math.max(0, Math.min(position, this.current().duration));
    this.patch({
      time: this.pendingSeek,
      duration: this.current().duration,
      playing: false,
      loading: autoplay,
      error: null,
    });
    a.src = this.current().url;
    a.volume = this.state.volume;
    a.muted = this.state.muted;
    a.load();
    if (autoplay) this.play();
  }
  play() {
    if (!this.current()) return;
    const a = this.element();
    if (!a.getAttribute("src")) {
      this.load(this.state.time);
      return;
    }
    const intent = ++this.intent;
    claimPlayback("library", a);
    this.patch({ loading: true, error: null });
    void a.play().catch((e: Error) => {
      if (intent === this.intent)
        this.patch({
          playing: false,
          loading: false,
          error:
            e.name === "NotAllowedError"
              ? "Press Play to start listening."
              : "Playback could not start. Try Play again or choose another version.",
        });
    });
  }
  pause = () => {
    ++this.intent;
    this.audio?.pause();
    this.patch({ playing: false, loading: false });
  };
  toggle() {
    if (this.state.playing || this.state.loading) this.pause();
    else this.play();
  }
  seek(time: number) {
    const value = Math.max(
      0,
      Math.min(Number.isFinite(time) ? time : 0, this.state.duration),
    );
    if (!this.audio?.getAttribute("src")) {
      this.load(value, false);
      return;
    }
    this.pendingSeek = value;
    if (this.audio.readyState > 0) this.audio.currentTime = value;
    this.patch({ time: value });
  }
  next(ended = false) {
    if (!this.current()) return;
    if (ended && this.state.repeat === "one") {
      this.load();
      return;
    }
    let next = this.state.index + 1;
    if (this.state.shuffle) {
      let options = this.state.queue
        .map((_, i) => i)
        .filter((i) => !this.visited.has(i));
      if (!options.length && this.state.repeat === "all") {
        this.visited = new Set([this.state.index]);
        options = this.state.queue
          .map((_, i) => i)
          .filter((i) => i !== this.state.index);
        if (!options.length) options = [this.state.index];
      }
      next = options.length
        ? options[Math.floor(this.random() * options.length)]
        : -1;
    } else if (next >= this.state.queue.length)
      next = this.state.repeat === "all" ? 0 : -1;
    if (next < 0) {
      this.pause();
      return;
    }
    this.history.push(this.state.index);
    this.visited.add(next);
    this.patch({ index: next });
    this.load();
  }
  previous() {
    if (this.state.time > 3) {
      this.seek(0);
      return;
    }
    const previous = this.history.pop() ?? Math.max(0, this.state.index - 1);
    this.patch({ index: previous });
    this.load();
  }
  select(index: number) {
    if (!this.state.queue[index]) return;
    this.history.push(this.state.index);
    this.visited.add(index);
    this.patch({ index });
    this.load();
  }
  enqueue(track: LibraryTrack, next = false) {
    if (!this.current()) {
      this.playQueue([track], 0, 0, false);
      return;
    }
    const queue = [...this.state.queue];
    queue.splice(next ? this.state.index + 1 : queue.length, 0, track);
    this.history = [];
    this.visited = new Set([this.state.index]);
    this.patch({ queue });
  }
  remove(index: number) {
    if (index === this.state.index) return;
    this.patch({
      queue: this.state.queue.filter((_, i) => i !== index),
      index: index < this.state.index ? this.state.index - 1 : this.state.index,
    });
    this.history = [];
    this.visited = new Set([this.state.index]);
  }
  move(index: number, direction: number) {
    const target = index + direction;
    if (
      index === this.state.index ||
      target === this.state.index ||
      target < 0 ||
      target >= this.state.queue.length
    )
      return;
    const queue = [...this.state.queue];
    [queue[index], queue[target]] = [queue[target], queue[index]];
    this.patch({ queue });
    this.history = [];
    this.visited = new Set([this.state.index]);
  }
  clearUpcoming() {
    if (this.current())
      this.patch({ queue: this.state.queue.slice(0, this.state.index + 1) });
    this.history = this.history.filter((i) => i <= this.state.index);
    this.visited = new Set(
      [...this.visited].filter((i) => i <= this.state.index),
    );
  }
  setVolume(volume: number) {
    const value = Math.max(0, Math.min(1, volume));
    if (this.audio) this.audio.volume = value;
    this.patch({ volume: value, muted: false });
    if (this.audio) this.audio.muted = false;
  }
  mute() {
    this.patch({ muted: !this.state.muted });
    if (this.audio) this.audio.muted = this.state.muted;
  }
  setRepeat() {
    const modes: RepeatMode[] = ["off", "all", "one"];
    this.patch({ repeat: modes[(modes.indexOf(this.state.repeat) + 1) % 3] });
  }
  setShuffle() {
    this.history = [];
    this.visited = new Set([this.state.index]);
    this.patch({ shuffle: !this.state.shuffle });
  }
  refresh(tracks: LibraryTrack[]) {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    this.patch({ queue: this.state.queue.map((t) => byId.get(t.id) ?? t) });
  }
}
export const libraryPlayer = new LibraryPlayer();
registerPlayback("library", libraryPlayer.pause);
export const useLibraryPlayer = () =>
  useSyncExternalStore(libraryPlayer.subscribe, libraryPlayer.snapshot);
