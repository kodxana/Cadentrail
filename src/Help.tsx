import {
  Component,
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { BookOpen } from "lucide-react";
import { Dialog } from "./Dialog";
import { getState } from "./store";
import {
  readHelpProgress,
  writeHelpProgress,
  type TourId,
} from "./helpProgress";
import { tours } from "./helpTours";

const HelpWindow = lazy(() => import("./HelpWindow"));
const Changelog = lazy(() => import("./Changelog"));
class HelpBoundary extends Component<
  { children: ReactNode; close: () => void; feature: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <Dialog
          className="help-status"
          titleId="help-unavailable"
          onClose={this.props.close}
        >
          <h2 id="help-unavailable">{this.props.feature} unavailable</h2>
          <p>
            The help files could not load. You can keep working. Once the
            connection returns, save your edits and reload the app to try help
            again.
          </p>
          <button type="button" onClick={this.props.close}>
            Continue working
          </button>
        </Dialog>
      );
    return this.props.children;
  }
}
type Display =
  | { kind: "book"; article: string; context: TourId }
  | { kind: "tour"; id: TourId; step: number }
  | { kind: "changes" };
type HelpContextValue = {
  tour: { id: TourId; step: number } | null;
  openHelp: (article?: string, context?: TourId) => void;
  openChangelog: () => void;
  startTour: (id: TourId, resume?: boolean) => void;
};
const HelpContext = createContext<HelpContextValue | null>(null);
export function currentHelpContext(): TourId {
  const s = getState();
  return s.radio
    ? "radio"
    : s.listening
      ? "listen"
      : s.view === "home" || !s.project
        ? "home"
        : s.view === "create"
          ? "create"
          : s.view === "visuals"
            ? "visuals"
            : "studio";
}
export const contextArticle: Record<TourId, string> = {
  home: "start",
  create: "first-song",
  studio: "studio",
  visuals: "visuals",
  listen: "listen",
  radio: "radio",
};
export function HelpProvider({ children }: { children: ReactNode }) {
  const [display, setDisplay] = useState<Display | null>(() =>
    new URLSearchParams(location.search).has("changelog")
      ? { kind: "changes" }
      : null,
  );
  const rememberTour = (
    value: Extract<Display, { kind: "tour" }>,
    state: "paused" | "complete" = "paused",
  ) => {
    const saved = readHelpProgress();
    writeHelpProgress({
      ...saved,
      tours: { ...saved.tours, [value.id]: { step: value.step, state } },
    });
  };
  const openHelp = (article?: string, context = currentHelpContext()) => {
    if (display?.kind === "tour") rememberTour(display);
    const saved = readHelpProgress();
    setDisplay({ kind: "book", article: article ?? saved.article, context });
  };
  const openChangelog = () => {
    if (display?.kind === "tour") rememberTour(display);
    setDisplay({ kind: "changes" });
  };
  const startTour = (id: TourId, resume = true) => {
    const saved = readHelpProgress().tours[id];
    const next: Extract<Display, { kind: "tour" }> = {
      kind: "tour",
      id,
      step:
        resume && saved?.state === "paused"
          ? Math.min(saved.step, tours[id].steps.length - 1)
          : 0,
    };
    rememberTour(next);
    setDisplay(next);
  };
  const close = () => {
    if (display?.kind === "tour") rememberTour(display);
    setDisplay(null);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "F1" || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      e.stopPropagation();
      const context = currentHelpContext();
      setDisplay({ kind: "book", context, article: contextArticle[context] });
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  return (
    <HelpContext.Provider
      value={{
        tour: display?.kind === "tour" ? display : null,
        openHelp,
        openChangelog,
        startTour,
      }}
    >
      {children}
      {display &&
        createPortal(
          <HelpBoundary close={close} feature={display.kind==="changes"?"Changelog":"Handbook"}>
            <Suspense
              fallback={
                <Dialog
                  className="help-status"
                  titleId="help-loading"
                  onClose={close}
                >
                  <h2 id="help-loading">
                    {display.kind === "changes"
                      ? "Opening changelog…"
                      : "Opening handbook…"}
                  </h2>
                  <p role="status">Loading your guide.</p>
                  <button type="button" onClick={close}>
                    Continue working
                  </button>
                </Dialog>
              }
            >
              {display.kind === "changes" ? (
                <Changelog close={close} back={() => openHelp()} />
              ) : (
                <HelpWindow
                  display={display}
                  close={close}
                  openHelp={openHelp}
                  openChangelog={openChangelog}
                  startTour={startTour}
                  move={(step) => {
                    if (display.kind === "tour") {
                      const next = { ...display, step };
                      rememberTour(next);
                      setDisplay(next);
                    }
                  }}
                  finish={() => {
                    if (display.kind === "tour")
                      rememberTour(display, "complete");
                    setDisplay(null);
                  }}
                />
              )}
            </Suspense>
          </HelpBoundary>,
          document.fullscreenElement ?? document.body,
        )}
    </HelpContext.Provider>
  );
}
export function useHelp() {
  const help = useContext(HelpContext);
  if (!help) throw new Error("HelpProvider is missing");
  return help;
}
export function HelpButton({
  context,
  topic,
  compact = false,
}: {
  context?: TourId;
  topic?: string;
  compact?: boolean;
}) {
  const { openHelp } = useHelp();
  return (
    <button
      type="button"
      className={"handbook-button" + (compact ? " compact" : "")}
      title="Handbook and guided tours (F1)"
      aria-label="Handbook and tours"
      onClick={() => {
        const area = context ?? currentHelpContext();
        openHelp(topic ?? contextArticle[area], area);
      }}
    >
      <BookOpen size={17} />
      <span>Guide</span>
    </button>
  );
}
export function HelpLink({
  topic,
  children = "How this works",
}: {
  topic: string;
  children?: ReactNode;
}) {
  const { openHelp } = useHelp();
  return (
    <button
      type="button"
      className="context-help"
      onClick={() => openHelp(topic)}
    >
      <BookOpen size={14} />
      {children}
    </button>
  );
}
