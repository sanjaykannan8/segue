# Segue technical film: beat sheet

The grid is 160 BPM with 1.5 s bars. The film is 30 bars, 45.0 s. The motion is calm: eased pushes and one smooth dolly, with no shake or beat pulse. It stays on the light palette until the gradient ending.

| Bars | Time | Act | What happens |
|---|---|---|---|
| 1–3 | 0–4.5 | The scale problem | "One delayed flight." EK 512 lands +25. "96 passengers at risk." Dots fill in and turn amber. "Scoring each one doesn't scale." A "96 model calls" chip appears. |
| 4–7 | 4.5–10.5 | Connection, not passenger | "Segue tracks the connection." Dots glide into 4 clusters by outbound flight, then fold into 4 connection cards, each with one risk badge. "96 passengers. 4 scores." |
| 8–10 | 10.5–15 | Cached risk | The EK 512 → BA 108 card shows its key (flight, flight, version). A gate change bumps v7 → v8 and the risk recomputes once. |
| 11–14 | 15–21 | clef-flash decisions | State card → clef-flash → five typed answers, each with a probability. "One call. Every decision." |
| 15–16 | 21–24 | Confidence gating | Each answer gets its gate: runs automatically, or ops approves. "Decisions are never cached." |
| 17–23 | 24–34.5 | Pipeline + fan-out | A packet travels App → Redpanda → engine (+ Redis) → clef-flash → outbox → RabbitMQ, then fans out to passenger, ops, crew, ground handler and authority. |
| 24–26 | 34.5–39 | Recap | "Scored once. Decided live. Delivered to everyone." |
| 27–30 | 39–45 | Ending | Gradient, logo, tagline, segue.app. |

User choices: content = connection scoring, clef-flash decisions, pipeline + fan-out (the reliability trio is left out). Opening = the scale problem. Music = a calmer variant of the bed.
Numbers on screen are demo values (96 passengers, 4 connections, the probabilities). They are illustrative, not measured.
Redpanda, Redis, RabbitMQ and clef-flash appear as text labels with generic icons: no third-party logos are drawn.
