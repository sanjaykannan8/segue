"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock, Landmark, Truck, Users, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { LogoTile, Mascot, Panel, PanelHeader, RiskBadge } from "@/components/segue/ui";
import type { DemoBoard, DemoPassenger } from "@/lib/api";
import { flightLabel, formatBuffer, formatTime, humanize } from "@/lib/format";
import styles from "./demo-board.module.css";

type Approve = (decisionId: string) => void;

/* ───────────── What just happened ───────────── */

export function StoryCard({ story }: { story: string[] }) {
  return (
    <Panel label="What just happened">
      <PanelHeader title="What just happened" />
      {story.length ? (
        <ol className={styles.story}>
          {/* A sentence that is new to the list fades in once as it mounts. */}
          {story.map((sentence, index) => <li key={`${index}:${sentence}`}><span>{sentence}</span></li>)}
        </ol>
      ) : (
        <p className={styles.storyEmpty}>Nothing running yet. Press 1 to seed eight made-up passengers.</p>
      )}
    </Panel>
  );
}

/* ───────────── The connection, and the ops suggestion ───────────── */

export function ConnectionStrip({ board, approving, onApprove }: { board: DemoBoard; approving: string | null; onApprove: Approve }) {
  const c = board.connection;
  if (!c) return null;
  const ops = board.ops;
  return (
    <div className={styles.strip}>
      <section className={styles.stripCard} aria-label="The connection">
        <p className={styles.stripRoute}>
          {flightLabel(c.inbound.flight_iata)} <ArrowRight width={18} height={18} aria-label="to" /> {flightLabel(c.outbound.flight_iata)}
        </p>
        <RiskBadge level={c.level} />
        <p className={styles.stripFacts}>Has {Math.round(c.left_min)} min · Needs {Math.round(c.needed_min)} min · Buffer {formatBuffer(c.buffer_min)}</p>
        <p className={styles.stripSource}>{c.source === "rules" ? "Fixed rules (model down)" : c.source === "model" ? "Decided by the model" : "Not scored yet"}</p>
      </section>
      {ops ? (
        <section className={styles.opsCard} aria-label="Suggestion for ops">
          <div className={styles.opsCopy}>
            <p className={styles.opsEyebrow}>Suggested to the ops controller</p>
            <p className={styles.opsTitle}>{ops.title}</p>
            <p className={styles.opsDetail}>{ops.detail}</p>
          </div>
          <div className={styles.opsSide}>
            <Badge tone={ops.status === "pending" ? "info" : "neutral"} icon={ops.status === "pending" ? <Clock width={12} height={12} aria-hidden="true" /> : <Check width={12} height={12} aria-hidden="true" />}>
              {ops.status === "pending" ? "Waiting for approval" : `${humanize(ops.status)}${ops.decided_by ? ` by ${ops.decided_by}` : ""}`}
            </Badge>
            {ops.status === "pending" ? <Button size="sm" loading={approving === ops.decision_id} disabled={approving !== null} onClick={() => onApprove(ops.decision_id)}>Approve</Button> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ───────────── The passengers ───────────── */

const AUDIENCE_ICON: Record<string, LucideIcon> = { crew: Users, ground: Truck, authority: Landmark };

function PassengerCard({ passenger, approving, onApprove }: { passenger: DemoPassenger; approving: string | null; onApprove: Approve }) {
  // One calm highlight when this passenger's level or message changes, so the audience sees what moved.
  const signature = `${passenger.level ?? ""}|${passenger.message?.at ?? ""}|${passenger.message?.title ?? ""}`;
  const previous = useRef(signature);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    setChanged(true);
    const timer = window.setTimeout(() => setChanged(false), 1500);
    return () => window.clearTimeout(timer);
  }, [signature]);

  const message = passenger.message;
  const earlier = passenger.earlier_messages[passenger.earlier_messages.length - 1] ?? null;
  const latestEarlier = passenger.earlier_messages.reduce<{ title: string; at: string } | null>((best, item) => (!best || item.at > best.at ? item : best), earlier);

  return (
    <article className={styles.pax} data-changed={changed || undefined} aria-label={`Seat ${passenger.seat}`}>
      <header className={styles.paxHead}>
        <h3 className={styles.paxSeat}>Seat {passenger.seat}</h3>
        <RiskBadge level={passenger.level} />
      </header>

      <div className={styles.facts}>
        <span className={styles.chip}>{passenger.booking === "separate_tickets" ? "Separate tickets" : "One booking"}</span>
        {passenger.assistance && passenger.assistance !== "none" ? <span className={styles.chip}>{humanize(passenger.assistance)}</span> : null}
      </div>

      <div>
        <p className={styles.paxBuffer}>Buffer {formatBuffer(passenger.buffer_min)}</p>
        {passenger.why.length ? (
          <ul className={styles.why}>{passenger.why.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        ) : (
          <p className={styles.whyNone}>Same as the connection.</p>
        )}
      </div>

      <div>
        <p className={styles.paxLabel}>On their phone</p>
        {message ? (
          <div className={styles.phone}>
            <div className={styles.phoneTop}>
              <LogoTile size={18} />
              <span>Segue</span>
              <time>{formatTime(message.at)}</time>
            </div>
            <p className={styles.phoneTitle}>{message.title}</p>
            <p className={styles.phoneBody}>{message.body}</p>
          </div>
        ) : (
          <p className={styles.phoneNone}>No message yet</p>
        )}
        {latestEarlier ? <p className={styles.earlier}>Earlier: {latestEarlier.title}</p> : null}
      </div>

      <div>
        <p className={styles.paxLabel}>Staff were told</p>
        {passenger.staff.length ? (
          <ul className={styles.staff}>
            {passenger.staff.map((line, index) => {
              const Icon = AUDIENCE_ICON[line.audience] ?? Users;
              return (
                <li key={`${line.audience}-${index}`} className={styles.staffLine} data-state={line.state}>
                  <Icon width={16} height={16} aria-hidden="true" />
                  <div className={styles.staffCopy}>
                    <p>{line.text}</p>
                    <div className={styles.facts}>
                      <Badge
                        size="sm"
                        tone={line.state === "waiting" ? "info" : "neutral"}
                        icon={line.state === "sent" ? <Check width={12} height={12} aria-hidden="true" /> : line.state === "dismissed" ? <X width={12} height={12} aria-hidden="true" /> : <Clock width={12} height={12} aria-hidden="true" />}
                      >
                        {line.note}
                      </Badge>
                      {line.decision_id ? (
                        <Button size="sm" variant="secondary" loading={approving === line.decision_id} disabled={approving !== null} onClick={() => onApprove(line.decision_id!)} aria-label={`Approve: ${line.text}`}>Approve</Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.whyNone}>No staff action needed.</p>
        )}
      </div>
    </article>
  );
}

const COUNT_WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function PassengerGrid({ passengers, approving, onApprove }: { passengers: DemoPassenger[]; approving: string | null; onApprove: Approve }) {
  if (!passengers.length) {
    return <Panel><EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No passengers yet" description="Press 1 to seed eight made-up passengers." label="No passengers" /></Panel>;
  }
  const word = COUNT_WORD[passengers.length] ?? String(passengers.length);
  return (
    <section aria-label="The passengers" className={styles.paxSection}>
      <div>
        <h2 className={styles.sectionTitle}>The {word.toLowerCase()} {passengers.length === 1 ? "passenger" : "passengers"}</h2>
        <p className={styles.sectionHint}>Made-up people on the same connection. Each one gets their own answer.</p>
      </div>
      <div className={styles.paxGrid}>
        {passengers.map((passenger) => <PassengerCard key={passenger.seat} passenger={passenger} approving={approving} onApprove={onApprove} />)}
      </div>
    </section>
  );
}
