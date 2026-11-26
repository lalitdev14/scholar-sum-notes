# REQ-2026-11-26-manual-class-times: Manual class times

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-manual-class-times            |
| Status       | In test           |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/manual-class-times` |
| PR           | (added in step 6) |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> addd a option for manual class time addition

## 2. Problem / goal

The next-lecture countdown (REQ-2026-11-26-next-lecture-countdown-from-nyu-section) only gets
class times from the student's NYU section. That fails when NYU's search is down, the section
isn't listed or shows "TBA", the class isn't an NYU class-search course, or the student's real
times differ (e.g. a recitation they care about). Students need to type in their class times
themselves.

## 3. Scope

**In scope**

- In the section picker (opened from "Set your section" on the class page, in "Your classes",
  and under "To add" in the subjects dialog), an **"Enter times manually"** option.
- Manual entry: one or more weekly meetings, each with days of the week (multi-select chips
  Mon–Sun), start time and end time; optional first and last day of classes (term dates).
- Saved the same way as an NYU section (one schedule per student per class), so the home
  countdown uses it unchanged; the saved label shows the manual times (e.g. "Your times ·
  Tue, Thu 2:00–3:15 pm").
- Editing manual times later (pre-filled) and switching back to an NYU section, or clearing.

**Out of scope**

- One-off/irregular sessions, holidays, multiple time zones (all times are New York time).
- Database changes (reuse `class_sections`).

## 4. User stories

- As a student whose section isn't on NYU's search, I want to type my class days and times,
  so that the countdown still works.
- As a student, I want to fix wrong times myself, so that the countdown is right.

## 5. Acceptance criteria

| ID    | Criterion |
| ----- | --------- |
| AC-1  | Wherever the section picker opens, it offers "Enter times manually"; it is also offered in the picker's NYU error and "no sections" states. |
| AC-2  | The manual form lets the student pick one or more days (Mon–Sun), a start time and an end time for a meeting, add another meeting (up to 5) and remove one; optional first/last day of classes. |
| AC-3  | Validation: at least one day per meeting, end time after start time, last day not before first day; errors are shown next to the field and Save stays disabled until valid. |
| AC-4  | Saving stores the manual schedule for that student and class (replacing any NYU section); no database migration is needed. The class shows "Your times · <days> <start–end>" wherever the saved section label appears. |
| AC-5  | The home "Next lecture" card uses manual times exactly like NYU section times (countdown within 24 h, day + time otherwise, happening now, term dates respected, New York time). |
| AC-6  | Reopening the picker for a class with manual times opens the manual form pre-filled; the student can edit, switch to picking an NYU section (which replaces the manual times), or clear. |
| AC-7  | Under "To add" in the subjects dialog, manual times can be set for a course before Done and are saved after the class is added/enrolled. |
| AC-8  | Keyboard and screen-reader usable (day chips are toggle buttons with pressed state; times are labelled inputs); works at 390 px with no horizontal scroll. |
| AC-9  | No regressions in NYU section picking, the countdown or the subjects dialog; typecheck, unit tests (manual schedule → meetings conversion and validation) and build pass. |

## 6. Design / technical notes

- Reuse `public.class_sections`: `section_no = 'Manual'`, `schedule_type = 'MANUAL'`, `meets`
  = generated human text (e.g. "TR 2-3:15p" style or "Tue, Thu 2:00–3:15 pm", ≤200 chars),
  `meetings` = `[{day,start,end}]` (0 = Monday, minutes), `term` = the selected term id (or
  the current term), start/end dates optional.
- Files: `src/components/SectionPicker.tsx`, `src/lib/class-sections.ts`, `src/lib/meeting-times.ts`
  (+ tests), labels where sections are shown (class page header button, "Your classes",
  "To add", home card).
- Use native `<input type="time">` / `<input type="date">` (good on iPad/phones).

## 7. Build summary (developer)

Files: `src/lib/manual-schedule.ts` (new, pure helpers) + `src/lib/manual-schedule.test.ts`
(19 unit tests), `src/components/SectionPicker.tsx`, `src/components/NextLectureCard.tsx`.
No database migration; `class_sections` is reused.

- **AC-1** The section picker (class page "Set your section", "Your classes", "To add") has an
  "Enter times manually" link in its footer (`section-manual`), in the NYU error box
  (`section-manual-error`) and in the "no sections" state (`section-manual-empty`).
- **AC-2** Manual form (`manual-form`): per meeting, Mon–Sun day chips, start and end
  `<input type="time">`; "Add another meeting" up to 5 (then disabled with a note); Remove on
  each meeting when there is more than one; optional first/last day of classes
  (`<input type="date">`).
- **AC-3** `validateManual()`: at least one day, start and end required, end after start,
  last day not before first day (and real dates). Errors appear under the field once it has
  been touched (`aria-invalid` + `aria-describedby`); "Save times" is disabled until valid.
- **AC-4** Save upserts `class_sections` (one row per student + class, replacing any NYU
  section) with `section_no 'Manual'`, `schedule_type 'MANUAL'`, `meets` = generated text such
  as "Tue, Thu 2:00–3:15 pm" (≤200 chars), `meetings` = `[{day,start,end}]` (0 = Monday,
  minutes), `term` = the picker's selected/current term, optional `start_date`/`end_date`.
  Labels (class page button, "Your classes", "To add" button) read
  "Your times · Tue, Thu 2:00–3:15 pm".
- **AC-5** The home card reads the same rows, so `findNextLecture` handles manual times as is
  (New York time, term dates, now/soon/later). Its detail line shows
  "CODE · Your times · Tue, Thu 2:00–3:15 pm" instead of a section number.
- **AC-6** A class with manual times opens the picker on the manual form, pre-filled
  (meetings with the same times share one row). "Pick an NYU section instead" switches to the
  NYU list (picking one replaces the manual row via upsert); "Clear times" deletes it.
- **AC-7** In the subjects dialog the "To add" picker returns the manual schedule as a section
  object, kept until Done and saved by the existing `savePendingSections` after enrolling.
- **AC-8** Day chips are `<button aria-pressed>` with full day names as accessible names inside
  a labelled group; time/date inputs have `<label>`s. Chips wrap and inputs use `min-w-0`, so
  390 px has no horizontal scroll. Theme tokens (`primary`, `muted`, `card`, `destructive`)
  for light/dark; the NYU error box got dark variants. Motion uses the shared tokens
  (`motion-rise`, `motion-fade-in`, chip press scale) and is removed under reduced motion.
- **AC-9** NYU picking path unchanged apart from the extra link; `bun run typecheck`,
  `bun test src` (84 pass) and `bun run build` pass; prettier clean on changed files.

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
| 2026-11-26T22:26:44Z | Requirement analyst | Requirement created | Manual class times |
| 2026-11-26T22:27:03Z | Requirement analyst | Requirement ready for build | 9 ACs; reuse class_sections, no migration |
| 2026-11-26T22:28:10Z | Test master | Test cases written | 22 cases covering AC-1..AC-9 |
| 2026-11-26T22:32:29Z | Developer | Build complete | Manual times form in SectionPicker, saved as section_no Manual/schedule_type MANUAL; manual-schedule.ts + 19 unit tests; typecheck, bun test (84), build pass |
