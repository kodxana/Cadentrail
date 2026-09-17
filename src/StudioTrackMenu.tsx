import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { deleteTrack, edit, useStudio } from "./store";

export type MenuPosition = { x: number; y: number };

export function StudioContextMenu({
  position,
  label,
  close,
  children,
}: {
  position: MenuPosition;
  label: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dismiss = useRef(close);
  dismiss.current = close;
  useLayoutEffect(() => {
    const menu = ref.current!;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(position.x, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(position.y, innerHeight - bounds.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [position.x, position.y]);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) dismiss.current();
    };
    const resize = () => dismiss.current();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return createPortal(
    <div
      ref={ref}
      className="context-menu studio-context-menu"
      role="menu"
      aria-label={label}
      style={{ left: position.x, top: position.y }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || e.key === "Tab") {
          close();
          return;
        }
        const buttons = [
          ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function StudioTrackMenu({
  trackId,
  position,
  close,
}: {
  trackId: string;
  position: MenuPosition;
  close: () => void;
}) {
  const track = useStudio().project?.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const toggle = (key: "mute" | "solo") => {
    edit(key === "mute" ? "Mute track" : "Solo track", (p) => {
      const target = p.tracks.find((t) => t.id === trackId);
      if (target) target[key] = !target[key];
    });
    close();
  };
  return (
    <StudioContextMenu
      position={position}
      label={`Track actions for ${track.name}`}
      close={close}
    >
      <span className="studio-menu-title">{track.name}</span>
      <button role="menuitem" onClick={() => toggle("mute")}>
        {track.mute ? "Unmute track" : "Mute track"}
      </button>
      <button role="menuitem" onClick={() => toggle("solo")}>
        {track.solo ? "Unsolo track" : "Solo track"}
      </button>
      <button
        role="menuitem"
        onClick={() => {
          deleteTrack(trackId);
          close();
        }}
      >
        <Trash2 size={14} />
        Delete track
      </button>
    </StudioContextMenu>
  );
}
