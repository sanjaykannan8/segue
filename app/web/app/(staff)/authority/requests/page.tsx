"use client";

import { useMemo } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { ChipGroup, FilterBar, FilterToggle, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { Mascot, Panel } from "@/components/segue/ui";
import { RISK_LABEL, RISK_LEVELS } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { COLUMNS, useAuthority } from "../authority-list";

type Risk = "all" | (typeof RISK_LEVELS)[number];

export default function AuthorityRequestsPage() {
  const { rows } = useAuthority();
  const now = useNow();
  const { query, setQuery, filters, set, active, clear } = useFilters<{ risk: Risk; airport: string; soon: boolean }>({ risk: "all", airport: "all", soon: false });
  const airports = useMemo(() => [...new Set(rows.map((row) => row.airport))].sort(), [rows]);
  const shown = rows.filter((row) =>
    matches(query, row.name, row.flights, row.airport)
    && (filters.risk === "all" || row.level === filters.risk)
    && (filters.airport === "all" || row.airport === filters.airport)
    && (!filters.soon || (row.deadline !== null && row.deadline - now <= 60 * 60_000)));

  return (
    <>
      <Alert tone="info" title="The airport decides.">Segue only asks for fast-track; you approve or refuse it in your own system. Every passenger on this list consented to sharing these details. Names are masked. Confirm with the flight.</Alert>
      <FilterBar label="Filter fast-track requests" query={query} onQuery={setQuery} placeholder="Search by passenger or flight" shown={shown.length} total={rows.length} noun={{ one: "request", other: "requests" }} active={active} onClear={clear}>
        <ChipGroup<Risk> label="Level" value={filters.risk} onChange={(next) => set("risk", next)} options={[{ value: "all", label: "All" }, ...RISK_LEVELS.map((level) => ({ value: level, label: RISK_LABEL[level], count: rows.filter((row) => row.level === level).length }))]} />
        {airports.length > 1 ? (
          <ChipGroup label="Airport" value={filters.airport} onChange={(next) => set("airport", next)} options={[{ value: "all", label: "All" }, ...airports.map((airport) => ({ value: airport, label: airport }))]} />
        ) : null}
        <FilterToggle label="Deadline within an hour" checked={filters.soon} onChange={(next) => set("soon", next)} />
      </FilterBar>
      <Panel label="Fast-track requests">
        {rows.length === 0 ? (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No requests right now" description="A request appears here when a passenger at Dubai International is short on time for a connection and has consented to sharing their name and flights with the airport." />
        ) : shown.length === 0 ? (
          <NoMatches onClear={clear} />
        ) : (
          <SortableDataTable rows={shown} columns={COLUMNS} rowKey="id" caption="Fast-track requests" defaultSort={{ key: "deadline", direction: "asc" }} itemName={{ one: "request", other: "requests" }} />
        )}
      </Panel>
    </>
  );
}
