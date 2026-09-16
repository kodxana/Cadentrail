import { setState } from "./store";
import { Headphones, Radio, Music2 } from "lucide-react";
import { BRAND, BrandMark } from "./Brand";

/** Shared visual chrome; switching experiences never changes project data. */
export function ExperienceWordmark({ room }: { room: string }) {
  return (
    <span
      className="experience-brand"
      role="img"
      aria-label={`${BRAND} · ${room}`}
    >
      <BrandMark size={27} />
      <span className="listen-brand" aria-hidden="true">
        {BRAND.toUpperCase()}
        <span>{room}</span>
      </span>
    </span>
  );
}
export function ExperienceAtmosphere({
  coverUrl,
  creation = false,
}: {
  coverUrl?: string | null;
  creation?: boolean;
}) {
  return (
    <div
      className={`listening-atmosphere${creation ? " creation-atmosphere" : ""}`}
      aria-hidden="true"
    >
      {coverUrl && <img key={coverUrl} src={coverUrl} alt="" />}
    </div>
  );
}
export function ExperienceSwitch({
  listening,
  radio = false,
  onCreate,
  onListen,
  recording = false,
}: {
  listening: boolean;
  radio?: boolean;
  onCreate?: () => void;
  onListen?: () => void;
  recording?: boolean;
}) {
  return (
    <div className="product-mode-switch" aria-label="Application mode" data-help={radio ? "radio-modes" : listening ? "listen-modes" : "creation-modes"}>
      <button
        aria-pressed={!listening && !radio}
        className={!listening && !radio ? "selected" : ""}
        onClick={onCreate}
      >
        <Music2 size={14} /> Creation
      </button>
      <button
        aria-pressed={listening}
        className={listening ? "selected" : ""}
        disabled={recording}
        title={
          recording ? "Finish recording before entering Listen" : undefined
        }
        onClick={onListen}
      >
        <Headphones size={14} />
        Listen
      </button>
      <button
        aria-pressed={radio}
        className={radio ? "selected" : ""}
        disabled={recording}
        title={recording ? "Finish recording before entering Radio" : undefined}
        onClick={() => setState({ listening: false, radio: true })}
      >
        <Radio size={14} /> Radio
      </button>
    </div>
  );
}
