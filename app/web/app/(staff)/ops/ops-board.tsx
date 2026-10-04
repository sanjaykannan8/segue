"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShieldCheck, User, Zap } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Card } from "@/components/arc/card/card";
import { Progress } from "@/components/arc/progress/progress";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { useToast } from "@/components/segue/toasts";
import { ErrorState, LiveRegion, Panel, RiskBadge, StaleNote } from "@/components/segue/ui";
import { useLive } from "@/components/segue/use-live";
import { api, errorMessage, type OpsAction, type OpsBoard, type RiskLevel } from "@/lib/api";
import { ageSince, asRiskLevel, flightLabel, formatAge, formatBuffer, formatMinutes, humanize, RISK_LABEL, RISK_LEVELS, RISK_RANK } from "@/lib/format";
import { useNow, useSessionSeries } from "@/lib/hooks";
import styles from "../staff.module.css";

/* Shared by every Ops page: the board loads once here, so moving between pages keeps the live stream open. */

export type Row = {
  id: string; label: string; airport: string;
  left: number | null; needed: number | null; buffer: number | null;
  passengers: number; status: number; level: string | null; age: number;
};

export const COLUMNS: DataColumn<Row>[] = [
  { key: "label", label: "Connection", sortable: true, render: (_, row) => <span className={`${styles.strong} ${styles.nowrap}`}>{row.label}</span> },
  { key: "airport", label: "Airport", sortable: true },
  { key: "left", label: "Left", sortable: true, numeric: true, render: (_, row) => formatMinutes(row.left) },
  { key: "needed", label: "Needed", sortable: true, numeric: true, render: (_, row) => formatMinutes(row.needed) },
  { key: "buffer", label: "Buffer", sortable: true, numeric: true, render: (_, row) => formatBuffer(row.buffer) },
  { key: "passengers", label: "Passengers", sortable: true, numeric: true },
  { key: "status", label: "Status", sortable: true, numeric: false, render: (_, row) => <RiskBadge level={row.level} size="sm" /> },
  { key: "age", label: "Data age", sortable: true, numeric: true, render: (_, row) => formatAge(row.age) },
];

export const GATE = {
  auto: { label: "Runs itself", tone: "neutral", Icon: Zap },
  approval: { label: "Needs approval", tone: "info", Icon: ShieldCheck },
  human: { label: "Needs a person", tone: "info", Icon: User },
} as const;

export const RISK_COLOR: Record<RiskLevel, string> = { safe: "#0DB879", tight: "#F3AD20", at_risk: "#F48120", lost: "#F15F55" };
/** Action states are not risk, so they use the brand blues. */
export const ACTION_STATES = [
  { key: "pending", label: "Pending", color: "var(--chart-1)" },
  { key: "approved", label: "Approved", color: "var(--chart-2)" },
  { key: "executed", label: "Executed", color: "var(--chart-3)" },
  { key: "dismissed", label: "Dismissed", color: "var(--chart-4)" },
  { key: "expired", label: "Expired", color: "var(--chart-5)" },
] as const;

export const CONTEXT: Record<RiskLevel, string> = {
  safe: "passengers with time to spare",
  tight: "passengers who need to keep moving",
  at_risk: "passengers who may miss it",
  lost: "passengers who can't make it",
};

/** What pressing Approve does, in plain words. */
const APPROVE_EFFECT: Record<string, string> = {
  hold_flight: "Approving holds the departure and re-scores everyone on it.",
  rebook: "Approving starts rebooking for the passengers who cannot make it.",
  escort: "Approving sends an escort request to the ground team.",
};

export function ActionCard({ action, now, onDecided }: { action: OpsAction; now: number; onDecided: (next: OpsAction) => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null);
  const gate = GATE[action.gate] ?? GATE.human;
  const percent = Math.round(Math.min(1, Math.max(0, action.confidence)) * 100);
  const probabilities = Object.entries(action.probabilities ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 4);

  async function decide(kind: "approve" | "dismiss") {
    setBusy(kind);
    try {
      onDecided(kind === "approve" ? await api.approveDecision(action.decision_id) : await api.dismissDecision(action.decision_id));
      notify(kind === "approve" ? "Action approved" : "Action dismissed", action.title);
    } catch (error) {
      notify("That didn't go through", errorMessage(error));
    } finally { setBusy(null); }
  }

  const footer = action.status === "pending" ? (
    <div className={styles.actionButtons}>
      <Button size="sm" variant="secondary" onClick={() => void decide("dismiss")} loading={busy === "dismiss"} disabled={busy !== null}>Dismiss</Button>
      <Button size="sm" onClick={() => void decide("approve")} loading={busy === "approve"} disabled={busy !== null}>Approve</Button>
    </div>
  ) : (
    <Badge tone="neutral">{humanize(action.status)}{action.decided_by ? ` by ${action.decided_by}` : ""}</Badge>
  );

  return (
    <Card
      title={action.title}
      description={action.detail}
      meta={`${action.connection_label}${action.seat ? ` · seat ${action.seat}` : ""}`}
      status={`Raised ${ageSince(action.created_at, now)}`}
      action={footer}
    >
      <div className={styles.actionBody}>
        <div className={styles.actionMeta}>
          <Badge size="sm" tone={gate.tone} icon={<gate.Icon width={12} height={12} aria-hidden="true" />}>{gate.label}</Badge>
          <Badge size="sm" tone="neutral">{humanize(action.type)}: {humanize(action.answer)}</Badge>
        </div>
        <Progress value={percent} label="Confidence" showValue />
        {action.status === "pending" ? <p className={styles.muted}>{APPROVE_EFFECT[action.answer] ?? "Approving sends this to the team that carries it out."}</p> : null}
        {action.gate === "human" && probabilities.length ? (
          <ul className={styles.probs} aria-label="Option probabilities">
            {probabilities.map(([option, value]) => <li key={option}>{humanize(option)} {Math.round(value * 100)}%</li>)}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

type Ops = ReturnType<typeof useOpsBoard>;
const OpsContext = createContext<Ops | null>(null);

/** The board and everything derived from it, exactly as the single Ops page computed it. */
function useOpsBoard() {
  const now = useNow();
  const board = useLive<OpsBoard>(api.opsBoard, "ops");
  const data = board.data;

  const rows = useMemo<Row[]>(() => (data?.connections ?? []).map((connection) => {
    const level = asRiskLevel(connection.risk?.level);
    return {
      id: connection.connection_id,
      label: `${flightLabel(connection.inbound.flight_iata)} → ${flightLabel(connection.outbound.flight_iata)}`,
      airport: connection.airport,
      left: connection.risk?.left_min ?? null,
      needed: connection.risk?.needed_min ?? null,
      buffer: connection.risk?.buffer_min ?? null,
      passengers: connection.passengers,
      status: level ? RISK_RANK[level] : 0,
      level: connection.risk?.level ?? null,
      age: Math.max(connection.inbound.age_sec, connection.outbound.age_sec),
    };
  }), [data]);

  const history = useSessionSeries(data, () => (data ? { safe: data.counts.safe ?? 0, tight: data.counts.tight ?? 0, at_risk: data.counts.at_risk ?? 0, lost: data.counts.lost ?? 0 } : null));

  const riskSlices = useMemo(() => RISK_LEVELS.map((level) => ({ key: level, label: RISK_LABEL[level], value: data?.counts[level] ?? 0, color: RISK_COLOR[level] })), [data]);
  // Needs -> has, one line per connection: a line that falls is a connection short of time (negative buffer).
  const slopes = useMemo(() => rows.filter((row) => row.left !== null && row.needed !== null).sort((a, b) => (a.buffer ?? 0) - (b.buffer ?? 0)).slice(0, 8).map((row) => ({ key: row.id, label: row.label, start: Math.round(row.needed ?? 0), end: Math.round(row.left ?? 0) })), [rows]);
  const actionSlices = useMemo(() => ACTION_STATES.map((state) => ({ key: state.key, label: state.label, color: state.color, value: (data?.actions ?? []).filter((action) => action.status === state.key).length })).filter((slice) => slice.value > 0), [data]);

  const replaceAction = (next: OpsAction) => board.setData((current) => current && { ...current, actions: current.actions.map((action) => (action.decision_id === next.decision_id ? next : action)) });
  const pending = data?.actions.filter((action) => action.status === "pending").length ?? 0;

  return { now, board, data, rows, history, riskSlices, slopes, actionSlices, replaceAction, pending };
}

export function useOps(): Ops & { data: OpsBoard } {
  const ops = useContext(OpsContext);
  if (!ops?.data) throw new Error("useOps is used inside OpsProvider, once the board has loaded");
  return ops as Ops & { data: OpsBoard };
}

const HEADINGS: Record<string, { title: string; hint: string }> = {
  "/ops": { title: "Ops controller", hint: "Decide on connections at risk at Dubai International." },
  "/ops/connections": { title: "Connections", hint: "Every watched connection, sorted by risk." },
  "/ops/actions": { title: "Suggested actions", hint: "Approve or dismiss what the system suggests." },
};

export function OpsProvider({ children }: { children: ReactNode }) {
  const ops = useOpsBoard();
  const { board, data, pending } = ops;
  const heading = HEADINGS[usePathname()] ?? HEADINGS["/ops"];

  return (
    <OpsContext.Provider value={ops}>
      <StaffHeading title={heading.title} hint={heading.hint} aside={<LiveState state={board.stream} />} />

      {data?.degraded ? (
        <Alert tone="info" title="Degraded mode">The decision model is unavailable. Risk comes from fixed rules and nothing runs automatically.</Alert>
      ) : null}
      {data ? <LiveRegion>{`Board updated: ${data.counts.at_risk} at risk, ${data.counts.lost} lost, ${pending} ${pending === 1 ? "action" : "actions"} waiting for a decision.`}</LiveRegion> : null}
      {data ? <StaleNote error={board.error} onRetry={() => void board.reload()} /> : null}

      {board.loading ? <Panel><Skeleton label="Loading the ops board" lines={6} /></Panel> : null}
      {!board.loading && !data ? <ErrorState error={board.error} onRetry={() => void board.reload()} title="The ops board didn't load" /> : null}

      {data ? children : null}
    </OpsContext.Provider>
  );
}
