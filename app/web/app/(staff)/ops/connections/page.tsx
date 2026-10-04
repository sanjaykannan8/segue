"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { ChipGroup, FilterBar, FilterToggle, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { Mascot, Panel } from "@/components/segue/ui";
import { RISK_LABEL, RISK_LEVELS } from "@/lib/format";
import { COLUMNS, useOps } from "../ops-board";

type Risk = "all" | (typeof RISK_LEVELS)[number] | "unscored";

export default function OpsConnectionsPage() {
  const { rows } = useOps();
  const { query, setQuery, filters, set, active, clear } = useFilters<{ risk: Risk; shortOnly: boolean; airport: string }>({ risk: "all", shortOnly: false, airport: "all" });

  const airports = useMemo(() => [...new Set(rows.map((row) => row.airport))].sort(), [rows]);
  const shown = rows.filter((row) =>
    matches(query, row.label, row.airport)
    && (filters.risk === "all" || (filters.risk === "unscored" ? row.level === null : row.level === filters.risk))
    && (!filters.shortOnly || (row.buffer !== null && row.buffer < 0))
    && (filters.airport === "all" || row.airport === filters.airport));
  const count = (risk: Risk) => rows.filter((row) => (risk === "unscored" ? row.level === null : row.level === risk)).length;

  return (
    <>
      <FilterBar label="Filter connections" query={query} onQuery={setQuery} placeholder="Search by flight or airport" shown={shown.length} total={rows.length} noun={{ one: "connection", other: "connections" }} active={active} onClear={clear}>
        <ChipGroup<Risk>
          label="Risk"
          value={filters.risk}
          onChange={(next) => set("risk", next)}
          options={[{ value: "all", label: "All" }, ...RISK_LEVELS.map((level) => ({ value: level, label: RISK_LABEL[level], count: count(level) })), { value: "unscored", label: "Not scored", count: count("unscored") }]}
        />
        {airports.length > 1 ? (
          <ChipGroup label="Airport" value={filters.airport} onChange={(next) => set("airport", next)} options={[{ value: "all", label: "All" }, ...airports.map((airport) => ({ value: airport, label: airport }))]} />
        ) : null}
        <FilterToggle label="Short of time only" checked={filters.shortOnly} onChange={(next) => set("shortOnly", next)} />
      </FilterBar>

      <Panel label="Connection board">
        {rows.length === 0 ? (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No connections yet" description="A connection appears here as soon as a passenger adds a trip through Dubai International." label="No connections" />
        ) : shown.length === 0 ? (
          <NoMatches onClear={clear} />
        ) : (
          <SortableDataTable rows={shown} columns={COLUMNS} rowKey="id" caption="Connections being watched" defaultSort={{ key: "status", direction: "desc" }} itemName={{ one: "connection", other: "connections" }} />
        )}
      </Panel>
    </>
  );
}
