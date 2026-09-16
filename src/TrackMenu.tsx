import { useId, useRef, useState } from "react";
import { libraryPlayer } from "./libraryPlayer";
import { openProject, notice } from "./store";
import type { LibraryTrack } from "./libraryModel";
export function TrackMenu({ track }: { track: LibraryTrack }) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const close = () => menu.current?.hidePopover();
  return (
    <>
      <button
        className="song-more"
        popoverTarget={id}
        aria-label={"More actions for " + track.version}
        onClick={(event) => {
          const r = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(window.innerWidth - 170, r.right - 160)),
            top: Math.max(8, Math.min(window.innerHeight - 140, r.bottom + 6)),
          });
        }}
      >
        ···
      </button>
      <div
        id={id}
        ref={menu}
        popover="auto"
        className="song-actions-popover"
        style={position}
        aria-label={"Actions for " + track.version}
      >
        <button
          onClick={() => {
            libraryPlayer.enqueue(track, true);
            notice("This version will play next.");
            close();
          }}
        >
          Play next
        </button>
        <button
          onClick={() => {
            close();
            void openProject(track.projectId);
          }}
        >
          Open project
        </button>
        <a href={track.url} download onClick={close}>
          Download audio
        </a>
      </div>
    </>
  );
}
