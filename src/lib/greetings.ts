/**
 * The welcome line on the signed-in home page: a different greeting on each visit, picked
 * to fit the time of day and the day of the week. It is shown as
 * "<lead>, <name><end>" (for example "Rise and revise, Lalit." or "How was class, Lalit?").
 */
export type Greeting = { lead: string; end: "." | "?" | "!" };

const g = (lead: string, end: Greeting["end"] = "."): Greeting => ({ lead, end });

const BY_TIME: { from: number; to: number; options: Greeting[] }[] = [
  {
    from: 0,
    to: 5,
    options: [
      g("Burning the midnight oil"),
      g("Still up"),
      g("Night owl mode"),
      g("Late-night thinking"),
      g("One more page"),
    ],
  },
  {
    from: 5,
    to: 12,
    options: [
      g("Good morning"),
      g("Rise and revise"),
      g("Coffee and notes"),
      g("Fresh start"),
      g("What are we learning today", "?"),
      g("Early bird"),
    ],
  },
  {
    from: 12,
    to: 17,
    options: [
      g("Good afternoon"),
      g("How was class", "?"),
      g("Back at it"),
      g("Afternoon focus"),
      g("Keep the momentum going"),
    ],
  },
  {
    from: 17,
    to: 21,
    options: [
      g("Good evening"),
      g("Evening review time"),
      g("Winding down"),
      g("Let's make today's notes stick"),
      g("Ready to review", "?"),
    ],
  },
  {
    from: 21,
    to: 24,
    options: [
      g("Late study session"),
      g("Good evening"),
      g("Night shift"),
      g("A little revision before bed", "?"),
    ],
  },
];

// Extra options on particular days (0 = Sunday).
const BY_DAY: Record<number, Greeting[]> = {
  0: [g("Sunday study session"), g("Getting ahead for the week", "?")],
  1: [g("Fresh week ahead"), g("Happy Monday")],
  3: [g("Halfway through the week")],
  5: [g("Happy Friday"), g("Almost the weekend")],
  6: [g("Weekend study session"), g("Saturday revision")],
};

const LAST_KEY = "lectureloop:last-greeting";

export function greetingOptions(now = new Date()): Greeting[] {
  const h = now.getHours();
  const time = BY_TIME.find((t) => h >= t.from && h < t.to)?.options ?? [g("Hello")];
  return [...time, ...(BY_DAY[now.getDay()] ?? [])];
}

/** Picks a greeting for now, avoiding the one shown last time on this device. */
export function pickGreeting(now = new Date(), random = Math.random): Greeting {
  const options = greetingOptions(now);
  let last = "";
  try {
    last = localStorage.getItem(LAST_KEY) ?? "";
  } catch {
    /* storage unavailable */
  }
  const fresh = options.filter((o) => o.lead !== last);
  const pool = fresh.length ? fresh : options;
  return pool[Math.floor(random() * pool.length)] ?? options[0]!;
}

/** Remembers the greeting that was shown, so the next visit gets a different one. */
export function rememberGreeting(greeting: Greeting) {
  try {
    localStorage.setItem(LAST_KEY, greeting.lead);
  } catch {
    /* storage unavailable */
  }
}
