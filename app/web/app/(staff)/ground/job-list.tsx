"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { ChipGroup, FilterBar, FilterToggle, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { Mascot, Panel } from "@/components/segue/ui";
import { flightLabel, humanize } from "@/lib/format";
import { JobTable, useGround } from "./ground-queue";

/** Open or finished jobs, with search and filters. Shared by the two Ground list pages. */
export function JobList({ status }: { status: "open" | "done" }) {
  const { ordered, now, replace } = useGround();
  const jobs = useMemo(() => ordered.filter((job) => (status === "done" ? job.status === "done" : job.status !== "done")), [ordered, status]);
  const { query, setQuery, filters, set, active, clear } = useFilters<{ kind: string; gate: string; assistance: boolean; tight: boolean }>({ kind: "all", gate: "all", assistance: false, tight: false });

  const kinds = useMemo(() => [...new Set(jobs.map((job) => job.kind))].sort(), [jobs]);
  const gates = useMemo(() => [...new Set(jobs.flatMap((job) => [job.from_gate, job.to_gate]).filter((gate): gate is string => !!gate))].sort(), [jobs]);
  const shown = jobs.filter((job) =>
    matches(query, job.seat, job.name, job.from_gate, job.to_gate, flightLabel(job.inbound), flightLabel(job.outbound), job.inbound, job.outbound, humanize(job.kind))
    && (filters.kind === "all" || job.kind === filters.kind)
    && (filters.gate === "all" || job.from_gate === filters.gate || job.to_gate === filters.gate)
    && (!filters.assistance || (job.assistance && job.assistance !== "none"))
    && (!filters.tight || job.buffer_min < 10));

  return (
    <>
      <FilterBar label={status === "open" ? "Filter open jobs" : "Filter finished jobs"} query={query} onQuery={setQuery} placeholder="Search by seat, gate or flight" shown={shown.length} total={jobs.length} noun={{ one: "job", other: "jobs" }} active={active} onClear={clear}>
        {kinds.length > 1 ? (
          <ChipGroup label="Job" value={filters.kind} onChange={(next) => set("kind", next)} options={[{ value: "all", label: "All" }, ...kinds.map((kind) => ({ value: kind, label: humanize(kind), count: jobs.filter((job) => job.kind === kind).length }))]} />
        ) : null}
        {gates.length > 1 ? (
          <ChipGroup label="Gate" value={filters.gate} onChange={(next) => set("gate", next)} options={[{ value: "all", label: "All" }, ...gates.map((gate) => ({ value: gate, label: gate }))]} />
        ) : null}
        {status === "open" ? <FilterToggle label="Under 10 min" checked={filters.tight} onChange={(next) => set("tight", next)} /> : null}
        <FilterToggle label="Needs assistance" checked={filters.assistance} onChange={(next) => set("assistance", next)} />
      </FilterBar>

      <Panel label={status === "open" ? "Open jobs" : "Finished jobs"}>
        {jobs.length === 0 ? (
          status === "open"
            ? <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="The queue is clear" description="A buggy, bus or escort job appears here as soon as a passenger at Dubai International needs one to make a connection." />
            : <EmptyState icon={<Mascot pose="calm" size={40} />} title="Nothing finished yet" description="Jobs you mark done move here." />
        ) : shown.length === 0 ? (
          <NoMatches onClear={clear} />
        ) : (
          <JobTable jobs={shown} now={now} caption={status === "open" ? "Open dispatch jobs, most urgent first" : "Finished dispatch jobs"} onDone={replace} />
        )}
      </Panel>
    </>
  );
}
