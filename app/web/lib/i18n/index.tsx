"use client";

/**
 * A small i18n layer: one typed dictionary per language, a provider and a hook. No library.
 * Passenger screens use the chosen language; staff screens always read English, left to right.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { arcLabels } from "@/components/arc/lib/labels";
import { ApiError, type Flight, type Language } from "@/lib/api";
import { ar } from "./ar";
import { en, type Dictionary, type Key } from "./en";
import { hi } from "./hi";
import { ta } from "./ta";

export type { Key } from "./en";

const DICTIONARIES: Record<Language, Dictionary> = { en, ar, hi, ta };

/** Each language named in its own script. */
export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
  { value: "hi", label: "हिन्दी" },
  { value: "ta", label: "தமிழ்" },
];

export function asLanguage(value: string | null | undefined): Language | null {
  return value === "en" || value === "ar" || value === "hi" || value === "ta" ? value : null;
}

const STORAGE_KEY = "segue.language";
const STAFF_PATHS = ["/login", "/ops", "/crew", "/ground", "/authority", "/console", "/demo"];

type Vars = Record<string, string | number>;
export type Translate = (key: Key, vars?: Vars) => string;

function translate(dictionary: Dictionary, key: Key, vars?: Vars): string {
  const template = dictionary[key] ?? en[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : template;
}

type I18n = { lang: Language; dir: "ltr" | "rtl"; t: Translate; setLanguage: (lang: Language) => void };

const I18nContext = createContext<I18n>({ lang: "en", dir: "ltr", t: (key, vars) => translate(en, key, vars), setLanguage: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [chosen, setChosen] = useState<Language>("en");
  const staff = STAFF_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const lang: Language = staff ? "en" : chosen;
  const dir = lang === "ar" ? "rtl" : "ltr";

  // The stored choice is read after hydration so the server and the first client render agree.
  useEffect(() => {
    try {
      const stored = asLanguage(window.localStorage.getItem(STORAGE_KEY));
      if (stored) setChosen(stored);
    } catch { /* storage blocked: stay with English */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLanguage = useCallback((next: Language) => {
    setChosen(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* not stored; still applies for this visit */ }
  }, []);

  const value = useMemo<I18n>(() => {
    const dictionary = DICTIONARIES[lang];
    const t: Translate = (key, vars) => translate(dictionary, key, vars);
    return { lang, dir, t, setLanguage };
  }, [lang, dir, setLanguage]);

  // Arc components carry a few fixed screen-reader strings; they read them from here.
  arcLabels.closeDialog = value.t("common.close");
  arcLabels.dismissToast = value.t("common.dismiss");
  arcLabels.stepCompleted = value.t("stepper.completed");
  arcLabels.stepUpcoming = value.t("stepper.upcoming");
  arcLabels.stepError = value.t("stepper.error");
  arcLabels.stepPosition = (n, count, label) => value.t("stepper.position", { n, count, label });

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

export function useT(): Translate {
  return useContext(I18nContext).t;
}

/** The browser tab title for the current page. React lifts <title> into the document head. */
export function PageTitle({ title }: { title: string }) {
  return <title>{`${title} · Segue`}</title>;
}

/**
 * Formatting in the current language. Digits stay Latin in every language, so times, gates and counts
 * read the same everywhere and never flip in right-to-left text.
 */
export function useFormat() {
  const { lang, t } = useI18n();
  return useMemo(() => {
    const locale = lang === "en" ? undefined : `${lang}-u-nu-latn`;
    const valid = (iso: string | null | undefined) => { if (!iso) return null; const date = new Date(iso); return Number.isNaN(date.getTime()) ? null : date; };
    const age = (seconds: number | null | undefined) => {
      if (seconds == null || !Number.isFinite(seconds)) return "—";
      const minutes = Math.floor(Math.max(0, seconds) / 60);
      if (minutes < 1) return t("time.justNow");
      if (minutes < 60) return t("time.minAgo", { n: minutes });
      const hours = Math.floor(minutes / 60);
      return hours < 24 ? t("time.hAgo", { n: hours }) : t("time.dAgo", { n: Math.floor(hours / 24) });
    };
    return {
      time: (iso: string | null | undefined) => valid(iso)?.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false }) ?? "—",
      dateTime: (iso: string | null | undefined) => valid(iso)?.toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) ?? "—",
      age,
      ageSince: (iso: string | null | undefined, now: number) => { const date = valid(iso); return date ? age((now - date.getTime()) / 1000) : "—"; },
      minutes: (n: number) => t("common.min", { n: Math.round(n) }),
      /** A signed buffer: "+12 min", "−5 min". */
      buffer: (minutes: number | null | undefined) => {
        if (minutes == null || !Number.isFinite(minutes)) return "—";
        const rounded = Math.round(minutes);
        return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${t("common.min", { n: Math.abs(rounded) })}`;
      },
      flightStatus: (flight: Pick<Flight, "status" | "delay_min">) => {
        const status = flight.status === "en-route" ? "active" : flight.status;
        const base = status === "scheduled" || status === "active" || status === "landed" || status === "cancelled" ? t(`status.${status}`) : t("status.unknown");
        return flight.delay_min > 0 ? `${base} · ${t("trip.late", { n: flight.delay_min })}` : base;
      },
      /** The API's own message when it gave one; a translated line when the request never arrived. */
      error: (error: unknown) => {
        if (error instanceof ApiError) return error.status === 0 ? t("error.network") : error.message;
        if (error instanceof Error && error.message) return error.message;
        return t("error.generic");
      },
    };
  }, [lang, t]);
}
