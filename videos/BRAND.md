# Segue: brand kit for film

There's no app codebase yet, so the rules come from the brief, the solution doc and the Arc UI kit the user chose.

## Sources
- Product brief: `../Segue_Solution.md` (from `Segue_Air_Solution.md`, renamed to Segue). Product name is **Segue** only (user).
- Logo: `public/segue-logo.svg` (gradient tile `#9FB5D7 → #46B5FD`, white mark and wordmark).
- Mascot: 12 blue cloud poses cut from the user's sheet into `public/mascot/*.png` (`tools/extract_mascots.py`).
- UI components: Arc (https://uiarc.dev/components, shadcn registry `@uiarc`), as the user asked. Sources are in `../_research/uiarc/src`.
- Font: **Instrument Sans** (user), variable 400–700, OFL, in `public/fonts`.

## Colors (solution doc §8)
| Token | Hex | Use |
|---|---|---|
| Deep Ocean | `#06283D` | text on light, ops dashboard background, primary button |
| Ocean Blue | `#1363DF` | accent words, links, progress |
| Clear Sky | `#47B5FF` | highlights. Text on it is Deep Ocean, never white |
| Morning Mist | `#DFF6FF` | film and passenger-view background |
| Status | Safe `#0DB879` / Tight `#F3AD20` / At Risk `#F48120` / Lost `#F15F55` | risk only. Every status has an icon and a label |

Status inks and tints follow Arc: text uses the accent's `-strong` value; the badge background is 10% color over the surface and the border is 25%.
The dark ops theme uses Deep Ocean surfaces: surface `#0A3350`, raised `#0E3B5C`, border `#174B70`, text `#EAF6FF`, secondary `#A6C3D6`.

## Arc rules (foundation.css)
- Radius: control 18, panel 26, surface 34, pill.
- Borders are 1px `#EBEBEB` (strong `#C4C4C4`). Shadows: resting, raised and floating, all soft and neutral.
- Primary button: foreground background with background-colored text. Secondary button: surface with a border.
- Motion: `--ease-standard cubic-bezier(.22,1,.36,1)`, a spring with a gentle settle (bounce .15), and blur-swaps for text changes (rise .3em with a soft blur).
- No focus rings, glows or particles.

## Components (twins)
Arc components run on `motion/react`, which has its own clock, so each one is redrawn as a frame-driven twin with the same structure and tokens:
Badge, Card, Toast, Button, Stepper, Gauge, Progress, Avatar, Metric card, Chat thread.

## Claims
- The product scores connections, alerts crew and passengers, suggests holds, tracks bags and prepares transit and customs steps.
- Never promise a guaranteed connection. The immigration authority decides on fast-track; Segue only requests it.
- All numbers on screen are the demo story (Priya: +25 min delay, 50 min left, a hold of 8 min saving 14 connections). There are no market statistics.
- Approved lines: "Flight trackers watch planes. Segue watches your connection." and "Waze for airport connections."

## Film decisions (user)
- 16:9 at 1080p, a pitch or demo, about 45 s. The pace is medium to fast, with constant camera motion and nothing static.
- Hook 0–3 s, workflow 3–20 s, payoff and CTA after that.
- Music: a generated beat bed at 160 BPM (license-free).
- Mascot: as a guide through the film, in the hook and the ending, and inside the UI as Segue's chat avatar.
- Ending: the tagline and the URL. `segue.app` is a **placeholder** until the user gives the real one.
