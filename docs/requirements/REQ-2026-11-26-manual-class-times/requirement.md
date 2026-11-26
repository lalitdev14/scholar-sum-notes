# REQ-2026-11-26-manual-class-times: Manual class times

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-manual-class-times            |
| Status       | Ready for build   |
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

What was changed and how each acceptance criterion is met.

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
