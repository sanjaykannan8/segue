"use client";

import { useEffect, useRef, useState } from "react";

/** A clock that ticks so relative times ("4 min ago") stay fresh. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}


export type Sample<T> = T & { at: number };

/**
 * Keeps the values seen since the page opened, one sample per fresh answer from the API.
 * It is session memory only: nothing is stored and nothing is invented, so a trend starts empty.
 */
export function useSessionSeries<T extends Record<string, number>>(source: unknown, pick: () => T | null, limit = 120): Sample<T>[] {
  const [series, setSeries] = useState<Sample<T>[]>([]);
  const pickRef = useRef(pick);
  useEffect(() => { pickRef.current = pick; });
  useEffect(() => {
    if (source === undefined || source === null) return;
    const sample = pickRef.current();
    if (!sample) return;
    setSeries((current) => [...current.slice(-(limit - 1)), { ...sample, at: Date.now() }]);
  }, [source, limit]);
  return series;
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
