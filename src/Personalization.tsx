import { useState } from "react";
import { UserRound, Music2, Headphones, Radio } from "lucide-react";
import { Dialog } from "./Dialog";
import { useProfile, saveProfile } from "./profile";
export type WelcomeMode = "create" | "studio" | "listen" | "radio";
export function Personalization({
  onClose,
  onChoose,
}: {
  onClose?: () => void;
  onChoose?: (mode: WelcomeMode, guided: boolean) => void;
}) {
  const profile = useProfile(),
    [name, setName] = useState(profile.name),
    [guided, setGuided] = useState(true);
  const finish = (mode: WelcomeMode) => {
    saveProfile(name);
    onChoose?.(mode, guided);
    onClose?.();
  };
  return (
    <Dialog
      className="welcome-modal personalization"
      titleId="profile-title"
      onClose={onClose}
    >
      <span className="eyebrow">
        {onChoose ? "MAKE YOURSELF AT HOME" : "YOUR EXPERIENCE"}
      </span>
      <h2 id="profile-title">
        {onChoose ? "Welcome to Cadentrail." : "Make it yours."}
      </h2>
      {onChoose && <p className="welcome-introduction">Make a song, play your collection, or tune a live station. We can show you where to start.</p>}
      <label htmlFor="profile-name">
        What should we call you? <span className="muted">Optional</span>
      </label>
      <input
        id="profile-name"
        name="given-name"
        autoComplete="given-name"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
      />
      <p className="muted">
        Your name stays in this browser. You can change it anytime.
      </p>
      {onChoose ? (
        <>
          <label className="welcome-tour-choice">
            <input type="checkbox" checked={guided} onChange={e => setGuided(e.target.checked)} />
            <span><strong>Show me around after I choose</strong><small>A short tour of real controls. Skip or resume anytime.</small></span>
          </label>
          <p>Where would you like to begin?</p>
          <div className="welcome-experiences">
            <button onClick={() => finish("create")}>
              <Music2 size={22} />
              <strong>Creation</strong>
              <span>A guided path from an idea to a saved song.</span>
            </button>
            <button onClick={() => finish("listen")}>
              <Headphones size={22} />
              <strong>Listen</strong>
              <span>Play saved music with artwork and timed lyrics.</span>
            </button>
            <button onClick={() => finish("radio")}>
              <Radio size={22} />
              <strong>Radio</strong>
              <span>Original live music. Songs stay temporary.</span>
            </button>
          </div>
          <button className="welcome-studio" onClick={() => finish("studio")}>
            Open Studio
          </button>
        </>
      ) : (
        <button className="primary" onClick={() => finish("create")}>
          Save preferences
        </button>
      )}
    </Dialog>
  );
}
export function PersonalizationButton() {
  const profile = useProfile(),
    [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="profile-button"
        aria-label="Personalization"
        title="Personalization"
        onClick={() => setOpen(true)}
      >
        <UserRound size={16} />
        <span>{profile.name || "You"}</span>
      </button>
      {open && <Personalization onClose={() => setOpen(false)} />}
    </>
  );
}
