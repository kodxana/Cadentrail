let activeOwner: string | null = null;
export const ownsPlayback = (owner: string) => activeOwner === owner;
const stops = new Map<string, () => void>();
export function registerPlayback(owner: string, pause: () => void) {
  stops.set(owner, pause);
  return () => {
    if (stops.get(owner) === pause) stops.delete(owner);
  };
}
export function claimPlayback(owner: string, keep?: HTMLMediaElement) {
  if (
    activeOwner !== owner &&
    typeof navigator !== "undefined" &&
    navigator.mediaSession
  ) {
    const session = navigator.mediaSession;
    for (const action of [
      "play",
      "pause",
      "stop",
      "previoustrack",
      "nexttrack",
      "seekto",
      "seekbackward",
      "seekforward",
    ] as MediaSessionAction[]) {
      try {
        session.setActionHandler(action, null);
      } catch {}
    }
    session.metadata = null;
    session.playbackState = "none";
    try {
      session.setPositionState();
    } catch {}
  }
  activeOwner = owner;
  for (const [other, pause] of stops) if (other !== owner) pause();
  if (typeof document !== "undefined")
    document
      .querySelectorAll<HTMLMediaElement>("audio,video")
      .forEach((element) => {
        if (
          element !== keep &&
          !(
            (owner === "library" || owner === "radio") &&
            element.dataset.player === owner
          )
        )
          element.pause();
      });
}

export function mediaPlaybackOwner(element: Pick<HTMLMediaElement, "dataset">) {
  return element.dataset.player === "library"
    ? "library"
    : element.dataset.player === "radio"
      ? "radio"
      : "preview";
}
