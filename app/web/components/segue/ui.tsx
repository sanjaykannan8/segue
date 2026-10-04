"use client";

import type { ReactNode } from "react";
import { CircleCheck, CircleHelp, CircleX, Clock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { RiskLevel } from "@/lib/api";
import { asRiskLevel } from "@/lib/format";
import { useFormat, useT } from "@/lib/i18n";
import styles from "./ui.module.css";

export type MascotPose = "wink" | "code" | "dizzy" | "sleepy" | "alert" | "happy" | "mail" | "calm" | "look_right" | "look_left";

/** The cloud mascot. Always decorative: the text next to it carries the meaning, so it has an empty alt. */
export function Mascot({ pose, size = 72, className }: { pose: MascotPose; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static local asset, no optimizer needed
  return <img src={`/mascot/${pose}.png`} width={size} height={size} alt="" className={[styles.mascot, className].filter(Boolean).join(" ")} decoding="async" />;
}

/** The gradient logo tile (mark and wordmark in white). */
export function LogoTile({ size = 40, decorative = false }: { size?: number; decorative?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element -- static local asset
  return <img src="/segue-logo.svg" width={size} height={size} alt={decorative ? "" : "Segue"} className={styles.logo} style={{ borderRadius: Math.round(size * 0.28) }} />;
}

const RISK_ICON: Record<RiskLevel, typeof CircleCheck> = { safe: CircleCheck, tight: Clock, at_risk: TriangleAlert, lost: CircleX };

export function RiskIcon({ level, size = 14 }: { level: RiskLevel | null; size?: number }) {
  const Icon = level ? RISK_ICON[level] : CircleHelp;
  return <Icon width={size} height={size} strokeWidth={2} aria-hidden="true" />;
}

/** Risk is never shown by color alone: every badge carries an icon and a label. */
export function RiskBadge({ level, size = "md" }: { level: string | null | undefined; size?: "sm" | "md" }) {
  const t = useT();
  const known = asRiskLevel(level);
  return (
    <Badge size={size} data-risk={known ?? "unknown"} icon={<RiskIcon level={known} size={size === "sm" ? 12 : 14} />}>
      {t(known ? `risk.${known}` : "risk.unknown")}
    </Badge>
  );
}

/** A white panel: the basic container on every screen. */
export function Panel({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section className={[styles.panel, className].filter(Boolean).join(" ")} aria-label={label}>{children}</section>;
}

export function PanelHeader({ title, hint, action, level = 2 }: { title: string; hint?: ReactNode; action?: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={styles.panelHeader}>
      <div className={styles.panelTitles}>
        <Heading className={styles.panelTitle}>{title}</Heading>
        {hint ? <p className={styles.panelHint}>{hint}</p> : null}
      </div>
      {action ? <div className={styles.panelAction}>{action}</div> : null}
    </div>
  );
}

/** Friendly inline error with a retry. Used wherever a request can fail. */
export function ErrorState({ error, onRetry, title, compact = false }: { error: unknown; onRetry?: () => void; title?: string; compact?: boolean }) {
  const t = useT();
  const format = useFormat();
  return (
    <div className={[styles.error, compact ? styles.errorCompact : ""].filter(Boolean).join(" ")} role="alert">
      {compact ? null : <Mascot pose="dizzy" size={72} />}
      <div className={styles.errorCopy}>
        <p className={styles.errorTitle}>{title ?? t("error.title")}</p>
        <p className={styles.errorText}>{format.error(error)}</p>
      </div>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>{t("common.retry")}</Button> : null}
    </div>
  );
}

/** A thin notice shown when a background refresh failed but older data is still on screen. */
export function StaleNote({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  if (!error) return null;
  return (
    <div className={styles.stale} role="status">
      <span>{t("stale.text")}</span>
      <button type="button" className={styles.linkButton} onClick={onRetry}>{t("common.retry")}</button>
    </div>
  );
}

export function LoadingPanel({ label, lines = 4 }: { label?: string; lines?: number }) {
  const t = useT();
  return <Panel><Skeleton label={label ?? t("common.loading")} lines={lines} /></Panel>;
}

/** Inline form feedback under a form. Give it an id to tie it to a field with aria-describedby. */
export function FormError({ error, id }: { error: unknown; id?: string }) {
  const format = useFormat();
  if (!error) return null;
  return <p id={id} className={styles.formError} role="alert">{format.error(error)}</p>;
}

/** A label and value pair, stacked. Use inside a <dl>. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Flight numbers, routes, gates, codes and times keep their left-to-right order inside right-to-left text. */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi dir="ltr" className={className}>{children}</bdi>;
}

/** Announced politely to screen readers, never shown and never focused. */
export function LiveRegion({ children }: { children: ReactNode }) {
  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{children}</p>;
}
