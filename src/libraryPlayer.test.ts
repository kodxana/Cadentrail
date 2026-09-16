import { afterEach, expect, it, vi } from "vitest";
import { LibraryPlayer } from "./libraryPlayer";
import { claimPlayback, registerPlayback, mediaPlaybackOwner } from "./playbackFocus";
import type { LibraryTrack } from "./libraryModel";
class FakeAudio {
  dataset: Record<string, string> = {};
  id = "";
  src = "";
  currentSrc = "";
  currentTime = 0;
  duration = 100;
  volume = 1;
  muted = false;
  paused = true;
  readyState = 1;
  onloadedmetadata?: () => void;
  ontimeupdate?: () => void;
  onplaying?: () => void;
  onpause?: () => void;
  onended?: () => void;
  getAttribute() {
    return this.src || null;
  }
  load() {
    this.currentSrc = this.src;
    this.onloadedmetadata?.();
  }
  pause() {
    this.paused = true;
    this.onpause?.();
  }
  play = vi.fn(() => {
    this.paused = false;
    this.onplaying?.();
    return Promise.resolve();
  });
}
const track = (id: string): LibraryTrack => ({
  id,
  title: id,
  version: "Take " + id,
  projectId: "p",
  artist: "Artist",
  kind: "take",
  duration: 100,
  favorite: false,
  coverUrl: null,
  url: "/api/assets/" + id + "/audio",
  archived: false,
  tags: [],
  updatedAt: 1,
  origin: "yue2",
});
const setup = () => {
  const audio = new FakeAudio();
  return {
    audio,
    player: new LibraryPlayer(
      () => audio as unknown as HTMLAudioElement,
      () => 0,
    ),
  };
};
afterEach(() => vi.unstubAllGlobals());
it("continues through the queue, stops at the end, and respects repeat-one and repeat-all", () => {
  const { audio, player: p } = setup();
  p.playQueue([track("a"), track("b")]);
  audio.onended?.();
  expect(p.current().id).toBe("b");
  audio.onended?.();
  expect(p.snapshot().playing).toBe(false);
  p.setRepeat();
  audio.onended?.();
  expect(p.current().id).toBe("a");
  p.setRepeat();
  audio.onended?.();
  expect(p.current().id).toBe("a");
  p.next();
  expect(p.current().id).toBe("b");
});
it("shuffles without repeating, then previous follows actual listening history", () => {
  const { player: p } = setup();
  p.playQueue([track("a"), track("b"), track("c")]);
  p.setShuffle();
  p.next();
  expect(p.current().id).toBe("b");
  p.next();
  expect(p.current().id).toBe("c");
  p.next();
  expect(p.snapshot().playing).toBe(false);
  p.previous();
  expect(p.current().id).toBe("b");
});
it("supports play-next, reordering and removal without changing current audio", () => {
  const { audio, player: p } = setup();
  p.playQueue([track("a"), track("c")]);
  p.enqueue(track("b"), true);
  expect(p.snapshot().queue.map((t) => t.id)).toEqual(["a", "b", "c"]);
  p.move(2, -1);
  p.remove(0);
  expect(p.current().id).toBe("a");
  expect(audio.src).toContain("/a/");
  p.remove(1);
  p.next();
  expect(p.current().id).toBe("b");
});
it("ignores a late rejected play from a replaced source", async () => {
  const { audio, player: p } = setup();
  let reject!: (e: Error) => void;
  audio.play.mockImplementationOnce(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  p.playQueue([track("a"), track("b")]);
  p.next();
  reject(new Error("old request cancelled"));
  await Promise.resolve();
  expect(p.snapshot().playing).toBe(true);
  expect(p.snapshot().error).toBeNull();
});
it("compares another take at the same position and refreshes metadata without restarting it", () => {
  const { audio, player: p } = setup();
  p.playQueue([track("a")], 0, 42);
  p.playQueue([track("b")], 0, p.snapshot().time);
  expect(audio.currentTime).toBe(42);
  p.refresh([{ ...track("b"), favorite: true, title: "Renamed" }]);
  expect(p.current().favorite).toBe(true);
  expect(audio.currentTime).toBe(42);
  expect(audio.play).toHaveBeenCalledTimes(2);
  p.seek(999);
  expect(audio.currentTime).toBe(100);
});
it("restores a duplicate queue entry and seek position paused, even with a removed earlier file", () => {
  let saved = JSON.stringify({
    ids: ["missing", "a", "b", "a"],
    currentId: "a",
    index: 3,
    time: 47,
    volume: 0.35,
    repeat: "one",
    shuffle: true,
  });
  vi.stubGlobal("localStorage", {
    getItem: () => saved,
    setItem: (_: string, value: string) => {
      saved = value;
    },
  });
  const { audio, player: p } = setup();
  p.restore([track("a"), track("b")]);
  expect(p.snapshot().index).toBe(2);
  expect(p.snapshot().playing).toBe(false);
  expect(audio.src).toBe("");
  p.play();
  expect(audio.currentTime).toBe(47);
  expect(audio.volume).toBe(0.35);
  expect(p.snapshot().repeat).toBe("one");
});
it("shares playback focus so Studio pauses the library and the library pauses Studio", () => {
  const { player: p } = setup();
  const pauseStudio = vi.fn();
  const a = registerPlayback("test-player", p.pause),
    b = registerPlayback("studio", pauseStudio);
  p.playQueue([track("a")]);
  expect(pauseStudio).toHaveBeenCalled();
  claimPlayback("studio");
  expect(p.snapshot().playing).toBe(false);
  a();
  b();
});
it("volume and mute affect listening audio independently of the project mix", () => {
  const { audio, player: p } = setup();
  p.playQueue([track("a")]);
  p.setVolume(0.3);
  p.mute();
  expect(audio.muted).toBe(true);
  expect(audio.volume).toBe(0.3);
  p.setVolume(0.45);
  expect(audio.muted).toBe(false);
  expect(audio.volume).toBe(0.45);
});

it("clearing upcoming songs preserves the current track and previous history", () => {
  const { audio, player: p } = setup();
  p.playQueue([track("a"), track("b"), track("c")], 1);
  p.clearUpcoming();
  expect(p.snapshot().queue.map((t) => t.id)).toEqual(["a", "b"]);
  expect(p.current().id).toBe("b");
  expect(audio.src).toContain("/b/");
  p.previous();
  expect(p.current().id).toBe("a");
});

it("the global media handler recognizes Radio and does not pause its own player",()=>{
 const pauseRadio=vi.fn(),pausePreview=vi.fn();
 const releaseRadio=registerPlayback("radio",pauseRadio),releasePreview=registerPlayback("preview",pausePreview);
 const owner=mediaPlaybackOwner({dataset:{player:"radio"}});
 claimPlayback(owner);
 expect(owner).toBe("radio");expect(pauseRadio).not.toHaveBeenCalled();expect(pausePreview).toHaveBeenCalled();
 expect(mediaPlaybackOwner({dataset:{player:"library"}})).toBe("library");
 expect(mediaPlaybackOwner({dataset:{}})).toBe("preview");
 releaseRadio();releasePreview();
});

it("clears stale OS actions across modes and restores Listen metadata", () => {
  const session={metadata:null as any,playbackState:"none",setActionHandler:vi.fn(),setPositionState:vi.fn()};
  vi.stubGlobal("navigator",{mediaSession:session});
  vi.stubGlobal("MediaMetadata",class {constructor(data:any){Object.assign(this,data);}});
  const {player}=setup();player.playQueue([track("a")]);
  expect(session.metadata.title).toBe("a");
  claimPlayback("radio");session.metadata={title:"Radio"};
  player.play();expect(session.metadata.title).toBe("a");
  claimPlayback("studio");expect(session.metadata).toBeNull();
  expect(session.setActionHandler).toHaveBeenCalledWith("nexttrack",null);
});
