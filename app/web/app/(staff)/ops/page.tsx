"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { SlopeChart } from "@/components/arc/slope-chart/slope-chart";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import { Mascot, Panel, PanelHeader, RiskBadge, RiskIcon } from "@/components/segue/ui";
import { formatBuffer, RISK_LABEL, RISK_LEVELS } from "@/lib/format";
import { clockTime } from "@/lib/hooks";
import styles from "../staff.module.css";
import { CONTEXT, useOps } from "./ops-board";

/** Ops dashboard: the counts, the charts, and the connections that need attention first. */
export default function OpsDashboardPage() {
  const { data, rows, history, riskSlices, slopes, actionSlices, pending } = useOps();
  const tightest = [...rows].filter((row) => row.buffer !== null).sort((a, b) => (a.buffer ?? 0) - (b.buffer ?? 0)).slice(0, 5);

  return (
    <>
      {pending > 0 ? (
        <Link href="/ops/actions" className={styles.callout}>
          <span><strong>{pending} {pending === 1 ? "action is" : "actions are"} waiting for you.</strong> Review and approve or dismiss.</span>
          <ArrowRight width={18} height={18} aria-hidden="true" className="flip-rtl" />
        </Link>
      ) : null}

      <div className={styles.metrics}>
        {RISK_LEVELS.map((level) => {
          const points = history.map((sample) => sample[level]);
          const change = points.length > 1 ? points[points.length - 1] - points[0] : 0;
          return (
            <div key={level} className={styles.metric} data-risk={level}>
              <span className={styles.metricIcon}><RiskIcon level={level} size={16} /></span>
              <MetricCard label={RISK_LABEL[level]} value={data.counts[level] ?? 0} context={CONTEXT[level]} />
              <div className={styles.metricTrend} data-risk-accent>
                <Sparkline
                  data={points}
                  labels={history.map((sample) => clockTime(sample.at))}
                  label="This session"
                  change={points.length > 1 ? (change === 0 ? "No change" : `${change > 0 ? "+" : "−"}${Math.abs(change)}`) : "Just started"}
                  height={40}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.charts}>
        <Panel label="Passengers by risk">
          <PanelHeader title="Passengers by risk" hint="Everyone on a watched connection, right now." />
          <DonutChart data={riskSlices} label="Passengers by risk" unit="passengers" totalLabel="Passengers" size={168} thickness={22} groupBelow={0} emptyLabel="No passengers yet" />
        </Panel>
        <Panel label="Time needed against time left">
          <PanelHeader title="Time needed against time left" hint="One line per connection, tightest first. A line that falls means the transfer needs more minutes than it has." />
          {slopes.length ? (
            <SlopeChart data={slopes} label="Minutes needed against minutes left, by connection" startLabel="Needs" endLabel="Has" formatValue={(value) => `${value} min`} highlightKey={slopes[0]?.key ?? null} ranks={false} />
          ) : (
            <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="Nothing scored yet" description="Lines appear once a connection has been scored." label="No scored connections" />
          )}
        </Panel>
        <Panel label="Actions by state">
          <PanelHeader title="Actions by state" hint="Suggested actions on the board." />
          <DonutChart data={actionSlices} label="Actions by state" unit="actions" totalLabel="Actions" size={168} thickness={22} groupBelow={0} emptyLabel="No actions yet" />
        </Panel>
      </div>

      <Panel label="Tightest connections">
        <PanelHeader title="Tightest connections" hint="The five with the least time to spare." action={<Link href="/ops/connections" className={styles.panelLink}>All connections</Link>} />
        {tightest.length ? (
          <ul className={styles.summaryList}>
            {tightest.map((row) => (
              <li key={row.id} className={styles.summaryRow}>
                <span className={styles.summaryMain}>
                  <span className={styles.strong}>{row.label}</span>
                  <span className={styles.muted}>{row.passengers} {row.passengers === 1 ? "passenger" : "passengers"}</span>
                </span>
                <span className={`${styles.num} ${styles.muted}`}>Buffer {formatBuffer(row.buffer)}</span>
                <RiskBadge level={row.level} size="sm" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No connections yet" description="A connection appears here as soon as a passenger adds a trip through Dubai International." label="No connections" />
        )}
      </Panel>
    </>
  );
}
