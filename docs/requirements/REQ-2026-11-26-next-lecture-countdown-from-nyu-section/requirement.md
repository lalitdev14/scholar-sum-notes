# REQ-2026-11-26-next-lecture-countdown-from-nyu-section: Next lecture countdown from NYU section

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-next-lecture-countdown-from-nyu-section            |
| Status       | In test           |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/next-lecture-countdown` |
| PR           | (added in step 6) |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> 21 (Next-lecture countdown) from the motion preview; class times come from the student picking their NYU section (user chose 'Pick NYU section')

## 2. Problem / goal

Students want to see at a glance when their next lecture starts. LectureLoop doesn't store class
times. The product owner chose to get them from NYU: the student picks **their section** of
each class from NYU's class search, which includes meeting days/times and term dates. The home
page then shows a split-flap countdown to the next lecture (preview item 21:
https://claude.ai/artifact/XcvCXJFiN7swfTdvRhk9XL).

## 3. Scope

**In scope**

- Server function returning a course's sections for a term from NYU class search (FOSE), with
  section number, meeting text (e.g. "T 4:55-6:55p"), parsed meeting days/times, start/end
  dates, instructor.
- A way for the student to pick their section for each enrolled class: in the "Your subjects
  this semester" dialog when adding, and from the class page / "Your classes" for existing
  classes ("Set your section" / change).
- Storing the chosen section per student per class (new table, own-rows-only RLS).
- Home page countdown card: next lecture across the student's classes, shown with split-flap
  digits (HH:MM:SS) when it starts within 24 h, otherwise day + time (e.g. "Thu 2:00 pm");
  "Happening now · ends in …" during a lecture.

**Out of scope**

- Recitations/labs (sections other than the chosen one), room numbers (FOSE search has none),
  calendar export, notifications.
- Holidays/cancelled days beyond the term start/end dates.

## 4. User stories

- As a student, I want to pick my NYU section once, so that LectureLoop knows when my class meets.
- As a student, I want a countdown to my next lecture on the home page, so that I know how
  long I have.

## 5. Acceptance criteria

| ID    | Criterion |
| ----- | --------- |
| AC-1  | A signed-in-only server function returns the sections of a course code for a term from NYU class search: section no., type (e.g. LEC), meeting text, parsed weekly meetings (day + start/end time), start/end dates, instructor. Times without `meetingTimes` are parsed from the meeting text (e.g. "TR 2-3:15p", "M 2-4:30p", "T 11a-1:30p"); unparseable/"TBA" sections are returned with no meetings. |
| AC-2  | In the subjects dialog, after adding a course, the student can choose its section from a list showing section no., days/times and instructor; choosing is optional. |
| AC-3  | For an already-enrolled class, the student can set or change their section from the class page or the "Your classes" list. |
| AC-4  | The chosen section (class, term, section no., meeting text, meetings, start/end dates) is saved per student per class in a new table; students can only read/write their own rows (RLS). Removing a class from "Your classes" removes its saved section. |
| AC-5  | The home page shows a "Next lecture" card for the soonest upcoming meeting across classes with a saved section, within the section's start/end dates, computed in New York time (America/New_York), correct across daylight-saving changes. |
| AC-6  | If the next lecture starts within 24 h, the card shows "<Class> starts in" with HH:MM:SS split-flap digits that tick every second, each digit flipping only when it changes; otherwise it shows the day and time (e.g. "Thu 2:00 pm"). |
| AC-7  | During a lecture the card shows "<Class> · happening now · ends in MM:SS" (or similar), then moves to the next lecture when it ends. |
| AC-8  | With no saved sections, the card invites the student to set their sections (links to the action from AC-2/3) instead of a countdown; with sections but none upcoming (e.g. term over), it says so. |
| AC-9  | With "reduce motion" on, the digits update without the flip animation. The card is readable by screen readers (time announced in words, not every second). |
| AC-10 | NYU lookup failure shows a clear message with Try again; it never blocks adding the class. |
| AC-11 | Works at 390 px; existing subjects dialog and home page behaviour unchanged otherwise; typecheck, unit tests (meeting-text parser, next-lecture calculation incl. DST) and build pass. |

## 6. Design / technical notes

- **NYU data:** the existing FOSE search (`src/lib/nyu-courses.server.ts`) returns sections
  with `no`, `schd`, `meets` (e.g. "T 4:55-6:55p"), `meetingTimes` (JSON
  `[{meet_day:"1",start_time:"1655",end_time:"1855"}]`, meet_day 0 = Monday; often empty),
  `instr`, `start_date`, `end_date`, `srcdb`. Search by the course code and filter exact code.
- **Migration** `supabase/migrations/<timestamp>_class_sections.sql` (additive only, safe for
  live code): table `public.class_sections` (id, user_id → auth.users, class_id → classes,
  term text, section_no text, schedule_type text, meets text, meetings jsonb, start_date date,
  end_date date, created_at, updated_at, unique (user_id, class_id)); RLS: own rows only for
  select/insert/update/delete. Update `src/integrations/supabase/types.ts`.
  **Pre-prod shares the live database: the product owner must run this SQL in Supabase before
  the PR is merged (DEPLOYMENT.md).**
- Next-lecture calculation in a pure, unit-tested module (e.g. `src/lib/next-lecture.ts`).
- Split-flap visual from the preview (CSS 3D flip), Lively strength.

## 7. Build summary (developer)

Code commit `154014b` on `claude/next-lecture-countdown`.

**Database (must be run in Supabase before merge):**
`supabase/migrations/20261126120000_class_sections.sql` — additive: table
`public.class_sections` (unique `(user_id, class_id)`), grants, RLS own-rows policies for
select/insert/update/delete, index on `class_id`, `updated_at` trigger, and an
`AFTER DELETE` trigger on `enrollments` that removes the student's saved section for that
class. `src/integrations/supabase/types.ts` updated by hand.

| AC | How it is met |
| -- | ------------- |
| AC-1 | `getNyuSections` (`src/lib/nyu-courses.functions.ts`, `requireSupabaseAuth`, input `{code, term}` validated by `NyuSectionsInput`) runs the FOSE keyword search for the code and keeps exact-code, non-cancelled sections (`toSections` in `nyu-courses.server.ts`): `no`, `type`, `meets`, `meetings` (from `meetingTimes`, else parsed from the text by `src/lib/meeting-times.ts`), `startDate`, `endDate`, `instructor`, `term`. "TBA"/unreadable text gives `meetings: []`. |
| AC-2 | `SemesterSubjectsDialog`: under "To add", each chosen course gets an optional "Choose section" button (`PendingSectionsList` / `SectionPickerDialog` in `src/components/SectionPicker.tsx`) listing section no., type, days/times, instructor and dates. Picked sections are saved after Done adds the classes; skipping is fine. |
| AC-3 | `ClassSectionButton` ("Set your section" / "Section A · T 11a-1:30p") on the class page header and on each row of "Your classes" in the subjects dialog; saves immediately (upsert), "No section" clears it. |
| AC-4 | Stored in `class_sections` (term id, section no., type, meets, meetings jsonb, start/end dates); own rows only. Removing a class (subjects dialog or dashboard) deletes its row from the client and via the enrollment-delete trigger. |
| AC-5 | `NextLectureCard` on the home page (`WelcomeHome`) uses `findNextLecture` (`src/lib/next-lecture.ts`): New York wall times converted to instants with `Intl` (DST-safe), only days between the section's start and end dates. |
| AC-6 | Within 24 h: "<Class> starts in" + `SplitFlap` HH:MM:SS ticking every second, each digit flipping only when it changes; otherwise class name + "Thu 2:00 pm" (with the date when more than 6 days away). |
| AC-7 | During a lecture: "<Class> · happening now · ends in" + MM:SS (H:MM:SS if an hour or more); recomputed every second so it moves to the next lecture when it ends. |
| AC-8 | No saved sections: invite with "Set your sections" (opens the subjects dialog). Sections but none upcoming: "No upcoming lectures". |
| AC-9 | Flip animation disabled under `prefers-reduced-motion` (JS and CSS). Digits are `aria-hidden`; a visually hidden sentence gives the time in words, changing once a minute, no live region. |
| AC-10 | Section lookup failure shows "We couldn't reach NYU's class search" with Try again inside the picker; adding classes never waits on it. |
| AC-11 | Flaps fit 390 px (smaller under 360 px); dialog/home otherwise unchanged. Typecheck, `bun test src` (55 tests incl. parser, DST, term dates, FOSE sample) and build pass. |

## 8. Test summary (tester)

| Total | Pass | Fail | Blocked | Evidence             |
| ----- | ---- | ---- | ------- | -------------------- |
|       |      |      |         | `test-evidence.xlsx` |

## 9. Product manager verification

| Field       | Value                          |
| ----------- | ------------------------------ |
| Decision    | (Approved / Changes requested) |
| Verified by | Product manager agent          |
| Date        |                                |

Notes per acceptance criterion:

| AC   | Met? | Notes |
| ---- | ---- | ----- |
| AC-1 |      |       |

## 10. Audit trail

Append rows with `node scripts/req/audit.mjs <folder> "<Role>" "<Action>" "<Details>"`.

| Time (UTC) | Role | Action | Details |
| ---------- | ---- | ------ | ------- |
| 2026-11-26T17:24:00Z | Requirement analyst | Requirement created | Next lecture countdown from NYU section |
| 2026-11-26T17:24:54Z | Requirement analyst | Requirement ready for build | 11 ACs; product owner chose 'Pick NYU section'; needs additive migration run in Supabase before merge |
| 2026-11-26T17:26:53Z | Test master | Test cases written | 28 cases covering AC-1..AC-11 |
| 2026-11-26T20:33:12Z | Developer | Build complete | Commit 154014b: getNyuSections, meeting parser + next-lecture (NY/DST) with tests, class_sections migration 20261126120000 + types, SectionPicker in subjects dialog/class page, Next lecture split-flap card; typecheck, 55 unit tests, build pass |
