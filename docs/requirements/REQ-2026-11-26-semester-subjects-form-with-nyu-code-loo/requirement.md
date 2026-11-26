# REQ-2026-11-26-semester-subjects-form-with-nyu-code-loo: Semester subjects form with NYU code lookup

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| ID           | REQ-2026-11-26-semester-subjects-form-with-nyu-code-loo |
| Status       | Ready for build                                         |
| Requested by | Product owner                                           |
| Created      | 2026-11-26                                              |
| Branch       | `claude/semester-subjects`                              |
| PR           | (added in step 6)                                       |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> When new users sign up and log in, show a form on the main landing page asking what subjects they are taking this semester; based on the subject name fetch the subject code from the NYU subject directory and populate the add course list. First time it is a pop-up; once they click Done it becomes a small icon they can click to update the subject list.

## 2. Problem / goal

New students land on an empty home page and must find and add every class by hand (Dashboard → Enroll in
subject / Add class, typing the subject, professor and code). Goal: right after sign-up/first login, ask which subjects
they are taking this semester, look each one up in NYU's public class search to get the official course code, and
add them to the student's classes in one step. The same form stays available later from a small icon to update the list.

## 3. Scope

**In scope**

- Signed-in home page (main landing page after sign-in): a "Your subjects this semester" form.
  - Shown automatically as a pop-up (dialog) the first time a signed-in student with **no classes** opens the home
    page (and hasn't completed or dismissed it on this device).
  - After **Done** (or closing it), a small icon button on the home page (e.g. "Update my subjects") reopens it any time.
- In the form the student types a subject name (e.g. "algorithms", "financial accounting") and sees matching NYU
  courses with their **course code and title** (e.g. "CS-GY 6033 · Design and Analysis of Algorithms I"); they pick one or
  more courses, see the chosen list, can remove items, and press **Done**.
- NYU lookup (live, server-side): a LectureLoop server function queries NYU's public class search
  (`https://bulletins.nyu.edu/class-search/api/?page=fose&route=search`, POST JSON
  `{"other":{"srcdb":"<term id>"},"criteria":[{"field":"keyword","value":"<text>"}]}`; response `results[]` with
  `code` (e.g. "CS-GY 6033"), `title`, `no` (section), `instr`, `meets`). Term ids come from the class-search page's term
  list (verified 2026-11-26: Spring 2027 = 1274, January 2027 = 1272, Fall 2026 = 9999, Summer 2026 = 1266). Default to
  the current semester; the student may switch term. Results are de-duplicated by course code (sections merged).
  Verified reachable from Vercel (iad1); NOT reachable from the test machine, so automated tests mock it.
- On **Done**, for each chosen course: if a LectureLoop class with that code already exists, enroll the student;
  otherwise create the class (subject = NYU title, code = NYU code, term = chosen term name, professor = NYU instructor or
  "TBA", tied to the student's university like Add class does) and enroll. Already-enrolled courses are skipped. The
  student's class list (dashboard / "Continue where you left off") reflects the new classes immediately.
- Updating later: the form shows the student's current classes; removing one un-enrolls the student (with the same
  confirmation wording/"keep my notes" safety as the dashboard's remove, or simply un-enroll without deleting notes).
- Errors: if NYU's search is unavailable or slow (> ~8 s), show a clear message and let the student add the class
  manually (link to the dashboard's Add class), never block the home page.

**Out of scope**

- Picking specific sections/meeting times; schedules/calendar.
- Universities other than NYU; storing NYU's catalogue in LectureLoop.
- Changing the dashboard's existing Enroll/Add class dialogs.

## 4. User stories

- As a new student, I want to list my subjects once and have LectureLoop set up all my classes with the right NYU codes.
- As a student, I want to add or remove subjects later from a small button, when my schedule changes.

## 5. Acceptance criteria

Each criterion is testable and has an ID that test cases refer to.

| ID   | Criterion                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | A signed-in student with no classes who opens the home page for the first time sees the "Your subjects this semester" pop-up automatically; a student who already has classes, or who completed/dismissed it before (on this device), does not get the automatic pop-up.                                                                                                                                      |
| AC-2 | Typing a subject name (at least 2 characters) shows matching NYU courses with code and title from NYU's class search for the selected term (default: the current semester), de-duplicated by code, within a few seconds; the student can switch the term; no results shows a clear "No NYU courses found" message.                                                                                            |
| AC-3 | The student can pick several courses, see and remove them from the chosen list, and press Done; each chosen course ends up in the student's classes: an existing LectureLoop class with the same code is reused (enrolled), otherwise a class is created with NYU's title, code and term and the student is enrolled; courses already in their classes are not duplicated. A summary confirms what was added. |
| AC-4 | After Done or closing the pop-up, a small icon button stays on the home page; clicking it reopens the form showing the student's current classes, where they can add more courses or remove one (un-enroll, notes kept).                                                                                                                                                                                      |
| AC-5 | If NYU's search fails or times out, the form shows a clear message with a way to add the class manually (Dashboard → Add class), and the home page keeps working.                                                                                                                                                                                                                                             |
| AC-6 | The NYU request is made by LectureLoop's server (not the browser), only for signed-in users, with input length limits; no page errors; the form works at phone width (390px) and with the keyboard; existing dashboard Enroll/Add class keep working.                                                                                                                                                         |

## 6. Design / technical notes

- New server function (e.g. `src/lib/nyu-courses.functions.ts`, `requireSupabaseAuth`): `searchNyuCourses({ q, term })`
  → POST to the FOSE endpoint with a timeout (~8 s) and a browser-like `User-Agent`; returns `[{code,title,instructor}]`
  (max ~25, de-duplicated by code). `getNyuTerms()` → term list parsed from the class-search page (cache in memory a few
  hours), with the current semester marked; fallback to a built-in list if parsing fails.
- UI: `src/components/WelcomeHome.tsx` (home), new `src/components/SemesterSubjectsDialog.tsx` (shadcn Dialog, Command/
  combobox style search with debounce). First-time flag: `localStorage` key per user (e.g. `lectureloop:subjects-done:<uid>`)
  combined with "has no enrollments" (no database change).
- Class creation/enrollment reuse the same Supabase calls and RLS as the dashboard (`classes` insert with
  `created_by`/`university_id`; `enrollments` insert). `classes.code` is unique: look up by code first; on a 23505 race,
  re-read and enroll.
- Tests must mock the NYU endpoint (the test machine can't reach bulletins.nyu.edu). Real reachability from Vercel was
  verified with a Vercel Sandbox in iad1 (HTTP 200; "algorithms" → CS-GY 6033, BMIN-GA 1170, …).

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

| Time (UTC)           | Role                | Action                      | Details                                                                                                                                              |
| -------------------- | ------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-26T04:59:18Z | Requirement analyst | Requirement created         | Semester subjects form with NYU code lookup                                                                                                          |
| 2026-11-26T04:59:18Z | Requirement analyst | Requirement ready for build | 6 acceptance criteria; source chosen by owner: live lookup on bulletins.nyu.edu (verified reachable from Vercel iad1, blocked from the test machine) |
