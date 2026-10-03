"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import type { Booking } from "@/lib/api";
import styles from "./booking-choice.module.css";

const OPTIONS: { value: Booking; title: string; text: string }[] = [
  { value: "single_ticket", title: "Together, on one booking", text: "The airline is responsible for your connection and moves your bag for you." },
  { value: "separate_tickets", title: "Separately", text: "You collect your bag and check in again. The airline will not rebook you if you miss the second flight." },
];

/** Radio cards (Arc has no radio-cards item in the registry folder, so this follows its tokens). Arrow keys move the choice. */
export function BookingChoice({ value, onChange }: { value: Booking; onChange: (value: Booking) => void }) {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
    event.preventDefault();
    const next = OPTIONS[(OPTIONS.findIndex((option) => option.value === value) + 1) % OPTIONS.length];
    onChange(next.value);
    group.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div className={styles.block}>
      <p id={labelId} className={styles.question}>How did you book these flights?</p>
      <div ref={group} role="radiogroup" aria-labelledby={labelId} className={styles.group} onKeyDown={onKeyDown}>
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button key={option.value} type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} data-value={option.value} className={styles.card} onClick={() => onChange(option.value)}>
              <span className={styles.mark} aria-hidden="true">{selected ? <Check width={12} height={12} strokeWidth={3} /> : null}</span>
              <span className={styles.copy}>
                <span className={styles.title}>{option.title}</span>
                <span className={styles.text}>{option.text}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
