"use client";

import Link from "next/link";
import { Accessibility, ArrowRight, Check, ClipboardList, Timer } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Mascot, Panel, PanelHeader, Stat, StatGrid } from "@/components/segue/ui";
import { formatBuffer, humanize } from "@/lib/format";
import styles from "../staff.module.css";
import { useGround } from "./ground-queue";

/** Ground dashboard: the figures, then the next jobs to run. */
export default function GroundDashboardPage() {
  const { ordered, open } = useGround();
  const openJobs = ordered.filter((job) => job.status !== "done");
  const done = ordered.length - openJobs.length;
  const tight = openJobs.filter((job) => job.buffer_min < 10).length;
  const assisted = openJobs.filter((job) => job.assistance && job.assistance !== "none").length;

  return (
    <>
      <StatGrid label="Dispatch summary">
        <Stat label="Open jobs" value={open} hint="Waiting for a buggy, bus or escort" icon={<ClipboardList width={16} height={16} aria-hidden="true" />} href="/ground/open" />
        <Stat label="Under 10 min" value={tight} hint="Open jobs with little time left" icon={<Timer width={16} height={16} aria-hidden="true" />} risk="at_risk" />
        <Stat label="Need assistance" value={assisted} hint="Open jobs with special help" icon={<Accessibility width={16} height={16} aria-hidden="true" />} />
        <Stat label="Done" value={done} hint="Jobs marked done" icon={<Check width={16} height={16} aria-hidden="true" />} href="/ground/done" />
      </StatGrid>
      <Panel label="Next up">
        <PanelHeader title="Next up" hint={open === 0 ? "Everything is done." : "The most urgent open jobs."} action={<Link href="/ground/open" className={styles.panelLink}>See all open jobs</Link>} />
        {openJobs.length ? (
          <ul className={styles.summaryList}>
            {openJobs.slice(0, 5).map((job) => (
              <li key={job.id} className={styles.summaryRow}>
                <span className={styles.summaryMain}>
                  <span className={styles.strong}>{humanize(job.kind)}</span>
                  <span className={styles.muted}>Seat {job.seat ?? "not set"}</span>
                </span>
                <span className={styles.route}>{job.from_gate ?? "Gate not set"} <ArrowRight width={14} height={14} aria-label="to" /> {job.to_gate ?? "Gate not set"}</span>
                <Badge size="sm" tone="info">{formatBuffer(job.buffer_min)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="The queue is clear" description="A buggy, bus or escort job appears here as soon as a passenger at Dubai International needs one to make a connection." />
        )}
      </Panel>
    </>
  );
}
