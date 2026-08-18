import { AgentProfile, CalendarBlock, Day, LocalStatus } from "../types/domain";

export const WEEK_START_DATE = "2026-08-24"; // a Monday, used only to render human-friendly date labels
export const DAY_OFFSET: Record<Day, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

/** Most restrictive block covering [start,end) on `day`, or "free" if nothing overlaps. */
export function statusAt(agent: AgentProfile, day: Day, start: string, end: string): { status: LocalStatus; block?: CalendarBlock } {
  const hits = agent.calendar.filter((b) => b.day === day && overlaps(b.start, b.end, start, end));
  if (hits.length === 0) return { status: "free" };
  const busyHit = hits.find((b) => b.status === "busy");
  if (busyHit) return { status: "busy", block: busyHit };
  return { status: hits[0].status, block: hits[0] };
}

export function dateLabel(day: Day): string {
  const base = new Date(`${WEEK_START_DATE}T00:00:00`);
  base.setDate(base.getDate() + DAY_OFFSET[day]);
  return base.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatSlot(day: Day, start: string, end: string): string {
  return `${dateLabel(day)}, ${to12h(start)}-${to12h(end)}`;
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function addMinutes(hhmm: string, minutes: number): string {
  const total = toMinutes(hhmm) + minutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Enumerate half-hour candidate start times for a day within business hours. */
export function candidateStarts(day: Day, businessStart = "09:00", businessEnd = "17:00"): string[] {
  const out: string[] = [];
  let t = toMinutes(businessStart);
  const end = toMinutes(businessEnd);
  while (t < end) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    t += 30;
  }
  return out;
}
