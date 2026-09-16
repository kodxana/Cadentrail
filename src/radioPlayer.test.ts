import { afterEach, expect, it, vi } from "vitest";
import {
  RadioPlayer,
  equalPowerCurves,
  type RadioTrack,
  type RadioMixer,
} from "./radioPlayer";
import { claimPlayback } from "./playbackFocus";
class AudioFixture {
  dataset: Record<string, string> = {};
  preload = "";
  src = "";
  currentTime = 0;
  duration = 20;
  readyState = 4;
  paused = true;
  onplaying?: () => void;
  onpause?: () => void;
  onended?: () => void;
  onloadedmetadata?: () => void;
  onerror?: () => void;
  ontimeupdate?: () => void;
  onwaiting?: () => void;
  load() {}
  remove() {}
  removeAttribute() {
    this.src = "";
  }
  async play() {
    this.paused = false;
    this.onplaying?.();
  }
  pause() {
    this.paused = true;
    this.onpause?.();
  }
}
const song = (id: string, start: number | null = null): RadioTrack => ({
  id,
  title: id,
  style: "Folk",
  url: "/" + id,
  duration: 20,
  number: 1,
  truncated: false,
  startedAt: start,
});
function setup() {
  const audio: AudioFixture[] = [],
    consumed = vi.fn(),
    started = vi.fn();
  const mixer: RadioMixer = {
    resume: async () => {},
    pause: vi.fn(),
    close: vi.fn(),
    gain: vi.fn(),
    fade: vi.fn(),
    volume: vi.fn(),
  };
  const player = new RadioPlayer(
    consumed,
    started,
    () => {
      const a = new AudioFixture();
      audio.push(a);
      return a as unknown as HTMLAudioElement;
    },
    () => mixer,
  );
  player.mount({ appendChild: () => {} } as unknown as HTMLElement);
  return { player, audio, mixer, consumed, started };
}
afterEach(() => vi.useRealTimers());
it("crossfades equal-power decks before retiring outgoing audio", async () => {
  const { player, audio, mixer, consumed } = setup();
  player.sync([song("first"), song("next")]);
  await player.play();
  audio[0].currentTime = 16;
  player.tick();
  await Promise.resolve();
  await Promise.resolve();
  expect(audio[0].paused).toBe(false);
  expect(audio[1].paused).toBe(false);
  expect(mixer.fade).toHaveBeenCalledWith(0, 1, 4);
  expect(consumed).not.toHaveBeenCalled();
  audio[0].currentTime = 20;
  audio[1].currentTime = 4;
  player.tick();
  expect(player.snapshot().track?.id).toBe("next");
  expect(audio[0].src).toBe("");
  expect(audio[1].currentTime).toBe(4);
  expect(audio[1].paused).toBe(false);
  expect(consumed).toHaveBeenCalledWith("first");
  player.dispose();
});
it("does not crossfade until the next stream is ready", async () => {
  const { player, audio, mixer } = setup();
  player.sync([song("first"), song("next")]);
  await player.play();
  audio[1].readyState = 0;
  audio[0].currentTime = 18;
  player.tick();
  expect(mixer.fade).not.toHaveBeenCalled();
  audio[0].onended?.();
  await Promise.resolve();
  expect(player.snapshot().track?.id).toBe("next");
  player.dispose();
});
it("joins the current live position and keeps playing after a server handoff", async () => {
  const { player, audio } = setup();
  player.sync([song("first", 1000), song("next", 1016)], 1007);
  await player.play();
  expect(audio[0].currentTime).toBeCloseTo(7, 1);
  player.pause();
  player.sync([song("next", 1016)], 1025);
  await player.play();
  expect(player.snapshot().track?.id).toBe("next");
  expect(audio[1].currentTime).toBeCloseTo(9, 1);
  player.dispose();
});
it("another workspace pauses both radio decks", async () => {
  const { player, audio } = setup();
  player.sync([song("first"), song("next")]);
  await player.play();
  audio[0].currentTime = 16;
  player.tick();
  await Promise.resolve();
  await Promise.resolve();
  claimPlayback("studio");
  expect(audio.every((a) => a.paused)).toBe(true);
  expect(player.snapshot().playing).toBe(false);
  player.dispose();
});
it("mixing curves preserve energy and have silent endpoints", () => {
  const curves = equalPowerCurves();
  expect(curves.out[0]).toBe(1);
  expect(curves.into[0]).toBe(0);
  expect(curves.into[64]).toBe(1);
  expect(curves.out[64]).toBeCloseTo(0);
  for (let i = 0; i < 65; i++)
    expect(curves.out[i] ** 2 + curves.into[i] ** 2).toBeCloseTo(1, 5);
});

it("native media controls cannot seek or skip a live station", async () => {
  const handlers = new Map<string, (() => void) | null>();
  vi.stubGlobal("navigator", {
    mediaSession: {
      setActionHandler: (action: string, cb: (() => void) | null) =>
        handlers.set(action, cb),
      setPositionState: vi.fn(),
    },
  });
  const { player, audio, consumed } = setup();
  try {
    player.sync([song("first", 1000), song("next", 1016)], 1007);
    await player.play();
    const time = audio[0].currentTime;
    for (const action of [
      "seekto",
      "seekforward",
      "seekbackward",
      "nexttrack",
      "previoustrack",
    ])
      handlers.get(action)?.();
    expect(audio[0].currentTime).toBe(time);
    expect(consumed).not.toHaveBeenCalled();
    expect(player.snapshot().track?.id).toBe("first");
    handlers.get("pause")?.();
    expect(audio[0].paused).toBe(false);
    expect(player.snapshot().muted).toBe(true);
    expect(navigator.mediaSession.playbackState).toBe("paused");
    expect(player.snapshot().playing).toBe(true);
    handlers.get("pause")?.();
    expect(player.snapshot().muted).toBe(true);
    handlers.get("play")?.();
    expect(player.snapshot().muted).toBe(false);
  } finally {
    player.dispose();
    vi.unstubAllGlobals();
  }
});

it("auto-joins when a live song becomes ready without a play click", async () => {
  const { player, audio } = setup();
  player.listen();
  player.sync([song("live", 1000)], 1008);
  await vi.waitFor(() => expect(player.snapshot().playing).toBe(true));
  expect(player.snapshot().playing).toBe(true);
  expect(audio[0].currentTime).toBeCloseTo(8, 1);
  player.dispose();
});
it("discards both stale decks when rejoining after several songs", async () => {
  const { player, audio } = setup();
  player.sync([song("old", 1000), song("also-old", 1016)], 1001);
  await player.play();
  player.pause();
  player.sync([song("live", 1100), song("upcoming", 1116)], 1107);
  player.listen();
  await vi.waitFor(() => expect(audio.some((a) => !a.paused)).toBe(true));
  expect(player.snapshot().track?.id).toBe("live");
  expect(audio.find((a) => !a.paused)?.currentTime).toBeCloseTo(7, 1);
  expect(audio.map((a) => a.src).sort()).toEqual(["/live", "/upcoming"]);
  player.dispose();
});
it("a blocked autoplay attempt can be joined later at the live position", async () => {
  const { player, audio } = setup();
  const realPlay = audio[0].play.bind(audio[0]);
  audio[0].play = vi
    .fn()
    .mockRejectedValueOnce(new Error("NotAllowedError"))
    .mockImplementation(realPlay);
  player.sync([song("live", 1000)], 1008);
  await player.play();
  expect(player.snapshot().playing).toBe(false);
  expect(player.snapshot().error).toContain("Join live");
  player.sync([song("live", 1000)], 1012);
  await player.play();
  expect(player.snapshot().playing).toBe(true);
  expect(audio[0].currentTime).toBeCloseTo(12, 1);
  player.dispose();
});

it("replaces prepared music without pausing or seeking the live deck", async () => {
  const { player, audio, mixer } = setup();
  player.sync([song("jpop", 1000), song("old-upcoming")], 1008);
  await player.play();
  const time = audio[0].currentTime;
  player.sync([song("jpop", 1000), song("classical")], 1009);
  expect(audio[0].paused).toBe(false);
  expect(audio[0].currentTime).toBe(time);
  expect(audio[1].src).toBe("/classical");
  audio[0].currentTime = 16;
  player.tick();
  await Promise.resolve();
  await Promise.resolve();
  expect(mixer.fade).toHaveBeenCalledWith(0, 1, 4);
  expect(audio[1].paused).toBe(false);
  player.dispose();
});

it("uses audio time events for fades when interval callbacks are throttled", async () => {
  const { player, audio, mixer } = setup();
  player.sync([song("first"), song("next")]);
  await player.play();
  audio[0].currentTime = 16;
  audio[0].ontimeupdate?.();
  await vi.waitFor(() => expect(mixer.fade).toHaveBeenCalledWith(0, 1, 4));
  player.dispose();
});
it("bounds a browser resume that never resolves and offers rejoin", async () => {
  vi.useFakeTimers();
  const { player, mixer } = setup();
  mixer.resume = () => new Promise(() => {});
  player.sync([song("live", 1000)], 1008);
  const pending = player.play();
  await vi.advanceTimersByTimeAsync(3001);
  await pending;
  expect(player.snapshot().playing).toBe(false);
  expect(player.snapshot().error).toContain("Join live");
  player.dispose();
});
it("resumes an interrupted audio context through a fresh live snapshot", async () => {
  const { player, mixer, audio } = setup();
  let changed: ((state: string) => void) | undefined;
  mixer.watch = (callback) => {
    changed = callback;
  };
  player.sync([song("old", 1000)], 1008);
  await player.play();
  player.onRejoin = vi.fn(() => {
    player.sync([song("live", 1100)], 1107);
    player.listen();
  });
  changed?.("interrupted");
  expect(player.snapshot().playing).toBe(false);
  changed?.("running");
  expect(player.onRejoin).toHaveBeenCalledOnce();
  await vi.waitFor(() =>
    expect(audio.find((a) => !a.paused)?.currentTime).toBeCloseTo(7, 1),
  );
  player.dispose();
});
it("does not commit a stale crossfade after its prepared deck changes", async () => {
  const { player, mixer, audio } = setup();
  player.sync([song("live", 1000), song("obsolete")], 1008);
  await player.play();
  let resolve!: () => void;
  audio[1].play = () =>
    new Promise<void>((done) => {
      resolve = done;
    });
  audio[0].currentTime = 16;
  player.tick();
  player.sync([song("live", 1000), song("replacement")], 1009);
  resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(mixer.fade).not.toHaveBeenCalled();
  expect(player.snapshot().crossfading).toBe(false);
  expect(audio[0].paused).toBe(false);
  player.dispose();
});
