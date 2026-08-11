import { env } from "../config.js";

/**
 * The school's academic calendar.
 *
 * gurukul.org/bangalore/academics/academic-calendar/ renders a Google Calendar
 * embed, and that calendar is public, so it also publishes an iCalendar feed.
 * Reading the feed means no page scraping, no API key, no model in the loop
 * and no guessing: the same 370-odd entries the school publishes, parsed
 * exactly as written.
 *
 * Nothing here creates anything. It returns what the school has listed and
 * leaves every decision about coverage to a person.
 */

export interface CalendarEntry {
  /** The feed's own id, so the same entry is never imported twice. */
  uid: string;
  title: string;
  /** Midnight UTC for whole-day entries, which is what the school publishes. */
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
}

/** Unfolds the line wrapping iCalendar applies at 75 octets. */
function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

/** iCalendar escapes commas, semicolons and newlines inside text values. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
}

/** `20260815` or `20260815T093000Z`. */
function parseStamp(value: string): { at: Date; allDay: boolean } | null {
  const date = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (date) {
    const [, y, m, d] = date;
    return { at: new Date(Date.UTC(+y, +m - 1, +d)), allDay: true };
  }
  const stamp = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (stamp) {
    const [, y, m, d, hh, mm, ss] = stamp;
    return { at: new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss)), allDay: false };
  }
  return null;
}

export function parseIcs(body: string): CalendarEntry[] {
  const text = unfold(body);
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  const entries: CalendarEntry[] = [];

  for (const block of blocks) {
    const body = block.split("END:VEVENT")[0];
    const field = (name: string) => {
      const match = body.match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, "m"));
      return match ? match[1].trim() : null;
    };

    const uid = field("UID");
    const summary = field("SUMMARY");
    const start = field("DTSTART");
    if (!uid || !summary || !start) continue;

    const from = parseStamp(start);
    if (!from) continue;

    const endRaw = field("DTEND");
    const to = endRaw ? parseStamp(endRaw) : null;

    entries.push({
      uid,
      title: unescapeText(summary),
      startsAt: from.at,
      // A whole-day DTEND is exclusive in iCalendar — the day after the last.
      endsAt: to ? (to.allDay ? new Date(to.at.getTime() - 86_400_000) : to.at) : null,
      allDay: from.allDay,
      location: field("LOCATION") ? unescapeText(field("LOCATION")!) : null,
    });
  }

  // The feed repeats a multi-day entry once per day; the same title on
  // consecutive days is one event, so keep the earliest of each.
  const seen = new Map<string, CalendarEntry>();
  for (const entry of entries.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    if (!seen.has(entry.uid)) seen.set(entry.uid, entry);
  }
  return [...seen.values()];
}

export class CalendarError extends Error {}

/** Fetches the school's published feed. Throws with something readable. */
export async function fetchSchoolCalendar(): Promise<CalendarEntry[]> {
  const url = `https://calendar.google.com/calendar/ical/${encodeURIComponent(env.GURUKUL_CALENDAR_ID)}/public/basic.ics`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
  } catch {
    throw new CalendarError("Could not reach the school calendar. Check the connection and try again.");
  }
  if (!response.ok) {
    throw new CalendarError(
      response.status === 404
        ? "The school calendar is no longer published at that address."
        : `The school calendar could not be read (${response.status}).`,
    );
  }
  return parseIcs(await response.text());
}
