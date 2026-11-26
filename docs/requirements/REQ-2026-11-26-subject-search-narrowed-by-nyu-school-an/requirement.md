# REQ-2026-11-26-subject-search-narrowed-by-nyu-school-an: Subject search narrowed by NYU school and program

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-subject-search-narrowed-by-nyu-school-an            |
| Status       | Ready for build   |
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
| 2026-11-26T15:14:40Z | Requirement analyst | Requirement created | Subject search narrowed by NYU school and program |
| 2026-11-26T15:15:09Z | Requirement analyst | Requirement ready for build | 11 ACs; all NYU schools; preview approved by user; branch claude/subject-search-by-school stacked on claude/semester-subjects-fix |
