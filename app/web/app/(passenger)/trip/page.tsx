"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Accessibility, ArrowRight, Bell } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Gauge } from "@/components/arc/gauge/gauge";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Stepper } from "@/components/arc/stepper/stepper";
import { Timeline, type TimelineEvent } from "@/components/arc/timeline/timeline";
import { UsageMeter } from "@/components/arc/usage-meter/usage-meter";
import { DeviceLinkButton } from "@/components/segue/device-link";
import { HeaderLink, PassengerShell } from "@/components/segue/passenger-shell";
import { useToast } from "@/components/segue/toasts";
import { ErrorState, Fact, Mascot, Panel, PanelHeader, RiskBadge, RiskIcon, StaleNote, type MascotPose } from "@/components/segue/ui";
import { api, isStatus, streams, useEventStream, useResource, type ConnectionView, type FeedItem, type Flight, type RiskLevel } from "@/lib/api";
import { asRiskLevel, flightLabel, flightStatusLabel, formatAge, formatBuffer, formatTime, humanize, RISK_LABEL } from "@/lib/format";
import { localTimeZone, useNow } from "@/lib/hooks";
import styles from "../passenger.module.css";

const HEADLINE: Record<RiskLevel, { text: string; pose: MascotPose }> = {
  safe: { text: "You have time to make it.", pose: "calm" },
  tight: { text: "It's tight. Keep moving.", pose: "look_right" },
  at_risk: { text: "Hurry. Go straight to your gate.", pose: "alert" },
  lost: { text: "This connection can't be made.", pose: "dizzy" },
};
const GAUGE_TONE = { safe: "success", tight: "warning", at_risk: "warning", lost: "danger" } as const;

function isFeedItem(value: unknown): value is FeedItem {
  return !!value && typeof value === "object" && typeof (value as FeedItem).id === "string" && typeof (value as FeedItem).title === "string";
}

function FlightBlock({ kind, flight }: { kind: "inbound" | "outbound"; flight: Flight }) {
  const inbound = kind === "inbound";
  const time = inbound ? flight.est_arr ?? flight.sched_arr : flight.est_dep ?? flight.sched_dep;
  const gate = inbound ? flight.arr_gate : flight.dep_gate;
  const terminal = inbound ? flight.arr_terminal : flight.dep_terminal;
  return (
    <article className={styles.flight} aria-label={`${inbound ? "Inbound" : "Outbound"} flight ${flightLabel(flight.flight_iata)}`}>
      <div className={styles.flightTop}>
        <div>
          <p className={styles.flightKind}>{inbound ? "Inbound" : "Outbound"}</p>
          <p className={styles.flightNo}>{flightLabel(flight.flight_iata)}</p>
        </div>
        <p className={styles.route}>
          <span>{flight.origin}</span>
          <ArrowRight width={16} height={16} aria-label="to" />
          <span>{flight.dest}</span>
        </p>
      </div>
      <dl className={styles.flightFacts}>
        <Fact label={inbound ? "Arrives (est.)" : "Departs (est.)"}>{formatTime(time)}</Fact>
        <Fact label="Gate">{gate ?? "Not yet"}</Fact>
        <Fact label="Terminal">{terminal ?? "Not yet"}</Fact>
      </dl>
      <p className={styles.updated}>{flightStatusLabel(flight)} · updated {formatAge(flight.age_sec)}</p>
    </article>
  );
}

function StatusCard({ view }: { view: ConnectionView }) {
  const risk = view.risk;
  const level = risk ? asRiskLevel(risk.level) : null;
  const buffer = view.my_buffer_min ?? risk?.buffer_min ?? null;
  const steps = useMemo(() => view.steps.map((step) => ({ id: step.id, label: step.label, description: `${Math.round(step.minutes)} min` })), [view.steps]);
  // The contract gives the steps but not the passenger's position, so progress follows the inbound flight: once it has landed, deplaning is under way.
  const currentStep = view.inbound.status === "landed" ? Math.min(1, steps.length) : 0;
  const left = risk ? Math.round(risk.left_min) : 0;
  const needed = risk ? Math.round(risk.needed_min) : 0;

  return (
    <>
      <section className={styles.statusHero} data-risk={level ?? "unknown"} aria-label="Connection status">
        {risk && level ? (
          <>
            <div className={styles.heroTop}>
              <Mascot pose={HEADLINE[level].pose} size={76} />
              <div className={styles.heroCopy}>
                <RiskBadge level={risk.level} />
                <h2 className={styles.headline}>{HEADLINE[level].text}</h2>
                <p className={styles.needs}>Connecting at {view.airport}{buffer !== null ? <> · your buffer is <strong>{formatBuffer(buffer)}</strong></> : null}</p>
              </div>
            </div>
            <div className={styles.gaugeRow}>
              <Gauge
                value={left}
                min={0}
                max={Math.max(60, Math.ceil(Math.max(risk.left_min, risk.needed_min * 1.5) / 30) * 30)}
                unit="min"
                label="Minutes to connect"
                tone={GAUGE_TONE[level]}
                thresholds={[{ from: Number.NEGATIVE_INFINITY, tone: GAUGE_TONE[level], label: RISK_LABEL[level] }]}
              />
              {left > 0 ? (
                <div className={styles.meter}>
                  <UsageMeter
                    label="Time you need, out of the time you have"
                    segments={[{ id: "needed", label: "Needed", value: needed }]}
                    limit={left}
                    unit="min"
                    decimals={0}
                    freeLabel="Spare"
                    overLabel="Short by"
                    warnAt={1}
                  />
                </div>
              ) : (
                <p className={styles.needs}>Needs {needed} min. There is no time left for this connection.</p>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Mascot pose="look_right" size={40} />}
            title="Scoring your connection…"
            description={`This takes a moment. The status for your connection at ${view.airport} appears here as soon as it's ready.`}
            label="Connection not scored yet"
          />
        )}
      </section>

      <Panel label="Your flights">
        <PanelHeader title="Your flights" hint={view.seat ? `Seat ${view.seat} on the first flight` : undefined} />
        <div className={styles.flights}>
          <FlightBlock kind="inbound" flight={view.inbound} />
          <FlightBlock kind="outbound" flight={view.outbound} />
        </div>
        {view.assistance && view.assistance.type !== "none" ? (
          <p className={styles.assist}>
            <Accessibility width={20} height={20} aria-hidden="true" />
            <span>Assistance requested: <strong>{humanize(view.assistance.type)}</strong>. Shared only with ops, crew and ground staff.</span>
          </p>
        ) : null}
      </Panel>

      {steps.length ? (
        <Panel label="Your steps">
          <PanelHeader title="Your steps" hint={risk ? `About ${needed} min in total` : undefined} />
          <Stepper steps={steps} current={currentStep} orientation="vertical" label="Steps to your next gate" />
        </Panel>
      ) : null}
    </>
  );
}

export default function TripPage() {
  const router = useRouter();
  const notify = useToast();
  const now = useNow();
  const connection = useResource(api.myConnection, { pollMs: 60_000 });
  const feed = useResource(api.myFeed);

  const noSession = isStatus(connection.error, 401);
  const noTrip = isStatus(connection.error, 404);
  useEffect(() => {
    if (noSession) router.replace("/");
    else if (noTrip) router.replace("/scan");
  }, [noSession, noTrip, router]);

  const reloadConnection = connection.reload;
  // The first score can land before the live stream is open, so poll until it is there.
  const unscored = Boolean(connection.data) && !connection.data?.risk;
  useEffect(() => {
    if (!unscored) return;
    const timer = setInterval(() => { void reloadConnection(); }, 2000);
    return () => clearInterval(timer);
  }, [unscored, reloadConnection]);
  const setFeed = feed.setData;
  const onConnection = useCallback(() => { void reloadConnection(); }, [reloadConnection]);
  const onFeed = useCallback((data: unknown) => {
    if (!isFeedItem(data)) return;
    setFeed((current) => [data, ...(current ?? []).filter((item) => item.id !== data.id)]);
    notify(data.title, data.body);
  }, [notify, setFeed]);
  const stream = useEventStream(noSession || noTrip ? null : streams.me, { connection: onConnection, feed: onFeed });

  const events = useMemo<TimelineEvent[]>(() => (feed.data ?? []).map((item) => {
    const level = asRiskLevel(item.level);
    return {
      id: item.id,
      at: item.created_at,
      title: item.title,
      meta: item.body,
      tone: level === "safe" ? "success" : level === "lost" ? "danger" : "neutral",
      icon: level ? <span data-risk={level} style={{ display: "grid", color: "var(--risk-ink)" }}><RiskIcon level={level} /></span> : <Bell aria-hidden="true" />,
    };
  }), [feed.data]);

  const view = connection.data;
  const redirecting = noSession || noTrip;

  return (
    <PassengerShell title="Your connection" action={<HeaderLink href="/privacy">Your data</HeaderLink>}>
      {view?.degraded ? (
        <Alert tone="info" title="Live decisions are paused.">Status is from fixed rules.</Alert>
      ) : null}

      {view ? <StaleNote error={connection.error} onRetry={() => void connection.reload()} /> : null}

      {view ? <StatusCard view={view} /> : connection.loading || redirecting ? (
        <Panel label="Connection status"><Skeleton label="Loading your connection" lines={6} avatar /></Panel>
      ) : (
        <ErrorState error={connection.error} onRetry={() => void connection.reload()} title="Your connection didn't load" />
      )}

      {view ? <div className={styles.quietRow}><DeviceLinkButton variant="ghost" /></div> : null}

      <Panel label="Messages">
        <div className={styles.feedHead}>
          <Mascot pose="mail" size={40} />
          <div>
            <h2>Messages</h2>
            <p className={styles.live} role="status">{stream === "open" ? "Live updates are on" : "Reconnecting to live updates…"}</p>
          </div>
        </div>
        {feed.loading ? <Skeleton label="Loading messages" lines={3} /> : null}
        {!feed.loading && !feed.data ? <ErrorState compact error={feed.error} onRetry={() => void feed.reload()} title="Messages didn't load" /> : null}
        {feed.data && feed.data.length === 0 ? (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No messages yet" description="Updates about your connection will show up here." label="No messages" />
        ) : null}
        {feed.data && feed.data.length > 0 ? <Timeline events={events} now={now} label="Messages about your connection" timeZone={localTimeZone()} headingLevel={3} /> : null}
      </Panel>
    </PassengerShell>
  );
}
