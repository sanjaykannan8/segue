"use client";

import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { ChipGroup, FilterBar, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { ErrorState, Mascot, Panel } from "@/components/segue/ui";
import styles from "../../passenger.module.css";
import { Messages, useTrip } from "../trip-data";

type Kind = "all" | "alerts" | "updates";
/** Messages about a connection in trouble; everything else is an update. */
const ALERT_LEVELS = ["tight", "at_risk", "lost"];

/** Every message about the passenger's connection, newest first, with search. */
export default function MessagesPage() {
  const { t, now, feed, stream } = useTrip();
  const { query, setQuery, filters, set, active, clear } = useFilters<{ kind: Kind }>({ kind: "all" });
  const items = feed.data ?? [];
  const alerts = items.filter((item) => ALERT_LEVELS.includes(item.level ?? "")).length;
  const shown = items.filter((item) =>
    matches(query, item.title, item.body)
    && (filters.kind === "all" || (filters.kind === "alerts") === ALERT_LEVELS.includes(item.level ?? "")));
  const title = t("trip.messages");

  return (
    <PassengerShell pageTitle={title} title={title}>
      <Panel>
        <div className={styles.feedHead}>
          <Mascot pose="mail" size={40} />
          <p className={styles.live} role="status">{t(stream === "open" ? "trip.liveOn" : "trip.liveOff")}</p>
        </div>
        {feed.loading ? <Skeleton label={t("trip.messagesLoading")} lines={3} /> : null}
        {!feed.loading && !feed.data ? <ErrorState compact error={feed.error} onRetry={() => void feed.reload()} title={t("trip.messagesError")} /> : null}
        {feed.data && feed.data.length === 0 ? (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title={t("trip.noMessages")} description={t("trip.noMessagesBody")} />
        ) : null}
        {feed.data && feed.data.length > 0 ? (
          <>
            <FilterBar
              label={t("filter.label")}
              query={query}
              onQuery={setQuery}
              placeholder={t("filter.search")}
              shown={shown.length}
              total={feed.data.length}
              noun={{ one: t("filter.message"), other: t("filter.messages") }}
              active={active}
              onClear={clear}
              text={{ clear: t("filter.clear"), clearSearch: t("filter.clearSearch"), of: (a, b, noun) => t("filter.of", { shown: a, total: b, noun }) }}
            >
              <ChipGroup<Kind> label={t("filter.show")} value={filters.kind} onChange={(next) => set("kind", next)} options={[{ value: "all", label: t("filter.all") }, { value: "alerts", label: t("filter.alerts"), count: alerts }, { value: "updates", label: t("filter.updates"), count: feed.data.length - alerts }]} />
            </FilterBar>
            {shown.length ? <Messages items={shown} now={now} /> : <NoMatches onClear={clear} text={{ title: t("filter.none"), clear: t("filter.clear") }} />}
          </>
        ) : null}
      </Panel>
    </PassengerShell>
  );
}
