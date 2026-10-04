"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import type { Booking } from "@/lib/api";
import { useT, type Key } from "@/lib/i18n";
import styles from "./booking-choice.module.css";

const OPTIONS: { value: Booking; title: Key; text: Key }[] = [
  { value: "single_ticket", title: "booking.singleTitle", text: "booking.singleText" },
  { value: "separate_tickets", title: "booking.separateTitle", text: "booking.separateText" },
];

/** Radio cards (the Arc registry folder has no radio-cards item, so this follows its tokens). Arrow keys move the choice. */
export function BookingChoice({ value, onChange }: { value: Booking; onChange: (value: Booking) => void }) {
  const t = useT();
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!forward && !backward) return;
    event.preventDefault();
    const at = OPTIONS.findIndex((option) => option.value === value);
    const next = OPTIONS[(at + (forward ? 1 : OPTIONS.length - 1)) % OPTIONS.length];
    onChange(next.value);
    group.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div className={styles.block}>
      <p id={labelId} className={styles.question}>{t("booking.question")}</p>
      <div ref={group} role="radiogroup" aria-labelledby={labelId} className={styles.group} onKeyDown={onKeyDown}>
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button key={option.value} type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} data-value={option.value} className={styles.card} onClick={() => onChange(option.value)}>
              <span className={styles.mark} aria-hidden="true">{selected ? <Check width={12} height={12} strokeWidth={3} /> : null}</span>
              <span className={styles.copy}>
                <span className={styles.title}>{t(option.title)}</span>
                <span className={styles.text}>{t(option.text)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
