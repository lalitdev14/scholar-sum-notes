# REQ-2026-11-26-courant-program-list-complete: Courant program list complete

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-courant-program-list-complete            |
| Status       | Ready for build   |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/courant-programs` |
| PR           | (added in step 6) |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> check for any course which is missing ... add all (add the 13 missing Courant programs and the new school name)

## 2. Problem / goal

Courant's program list in the "Your subjects this semester" dialog (step 2) only had 9 programs;
13 current Courant programs were missing (e.g. Information Systems MS), and NYU has renamed the
school to "Courant Institute School of Mathematics, Computing, and Data Science".

## 3. Scope

**In scope:** Courant entry in `src/lib/nyu-schools.ts` only: full name and program list.

**Out of scope:** course-code matching (unchanged; `CSCI-`, `MATH-`, `DS-` with `-UA`/`-GA`),
other schools, UI changes.

## 4. User stories

- As a Courant student, I want my actual program in the list, so that I don't have to pick
  "Other / undeclared".

## 5. Acceptance criteria

| ID   | Criterion |
| ---- | --------- |
| AC-1 | Courant's full name is "Courant Institute School of Mathematics, Computing, and Data Science"; short name stays "Courant". |
| AC-2 | Courant's program list contains the 9 existing programs plus: Information Systems (MS); Computing, Entrepreneurship and Innovation (MS); Data Science (MS); Data Science (PhD); Atmosphere Ocean Science and Mathematics (PhD); Mathematics and Computer Science (BA); Computer Science and Data Science (BA); Computer Science and Economics (BA); Data Science and Mathematics (BA); Computer Science (Minor); Mathematics (Minor); Mathematics and Computer Science (Minor); Web Programming and Applications (Minor). Grouped BA → minors → MS → PhD, then "Other / undeclared". |
| AC-3 | Code → school mapping is unchanged; typecheck, unit tests and build pass. |

## 6. Design / technical notes

Data-only change in `src/lib/nyu-schools.ts` (+ unit test asserting the new name and that
"Information Systems (MS)" is listed). Sources: NYU Bulletin and Courant department pages.

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
| 2026-11-26T16:30:50Z | Requirement analyst | Requirement created | Courant program list complete |
| 2026-11-26T16:30:50Z | Requirement analyst | Requirement ready for build | 3 ACs; data-only change |
| 2026-11-26T16:30:50Z | Product owner | Steps 3-5 waived | Trivial data change (program list); user replied 'add all' to the proposal to skip testing and PM review |
