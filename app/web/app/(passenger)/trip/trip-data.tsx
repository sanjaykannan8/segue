"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Accessibility, ArrowRight, Bell, ExternalLink } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Gauge } from "@/components/arc/gauge/gauge";
import { Stepper } from "@/components/arc/stepper/stepper";
import { EmailVerify } from "@/components/segue/email-verify";
import { useToast } from "@/components/segue/toasts";
import { Fact, LiveRegion, Ltr, Mascot, Panel, PanelHeader, RiskBadge, RiskIcon, type MascotPose } from "@/components/segue/ui";
import { api, isStatus, streams, useEventStream, useResource, type AssistanceType, type ConnectionView, type FeedItem, type Flight, type RiskLevel } from "@/lib/api";
import { asRiskLevel, ASSISTANCE_TYPES, flightLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useFormat, useT } from "@/lib/i18n";
import styles from "../passenger.module.css";

const POSE: Record<RiskLevel, MascotPose> = { safe: "calm", tight: "look_right", at_risk: "alert", lost: "dizzy" };
const GAUGE_TONE = { safe: "success", tight: "warning", at_risk: "warning", lost: "danger" } as const;
const GUIDE_URL = "https://dubaiairports.ae/information/transfers";

function isFeedItem(value: unknown): value is FeedItem {
  return !!value && typeof value === "object" && typeof (value as FeedItem).id === "string" && typeof (value as FeedItem).title === "string";
}

export function FlightBlock({ kind, flight }: { kind: "inbound" | "outbound"; flight: Flight }) {
  const t = useT();
  const format = useFormat();
  const inbound = kind === "inbound";
  const time = inbound ? flight.est_arr ?? flight.sched_arr : flight.est_dep ?? flight.sched_dep;
  const gate = inbound ? flight.arr_gate : flight.dep_gate;
  const terminal = inbound ? flight.arr_terminal : flight.dep_terminal;
  return (
    <div className={styles.flight}>
      <div className={styles.flightTop}>
        <div>
          <p className={styles.flightKind}>{t(inbound ? "trip.inbound" : "trip.outbound")}</p>
          <h3 className={styles.flightNo}><Ltr>{flightLabel(flight.flight_iata)}</Ltr></h3>
        </div>
        <p className={styles.route}>
          <Ltr>{flight.origin} <ArrowRight width={16} height={16} aria-hidden="true" /> {flight.dest}</Ltr>
        </p>
      </div>
      <dl className={styles.flightFacts}>
        <Fact label={t(inbound ? "trip.arrivesEst" : "trip.departsEst")}><Ltr>{format.time(time)}</Ltr></Fact>
        <Fact label={t("trip.gate")}>{gate ? <Ltr>{gate}</Ltr> : t("common.notYet")}</Fact>
        <Fact label={t("trip.terminal")}>{terminal ? <Ltr>{terminal}</Ltr> : t("common.notYet")}</Fact>
      </dl>
      <p className={styles.updated}>{format.flightStatus(flight)} · {t("trip.updated", { age: format.age(flight.age_sec) })}</p>
    </div>
  );
}

/** The time you need against the time you have, as one plain bar with its numbers written out. */
function NeedHave({ need, have }: { need: number; have: number }) {
  const t = useT();
  const spare = have - need;
  const share = Math.min(100, Math.max(0, Math.round((need / Math.max(have, need, 1)) * 100)));
  return (
    <div className={styles.needHave}>
      <p className={styles.needText}>{t("trip.needHave", { need, have })}</p>
      <div className={styles.needTrack} aria-hidden="true"><span className={styles.needFill} style={{ inlineSize: `${share}%` }} /></div>
      <p className={styles.needSpare}>{spare >= 0 ? t("trip.spare", { n: spare }) : t("trip.short", { n: -spare })}</p>
    </div>
  );
}

export function StatusCard({ view }: { view: ConnectionView }) {
  const t = useT();
  const format = useFormat();
  const risk = view.risk;
  const level = risk ? asRiskLevel(risk.level) : null;
  const buffer = view.my_buffer_min ?? risk?.buffer_min ?? null;
  const steps = useMemo(() => view.steps.map((step) => ({ id: step.id, label: step.label, description: format.minutes(step.minutes) })), [view.steps, format]);
  // The contract gives the steps but not the passenger's position, so progress follows the inbound flight: once it has landed, deplaning is under way.
  const currentStep = view.inbound.status === "landed" ? Math.min(1, steps.length) : 0;
  const left = risk ? Math.round(risk.left_min) : 0;
  const needed = risk ? Math.round(risk.needed_min) : 0;
  const assistance = view.assistance?.type;

  return (
    <>
      <section className={styles.statusHero} data-risk={level ?? "unknown"} aria-labelledby="status-heading">
        {risk && level ? (
          <>
            <div className={styles.heroTop}>
              <Mascot pose={POSE[level]} size={76} />
              <div className={styles.heroCopy}>
                <RiskBadge level={risk.level} />
                <h2 id="status-heading" className={styles.headline}>{t(`trip.head.${level}`)}</h2>
                <p className={styles.needs}>
                  {t("trip.connectingAt", { airport: view.airport })}
                  {buffer !== null ? <> · {t("trip.buffer", { buffer: format.buffer(buffer) })}</> : null}
                </p>
              </div>
            </div>
            <div className={styles.gaugeRow}>
              {/* The ring counts and sweeps left to right in every language. */}
              <div dir="ltr">
                <Gauge
                  value={left}
                  min={0}
                  max={Math.max(60, Math.ceil(Math.max(risk.left_min, risk.needed_min * 1.5) / 30) * 30)}
                  unit={t("common.min", { n: "" }).trim()}
                  label={t("trip.gaugeLabel")}
                  tone={GAUGE_TONE[level]}
                  thresholds={[{ from: Number.NEGATIVE_INFINITY, tone: GAUGE_TONE[level], label: t(`risk.${level}`) }]}
                />
              </div>
              {left > 0 ? <NeedHave need={needed} have={left} /> : <p className={styles.needs}>{t("trip.noTime", { need: needed })}</p>}
            </div>
            {/* A change of status is announced once, politely, without moving focus. */}
            <LiveRegion>{t("trip.announce", { level: t(`risk.${level}`), headline: t(`trip.head.${level}`) })}</LiveRegion>
          </>
        ) : (
          <>
            <h2 id="status-heading" className="sr-only">{t("trip.statusLabel")}</h2>
            <EmptyState icon={<Mascot pose="look_right" size={40} />} title={t("trip.scoringTitle")} description={t("trip.scoringBody")} />
          </>
        )}
      </section>

      {view.booking === "separate_tickets" ? (
        <Alert tone="info" title={t("trip.separateTitle")}>{t("trip.separateBody", { flight: `⁦${flightLabel(view.outbound.flight_iata)}⁩` })}</Alert>
      ) : null}

      <Panel>
        <PanelHeader title={t("trip.flights")} hint={view.seat ? t("trip.seat", { seat: view.seat }) : undefined} />
        <div className={styles.flights}>
          <FlightBlock kind="inbound" flight={view.inbound} />
          <FlightBlock kind="outbound" flight={view.outbound} />
        </div>
        {assistance && assistance !== "none" ? (
          <p className={styles.assist}>
            <Accessibility width={20} height={20} aria-hidden="true" />
            <span>{t("trip.assistance", { type: (ASSISTANCE_TYPES as readonly string[]).includes(assistance) ? t(`assist.${assistance as AssistanceType}`) : assistance })}</span>
          </p>
        ) : null}
      </Panel>

      {steps.length ? (
        <Panel>
          <PanelHeader title={t("trip.steps")} hint={risk ? t("trip.stepsTotal", { n: needed }) : undefined} />
          <Stepper steps={steps} current={currentStep} orientation="vertical" label={t("trip.stepsLabel")} completeLabel={t("stepper.done")} />
          <a className={styles.guide} href={GUIDE_URL} target="_blank" rel="noopener">
            <ExternalLink width={16} height={16} aria-hidden="true" />
            <span>{t("trip.guide")} <span className={styles.guideNote}>{t("trip.newTab")}</span></span>
          </a>
        </Panel>
      ) : null}
    </>
  );
}

export function Messages({ items, now }: { items: FeedItem[]; now: number }) {
  const format = useFormat();
  return (
    <ol className={styles.feed}>
      {items.map((item) => {
        const level = asRiskLevel(item.level);
        return (
          <li key={item.id} className={styles.feedItem} data-risk={level ?? undefined}>
            <span className={styles.feedIcon} aria-hidden="true">{level ? <RiskIcon level={level} size={16} /> : <Bell width={16} height={16} />}</span>
            <div className={styles.feedCopy}>
              {/* Messages arrive translated from the API and are shown as given. */}
              <p className={styles.feedTitle}>{item.title}</p>
              <p className={styles.feedBody}>{item.body}</p>
              <time className={styles.feedTime} dateTime={item.created_at}>{format.ageSince(item.created_at, now)} · <Ltr>{format.time(item.created_at)}</Ltr></time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type Trip = ReturnType<typeof useTripData>;
const TripContext = createContext<Trip | null>(null);

/** The connection, the message feed and the live stream, shared by the trip and messages pages. */
function useTripData() {
  const router = useRouter();
  const t = useT();
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
    // The toast is a polite live region, so a new message is read out without taking focus.
    notify(data.title, data.body);
  }, [notify, setFeed]);
  const stream = useEventStream(noSession || noTrip ? null : streams.me, { connection: onConnection, feed: onFeed });

  const view = connection.data;
  const redirecting = noSession || noTrip;

  return { t, now, connection, feed, stream, view, redirecting };
}

export function useTrip(): Trip {
  const trip = useContext(TripContext);
  if (!trip) throw new Error("useTrip is used inside TripProvider");
  return trip;
}

export function TripProvider({ children }: { children: ReactNode }) {
  return <TripContext.Provider value={useTripData()}>{children}</TripContext.Provider>;
}

/** Asks for the emailed code while the address is unconfirmed; nothing is shown otherwise. */
export function EmailCheck() {
  const me = useResource(api.me);
  return <EmailVerify me={me.data} onChange={() => void me.reload()} />;
}
