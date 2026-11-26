# REQ-2026-11-26-manual-class-times: Manual class times

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-manual-class-times            |
| Status       | In PM review      |
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
| 22    | 22   | 0    | 0       | `test-evidence.xlsx` |

Run on 2026-11-26 against a local production build (`bun run build`, `node .output/server/index.mjs`
on port 8093) with a fake session and Playwright mocks for Supabase REST/auth and the NYU server
functions (no real accounts, no real Supabase or NYU). Home-card cases fake "now" in New York time
with the browser time zone set to UTC; TC-20 at 390×844 in light and dark. TC-22: typecheck, 84 unit
tests (19 in `manual-schedule.test.ts`) and build pass.

**Re-test after PM review** (2026-11-26, `0f3f212`, after developer commit 8d9c1a5): TC-01, TC-02,
TC-11, TC-16, TC-20 and TC-22 re-run on a fresh production build. All pass.

- Change 1 (TC-16): clearing manual times now toasts "Cleared your class times for Database
  Systems". Clearing an NYU section still toasts "Section cleared for Database Systems".
- Change 2 (TC-20): the home "Next lecture" card was checked at 390 px in light and dark, in every
  state reachable (loading, invite, none, countdown, happening now, later). In dark theme the card
  is dark (rgb(26, 24, 32)) with body text at 5.15:1 or more. Light theme is unchanged (white card,
  lowest body text 4.62:1). Only the 30 px split-flap colons sit below 4.5:1 in light theme
  (3.41:1). That meets the 3:1 rule for large text, and they come from the unchanged SplitFlap
  component. Screenshots: `evidence/TC-20-9.png` to `TC-20-20.png`.
- Change 3 (TC-01, TC-02): the NYU error and "no sections" states each show exactly one "Enter
  times manually" link (the inline one). The footer link `section-manual` is hidden in those
  states and still shows when NYU sections are listed.
- Regressions: TC-11 countdown unchanged. Typecheck, 84 unit tests and build pass.

Remaining observation (not a failure, accepted by the PM): a new untouched meeting shows its errors
once the student works on it, and Save stays disabled meanwhile.

## 9. Product manager verification

| Field       | Value                          |
| ----------- | ------------------------------ |
| Decision    | Changes requested              |
| Verified by | Product manager agent          |
| Date        | 2026-11-26                     |

The feature does what the user asked ("add an option for manual class time addition"). The option is easy to find from every picker. The form is clear, validates input and saves times that the countdown then uses. All 9 ACs pass on the evidence (22/22 test cases). Three small changes are needed before the PR, all about copy and visual polish. None of them needs new behaviour or a database change.

Notes per acceptance criterion:

| AC   | Met? | Notes |
| ---- | ---- | ----- |
| AC-1 | Yes  | TC-01/02: "Enter times manually" shows on the class page, in "Your classes" and under "To add", and in the NYU error and "no sections" states. In those two states the link appears twice (inline and in the footer), see change 3. |
| AC-2 | Yes  | TC-03/04/05: Mon–Sun chips, start/end time, up to 5 meetings (then disabled with a note), Remove, optional term dates. |
| AC-3 | Yes  | TC-06/07/08: errors appear under the day chips, the end time and the last day, with clear wording. Save stays disabled until the form is valid. A blank meeting that was just added shows its errors only once touched, and Save is disabled meanwhile. That is acceptable, no change. |
| AC-4 | Yes  | TC-05/09/10: one row per student and class (an NYU section is replaced). `section_no` 'Manual' / `schedule_type` 'MANUAL'. No migration. "Your times · Tue, Thu 2:00–3:15 pm" appears on the class header, "Your classes", "To add" and the home card. |
| AC-5 | Yes  | TC-11/12/13: same countdown, happening-now and day + time output as an NYU section. Term dates are respected, in New York time. The hydration warning in TC-13 comes from the faked 2027 browser clock, not the product. |
| AC-6 | Yes  | TC-14/15/16: the form reopens pre-filled. Edits save. "Pick an NYU section instead" replaces the manual times. "Clear times" removes them. The toast copy after clearing is wrong, see change 1. |
| AC-7 | Yes  | TC-17/18: times set under "To add" are kept until Done, then saved after enrolling. Removing the course discards them. |
| AC-8 | Yes  | TC-19/20: day chips are toggle buttons with aria-pressed and full day names. Inputs are labelled and errors are linked to their fields. Keyboard path works. At 390 px there is no horizontal scroll in light or dark, and long labels truncate. The home card that shows the manual label stays white in dark theme, see change 2. |
| AC-9 | Yes  | TC-21/22: NYU picking, countdown and subjects dialog unchanged. Typecheck, 84 unit tests (19 new) and build pass. |

Changes requested:

1. **Clear-times toast copy.** When the student clears *manual times*, the toast must say "Cleared your class times for <subject>", not "Section cleared for <subject>". Keep "Section cleared for …" when an NYU section is cleared.
2. **Home "Next lecture" card in dark theme.** `NextLectureCard.tsx` is already changed on this branch, and its detail line is where this feature's "Your times · …" label appears on Home. It uses hard-coded light colours (`bg-white`, `border-[#ebe8f0]`, `text-[#17151c]`, `text-[#6b6874]`, `text-[#5c5965]`, `text-[#77737f]`). Switch these to theme tokens (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, or equivalents) for every state: loading, invite, none, countdown, later and happening now. The card must match the other dark-theme cards and keep readable contrast (≥ 4.5:1 for body text). Light theme must look unchanged.
3. **Duplicate "Enter times manually" link.** In the NYU error state and the "no sections" state, the picker shows the link twice (inline and in the footer). Show it once: hide the footer link while the inline one is visible. Keep the inline one, because its sentence explains why.

Re-test after the fix: TC-16 (toast text), TC-20 (home card at 390 px in dark and light), TC-02 (exactly one "Enter times manually" link in each state), and a quick regression of TC-01 and TC-11.

## 10. Audit trail

Append rows with `node scripts/req/audit.mjs <folder> "<Role>" "<Action>" "<Details>"`.

| Time (UTC) | Role | Action | Details |
| ---------- | ---- | ------ | ------- |
| 2026-11-26T22:26:44Z | Requirement analyst | Requirement created | Manual class times |
| 2026-11-26T22:27:03Z | Requirement analyst | Requirement ready for build | 9 ACs; reuse class_sections, no migration |
| 2026-11-26T22:28:10Z | Test master | Test cases written | 22 cases covering AC-1..AC-9 |
| 2026-11-26T22:32:29Z | Developer | Build complete | Manual times form in SectionPicker, saved as section_no Manual/schedule_type MANUAL; manual-schedule.ts + 19 unit tests; typecheck, bun test (84), build pass |
| 2026-11-26T22:45:25Z | Tester | Tests executed | 22 run: 22 passed, 0 failed, 0 blocked (local production build, mocked Supabase and NYU) |
| 2026-11-26T22:45:25Z | Tester | Evidence generated | test-evidence.xlsx with 57 screenshots in evidence/ |
| 2026-11-26T22:47:26Z | Product manager | PM requested changes | AC-1..AC-9 met on evidence (22/22). Changes: 1) clear-manual-times toast copy; 2) NextLectureCard theme tokens for dark mode (card shows the manual label on Home); 3) show one Enter times manually link in error/no-sections states. Hydration warning and touched-only errors accepted. |
| 2026-11-26T22:48:58Z | Developer | Changes after PM review | 1) clearing manual times toasts 'Cleared your class times for <subject>'; 2) NextLectureCard uses home theme tokens (home-block/line/ink/label/body/muted, home-accent) in all states, light unchanged, dark text >= 4.5:1; 3) footer 'Enter times manually' hidden in NYU error/no-sections states. typecheck, bun test (84), build pass |
| 2026-11-26T22:52:52Z | Tester | Re-test after PM review | 6 re-run (TC-01, TC-02, TC-11, TC-16, TC-20, TC-22): 6 passed, 0 failed, 0 blocked; overall 22/22 pass |
