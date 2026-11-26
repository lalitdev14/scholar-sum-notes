# REQ-2026-11-26-subject-search-narrowed-by-nyu-school-an: Subject search narrowed by NYU school and program

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-subject-search-narrowed-by-nyu-school-an            |
| Status       | In PM review      |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/subject-search-by-school` |
| PR           | (added in step 6) |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> lets narrow down the search, as student to select the school they are in NYU along with course , they will select school first then based on school course will load and then give field to type the name of subject with term and in subject suggestion top result will be of subject from the selected school , and list will still open to any cross registration that means if a courant student typing a stern subject it should be there in suggestion list. (After preview approval:) add all schools to it and implemnt the change it looks good to me

## 2. Problem / goal

The "Your subjects this semester" dialog (REQ-2026-11-26-semester-subjects-form-with-nyu-code-loo)
searches all of NYU at once, so a search like "machine learning" or "algorithms" mixes courses
from every school in arbitrary order and the student has to hunt for their own school's
version. Students should first say which NYU school and program they are in, and the search
should then put their own school's courses at the top, while still listing other schools'
courses below so cross-registration (e.g. a Courant student taking a Stern class) works.

The interactive preview the user approved: https://claude.ai/artifact/4XyDVLdwAbnLEHVrgHecqm.
The user asked for **all NYU schools** to be included.

## 3. Scope

**In scope**

- Step 1 in the dialog: a "Your NYU school" select listing all NYU schools (see 6.1).
- Step 2: a "Your program" select whose options load from the chosen school (a fixed list per
  school kept in the app, plus an "Other / undeclared" option).
- Step 3: the existing subject search box and term select, enabled once a school is chosen.
- Results grouped: "From <school>" first, then "Other NYU schools · cross-registration", each
  cross-registration row tagged with its school's short name.
- The chosen school and program are remembered for the student and pre-filled next time.
- Everything else in the dialog (Add/Added, To add list, Your classes, Remove, Done,
  errors) keeps working as today.

**Out of scope**

- Filtering out other schools' courses (they must stay visible).
- Changing NYU's search itself, or the terms list.
- Validating that a student really belongs to the school.
- Using the program to rank results (school only).

## 4. User stories

- As a student, I want to pick my NYU school and program first, so that the subject
  suggestions show my school's courses at the top.
- As a student cross-registering, I want other schools' courses still in the list, so that I
  can add a Stern class while studying at Courant.
- As a returning student, I want my school and program remembered, so that I don't pick them
  every time I open "My subjects".

## 5. Acceptance criteria

| ID    | Criterion |
| ----- | --------- |
| AC-1  | The dialog shows three numbered steps in order: 1 "Your NYU school", 2 "Your program", 3 the subject search with the term select. |
| AC-2  | The school select lists every NYU school in 6.1 (at least 20), each by its full name. |
| AC-3  | Before a school is chosen, the program select and the subject search are disabled and a hint says to choose a school first. |
| AC-4  | Choosing a school loads that school's programs into the program select (including "Other / undeclared"); changing the school replaces the list and resets the program. |
| AC-5  | Search results from the chosen school are listed first under a heading "From <school short name>". |
| AC-6  | Results from other NYU schools are still listed, below, under the heading "Other NYU schools · cross-registration", each tagged with its school's short name (e.g. a Courant student searching "accounting" sees ACCT-UB courses tagged "Stern"). Courses whose school can't be determined go in this group with no tag. |
| AC-7  | Changing the school while results are shown re-groups the same results immediately without a new search. |
| AC-8  | Within each group, results keep the order NYU's search returned. If no result matches the chosen school, only the cross-registration group is shown (no empty heading). |
| AC-9  | The chosen school and program are saved for the student's account and pre-filled the next time the dialog opens (also on another device). |
| AC-10 | The existing behaviour still works: debounced search, term select, Add/Added, To add list, Your classes with Remove, Done adding/enrolling, error box with Try again, focus return. |
| AC-11 | The dialog works at phone width (390 px): no horizontal scroll, the selects and search are usable. |

## 6. Design / technical notes

### 6.1 Schools and how a course code maps to a school

NYU course codes are `SUBJECT-XX NNNN`; the suffix after the dash identifies the school.
Keep the table in one module (e.g. `src/lib/nyu-schools.ts`), with programs per school.

| School (short name) | Codes |
| --- | --- |
| College of Arts & Science (CAS) | `-UA`, except Courant subjects |
| Courant Institute (Courant) | `CSCI-UA/GA`, `MATH-UA/GA`, `DS-UA/GA` |
| Graduate School of Arts & Science (GSAS) | `-GA`, except Courant subjects and IFA/ISAW subjects |
| Stern School of Business (Stern) | `-UB`, `-GB` |
| Tandon School of Engineering (Tandon) | `-UY`, `-GY` |
| Steinhardt (Steinhardt) | `-UE`, `-GE` |
| Tisch School of the Arts (Tisch) | `-UT`, `-GT` |
| Gallatin School of Individualized Study (Gallatin) | `-UG`, `-GG` |
| School of Professional Studies (SPS) | `-UC`, `-GC`, `-CE` |
| Silver School of Social Work (Silver) | `-US`, `-GS` |
| Wagner Graduate School of Public Service (Wagner) | `-GP` |
| School of Global Public Health (GPH) | `-UU`, `-GU` |
| Rory Meyers College of Nursing (Meyers) | `-UN`, `-GN` |
| College of Dentistry (Dentistry) | `-UD`, `-DN` |
| Grossman School of Medicine (Grossman) | `-GM`, `-MD` |
| Grossman Long Island School of Medicine (NYU Long Island) | `-LI` |
| School of Law (Law) | `-LW` |
| Liberal Studies (Liberal Studies) | `-UF` |
| Institute of Fine Arts (IFA) | `FINH-GA`, `FIAR-GA`, `CONS-GA` |
| Institute for the Study of the Ancient World (ISAW) | `ISAW-GA` |
| NYU Abu Dhabi (Abu Dhabi) | `-UH`, `-AD` |
| NYU Shanghai (Shanghai) | `-SHU` |

The ranking runs on the results the existing server function already returns (no change to
NYU's search); grouping happens in the dialog, so changing the school regroups instantly.

### 6.2 Remembering the choice

No database migration (pre-prod shares the live database): save `{ nyu_school, nyu_program }`
in the Supabase auth user metadata (`supabase.auth.updateUser({ data })`) when the student
picks them, and read them from the session user when the dialog opens.

### 6.3 Files

- `src/components/SemesterSubjectsDialog.tsx` — steps 1–2, grouping, disabled state.
- New `src/lib/nyu-schools.ts` (+ bun unit tests for the code → school mapping).
- Built on top of `claude/semester-subjects-fix` (approved, PR not yet raised) because it
  changes the same dialog.

### 6.4 Risks

- A school's suffix list may miss a rare code; such courses fall into the cross-registration
  group with no tag, so nothing is hidden.

## 7. Build summary (developer)

Code commit `b916579` on `claude/subject-search-by-school`.

**Files**

- New `src/lib/nyu-schools.ts`: `NYU_SCHOOLS` (22 schools from 6.1: id, full name, short name,
  2–10 real programs each, code suffixes and exact `SUBJECT-SUFFIX` prefixes),
  `schoolForCode(code)` (prefix rules win: Courant `CSCI/MATH/DS-UA/GA`, IFA `FINH/FIAR/CONS-GA`,
  ISAW `ISAW-GA`; then the suffix after the dash; unknown → `null`), `programsFor(id)` (programs +
  "Other / undeclared"), `schoolById`, and `groupBySchool(results, schoolId)`.
- New `src/lib/nyu-schools.test.ts`: 10 bun tests (mapping for every school, case/dot handling,
  unknown → null, table sanity, grouping order).
- `src/components/SemesterSubjectsDialog.tsx`: steps 1–2, disabled state and hint, grouped
  results, remembering the choice.

**How each AC is met**

| AC | How |
| --- | --- |
| AC-1 | Labels with numbered badges: 1 "Your NYU school", 2 "Your program" (side by side ≥ sm, stacked on phones), then 3 "Subject name" + "Term". |
| AC-2 | School select lists all 22 entries of `NYU_SCHOOLS` by full name. |
| AC-3 | Without a school the program select, subject input and term select are `disabled`; hint "Choose your school first to search subjects." (`data-testid="school-hint"`) and program placeholder "Choose a school first". The NYU search query is also not enabled without a school. |
| AC-4 | Program options come from `programsFor(school)` (ending with "Other / undeclared"); choosing a different school resets the program to empty (placeholder "Choose your program"). |
| AC-5 | `groupBySchool` puts courses whose `schoolForCode` matches the chosen school under heading "From <short name>" (`data-testid="nyu-group-own"`), shown first. |
| AC-6 | All other courses under "Other NYU schools · cross-registration" (`data-testid="nyu-group-other"`), each with a small outline badge of the school short name (`data-testid="school-tag"`); unknown codes get no badge. |
| AC-7 | Grouping is computed at render from the cached search results and the current school; the search query key does not include the school, so changing school regroups with no new request. |
| AC-8 | `groupBySchool` keeps input order inside each group; a group with no rows is not rendered (no empty heading). |
| AC-9 | On every pick, `supabase.auth.updateUser({ data: { nyu_school, nyu_program } })` (school change saves `nyu_program: null`); failures only `console.warn`. On open the dialog reads `user_metadata` from `getSession()` and then from `getUser()` (fresh, covers another device) and pre-fills school/program (unknown ids or programs ignored; a pick made during this opening is never overwritten by a late read). |
| AC-10 | Search debounce, term select, Add/Added, To add chips, Your classes + Remove confirm, Done/Done · add N, error box with Try again and focus return are unchanged (same row markup, now rendered by a shared `renderRow`). `data-testid="nyu-results"` now wraps both groups. |
| AC-11 | Selects stack in one column below `sm`; triggers are `min-w-0` (long names clamp to one line) and dropdowns are capped at `100vw - 2rem` wide and `max-h-72` tall. |

**Checks**: `bun run typecheck` pass; `bun test src` 16 pass / 0 fail; `bun run build` pass;
`prettier --check` and `eslint` clean on the 3 changed files.

## 8. Test summary (tester)

| Total | Pass | Fail | Blocked | Evidence             |
| ----- | ---- | ---- | ------- | -------------------- |
| 23    | 23   | 0    | 0       | `test-evidence.xlsx` |

Run on 2026-11-26 against a local production build (`node .output/server/index.mjs`, commit `7d5d7da`)
with mocked Supabase (auth user metadata, REST) and mocked NYU search server functions; Chromium
1280x900 and 390x844. Note for PM: TC-20 (save of school/program fails) passes against the ACs, but
the failure is only logged in the browser console (`[subjects] could not save school`); the student
sees no message, whereas the test case wording says the failure is "reported".

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
| 2026-11-26T15:14:40Z | Requirement analyst | Requirement created | Subject search narrowed by NYU school and program |
| 2026-11-26T15:15:09Z | Requirement analyst | Requirement ready for build | 11 ACs; all NYU schools; preview approved by user; branch claude/subject-search-by-school stacked on claude/semester-subjects-fix |
| 2026-11-26T15:16:31Z | Test master | Test cases written | 23 cases covering AC-1..AC-11 |
| 2026-11-26T15:19:43Z | Developer | Build complete | Commit b916579: nyu-schools.ts (22 schools, schoolForCode, groupBySchool) + bun tests; dialog steps 1-3, grouped results, school/program saved in auth user_metadata; typecheck/tests/build pass |
| 2026-11-26T15:29:33Z | Tester | Tests executed | 23 passed, 0 failed, 0 blocked (local production build, mocked Supabase and NYU search). TC-20: failed save of school is only console-logged, no UI message |
| 2026-11-26T15:29:33Z | Tester | Evidence generated | test-results.json, 26 screenshots in evidence/, test-evidence.xlsx |
