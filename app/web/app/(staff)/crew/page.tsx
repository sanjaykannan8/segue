"use client";

import Link from "next/link";
import { Accessibility, ArrowRight, PlaneLanding, TriangleAlert, Users } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Mascot, Panel, PanelHeader, Stat, StatGrid } from "@/components/segue/ui";
import { flightLabel, formatTime } from "@/lib/format";
import styles from "../staff.module.css";
import { useCrew } from "./crew-list";

/** Crew dashboard: the figures, then each arriving flight and how many to call off. */
export default function CrewDashboardPage() {
  const { data, total } = useCrew();
  const items = data.flatMap((entry) => entry.items);
  const assisted = items.filter((item) => item.assistance && item.assistance !== "none").length;
  const urgent = items.filter((item) => item.level === "at_risk" || item.level === "lost").length;

  return (
    <>
      <StatGrid label="Call-off summary">
        <Stat label="Flights" value={data.length} hint="Inbound flights being watched" icon={<PlaneLanding width={16} height={16} aria-hidden="true" />} />
        <Stat label="To call off" value={total} hint="Passengers to let off first" icon={<Users width={16} height={16} aria-hidden="true" />} href="/crew/list" />
        <Stat label="May miss it" value={urgent} hint="At risk or can't make it" icon={<TriangleAlert width={16} height={16} aria-hidden="true" />} risk="at_risk" />
        <Stat label="Need assistance" value={assisted} hint="Wheelchair or other help" icon={<Accessibility width={16} height={16} aria-hidden="true" />} />
      </StatGrid>
      <Panel label="Flights">
        <PanelHeader title="Flights" hint="Arriving flights and how many passengers to call off on each." action={<Link href="/crew/list" className={styles.panelLink}>Open the call-off list</Link>} />
        {data.length ? (
          <ul className={styles.summaryList}>
            {data.map((entry) => (
              <li key={entry.flight.id} className={styles.summaryRow}>
                <span className={styles.summaryMain}>
                  <span className={styles.strong}>{flightLabel(entry.flight.flight_iata)}</span>
                  <span className={styles.route}>{entry.flight.origin} <ArrowRight width={14} height={14} aria-label="to" /> {entry.flight.dest}</span>
                </span>
                <span className={styles.muted}>Arrives {formatTime(entry.flight.est_arr ?? entry.flight.sched_arr)} · Gate {entry.flight.arr_gate ?? "not yet"}</span>
                <Badge size="sm" tone={entry.items.length ? "info" : "neutral"}>{entry.items.length} to call off</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No one to call off yet" description="When an inbound flight has passengers short on time for their connection at Dubai International, they appear here in the order to let them off." />
        )}
      </Panel>
    </>
  );
}
