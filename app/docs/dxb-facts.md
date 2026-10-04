# DXB facts for transfer-time planning

Research date: 2026-10-03. Scope: Dubai International Airport (DXB) layout and published connection guidance, for a prototype that estimates transfer time between two flights.

**How to read this document**

- Sections 1 to 7 are **sourced facts**. Every row carries a source URL.
- Section 8 holds the **planning values**. Each is labelled `SOURCED` (the number is taken directly from a cited source) or `ESTIMATE` (derived by us, with the reasoning shown).
- "not found" means no public source was found in this research. No number has been invented to fill a gap.
- Confidence labels used for sources:
  - **Official**: Dubai Airports, Emirates, flydubai, Government of Dubai Media Office.
  - **Reference**: Wikipedia (secondary, usually cites official material).
  - **Third-party**: travel guides, Wikivoyage, news sites. Treat as indicative only.
- Retrieval caveats:
  - The flydubai pages (`flydubai.com/en/plan/connections/` and `.../terminal-3-operations`) timed out on every direct fetch. Their figures below were read from search-engine excerpts of those pages, not from the pages themselves. **Re-verify before presenting them as flydubai-published.**
  - Items marked "(search excerpt)" were likewise seen only in a search result excerpt, not confirmed by opening the page.

---

## 1. Terminals and concourses

| Terminal | Concourse(s) | Gate letter | Main users | Source |
|---|---|---|---|---|
| Terminal 1 | Concourse D | D | International carriers other than Emirates ("home to 60 international airlines") | Official: [Dubai Airports Concourse D fact file (PDF)](https://media.dubaiairports.ae/download/cb6d4011-5496-4930-aaf6-352d392cd049/concoursedfactfile.pdf) |
| Terminal 2 | No separate concourse; gates in the terminal | F | flydubai (main base) and regional / low-cost carriers | Reference: [Wikipedia, Dubai International Airport](https://en.wikipedia.org/wiki/Dubai_International_Airport); Third-party: [Wikivoyage](https://en.wikivoyage.org/wiki/Dubai_International_Airport) |
| Terminal 3 | Concourses A, B, C | A, B, C | Emirates ("All our flights arrive and depart from Emirates Terminal 3"); selected flydubai flights | Official: [Emirates, Transferring between terminals](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/); Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport) |

Notes:

- Dubai Airports' own wording for passengers is "A Gates", "B Gates", "C Gates" (Terminal 3) and "D Gates" (Terminal 1). Source: [Dubai Airports, Transfers](https://dubaiairports.ae/information/transfers).
- Concourse C opened in 2000 and became part of Terminal 3 in 2016. Source: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport).
- Wikipedia also lists selected United flights in Terminal 3. Source: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport). Not confirmed against an airline page.
- Which specific flydubai routes use Terminal 3: **not found** (the flydubai page listing them could not be opened).

---

## 2. Gate numbering

| Concourse | Documented gate range | Gate count and type | Source |
|---|---|---|---|
| A | A1 to A24 | 20 air-bridge gates, all A380-capable per one page; "20 air bridges (18 A380-capable)" per another | Reference: [Wikipedia, DXB](https://en.wikipedia.org/wiki/Dubai_International_Airport) and [Wikipedia, Terminal 3](https://en.wikipedia.org/wiki/Dubai_International_Terminal_3). The two pages disagree on 20 vs 18 A380-capable. |
| B | B1 to B32 | 32 gates: 26 air-bridge gates (B7 to B32) plus boarding lounges B1 to B6 serving remote stands | Reference: [Wikipedia, DXB](https://en.wikipedia.org/wiki/Dubai_International_Airport); [Wikipedia, Terminal 3](https://en.wikipedia.org/wiki/Dubai_International_Terminal_3) |
| C | C1 to C50 | 50 gates: 28 air bridges, 22 remote gates | Reference: [Wikipedia, DXB](https://en.wikipedia.org/wiki/Dubai_International_Airport) |
| D | D1 to D32 (range itself is third-party only) | **Sources disagree.** Official fact file: "32 gates, including four code F gates (21 contact gates, 11 remote)". Wikipedia: "17 gates". The designer, Dar, says "up to 17 aircraft stands". The likely explanation is 17 contact stands at the building vs 32 gate lounges, but no source states that explicitly. | Official: [Concourse D fact file](https://media.dubaiairports.ae/download/cb6d4011-5496-4930-aaf6-352d392cd049/concoursedfactfile.pdf); Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport); [Dar](https://dar.com/work/project/dubai-international-concourse-d). Numbering D1 to D10 (one wing) and D11 to D32 (other wing): third-party, search excerpt only, e.g. [all-maps.com](https://all-maps.com/dubai-international-airport-terminal-1-map/). |
| Terminal 2 (F) | **Sources disagree.** F1 to F12 (Wikipedia, current) vs F1 to F6 (older news article on the signage change) | No jet bridges; all boarding by bus or on foot | Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport); Third-party: [Khaleej Times, new signage](https://khaleejtimes.com/article/new-signage-at-dubai-airport?amp=1) (search excerpt) |

Also noted: the official fact file's second page breaks Concourse D into 12 code E + 1 code C + 4 code F gates (17 contact) and 11 remote stands, which does not add up to the "21 contact" on its first page. The official document is internally inconsistent on this point.

---

## 3. How passengers move between concourses and terminals

| Link | Mode | Airside? | Published time / frequency | Source |
|---|---|---|---|---|
| A to B/C (within Terminal 3) | Airport train (automated people mover, "Terminal 3 APM"); Emirates also runs a bus between A and C | Airside | Train journey time: **not found**. Train frequency: **not found**. Emirates gives an overall figure: "approximately 30 minutes to travel between each concourse". | Official: [Dubai Airports, Transfers](https://dubaiairports.ae/information/transfers) ("take a short ride on the airport train to A Gates"); [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/); Reference: [Wikipedia, DXB APM](https://en.wikipedia.org/wiki/Dubai_International_Airport_Automated_People_Mover) |
| A to C bus | Emirates bus. Pick-up: Concourse A "Bus Connection area A6"; Concourse C "connections desk E" | Airside | Time and frequency: **not found** | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/) |
| B to C | Walk ("travellers can walk between B Gates and C Gates") | Airside | Walking time: **not found** in official sources | Official: [Dubai Airports, Transfers](https://dubaiairports.ae/information/transfers) |
| Terminal 1 to Concourse D | Elevated airport train (Terminal 1 APM, 1.5 km) | Airside (after Terminal 1 passport control and security) | "transit time of 2 minutes"; train of 5 carriages, 300 passengers. Frequency "every two and a half minutes": third-party, search excerpt only. | Official: [Concourse D fact file](https://media.dubaiairports.ae/download/cb6d4011-5496-4930-aaf6-352d392cd049/concoursedfactfile.pdf); Reference: [Wikipedia, DXB APM](https://en.wikipedia.org/wiki/Dubai_International_Airport_Automated_People_Mover); frequency via [Arabian Business](https://www.arabianbusiness.com/industries/transport/dubai-int-l-hold-concourse-d-trials-in-august-556087) (search excerpt) |
| Terminal 3 (A/B/C) to D gates | Shuttle bus from "Concourse B, connections desk K for D and F gates" | Airside for through-ticketed passengers (no immigration, per Emirates' description) | Time and frequency: **not found** in official sources. Third-party range: 5 to 30 minutes. | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/); Third-party: [cestee.com](https://www.cestee.com/airport/dubai-dxb/terminal) (search excerpt) |
| Terminal 3 to Terminal 2 (F gates) | Shuttle bus. Pick-up: Concourse A "bus connection area A6 for F gates"; Concourse B "connections desk K"; Concourse C "connections desk E for F gates" | **Sources disagree**, see below | Ride time "around 20 minutes from Terminal 2 to Terminal 1 and 30 minutes to Terminal 3" (Wikipedia). Wikivoyage: "approximately 60 minutes from landing until you reach the Connections desk in Terminal 1 or 3". Third-party: 15 to 25 minutes "depending on traffic", buses about every 15 to 20 minutes. | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/); Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport); Third-party: [Wikivoyage](https://en.wikivoyage.org/wiki/Dubai_International_Airport), [cestee.com](https://www.cestee.com/airport/dubai-dxb/terminal) (search excerpt) |
| Terminal 1 to Terminal 2 | Shuttle bus | Same disagreement as above | "around 20 minutes" | Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport) |

### Airside or landside for Terminal 2? Sources disagree

- **Airside for single-ticket passengers.** Emirates: if the whole journey is on one booking, "You don't need to collect your bags when you arrive. Simply go to the Connections desk and take the shuttle bus to your next departure terminal." Wikivoyage also describes an airside connection to Terminal 2. Sources: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/); [Wikivoyage](https://en.wikivoyage.org/wiki/Dubai_International_Airport).
- **Landside for separate tickets.** Emirates: "You need to clear Immigration, collect your bags from the carousel and go through Customs. Exit the terminal and take a taxi or bus to your departure terminal." A visa may be needed. Source: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/).
- **Landside always (third-party claim).** Some guides state Terminal 2 "is not linked airside" and that all passengers re-clear immigration and security. Source: [cestee.com](https://www.cestee.com/airport/dubai-dxb/terminal) (search excerpt). This contradicts the Emirates description and Wikipedia's statement that Terminal 2 "cannot internally connect" refers to there being no walkway or train.

Working reading for the prototype: the bus is airside for through-ticketed passengers and landside (immigration, bags, customs) for separately ticketed passengers. This is an interpretation, not a single published statement.

Dubai Airports itself publishes no times: "Guests transferring between concourses and terminals, please consult with your airline or Guest Experience Ambassadors upon arrival." Source: [Dubai Airports, Transfers](https://dubaiairports.ae/information/transfers).

---

## 4. Published connection guidance

### Minimum connection times (MCT)

| Terminal pair | MCT | Published by | Source and caveat |
|---|---|---|---|
| T2 to T2 | 60 min | flydubai | [flydubai, Connecting flights](https://www.flydubai.com/en/plan/connections/) (search excerpt; page could not be opened) |
| T3 to T3 (flydubai-involved) | 90 min | flydubai | Same source, same caveat |
| T2 to T3 (either direction) | 120 min | flydubai | Same source, same caveat. Also [flydubai, Terminal 3 operations](https://www.flydubai.com/en/flying-with-us/terminal-3-operations) (search excerpt) |
| T3 to T3, Emirates to Emirates | 60 min (some say 60 to 75) | **Not found on emirates.com.** Commonly cited by third parties only. | Third-party: [travelvient.com](https://travelvient.com/guides/minimum-connection-time-dubai-2026/); [Australian Frequent Flyer forum](https://www.australianfrequentflyer.com.au/community/threads/mct-in-dubai-thoughts-on-this-connection.117635/latest) (search excerpt) |
| T1 to T3 | Official MCT **not found**. Third-party recommendation: 90 to 120 min. | n/a | Third-party: [travelvient.com](https://travelvient.com/guides/minimum-connection-time-dubai-2026/) |
| T1 to T2 | **not found** | n/a | n/a |

### Other published timings

| Item | Published value | Source |
|---|---|---|
| Travel between Terminal 3 concourses | "It takes approximately 30 minutes to travel between each concourse." | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/) |
| Be at the gate | "no later than 60 minutes before departure" in Premium Economy or Economy; 45 minutes in First or Business | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/) |
| Gate closes | "Boarding gates will close strictly 20 minutes before the scheduled departure time" | Emirates advisory as reported by [Gulf News, 18 April 2025](https://gulfnews.com/business/aviation/uae-travel-dubais-emirates-issues-advisory-ahead-of-weekend-rush-300000-passengers-expected-1.500098381). Not located on emirates.com itself in this research. |
| Passengers who must re-check bags | Go "through passport control and security 90 minutes before your flight" | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/) |
| Emirates First Class short connection | Car transfer between A and C when connection is "less than 90 minutes" | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/) |
| Baggage transfer service (separate tickets) | Connection "needs to be at least three hours" | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/) |
| flydubai gate-close time | **not found** (page could not be opened) | n/a |
| General walking budget | Budget "15 minutes minimum" to reach a gate from the terminal (tunnel walk, train, or both) | Third-party: [Wikivoyage](https://en.wikivoyage.org/wiki/Dubai_International_Airport) |

### Transfer security screening

- Official description of the transfer security process (who is re-screened, where): **not found**. Dubai Airports' transfer page only says to follow signs to Connections and use transfer desks. Source: [Dubai Airports, Transfers](https://dubaiairports.ae/information/transfers).
- Airport-wide security performance, 2025: "98.9%" of guests waited under 5 minutes at security; 99.35% of departing guests waited under 10 minutes at passport control. This is an airport-wide figure and is **not specific to transfer screening**. Source: Official: [Government of Dubai Media Office, 11 Feb 2026](https://mediaoffice.ae/en/news/2026/february/11-02/dxb-sets-new-global); also [Moodie Davitt Report](https://moodiedavittreport.com/?p=466278).
- Third-party claim for transfer security: "about 8 minutes off-peak and 25 minutes at peak". Source: [travelvient.com](https://travelvient.com/guides/minimum-connection-time-dubai-2026/). The guide does not show measured data behind these numbers.
- Concourse B has 3 transfer areas and 62 transfer desks; Concourse D has 30 transfer counters. Sources: [Wikipedia, Terminal 3](https://en.wikipedia.org/wiki/Dubai_International_Terminal_3); [Concourse D fact file](https://media.dubaiairports.ae/download/cb6d4011-5496-4930-aaf6-352d392cd049/concoursedfactfile.pdf).

---

## 5. Size facts useful for walking estimates

| Facility | Length x width | Gates | Other | Source |
|---|---|---|---|---|
| Concourse A | 924 m x 91 m | A1 to A24, 20 air bridges | Built-up area: 528,000 m2 (Terminal 3 page) vs 540,000 m2 (airport page). 11 floors. Capacity 19 million a year. | Reference: [Wikipedia, Terminal 3](https://en.wikipedia.org/wiki/Dubai_International_Terminal_3); [Wikipedia, DXB](https://en.wikipedia.org/wiki/Dubai_International_Airport) |
| Concourse B | 945 m x 90.8 m | B1 to B32 | Built-up area 675,000 m2. 10 floors. | Reference: [Wikipedia, Terminal 3](https://en.wikipedia.org/wiki/Dubai_International_Terminal_3) |
| Concourse C | Length **not found** | C1 to C50 | n/a | Reference: [Wikipedia, DXB](https://en.wikipedia.org/wiki/Dubai_International_Airport) |
| Concourse D | 700 m x 144 m x 27 m | 32 gates (official) / 17 (Wikipedia), see section 2 | Area 150,000 m2; seating for more than 8,000. Capacity 18 million (official) vs 15 million (Wikipedia). | Official: [Concourse D fact file](https://media.dubaiairports.ae/download/cb6d4011-5496-4930-aaf6-352d392cd049/concoursedfactfile.pdf) |
| Terminal 2 | Length **not found** | F gates, no jet bridges | Floor area 47,000 m2; capacity 10 million | Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport) |
| Terminal 3 APM (to Concourse A) | 5.2 km system, 2 stations | n/a | Journey time and headway **not found** | Reference: [Wikipedia, DXB APM](https://en.wikipedia.org/wiki/Dubai_International_Airport_Automated_People_Mover) |
| Terminal 1 APM (to Concourse D) | 1.5 km, 2 stations | n/a | 2-minute transit; 300 passengers per train | Official: [Concourse D fact file](https://media.dubaiairports.ae/download/cb6d4011-5496-4930-aaf6-352d392cd049/concoursedfactfile.pdf) |

- Official statement of walking time inside any concourse: **not found**.
- Third-party remark that the walk between the A gates and gate C1 is "over 1.5 km": [Wikivoyage](https://en.wikivoyage.org/wiki/DXB) (search excerpt, not verified on the page).

---

## 6. Passenger assistance

| Service | Official name / wording | What it is | Source |
|---|---|---|---|
| Reduced-mobility programme | "People of Determination" (the UAE's official term for people with disabilities) | Umbrella for accessible transport, facilities and special assistance. Assistance is requested through the airline. | Official: [Dubai Airports, People of Determination](https://dubaiairports.ae/people-of-determination) |
| Wheelchair | "Wheelchair assistance at DXB and DWC is provided by dnata" | From kerb or check-in to the gate, and on arrival. Free for People of Determination. Request when booking or at check-in; on arrival, identify yourself to dnata attendants at the gate. | Official: [Dubai Airports, Facilities and services](https://dubaiairports.ae/facilities-services) |
| Buggy | "A 24/7 shuttle service" (buggy cars) with priority access for persons with disabilities | Moves passengers across terminals and concourses | Official: [Dubai Airports, Facilities and services](https://dubaiairports.ae/facilities-services) |
| Emirates free buggies | "free airport buggies" | Pick-up points: Concourse A central area; Concourse B central area opposite gate B18; Concourse C entrance. First Class passengers can ask for a buggy transfer at the lounge reception. | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/) |
| Hidden disabilities | Sunflower Lanyard; "Assisted Travel Lounge" (Terminal 2 departures) | Lanyard gives access to family and priority lanes. Details came from search excerpts; the Dubai Airports page itself loaded only as navigation. | Official page: [Dubai Airports, Hidden disabilities](https://dubaiairports.ae/hidden-disabilities); detail via [Gulf News](https://gulfnews.com/living-in-uae/ask-us/dubai-6-ways-to-plan-airport-travel-for-people-of-determination-1.1680524557584) (search excerpt) |
| Emirates First Class | "Premium Connections Service" | Car transfer between Concourses A and C for connections under 90 minutes | Official: [Emirates](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/) |
| Paid meet and greet | "marhaba" (a dnata brand). Packages named Fast Track, Bronze, Silver, Gold, Elite. | Escort and fast-track through immigration; higher tiers add porter, lounge, buggy transfers "where permitted". Available 24 hours at Terminals 1, 2 and 3. | Third-party summaries: [Gulf News](https://gulfnews.com/living-in-uae/ask-us/uae-special-assistance-services-at-dubai-airports---all-you-need-to-know-1.1700057476882); [flydubai Meet and Greet](https://flydubai.com/en/book-and-manage/meet-and-greet) (search excerpt). Official site named in those articles: marhabaservices.com (not opened in this research). |
| Medical assistance | dnata medical transport with escorts | For guests needing medical assistance | Official: [Dubai Airports, People of Determination](https://dubaiairports.ae/people-of-determination) |

Published time saving from using a wheelchair, buggy or marhaba on a transfer: **not found**.

---

## 7. Passenger numbers (context only)

| Fact | Value | Year | Source |
|---|---|---|---|
| Annual passengers | 95.2 million, up 3.1% | 2025 | Official: [Government of Dubai Media Office, 11 Feb 2026](https://mediaoffice.ae/en/news/2026/february/11-02/dxb-sets-new-global) |
| Flight movements | 454,800 | 2025 | Same source |
| Annual passengers | 86.994 million | 2023 | Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport) |
| Forecast | 99.5 million | 2026 | [Media Office](https://mediaoffice.ae/en/news/2026/february/11-02/dxb-sets-new-global) (search excerpt) |
| Transfer share | "Almost half of the travelers using the airport are connecting passengers." | Year not stated | Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport) |
| Transfer share (specific figure) | "Direct traffic share reached 54% (44% transfer traffic)". Seen only in a search excerpt attributed to [Routes Online, Dubai Airports profile](https://www.routesonline.com/destinations/10463/dubai-airports/about/). The two figures do not add up to 100 and the period is unclear. **Not confirmed**; the 2025 annual press release that was opened does not give a transfer share. | Unclear | As linked |
| Stated total capacity | 115 million a year | n/a | Reference: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_International_Airport) |

---

## 8. Suggested planning values

These are **configurable planning values, not measurements**. Of the 17 values below, **4 are SOURCED** and **13 are ESTIMATES**.

### Assumptions behind every estimate

- Walking speed 1.2 m/s (about 72 m per minute), a common planning figure for mixed airport crowds with hand luggage. This is our assumption, not a DXB figure.
- "Transfer time" means arrival gate to departure gate: walking, waiting for and riding a train or bus, and level changes. It **excludes** the transfer security queue and the gate-close buffer, which are separate values at the end.
- Passenger is on a single ticket with bags checked through. For separate tickets involving Terminal 2 or Terminal 1, add immigration, baggage reclaim and re-check; Emirates' own guidance for that case is a connection of at least three hours (section 4).

### Transfer time matrix (minutes)

| From / to | Value | Label | One-line reasoning |
|---|---|---|---|
| A to A | 10 | ESTIMATE | Concourse is 924 m long; half-length walk is about 6.5 min, full length about 13 min, plus level change. |
| B to B | 10 | ESTIMATE | 945 m long; same reasoning as A. |
| C to C | 12 | ESTIMATE | Length not found; 50 gates suggests it is at least as long as A or B, so slightly higher. Weakest of the same-concourse values. |
| D to D | 10 | ESTIMATE | 700 m long (official); full length about 10 min at 1.2 m/s. |
| F to F (Terminal 2) | 5 | ESTIMATE | Small terminal (47,000 m2), bus-boarded gates close together; no published length. |
| A to B | 30 | SOURCED | Emirates: "approximately 30 minutes to travel between each concourse" ([source](https://www.emirates.com/english/before-you-fly/dubai-international-airport/transferring-between-terminals/)). |
| A to C | 30 | SOURCED | Same Emirates statement; a dedicated A to C bus exists. |
| B to C | 30 | SOURCED | Same Emirates statement. Likely conservative: B and C are walkable with no train, so a real value may be nearer 15 to 20 (that lower figure would be an estimate). |
| A to D | 45 | ESTIMATE | No published time. Emirates lists the D-gate shuttle only from Concourse B desk K, so A passengers first take the train to B (part of the sourced 30), then a bus. |
| B to D | 35 | ESTIMATE | Shuttle bus from desk K; time not published. Third-party range 5 to 30 min for T1/T3 transfers, plus walk to desk and bus wait. |
| C to D | 40 | ESTIMATE | Walk C to B desk K, then the same bus as B to D. |
| A to F | 60 | ESTIMATE | Bus from area A6. Anchors: Wikipedia "30 minutes" T2 to T3 ride, buses roughly every 15 to 20 min (third-party), Wikivoyage "approximately 60 minutes" to reach the connections desk. |
| B to F | 60 | ESTIMATE | Same anchors; bus from desk K. |
| C to F | 60 | ESTIMATE | Same anchors; bus from desk E. |
| D to F | 50 | ESTIMATE | Wikipedia "around 20 minutes" T2 to T1 ride, plus 2-min train (official), bus wait and walking. |

Use the same value in both directions; no source distinguishes direction.

### Other planning values

| Value | Minutes | Label | One-line reasoning |
|---|---|---|---|
| Gate closes before departure | 20 | SOURCED | Emirates advisory: gates "close strictly 20 minutes before the scheduled departure time" ([Gulf News, 18 Apr 2025](https://gulfnews.com/business/aviation/uae-travel-dubais-emirates-issues-advisory-ahead-of-weekend-rush-300000-passengers-expected-1.500098381)). Applies to Emirates; flydubai and Terminal 1 airlines not found. |
| Typical transfer security queue | 10 | ESTIMATE | Official figure is airport-wide, not transfer-specific (98.9% under 5 min). One third-party guide claims 8 min off-peak and 25 min peak. 10 sits between the two; consider 25 as a peak setting. |

### Cross-check against published MCTs

The matrix can be sanity-checked by adding: transfer time + security queue + gate-close buffer, plus time to leave the aircraft (not modelled here).

| Case | Planning sum | Published MCT | Comment |
|---|---|---|---|
| T3 to T3, different concourse | 30 + 10 + 20 = 60 | 60 (third-party, Emirates to Emirates); 90 (flydubai, search excerpt) | Consistent with the commonly cited 60, with no slack for deplaning. |
| T2 to T2 | 5 + 10 + 20 = 35 | 60 (flydubai, search excerpt) | Leaves 25 min for bus from a remote stand and deplaning. |
| T2 to T3 | 60 + 10 + 20 = 90 | 120 (flydubai, search excerpt) | Leaves 30 min margin. |

### What would improve these values

- The APM journey time and headway for the Terminal 3 train (not found anywhere public).
- The length of Concourse C.
- Official frequencies and ride times for the airside shuttle buses to D and F gates.
- A direct read of the flydubai connections page to confirm the 60 / 90 / 120 figures.
- An Emirates-published MCT (not on its public transfer page).
