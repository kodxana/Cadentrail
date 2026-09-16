import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  List,
  Search,
  History,
  X,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { chapters, searchChapters } from "./helpContent";
import { tours } from "./helpTours";
import {
  readHelpProgress,
  writeHelpProgress,
  type TourId,
} from "./helpProgress";
import { version } from "../package.json";
import "./changelog.css";

type Props = {
  display:
    | { kind: "book"; article: string; context: TourId }
    | { kind: "tour"; id: TourId; step: number };
  close: () => void;
  finish: () => void;
  move: (step: number) => void;
  openHelp: (article?: string, context?: TourId) => void;
  openChangelog: () => void;
  startTour: (id: TourId, resume?: boolean) => void;
};
export default function HelpWindow(props: Props) {
  return props.display.kind === "tour" ? (
    <Tour {...props} display={props.display} />
  ) : (
    <Handbook {...props} display={props.display} />
  );
}
function Handbook({
  display,
  close,
  startTour,
  openChangelog,
}: Props & { display: Extract<Props["display"], { kind: "book" }> }) {
  const [articleId, setArticleId] = useState(display.article),
    [query, setQuery] = useState(""),
    [contents, setContents] = useState(false);
  const article = chapters.find((c) => c.id === articleId) ?? chapters[0];
  const results = searchChapters(query),
    progress = readHelpProgress().tours[display.context];
  const reading = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    first = useRef(true);
  const index = chapters.indexOf(article);
  useEffect(() => {
    setArticleId(display.article);
  }, [display.article]);
  useEffect(() => {
    writeHelpProgress({ ...readHelpProgress(), article: article.id });
    reading.current?.scrollTo({ top: 0 });
    if (!first.current) heading.current?.focus({ preventScroll: true });
    first.current = false;
  }, [article.id]);
  const choose = (id: string) => {
    setArticleId(id);
    setContents(false);
  };
  return (
    <Dialog className="handbook" titleId="handbook-title" onClose={close}>
      <header className="handbook-header">
        <div>
          <BookOpen size={22} />
          <h2 id="handbook-title">Cadentrail handbook</h2>
          <span className="handbook-version">{version}</span>
        </div>
        <button type="button" onClick={close} aria-label="Close handbook">
          <X size={20} />
        </button>
      </header>
      <div className="handbook-searchbar">
        <button
          className="handbook-contents-toggle"
          type="button"
          aria-expanded={contents}
          onClick={() => setContents(!contents)}
        >
          <List size={17} />
          {contents ? "Back to article" : "Contents"}
        </button>
        <label className="handbook-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search handbook"
            placeholder="Search: lyrics, downloads, duets…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setContents(true);
            }}
          />
        </label>
        <button
          type="button"
          className="handbook-releases-entry"
          onClick={openChangelog}
        >
          <History size={16} />
          What's new
        </button>
      </div>
      <div className={"handbook-layout" + (contents ? " show-contents" : "")}>
        <aside className="handbook-index" aria-label="Handbook contents">
          {query.trim() && (
            <p role="status" className="handbook-result-count">
              {results.length} {results.length === 1 ? "chapter" : "chapters"}{" "}
              found
            </p>
          )}
          {!results.length && (
            <p className="handbook-empty">
              No matching chapter. Try “lyrics”, “Radio”, “download” or
              “backup”.
            </p>
          )}
          {results.map((chapter, i) => (
            <div key={chapter.id}>
              {!query.trim() &&
                (i === 0 || results[i - 1].group !== chapter.group) && (
                  <h3>{chapter.group}</h3>
                )}
              <button
                type="button"
                aria-current={article.id === chapter.id ? "page" : undefined}
                onClick={() => choose(chapter.id)}
              >
                <span>{chapter.title}</span>
                <ChevronRight size={14} />
                {query.trim() && <small>{chapter.summary}</small>}
              </button>
            </div>
          ))}
        </aside>
        <main ref={reading} className="handbook-reading">
          <aside className="handbook-tour-entry" aria-label="Workspace tour">
            <div>
              <span>TOUR THIS WORKSPACE</span>
              <strong>{tours[display.context].title}</strong>
              <small>
                {progress?.state === "complete"
                  ? "Completed · replay whenever you like"
                  : progress?.state === "paused"
                    ? "Continue where you left off"
                    : tours[display.context].steps.length +
                      " short steps · no generation or downloads"}
              </small>
            </div>
            <button type="button" onClick={() => startTour(display.context)}>
              {progress?.state === "complete"
                ? "Replay tour"
                : progress?.state === "paused"
                  ? "Resume tour"
                  : "Start tour"}
              <ArrowRight size={16} />
            </button>
            {progress?.state === "paused" && (
              <button
                type="button"
                className="tour-restart"
                onClick={() => startTour(display.context, false)}
              >
                Start over
              </button>
            )}
          </aside>
          <article>
            <p className="handbook-eyebrow">{article.group}</p>
            <h1 ref={heading} tabIndex={-1}>
              {article.title}
            </h1>
            <p className="handbook-summary">{article.summary}</p>
            {article.sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                {section.paragraphs?.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {section.steps && (
                  <ol>
                    {section.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                )}
                {section.tip && (
                  <aside className="handbook-note">{section.tip}</aside>
                )}
              </section>
            ))}
            <footer className="handbook-related">
              <h2>Continue exploring</h2>
              {article.related.map((id) => (
                <button key={id} type="button" onClick={() => choose(id)}>
                  {chapters.find((c) => c.id === id)?.title}
                  <ArrowRight size={15} />
                </button>
              ))}
            </footer>
            <nav className="handbook-pages" aria-label="Chapter navigation">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => choose(chapters[index - 1].id)}
              >
                <ArrowLeft size={16} />
                Previous chapter
              </button>
              <span>
                {index + 1} / {chapters.length}
              </span>
              <button
                type="button"
                disabled={index === chapters.length - 1}
                onClick={() => choose(chapters[index + 1].id)}
              >
                Next chapter
                <ArrowRight size={16} />
              </button>
            </nav>
          </article>
        </main>
      </div>
    </Dialog>
  );
}

type Rect = { top: number; left: number; width: number; height: number };
function Tour({
  display,
  close,
  move,
  finish,
  openHelp,
}: Props & { display: Extract<Props["display"], { kind: "tour" }> }) {
  const tour = tours[display.id],
    step = tour.steps[display.step];
  const dialog = useRef<HTMLDialogElement>(null),
    card = useRef<HTMLElement>(null),
    title = useRef<HTMLHeadingElement>(null);
  const [rect, setRect] = useState<Rect | null>(null),
    [position, setPosition] = useState<{ left?: number; top?: number }>({});
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    let frame = 0,
      scrolled: Element | null = null;
    const update = () => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>(step.target),
      ).find((el) => el.getClientRects().length && !el.closest("[inert]"));
      if (target && scrolled !== target) {
        target.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "instant",
        });
        scrolled = target;
      }
      const box = target?.getBoundingClientRect(),
        w = window.innerWidth,
        h = window.innerHeight;
      const next = box
        ? {
            top: Math.max(6, box.top - 5),
            left: Math.max(6, box.left - 5),
            width: Math.max(0, Math.min(w - 12, box.width + 10)),
            height: Math.max(
              0,
              Math.min(h - Math.max(6, box.top - 5) - 6, box.height + 10),
            ),
          }
        : null;
      setRect((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
      if (w > 700) {
        const cw = Math.min(380, w - 32),
          ch = card.current?.offsetHeight ?? 300;
        const left =
          box && box.right + cw + 32 < w
            ? box.right + 16
            : Math.max(16, w - cw - 24);
        const top =
          box && box.bottom + ch + 24 < h
            ? box.bottom + 16
            : Math.max(16, h - ch - 24);
        setPosition((old) =>
          old.left === left && old.top === top ? old : { left, top },
        );
      } else setPosition((old) => (Object.keys(old).length ? {} : old));
    };
    const schedule = () => {
      // Studio meters update the DOM every frame. Keep the pending measurement
      // instead of continually cancelling it before it can run.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    title.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [display.id, display.step, step.target]);
  return (
    <dialog
      ref={dialog}
      className="tour-layer"
      aria-labelledby="tour-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "ArrowRight" && display.step < tour.steps.length - 1) {
          e.preventDefault();
          move(display.step + 1);
        }
        if (e.key === "ArrowLeft" && display.step > 0) {
          e.preventDefault();
          move(display.step - 1);
        }
      }}
    >
      {rect && rect.width > 0 && rect.height > 0 && (
        <div className="tour-spotlight" style={rect} aria-hidden="true" />
      )}
      {!rect && <div className="tour-shade" aria-hidden="true" />}
      <section ref={card} className="tour-card" style={position}>
        <header>
          <span>{tour.title}</span>
          <button type="button" onClick={close} aria-label="Pause tour">
            <X size={19} />
          </button>
        </header>
        <div className="tour-progress" aria-label="Tour progress">
          {tour.steps.map((s, i) => (
            <span
              key={s.title}
              className={i <= display.step ? "reached" : ""}
            />
          ))}
        </div>
        <p className="tour-count" role="status">
          STEP {display.step + 1} OF {tour.steps.length}
        </p>
        <h2 id="tour-title" ref={title} tabIndex={-1}>
          {step.title}
        </h2>
        <p className="tour-description">{step.text}</p>
        {!rect && (
          <small className="tour-unavailable">
            This area may need a song or a different layout to be visible.
          </small>
        )}
        <button
          type="button"
          className="context-help"
          onClick={() => openHelp(step.article, display.id)}
        >
          <BookOpen size={14} />
          Read the full guide
        </button>
        <footer>
          <button type="button" onClick={close}>
            Finish later
          </button>
          <div>
            <button
              type="button"
              disabled={display.step === 0}
              onClick={() => move(display.step - 1)}
              aria-label="Previous tour step"
            >
              <ArrowLeft size={17} />
            </button>
            {display.step === tour.steps.length - 1 ? (
              <button type="button" className="primary" onClick={finish}>
                Done
                <Check size={17} />
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={() => move(display.step + 1)}
              >
                Next
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </dialog>
  );
}
