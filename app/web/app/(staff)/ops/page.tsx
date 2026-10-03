"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, User, Zap } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Card } from "@/components/arc/card/card";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { Progress } from "@/components/arc/progress/progress";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { SortableDataTable, type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { useToast } from "@/components/segue/toasts";
import { ErrorState, Mascot, Panel, PanelHeader, RiskBadge, RiskIcon, StaleNote } from "@/components/segue/ui";
import { useLive } from "@/components/segue/use-live";
import { api, errorMessage, type OpsAction, type OpsBoard, type RiskLevel } from "@/lib/api";
import { ageSince, asRiskLevel, flightLabel, formatAge, formatBuffer, formatMinutes, humanize, RISK_LABEL, RISK_LEVELS, RISK_RANK } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import styles from "../staff.module.css";

type Row = {
  id: string; label: string; airport: string;
  left: number | null; needed: number | null; buffer: number | null;
  passengers: number; status: number; level: string | null; age: number;
};

const COLUMNS: DataColumn<Row>[] = [
  { key: "label", label: "Connection", sortable: true, render: (_, row) => <span className={`${styles.strong} ${styles.nowrap}`}>{row.label}</span> },
  { key: "airport", label: "Airport", sortable: true },
  { key: "left", label: "Left", sortable: true, numeric: true, render: (_, row) => formatMinutes(row.left) },
  { key: "needed", label: "Needed", sortable: true, numeric: true, render: (_, row) => formatMinutes(row.needed) },
  { key: "buffer", label: "Buffer", sortable: true, numeric: true, render: (_, row) => formatBuffer(row.buffer) },
  { key: "passengers", label: "Passengers", sortable: true, numeric: true },
  { key: "status", label: "Status", sortable: true, numeric: false, render: (_, row) => <RiskBadge level={row.level} size="sm" /> },
  { key: "age", label: "Data age", sortable: true, numeric: true, render: (_, row) => formatAge(row.age) },
];

const GATE = {
  auto: { label: "Auto", tone: "neutral", Icon: Zap },
  approval: { label: "Needs approval", tone: "info", Icon: ShieldCheck },
  human: { label: "Needs a person", tone: "info", Icon: User },
} as const;

const CONTEXT: Record<RiskLevel, string> = {
  safe: "passengers with time to spare",
  tight: "passengers who need to keep moving",
  at_risk: "passengers who may miss it",
  lost: "passengers who can't make it",
};

function ActionCard({ action, now, onDecided }: { action: OpsAction; now: number; onDecided: (next: OpsAction) => void }) {
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
        {action.gate === "human" && probabilities.length ? (
          <ul className={styles.probs} aria-label="Option probabilities">
            {probabilities.map(([option, value]) => <li key={option}>{humanize(option)} {Math.round(value * 100)}%</li>)}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

export default function OpsPage() {
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

  const replaceAction = (next: OpsAction) => board.setData((current) => current && { ...current, actions: current.actions.map((action) => (action.decision_id === next.decision_id ? next : action)) });
  const pending = data?.actions.filter((action) => action.status === "pending").length ?? 0;

  return (
    <>
      <StaffHeading title="Ops board" hint="Connections by risk, with suggested actions." aside={<LiveState state={board.stream} />} />

      {data?.degraded ? (
        <Alert tone="info" title="Degraded mode">The decision model is unavailable. Risk comes from fixed rules and nothing runs automatically.</Alert>
      ) : null}
      {data ? <StaleNote error={board.error} onRetry={() => void board.reload()} /> : null}

      {board.loading ? <Panel><Skeleton label="Loading the ops board" lines={6} /></Panel> : null}
      {!board.loading && !data ? <ErrorState error={board.error} onRetry={() => void board.reload()} title="The ops board didn't load" /> : null}

      {data ? (
        <>
          <div className={styles.metrics}>
            {RISK_LEVELS.map((level) => (
              <div key={level} className={styles.metric} data-risk={level}>
                <MetricCard label={RISK_LABEL[level]} value={data.counts[level] ?? 0} context={CONTEXT[level]} />
                <span className={styles.metricIcon}><RiskIcon level={level} size={16} /></span>
              </div>
            ))}
          </div>

          <div className={styles.opsGrid}>
            <Panel label="Connection board">
              <PanelHeader title="Connections" hint="Sorted by risk. Select a column to re-sort." />
              {rows.length ? (
                <SortableDataTable
                  rows={rows}
                  columns={COLUMNS}
                  rowKey="id"
                  caption="Connections being watched"
                  defaultSort={{ key: "status", direction: "desc" }}
                  itemName={{ one: "connection", other: "connections" }}
                />
              ) : (
                <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No connections yet" description="Connections appear here once passengers add their trips." label="No connections" />
              )}
            </Panel>

            <section className={styles.actions} aria-label="Suggested actions">
              <div>
                <h2 className={styles.actionsTitle}>Suggested actions</h2>
                <p className={styles.muted}>{pending === 0 ? "Nothing is waiting for you." : `${pending} waiting for a decision.`}</p>
              </div>
              {data.actions.length ? data.actions.map((action) => (
                <ActionCard key={action.decision_id} action={action} now={now} onDecided={replaceAction} />
              )) : (
                <Panel><EmptyState icon={<Mascot pose="calm" size={40} />} title="No actions right now" description="Suggestions show up here when a connection needs a decision." label="No suggested actions" /></Panel>
              )}
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}
