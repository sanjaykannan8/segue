"use client";

import Link from "next/link";
import { CircleX, Clock, ListChecks, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Mascot, Panel, PanelHeader, RiskBadge, Stat, StatGrid } from "@/components/segue/ui";
import styles from "../staff.module.css";
import { useAuthority } from "./authority-list";

/** Authority dashboard: the figures, then the requests with the earliest deadlines. */
export default function AuthorityDashboardPage() {
  const { data, rows } = useAuthority();
  const atRisk = rows.filter((row) => row.level === "at_risk").length;
  const lost = rows.filter((row) => row.level === "lost").length;
  const soonest = [...rows].filter((row) => row.deadline !== null).sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0)).slice(0, 5);

  return (
    <>
      <StatGrid label="Fast-track summary">
        <Stat label="Requests" value={data.length} hint="Waiting for your decision" icon={<ListChecks width={16} height={16} aria-hidden="true" />} href="/authority/requests" />
        <Stat label="At risk" value={atRisk} hint="May miss the connection" icon={<TriangleAlert width={16} height={16} aria-hidden="true" />} risk="at_risk" />
        <Stat label="Can't make it" value={lost} hint="Need another plan" icon={<CircleX width={16} height={16} aria-hidden="true" />} risk="lost" />
        <Stat label="Next deadline" value={soonest[0] ? <span className={styles.statSmall}>{soonest[0].deadlineText}</span> : "None"} hint="Earliest request deadline" icon={<Clock width={16} height={16} aria-hidden="true" />} />
      </StatGrid>
      <Panel label="Earliest deadlines">
        <PanelHeader title="Earliest deadlines" hint="The requests to look at first." action={<Link href="/authority/requests" className={styles.panelLink}>See all requests</Link>} />
        {soonest.length ? (
          <ul className={styles.summaryList}>
            {soonest.map((row) => (
              <li key={row.id} className={styles.summaryRow}>
                <span className={styles.summaryMain}>
                  <span className={styles.strong}>{row.name}</span>
                  <span className={styles.muted}>{row.flights}</span>
                </span>
                <span className={`${styles.num} ${styles.muted}`}>{row.deadlineText}</span>
                <RiskBadge level={row.level} size="sm" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No requests right now" description="A request appears here when a passenger at Dubai International is short on time for a connection and has consented to sharing their name and flights with the airport." />
        )}
      </Panel>
    </>
  );
}
