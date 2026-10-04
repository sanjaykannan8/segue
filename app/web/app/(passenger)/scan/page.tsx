"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Select } from "@/components/arc/select/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { BookingChoice } from "@/components/segue/booking-choice";
import { choiceSummary, choiceToInput, FlightPicker, type FlightChoice } from "@/components/segue/flight-picker";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { PassScanner } from "@/components/segue/pass-scanner";
import { ErrorState, FormError, LoadingPanel, Panel } from "@/components/segue/ui";
import { api, isStatus, useResource, type AssistanceType, type Booking } from "@/lib/api";
import type { Bcbp } from "@/lib/bcbp";
import { ASSISTANCE_TYPES, flightLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import styles from "../passenger.module.css";

export default function ScanPage() {
  const router = useRouter();
  const t = useT();
  const me = useResource(api.me);
  const [tab, setTab] = useState("manual");
  const [inbound, setInbound] = useState<FlightChoice | null>(null);
  const [outbound, setOutbound] = useState<FlightChoice | null>(null);
  const [prefill, setPrefill] = useState<{ inbound?: string; outbound?: string; stamp: number }>({ stamp: 0 });
  const [seat, setSeat] = useState("");
  const [assistance, setAssistance] = useState<AssistanceType>("none");
  const [bookingChoice, setBookingChoice] = useState<Booking | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // No session yet: the notice and consent come first.
  const unauthorized = isStatus(me.error, 401);
  useEffect(() => { if (unauthorized) router.replace("/"); }, [unauthorized, router]);

  const canShareAssistance = me.data?.consents.some((c) => c.purpose === "assistance" && !c.withdrawn_at) ?? false;
  const first = inbound ? choiceSummary(inbound) : null;
  const second = outbound ? choiceSummary(outbound) : null;
  // Same airline code on both flights usually means one booking; the passenger can change it.
  const inferred: Booking = first && second && first.iata.slice(0, 2) === second.iata.slice(0, 2) ? "single_ticket" : "separate_tickets";
  const booking = bookingChoice ?? inferred;

  function onScan(pass: Bcbp) {
    const [one, two] = pass.legs;
    if (!one) return;
    setInbound(null);
    setOutbound(null);
    setPrefill((now) => ({ inbound: one.flightIata, outbound: two?.flightIata, stamp: now.stamp + 1 }));
    if (one.seat) setSeat(one.seat);
    setScanned(pass.legs.map((leg) => `${flightLabel(leg.flightIata)} ${leg.from}→${leg.to}`).join(", "));
    setTab("manual");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!inbound || !outbound) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await api.createItinerary({
        inbound: choiceToInput(inbound),
        outbound: choiceToInput(outbound),
        booking,
        ...(seat.trim() ? { seat: seat.trim().toUpperCase() } : {}),
        ...(canShareAssistance ? { assistance } : {}),
      });
      router.push("/trip");
    } catch (error) {
      // A connection that is not through Dubai International comes back as 400 with the API's own message.
      setSubmitError(error);
      setBusy(false);
    }
  }

  const title = t("title.scan");
  if (me.loading || unauthorized) {
    return <PassengerShell pageTitle={title} title={title}><LoadingPanel lines={4} /></PassengerShell>;
  }
  if (!me.data) {
    return <PassengerShell pageTitle={title} title={title}><ErrorState error={me.error} onRetry={() => void me.reload()} /></PassengerShell>;
  }

  return (
    <PassengerShell pageTitle={title} title={title} intro={t("scan.intro")}>
      {me.data.has_itinerary ? (
        <Alert tone="info" title={t("scan.haveTrip")}>
          <Link href="/trip">{t("scan.goTrip")}</Link>
        </Alert>
      ) : null}

      <Panel>
        {/* Both panels stay mounted (forceMount) and the idle one is hidden, so the card always takes its height
            from the content on show and grows with it; nothing animates or pins the panel height. */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label={t("scan.tabsLabel")}>
            <TabsTrigger value="manual">{t("scan.tabFind")}</TabsTrigger>
            <TabsTrigger value="scan">{t("scan.tabScan")}</TabsTrigger>
          </TabsList>

          <TabsContent value="scan" forceMount className={styles.tabPanel}>
            {tab === "scan" ? <PassScanner onScan={onScan} /> : null}
          </TabsContent>

          <TabsContent value="manual" forceMount className={styles.tabPanel}>
            <form className={styles.steps} onSubmit={submit} noValidate>
              {scanned ? (
                <p className={styles.scanned} role="status">
                  <ScanLine width={18} height={18} aria-hidden="true" />
                  <span>{t("scan.scanned", { flights: `⁦${scanned}⁩` })}</span>
                </p>
              ) : null}

              <FlightPicker
                key={`in-${prefill.stamp}`}
                step={1}
                leg="first"
                title={t("scan.first")}
                value={inbound}
                onChange={(choice) => { setInbound(choice); setOutbound(null); setBookingChoice(null); }}
                prefillNumber={prefill.inbound}
              />

              {inbound && first ? (
                <>
                  <hr className={styles.divider} style={{ margin: 0 }} />
                  <FlightPicker
                    key={`out-${prefill.stamp}-${first.iata}`}
                    step={2}
                    leg="second"
                    title={t("scan.second")}
                    after={first.arr}
                    value={outbound}
                    onChange={(choice) => { setOutbound(choice); setBookingChoice(null); }}
                    prefillNumber={prefill.outbound}
                  />
                </>
              ) : null}

              {inbound && outbound ? (
                <>
                  <hr className={styles.divider} style={{ margin: 0 }} />
                  <BookingChoice value={booking} onChange={setBookingChoice} />
                  <Input label={t("scan.seat")} placeholder="12A" dir="ltr" autoCapitalize="characters" autoComplete="off" value={seat} onChange={(event) => setSeat(event.target.value)} description={t("scan.seatHint")} />
                  {canShareAssistance ? (
                    <Select
                      label={t("scan.assistance")}
                      value={assistance}
                      onValueChange={(value) => setAssistance(value as AssistanceType)}
                      options={ASSISTANCE_TYPES.map((value) => ({ value, label: t(`assist.${value}`) }))}
                      description={t("scan.assistanceHint")}
                    />
                  ) : null}
                  <FormError error={submitError} />
                  <Button type="submit" size="lg" loading={busy} className={styles.full}>{t("scan.submit")}</Button>
                </>
              ) : null}
            </form>
          </TabsContent>
        </Tabs>
      </Panel>

      <p className={styles.muted} style={{ textAlign: "center" }}>{t("scan.footnote")}</p>
    </PassengerShell>
  );
}
