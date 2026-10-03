/**
 * IATA Bar Coded Boarding Pass (BCBP, resolution 792) parser for the fields Segue needs.
 * Leg 1 mandatory block is 60 characters, fixed width:
 *   0 format code "M", 1 number of legs, 2–22 passenger name, 22 e-ticket flag, 23–30 PNR,
 *   30–33 from, 33–36 to, 36–39 carrier, 39–44 flight number, 44–47 day of year, 47 cabin,
 *   48–52 seat, 52–57 sequence, 57 status, 58–60 size (hex) of the conditional block that follows.
 * Later legs repeat PNR to size (37 characters) after the previous leg's conditional block.
 */

export type BcbpLeg = {
  from: string;
  to: string;
  carrier: string;
  flightNumber: string;
  /** Carrier and number joined the way the API expects, for example "EK512". */
  flightIata: string;
  seat: string | null;
};

export type Bcbp = { name: string; legs: BcbpLeg[] };

function cleanSeat(raw: string): string | null {
  const seat = raw.trim().replace(/^0+/, "").toUpperCase();
  return /^\d{1,3}[A-Z]$/.test(seat) ? seat : null;
}

function leg(from: string, to: string, carrierRaw: string, numberRaw: string, seatRaw: string): BcbpLeg | null {
  const carrier = carrierRaw.trim().toUpperCase();
  const flightNumber = numberRaw.trim().replace(/^0+/, "").toUpperCase();
  if (!/^[A-Z0-9]{2,3}$/.test(carrier) || !/^\d{1,4}[A-Z]?$/.test(flightNumber)) return null;
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  return { from, to, carrier, flightNumber, flightIata: `${carrier}${flightNumber}`, seat: cleanSeat(seatRaw) };
}

/** "DESMARAIS/LUC MR" → "Luc Desmarais" */
function cleanName(raw: string): string {
  const [last = "", first = ""] = raw.trim().split("/");
  const given = first.replace(/\s+(MR|MRS|MS|MISS|MSTR|DR)$/i, "").trim();
  const title = (text: string) => text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
  return [title(given), title(last.trim())].filter(Boolean).join(" ");
}

export function parseBcbp(text: string): Bcbp | null {
  const raw = text.replace(/[\r\n]+$/, "");
  if (raw.length < 52 || raw[0] !== "M") return null;
  const count = Number.parseInt(raw[1] ?? "", 10);
  if (!Number.isFinite(count) || count < 1) return null;

  const first = leg(raw.slice(30, 33), raw.slice(33, 36), raw.slice(36, 39), raw.slice(39, 44), raw.slice(48, 52));
  if (!first) return null;
  const legs = [first];

  // Further legs, when the pass carries the whole journey.
  let cursor = 60 + (Number.parseInt(raw.slice(58, 60), 16) || 0);
  for (let index = 1; index < Math.min(count, 4); index += 1) {
    const block = raw.slice(cursor, cursor + 37);
    if (block.length < 26) break;
    const next = leg(block.slice(7, 10), block.slice(10, 13), block.slice(13, 16), block.slice(16, 21), block.slice(25, 29));
    if (!next) break;
    legs.push(next);
    cursor += 37 + (Number.parseInt(block.slice(35, 37), 16) || 0);
  }

  return { name: cleanName(raw.slice(2, 22)), legs };
}

/** "ek 512" → "EK512" */
export function normalizeFlightIata(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isFlightIata(input: string): boolean {
  return /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(normalizeFlightIata(input));
}
