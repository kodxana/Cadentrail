import { instrumentalDirection } from "./generationPresentation";
import { renderPresetKey, renderPresetLabel } from "./generationPresentation";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Music2 } from "lucide-react";
import type { Project } from "./model";

export const creationSteps = [
  {
    name: "Sound",
    title: "What does your song feel like?",
    detail: "Start with a mood, a genre, or a scene. A few words are enough.",
  },
  {
    name: "Words",
    title: "Give it a story.",
    detail:
      "Write your lyrics, ask for a draft, or let the instruments do the talking.",
  },
  {
    name: "Performance",
    title: "Make it your own.",
    detail:
      "Choose a vocal direction and how many versions you’d like to explore.",
  },
  {
    name: "Listen",
    title: "Find the take you love.",
    detail:
      "Listen, compare and keep a favorite. Then give it a cover or a music video.",
  },
] as const;

export function useCreateGuide(projectId: string, hasResults: boolean) {
  const [step, setStep] = useState(() => {
    try {
      const saved = localStorage.getItem("studio:create-step:" + projectId);
      if (saved !== null && /^[0-3]$/.test(saved)) return Number(saved);
    } catch {
      /* Navigation also works without browser storage. */
    }
    return hasResults ? 3 : 0;
  });
  const [direction, setDirection] = useState("forward");
  useEffect(() => {
    try {
      localStorage.setItem("studio:create-step:" + projectId, String(step));
    } catch {
      /* Project data is still saved on the server. */
    }
  }, [step, projectId]);
  const go = (next: number) => {
    setDirection(next < step ? "back" : "forward");
    setStep(Math.max(0, Math.min(3, next)));
  };
  return { step, direction, go };
}

export function CreateSteps({
  step,
  onGo,
}: {
  step: number;
  onGo: (step: number) => void;
}) {
  return (
    <nav className="create-steps" aria-label="Song creation steps">
      <div className="guide-label">
        <Music2 size={17} />
        <span>
          MAKE A SONG<small>One idea at a time.</small>
        </span>
      </div>
      <ol>
        {creationSteps.map((item, index) => (
          <li
            key={item.name}
            className={
              index === step ? "current" : index < step ? "visited" : ""
            }
          >
            <button
              aria-current={index === step ? "step" : undefined}
              onClick={() => onGo(index)}
              aria-label={`Step ${index + 1}: ${item.name}`}
            >
              <span className="step-number">
                {index < step ? (
                  <Check size={14} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <span>{item.name}</span>
            </button>
          </li>
        ))}
      </ol>
      <span className="guide-count">{step + 1} / 4</span>
    </nav>
  );
}

export function SongBrief({
  project: p,
  step,
  onGo,
}: {
  project: Project;
  step: number;
  onGo: (step: number) => void;
}) {
  const instrumental = instrumentalDirection(p.generation);
  const role = {
    auto: "Automatic voice",
    female: "Female voice",
    male: "Male voice",
    duet: "Duet",
    dialogue: "Alternating voices",
    shared: "Shared vocals",
    instrumental: "Instrumental",
  }[p.generation.role];
  const preset = renderPresetLabel(
    renderPresetKey(p.creative.quality, p.generation.odeSteps),
  );
  return (
    <aside className="song-brief" aria-label="Your song so far">
      {p.visuals.coverId && (
        <img
          className="brief-artwork"
          src={`/api/projects/${p.id}/visuals/${p.visuals.coverId}`}
          alt={`${p.name} cover`}
        />
      )}
      <span className="eyebrow">YOUR SONG SO FAR</span>
      <h2>{p.name}</h2>
      <div className="brief-entries">
        <button onClick={() => onGo(0)} className={step === 0 ? "current" : ""}>
          <span>01 · THE SOUND</span>
          <strong>
            {p.generation.style.trim() || "A mood. A moment. Your idea."}
          </strong>
          <ArrowRight size={15} />
        </button>
        <button onClick={() => onGo(1)} className={step === 1 ? "current" : ""}>
          <span>02 · THE WORDS</span>
          <strong>
            {instrumental
              ? "Let the music tell the story"
              : p.generation.lyrics.trim()
                ? p.generation.lyrics.trim()
                : "Your words, or a little writing help"}
          </strong>
          <ArrowRight size={15} />
        </button>
        <button onClick={() => onGo(2)} className={step === 2 ? "current" : ""}>
          <span>03 · THE PERFORMANCE</span>
          <strong>{instrumental ? "Instrumental" : role}</strong>
          <small>
            {preset} · {p.creative.candidates}{" "}
            {p.creative.candidates === 1 ? "take" : "takes"}
          </small>
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="brief-note">
        <span>UP NEXT</span>
        <p>
          {
            [
              "A few lyrics can turn the feeling into a story. We’ll help you find a first line.",
              "Next, choose a vocal direction and a few takes. You can change your words at any time.",
              "Each take is a fresh interpretation. Compare them at the same moment and keep what moves you.",
            ][Math.min(step, 2)]
          }
        </p>
      </div>
      {p.candidates.length > 0 && (
        <button className="brief-listen" onClick={() => onGo(3)}>
          Listen to your {p.candidates.length} saved{" "}
          {p.candidates.length === 1 ? "take" : "takes"}
          <ArrowRight size={16} />
        </button>
      )}
      <small className="brief-save">
        Your song stays in the same project, every step of the way.
      </small>
    </aside>
  );
}
