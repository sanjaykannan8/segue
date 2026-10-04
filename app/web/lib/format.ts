import type { Flight, RiskLevel } from "./api";

export const RISK_LEVELS: RiskLevel[] = ["safe", "tight", "at_risk", "lost"];

export const RISK_LABEL: Record<RiskLevel, string> = {
  safe: "Safe",
  tight: "Tight",
  at_risk: "At risk",
  lost: "Lost",
};

/** Higher is worse. Unknown levels sort last. */
export const RISK_RANK: Record<RiskLevel, number> = { lost: 4, at_risk: 3, tight: 2, safe: 1 };

export function asRiskLevel(level: string | null | undefined): RiskLevel | null {
  return level && (RISK_LEVELS as string[]).includes(level) ? (level as RiskLevel) : null;
}

export const ASSISTANCE_TYPES = ["none", "wheelchair", "buggy", "escort", "step_free_route"] as const;

/** "step_free_route" → "Step-free route", "hold_flight" → "Hold flight" */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  if (value === "step_free_route") return "Step-free route";
  const text = value.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "EK512" → "EK 512" */
export function flightLabel(iata: string): string {
  const match = /^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/.exec(iata) ?? /^([A-Z0-9]{3})(\d{1,4}[A-Z]?)$/.exec(iata);
  return match ? `${match[1]} ${match[2]}` : iata;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "just now", "4 min ago", "2 h ago" */
export function formatAge(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

export function ageSince(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? "—" : formatAge((now - time) / 1000);
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  return `${Math.round(minutes)} min`;
}

/** A signed buffer: "+12 min", "−5 min". */
export function formatBuffer(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const rounded = Math.round(minutes);
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)} min`;
}

export function flightStatusLabel(flight: Flight): string {
  const base = humanize(flight.status);
  return flight.delay_min > 0 ? `${base}, ${flight.delay_min} min late` : base;
}

/** datetime-local value (local time) → ISO 8601 UTC */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
