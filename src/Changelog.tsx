import { useEffect, useRef, useState } from "react";
import { ArrowLeft, History, Search, X } from "lucide-react";
import { Dialog } from "./Dialog";
import history from "./changelog.json";
import { version } from "../package.json";
import "./help.css";
import "./changelog.css";
const categories = ["All changes", "Added", "Improved", "Fixed"] as const;
type Category = (typeof categories)[number];
type Release = {version:string;title:string;summary:string;changes:Partial<Record<Exclude<Category,"All changes">,string[]>>};
const releases:Release[]=history;
export default function Changelog({
  close,
  back,
}: {
  close: () => void;
  back: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All changes");
  const [chosen, setChosen] = useState(
    () => new URLSearchParams(location.search).get("changelog") || version,
  );
  const reading = useRef<HTMLElement>(null);
  const matches = releases.filter((r) => {
    if (category !== "All changes" && !r.changes[category]?.length)
      return false;
    const text = [
      r.version,
      r.title,
      r.summary,
      ...Object.entries(r.changes)
        .filter(([key]) => category === "All changes" || key === category)
        .flatMap(([, lines]) => lines ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((term) => text.includes(term));
  });
  const selected = matches.find((r) => r.version === chosen) ?? matches[0];
  useEffect(() => {
    reading.current?.scrollTo({ top: 0 });
  }, [selected?.version, category]);
  return (
    <Dialog
      className="handbook changelog"
      titleId="changelog-title"
      onClose={close}
    >
      <header className="handbook-header">
        <div>
          <History size={22} />
          <h2 id="changelog-title">What's new</h2>
          <span className="handbook-version">Installed {version}</span>
        </div>
        <button type="button" onClick={close} aria-label="Close changelog">
          <X size={20} />
        </button>
      </header>
      <div className="changelog-toolbar">
        <button type="button" onClick={back}>
          <ArrowLeft size={16} />
          Guide
        </button>
        <label className="handbook-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search updates"
            placeholder="Search updates, features or versions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="changelog-filter">
          <span>Show</span>
          <select
            aria-label="Change type"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="changelog-layout">
        <nav className="changelog-versions" aria-label="Release versions">
          <p role="status">
            {matches.length} {matches.length === 1 ? "update" : "updates"}
          </p>
          {matches.map((r) => (
            <button
              type="button"
              key={r.version}
              aria-current={
                selected?.version === r.version ? "page" : undefined
              }
              onClick={() => setChosen(r.version)}
            >
              <span>
                <strong>{r.version}</strong>
                {r.version === version && <small>Current</small>}
              </span>
              <span>{r.title}</span>
            </button>
          ))}
        </nav>
        <main className="changelog-reading" ref={reading}>
          <label className="changelog-mobile-version">
            Browse versions
            <select
              aria-label="Release version"
              disabled={!matches.length}
              value={selected?.version ?? ""}
              onChange={(e) => setChosen(e.target.value)}
            >
              {!matches.length && <option value="">No matching updates</option>}
              {matches.map((r) => (
                <option key={r.version} value={r.version}>
                  {r.version} · {r.title}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <article aria-label={"Release " + selected.version}>
              <p className="handbook-eyebrow">
                VERSION {selected.version}
                {selected.version === version ? " · CURRENT RELEASE" : ""}
              </p>
              <h1>{selected.title}</h1>
              <p className="changelog-summary">{selected.summary}</p>
              {Object.entries(selected.changes)
                .filter(
                  ([name, lines]) =>
                    lines?.length &&
                    (category === "All changes" || name === category),
                )
                .map(([name, lines]) => (
                  <section key={name}>
                    <h2>{name}</h2>
                    <ul>
                      {lines!.map((line: string) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              <footer>
                Changes describe each version when it was released. Early
                versions used the working title YuE2 Studio.
              </footer>
            </article>
          ) : (
            <div className="changelog-empty" role="status">
              <h1>No matching updates</h1>
              <p>
                Try a feature such as Radio, lyrics or backups, or a version
                number.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("All changes");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </main>
      </div>
    </Dialog>
  );
}
