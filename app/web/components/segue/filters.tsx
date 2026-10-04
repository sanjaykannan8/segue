"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import styles from "./filters.module.css";

export type ChipOption<V extends string> = { value: V; label: string; count?: number };

/** True when every word of the query appears in one of the fields. Case and Latin accents don't matter
    (the character class below is the combining accents block, U+0300 to U+036F). */
export function matches(query: string, ...fields: (string | number | null | undefined)[]): boolean {
  const fold = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(fields.filter((field) => field !== null && field !== undefined).join(" ")).replace(/\s+/g, " ");
  const compact = haystack.replace(/\s+/g, "");
  return words.every((word) => haystack.includes(word) || compact.includes(word));
}

/** Search text plus a set of named filters, with a reset. They are kept for this page for the rest of the browser session. */
export function useFilters<F extends Record<string, string | boolean>>(initial: F) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<F>(initial);
  const storageKey = `segue.filters:${usePathname()}`;
  // Saving starts only after the restored values have been rendered, so the empty first render never overwrites them.
  const [restored, setRestored] = useState(false);

  // Restored after mount, so the server render and the first client render agree.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as { query?: unknown; filters?: Record<string, unknown> } | null;
      if (saved) {
        if (typeof saved.query === "string") setQuery(saved.query);
        // Only known keys with the right type come back, so an old or edited entry can't break the page.
        const next = { ...initial };
        for (const key of Object.keys(initial) as (keyof F)[]) {
          const value = saved.filters?.[key as string];
          if (typeof value === typeof initial[key]) next[key] = value as F[typeof key];
        }
        setFilters(next);
      }
    } catch { /* storage blocked or unreadable: start fresh */ }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per page
  }, [storageKey]);
  useEffect(() => {
    if (!restored) return;
    try { window.sessionStorage.setItem(storageKey, JSON.stringify({ query, filters })); } catch { /* storage blocked: filters still work on this view */ }
  }, [restored, storageKey, query, filters]);

  const set = <K extends keyof F>(key: K, value: F[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const active = query.trim() !== "" || (Object.keys(initial) as (keyof F)[]).some((key) => filters[key] !== initial[key]);
  const clear = () => { setQuery(""); setFilters(initial); };
  return { query, setQuery, filters, set, active, clear };
}

/** Words the bar shows. Staff screens use the English defaults; passenger screens pass translations. */
type BarText = { clear: string; clearSearch: string; of: (shown: number, total: number, noun: string) => string };
const BAR_TEXT: BarText = { clear: "Clear filters", clearSearch: "Clear search", of: (shown, total, noun) => `${shown} of ${total} ${noun}` };

/** The filter row above a list: search, then any chip groups and toggles, then the result count. Press "/" to jump to the search. */
export function FilterBar({ label, query, onQuery, placeholder, children, shown, total, noun, active, onClear, text = BAR_TEXT }: {
  /** Names the whole filter area for screen readers, e.g. "Filter connections". */
  label: string;
  query: string;
  onQuery: (next: string) => void;
  placeholder: string;
  children?: ReactNode;
  shown: number;
  total: number;
  noun: { one: string; other: string };
  active: boolean;
  onClear: () => void;
  text?: BarText;
}) {
  const searchId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
      if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const nounFor = total === 1 ? noun.one : noun.other;
  return (
    <section className={styles.bar} aria-label={label}>
      <div className={styles.searchRow}>
        <label htmlFor={searchId} className="sr-only">{placeholder}</label>
        <span className={styles.search}>
          <Search width={18} height={18} aria-hidden="true" className={styles.searchIcon} />
          <input
            ref={input}
            id={searchId}
            type="search"
            className={styles.searchInput}
            placeholder={placeholder}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); onQuery(""); } }}
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button type="button" className={styles.searchClear} onClick={() => onQuery("")} aria-label={text.clearSearch}>
              <X width={16} height={16} aria-hidden="true" />
            </button>
          ) : null}
        </span>
        <p className={styles.count} role="status" aria-live="polite" aria-atomic="true">
          {shown === total ? `${total} ${nounFor}` : text.of(shown, total, nounFor)}
        </p>
        {active ? <button type="button" className={styles.clear} onClick={onClear}>{text.clear}</button> : null}
      </div>
      {children ? <div className={styles.filters}>{children}</div> : null}
    </section>
  );
}

/** One single-choice filter, as a row of pill buttons. */
export function ChipGroup<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: ChipOption<V>[]; onChange: (next: V) => void }) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <span className={`${styles.groupLabel} way`} aria-hidden="true">{label}</span>
      <div className={styles.chips}>
        {options.map((option) => (
          <button key={option.value} type="button" className={styles.chip} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
            {option.label}
            {option.count !== undefined ? <span className={styles.chipCount}>{option.count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An on/off filter. */
export function FilterToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Shown in place of a list when filters hide every row. */
export function NoMatches({ onClear, text = { title: "Nothing matches these filters.", clear: "Clear filters" } }: { onClear: () => void; text?: { title: string; clear: string } }) {
  return (
    <div className={styles.none}>
      <p className={styles.noneTitle}>{text.title}</p>
      <button type="button" className={styles.clear} onClick={onClear}>{text.clear}</button>
    </div>
  );
}
