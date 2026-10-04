"use client";

import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { ChipGroup, FilterBar, FilterToggle, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { Mascot, Panel } from "@/components/segue/ui";
import { flightLabel, RISK_LABEL, RISK_LEVELS } from "@/lib/format";
import { FlightList, useCrew } from "../crew-list";

type Risk = "all" | (typeof RISK_LEVELS)[number];

export default function CrewListPage() {
  const { data, total } = useCrew();
  const { query, setQuery, filters, set, active, clear } = useFilters<{ flight: string; risk: Risk; assistance: boolean; separate: boolean }>({ flight: "all", risk: "all", assistance: false, separate: false });

  // Each flight keeps only the passengers that match; flights left empty are hidden while filtering.
  const entries = data
    .filter((entry) => filters.flight === "all" || entry.flight.id === filters.flight)
    .map((entry) => ({
      ...entry,
      items: entry.items.filter((item) =>
        matches(query, item.seat, item.name, flightLabel(item.onward), item.onward, item.onward_dest, flightLabel(entry.flight.flight_iata))
        && (filters.risk === "all" || item.level === filters.risk)
        && (!filters.assistance || (item.assistance && item.assistance !== "none"))
        && (!filters.separate || item.booking === "separate_tickets")),
    }))
    .filter((entry) => !active || entry.items.length > 0);
  const shown = entries.reduce((sum, entry) => sum + entry.items.length, 0);
  const firstWithItems = entries.findIndex((entry) => entry.items.length > 0);
  const all = data.flatMap((entry) => entry.items);

  return (
    <>
      <FilterBar label="Filter the call-off list" query={query} onQuery={setQuery} placeholder="Search by seat, name or onward flight" shown={shown} total={total} noun={{ one: "passenger", other: "passengers" }} active={active} onClear={clear}>
        {data.length > 1 ? (
          <ChipGroup label="Flight" value={filters.flight} onChange={(next) => set("flight", next)} options={[{ value: "all", label: "All" }, ...data.map((entry) => ({ value: entry.flight.id, label: flightLabel(entry.flight.flight_iata), count: entry.items.length }))]} />
        ) : null}
        <ChipGroup<Risk> label="Risk" value={filters.risk} onChange={(next) => set("risk", next)} options={[{ value: "all", label: "All" }, ...RISK_LEVELS.map((level) => ({ value: level, label: RISK_LABEL[level], count: all.filter((item) => item.level === level).length }))]} />
        <FilterToggle label="Needs assistance" checked={filters.assistance} onChange={(next) => set("assistance", next)} />
        <FilterToggle label="Separate tickets" checked={filters.separate} onChange={(next) => set("separate", next)} />
      </FilterBar>

      {data.length === 0 ? (
        <Panel><EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No one to call off yet" description="When an inbound flight has passengers short on time for their connection at Dubai International, they appear here in the order to let them off." /></Panel>
      ) : entries.length === 0 ? (
        <Panel><NoMatches onClear={clear} /></Panel>
      ) : (
        entries.map((entry, index) => <FlightList key={entry.flight.id} entry={entry} showNameHelp={index === firstWithItems} />)
      )}
    </>
  );
}
