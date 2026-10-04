"use client";

import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { ChipGroup, FilterBar, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { Mascot, Panel } from "@/components/segue/ui";
import { humanize } from "@/lib/format";
import styles from "../../staff.module.css";
import { ActionCard, ACTION_STATES, GATE, useOps } from "../ops-board";

type State = "all" | (typeof ACTION_STATES)[number]["key"];
type Gate = "all" | keyof typeof GATE;

export default function OpsActionsPage() {
  const { data, now, replaceAction, pending } = useOps();
  // Opens on what still needs a decision.
  const { query, setQuery, filters, set, active, clear } = useFilters<{ state: State; gate: Gate }>({ state: "pending", gate: "all" });
  const actions = data.actions;
  const shown = actions.filter((action) =>
    matches(query, action.title, action.detail, action.connection_label, action.seat, humanize(action.type), humanize(action.answer))
    && (filters.state === "all" || action.status === filters.state)
    && (filters.gate === "all" || action.gate === filters.gate));

  return (
    <>
      <FilterBar label="Filter suggested actions" query={query} onQuery={setQuery} placeholder="Search by connection, seat or action" shown={shown.length} total={actions.length} noun={{ one: "action", other: "actions" }} active={active} onClear={clear}>
        <ChipGroup<State>
          label="State"
          value={filters.state}
          onChange={(next) => set("state", next)}
          options={[{ value: "all", label: "All", count: actions.length }, ...ACTION_STATES.map((state) => ({ value: state.key, label: state.label, count: actions.filter((action) => action.status === state.key).length }))]}
        />
        <ChipGroup<Gate>
          label="Who decides"
          value={filters.gate}
          onChange={(next) => set("gate", next)}
          options={[{ value: "all", label: "All" }, ...(Object.keys(GATE) as (keyof typeof GATE)[]).map((gate) => ({ value: gate, label: GATE[gate].label }))]}
        />
      </FilterBar>

      <p className={styles.muted}>{pending === 0 ? "Nothing is waiting for you." : `${pending} waiting for a decision.`}</p>

      {actions.length === 0 ? (
        <Panel><EmptyState icon={<Mascot pose="calm" size={40} />} title="No actions right now" description="A card appears here when a connection at risk needs your decision, for example a short hold." label="No suggested actions" /></Panel>
      ) : shown.length === 0 ? (
        <Panel><NoMatches onClear={clear} /></Panel>
      ) : (
        <section className={styles.actionGrid} aria-label="Suggested actions">
          {shown.map((action) => <ActionCard key={action.decision_id} action={action} now={now} onDecided={replaceAction} />)}
        </section>
      )}
    </>
  );
}
