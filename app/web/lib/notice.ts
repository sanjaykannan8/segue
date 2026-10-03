import type { Notice } from "./api";

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
];

/** The first sentence of a paragraph, in English or Hindi punctuation. */
function firstSentence(text: string): string {
  const match = /^.*?[.।!?](?=\s|$)/.exec(text.trim());
  return (match ? match[0] : text).trim();
}

const TOPICS: { id: "collect" | "retention" | "rights"; match: RegExp }[] = [
  { id: "collect", match: /collect|लेते|एकत्र/i },
  { id: "retention", match: /how long|keep|कितने समय|कब तक/i },
  { id: "rights", match: /right|अधिकार/i },
];

export type NoticePoint = { id: string; heading: string; line: string };

/**
 * Three one-line points for the consent screen, taken from the notice itself: the heading and the first
 * sentence of the matching section. A topic the notice does not cover is left out rather than invented.
 */
export function noticeSummary(notice: Notice): NoticePoint[] {
  return TOPICS.flatMap(({ id, match }) => {
    const section = notice.sections.find((entry) => match.test(entry.heading));
    return section ? [{ id, heading: section.heading, line: firstSentence(section.body) }] : [];
  });
}

/** A stable anchor for a section heading in any script. */
export function sectionAnchor(index: number): string {
  return `section-${index + 1}`;
}
