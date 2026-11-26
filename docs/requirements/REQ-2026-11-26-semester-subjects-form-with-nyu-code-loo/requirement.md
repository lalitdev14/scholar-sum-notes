# REQ-2026-11-26-semester-subjects-form-with-nyu-code-loo: Semester subjects form with NYU code lookup

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| ID           | REQ-2026-11-26-semester-subjects-form-with-nyu-code-loo |
| Status       | Approved                                                |
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

Code commit: `bfa90a5`.

**Files**

- `src/lib/nyu-courses.functions.ts` (new): `searchNyuCourses({ q, term })` (POST) and `getNyuTerms()` (GET),
  both behind `requireSupabaseAuth`; zod: `q` trimmed 2–80 chars, `term` 1–8 digits. Exports `NyuCourse` / `NyuTerm` types.
- `src/lib/nyu-courses.server.ts` (new, server-only, loaded with dynamic import): FOSE request
  (`<base>api/?page=fose&route=search&keyword=<q>`, JSON body `{other:{srcdb}, criteria:[{field:"keyword",value}]}`),
  browser-like `User-Agent`, `Accept: application/json`, 8 s `AbortController` timeout; results de-duplicated by code
  (sections merged, first named instructor kept), max 25. Term list parsed from `<select name="srcdb">` on the
  class-search page, cached in memory 6 h; current semester = Jan–May Spring / Jun–Aug Summer / Sep–Dec Fall of this year,
  else the first option; built-in fallback list (Spring 2027 … Spring 2026) if fetch/parse fails. HTTP call goes through
  a swappable helper (`setNyuHttpFetch`) for tests; base URL overridable with `NYU_CLASS_SEARCH_URL` (documented in `.env.example`).
- `src/components/SemesterSubjectsDialog.tsx` (new): shadcn Dialog "Your subjects this semester" with subject search
  (350 ms debounce), term select (defaults to the current semester), results (code + title + Add/Added, "In your classes" for
  ones already enrolled), "To add" chosen list with remove, "Your classes" list with Remove (confirm dialog: "Your notes are
  kept…", deletes only the enrollment), error box with "Try again" and a link to Dashboard → Add class, Done button.
- `src/components/WelcomeHome.tsx`: auto-opens the dialog once per device for a signed-in student with zero enrollments and no
  `lectureloop:subjects-done:<uid>` flag (waits for any other open pop-up first); Done/close/Esc sets the flag; a small
  "My subjects" pill button (aria-label/title "Update my subjects", icon-only on phones) next to the date reopens it.

**Acceptance criteria**

- AC-1: auto-open rule above (no classes AND no device flag); students with classes or the flag don't get it.
- AC-2: ≥2 characters triggers the server search for the selected term; results show code and title, one row per code;
  term select switches the search; empty results show "No NYU courses found for “…” in <term>".
- AC-3: Done, per chosen course: look up an active class by `code` → enroll (23505 on enrollment = already enrolled, skipped);
  otherwise insert class {subject: NYU title, code, term: term label, professor: instructor or "TBA", created_by, university_id
  from profile} then enroll; on 23505 re-read by code and enroll. Courses already in the student's classes are skipped.
  Invalidates `welcome-home`, `my-enrollments`, `classes`; toast e.g. "Added 3 subjects" (+ "N already in your classes" /
  "N couldn't be added").
- AC-4: "Update my subjects" button stays on the home page and reopens the form listing current classes; Remove un-enrolls
  after confirmation; notes are not touched.
- AC-5: any server failure/timeout shows "We couldn't reach NYU's class search" with Try again and the Dashboard → Add class link;
  the home page is unaffected.
- AC-6: NYU is called only from the server function (no NYU URL in the client bundle); unauthenticated calls are rejected
  ("Unauthorized: Invalid token" seen with a fake session); input limits via zod and `maxLength`; dialog fits 390 px
  (scrolls inside, no page overflow); all controls are buttons/inputs reachable by Tab; dashboard untouched.

**Developer verification** (test data and mocks only)

- `bun run typecheck`, `bun run build` pass; eslint + prettier clean on touched files.
- Unit checks (bun test, mocked HTTP, NYU samples): request URL/body/headers/timeout signal, de-dup + 25 cap, HTTP 503 /
  `{"fatal"}` / network error / 8 s timeout → friendly error, term parsing, current-term pick (Nov→Fall 2026, Feb→Spring 2027,
  Jul→Summer 2026, unknown→first), 6 h cache, fallback list, env override — 6/6 pass.
- Chromium (Playwright) against the dev server with a fake session, mocked Supabase REST and mocked server-function responses:
  36/36 checks pass (auto-open/no auto-open cases, search, term switch, choose/remove, Done with create + reuse + 23505 race,
  summary toast, flag, reopen + remove with confirm, no results, error + link to dashboard, 390 px, keyboard-only add/Done,
  no page errors).

**Limitations**: the live NYU endpoint is not reachable from the build machine, so the real FOSE call was verified only against
the documented format and sample responses (reachability was verified from Vercel iad1 by the analyst). The "done" flag is per
device (localStorage), as specified. If an NYU course code already exists as a class at another university (hidden by RLS),
that course is reported as "couldn't be added".

### Changes after PM review

Code commit: `8ef15eb` (branch `claude/semester-subjects-fix`).

1. **Home page shows the student's classes** (`src/components/WelcomeHome.tsx`). A class with activity still gets
   "Continue where you left off". A student with classes but no activity now sees a "Your classes" card instead of
   "Open a class to begin". It lists the 3 most recently added classes (by enrollment date), each with code, title and an
   Open link to `/class/<id>`, plus "See all N classes on your dashboard" (or "See them on your dashboard"). The home query
   (`welcome-home`) is already refreshed by the form, so the card updates right after Done and after a removal, with no
   reload. Students with no classes keep the existing "Get started" card.
2. **Focus return** (`src/components/SemesterSubjectsDialog.tsx`). New `returnFocusTo` prop, used in `onCloseAutoFocus`.
   When the form was opened from "My subjects", Escape, X or Done puts focus back on that button.
3. **Input validation tests.** The search schema moved to `src/lib/nyu-courses.schema.ts` and is used by
   `searchNyuCourses`. `src/lib/nyu-courses.schema.test.ts` (bun test) checks:
   - a normal query is accepted and trimmed, and exactly 2 and 80 characters are accepted;
   - fewer than 2 or more than 80 characters after trimming is rejected;
   - invalid term ids are rejected;
   - missing or wrong-type fields are rejected.

   The new `bun run test` script runs it (6/6 pass). `*.test.ts` is excluded from `tsc`, since bun types aren't
   installed for the app.

**Verification**

- typecheck, build, eslint and prettier are clean on the touched files.
- Chromium at 1440px and 390px, with mocks only: 32/32 checks pass.
  - The card appears after Done without a navigation, and its Open link points to `/class/<id>`.
  - The card updates after a removal.
  - With 5 classes it shows the 3 most recent and "See all 5".
  - A class with activity keeps the Continue card, and a student with no classes gets the Get started card.
  - Focus returns to "My subjects" after Escape, X and Done.
  - No horizontal scroll and no page errors.

## 8. Test summary (tester)

| Total | Pass | Fail | Blocked | Evidence             |
| ----- | ---- | ---- | ------- | -------------------- |
| 23    | 22   | 1    | 0       | `test-evidence.xlsx` |

Run on the dev server (branch `claude/semester-subjects` @ `5679665`) started with `NYU_CLASS_SEARCH_URL`
pointing at a local NYU class-search mock (FOSE format; terms page with Spring 2027 / January 2027 /
Fall 2026 / Summer 2026; modes: results, empty, HTTP 503, dropped connection, never answering).
Chromium 1440x900 and 390x844, fake session, stateful mocked Supabase recording class/enrollment
inserts and deletes. The fake session can't pass the server function's auth check, so in the browser
the two server functions were answered through `page.route` by the **real** `nyu-courses.server.ts`
module running against the NYU mock (real request building, 8 s timeout, de-duplication and term
parsing); the real server functions were called directly with curl for the signed-out checks (TC-16).
Developer unit tests: 6/6 pass. 20 screenshots in `evidence/`.

**Failures**

- **TC-12** (AC-3): right after Done the **home page does not show the new classes**; it still shows
  the generic "Open a class to begin / Find your class by name or code on the dashboard" card. The home
  lists a class only in "Continue where you left off" once it has activity (notes, handwriting or a
  visit). §3 says the class list (dashboard / "Continue where you left off") reflects the new classes
  immediately. The dashboard part passes (both classes listed with NYU title and code, no reload).
- **TC-02** (AC-1): no automatic pop-up for a student with classes (AC-1 part passes), but with a class
  and no notes the home shows the same generic "Open a class to begin" card instead of the student's
  class. With a note in the class it shows in "Continue where you left off". Same cause as TC-12;
  the home card itself is pre-existing behaviour.

**Observations** (not failures)

- TC-16: input limits on the server could not be exercised end to end: without a real Supabase session
  the auth middleware rejects first ("Unauthorized: No authorization header provided" / "Invalid
  token"), so oversized input was only seen as rejected and never forwarded to NYU. Client limits:
  field `maxlength` 80 and q cut to 80 (TC-08).
- TC-17: after Escape, focus goes to the page body rather than back to the "Update my subjects" button.
- TC-11: a course already in the student's classes can't be picked at all ("In your classes", no Add
  button), so the summary only reports what was added.

**Re-test after PM review** (2026-11-26, branch `claude/semester-subjects-fix` @ `ff98ec7`, code `8ef15eb`;
same environment and mocks). Re-ran TC-02, TC-12, TC-17, the new TC-20..TC-23 and the regression set
TC-01, TC-03, TC-09, TC-13, TC-19: **11 pass, 1 fail**. TC-04..08, TC-10, TC-11 and TC-14..18 were not
re-run; their earlier Pass results are kept. Total: **22/23 passed**. 24 screenshots in `evidence/`.

- TC-02 now passes: a student with a class and no notes sees a "Your classes" card (code, title, Open link to
  `/class/<id>`) at 1440px and 390px; no Get started card.
- TC-17 now passes: after opening from "My subjects", Escape, X and Done each return focus to that button.
  After the first-time pop-up's Done, focus goes to the page body.
- TC-20 passes: removals update the home without a reload, and after the last one the Get started card
  ("Join your first class") is back. TC-21 passes. TC-22 passes: 3 most recently added classes plus "See all 5
  classes on your dashboard"; a class with notes shows the Continue card. TC-23 passes: `bun test src` 6/6,
  plus an independent check of the schema.
- **TC-12 fails at its last step.** Right after Done and after a plain reload, both new classes are on the home
  page (the earlier failure is fixed). But after Open on CS-GY 6033, going back and reloading, the home shows only
  the "Continue where you left off" card for CS-GY 6033, and BMIN-GA 1170 is no longer on the home page. The
  visit counts as activity, and with any activity the home shows only the Continue card. That matches the
  documented rule ("a class with activity keeps the Continue card"), but TC-12 expects both classes still shown
  after that reload. The PM decides between the test case and the design.

## 9. Product manager verification

| Field       | Value                 |
| ----------- | --------------------- |
| Decision    | Approved              |
| Verified by | Product manager agent |
| Date        | 2026-11-26            |

**Re-verification of the follow-up fix.** Branch `claude/semester-subjects-fix`: code `8ef15eb`, developer
docs `ff98ec7`, re-test `b71a345` (22/23 Pass). Context: the original feature was released before review
(#74/#75); this fix goes to `preprod` through the normal PR flow.

**What I checked myself.** Dev server with the tester's NYU mock and bridge (the real `nyu-courses.server.ts`),
Chromium, fake session, mocked Supabase. No real data was used.

- **New student:** picked CS-GY 6033 and BMIN-GA 1170, then pressed Done. Without a reload the home page shows
  a **"Your classes · 2 classes"** card listing both, each with code, title and Open, plus "See them on your
  dashboard". There's no "Open a class to begin" card any more.
- **Focus:** opened the form from "My subjects", then pressed Escape: focus went back to the "Update my
  subjects" button. Same with the X button.
- **After using one class:** opened one class, went back and reloaded. The home page shows "Continue where you
  left off" for the class just used, plus the existing "Go to your dashboard · All your classes, notes and
  summaries are on your dashboard" card. 0 page errors.
- **Unit test:** `bun test src/lib/nyu-courses.schema.test.ts` gave 6 pass, 0 fail.

**TC-12's last step: the behaviour is correct, and the test expectation is wrong.**

- My required change 1 asked for exactly this: a class with activity keeps the "Continue where you left off"
  card; otherwise the student's most recently added classes are shown.
- The home page is a launch pad, not the class list: one card to resume, and the dashboard for all classes,
  linked right below.
- What blocked approval before was a dead end: an enrolled student being told to "Open a class to begin". That
  is gone. Right after Done both new classes are on the home page (§3: "reflects the new classes immediately"),
  and once the student has used a class the home page offers to resume it.
- Keeping every class on the home page after activity would duplicate the dashboard and wasn't part of the
  requirement.
- **Required test-case correction** (test master, next time the suite is touched): TC-12's last step should
  expect the "Continue where you left off" card for the class just opened, plus the "Go to your dashboard"
  link, with both classes still listed on the dashboard. It should not expect both classes on the home page.
- **Optional product follow-up:** a short "Your other classes" list under the Continue card. Not required.

Notes per acceptance criterion:

| AC   | Met? | Notes |
| ---- | ---- | ----- |
| AC-1 | Yes  | Pop-up rules unchanged and passing (TC-01, TC-03, TC-04). TC-02 now passes: a student with a class and no notes sees a "Your classes" card. |
| AC-2 | Yes  | NYU search with code, title, term switch and the no-results message (TC-05..TC-08; earlier Pass kept). |
| AC-3 | Yes  | Pick, remove, Done, reuse, create and no duplicates (TC-09..TC-11). The home page lists the new classes right after Done without a reload; I checked this myself (TC-12, apart from its last-step expectation, judged above). Dashboard lists both. |
| AC-4 | Yes  | "My subjects" reopens the form with the current classes; removing a class keeps notes and updates the home page without a reload; the Get started card returns after the last removal (TC-13, TC-20). |
| AC-5 | Yes  | Clear NYU-unavailable message with the Dashboard → Add class link; the home page keeps working (TC-14, TC-15). |
| AC-6 | Yes  | Server-side and signed-in only (TC-16). Input limits now have a unit test (TC-23; I ran it myself: 6/6). Focus returns to "My subjects" after Escape, X and Done (TC-17; I checked Escape and X myself). 390px works and there are 0 page errors (TC-19, TC-22); dashboard Enroll/Add class unchanged (TC-18). |

**Required changes from the previous review: all closed**

1. The home page shows the student's classes as soon as they have any: done ("Your classes" card, up to 3
   most recent, updates after Done and after a removal; TC-02, TC-12, TC-20, TC-22; I checked myself).
2. Focus returns to "My subjects": done (TC-17; I checked myself). After the first-time pop-up, focus goes to
   the page body, which is acceptable because there was no button that opened it.
3. Unit test for the server input limits: done (`src/lib/nyu-courses.schema.test.ts`, 6/6; TC-23).
4. Retest: done (22/23). The one failure is the TC-12 last-step expectation, corrected above.

## 10. Audit trail

Append rows with `node scripts/req/audit.mjs <folder> "<Role>" "<Action>" "<Details>"`.

| Time (UTC)           | Role                | Action                                    | Details                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-26T04:59:18Z | Requirement analyst | Requirement created                       | Semester subjects form with NYU code lookup                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-11-26T04:59:18Z | Requirement analyst | Requirement ready for build               | 6 acceptance criteria; source chosen by owner: live lookup on bulletins.nyu.edu (verified reachable from Vercel iad1, blocked from the test machine)                                                                                                                                                                                                                                                                      |
| 2026-11-26T05:01:00Z | Test master         | Test cases written                        | 19 test cases covering AC-1..AC-6                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-26T05:09:00Z | Developer           | Build complete                            | nyu-courses server functions + SemesterSubjectsDialog + WelcomeHome auto-open/Update my subjects; typecheck+build pass; unit 6/6, Chromium mock checks 36/36; commit bfa90a5                                                                                                                                                                                                                                              |
| 2026-11-26T05:13:38Z | Product owner       | PR requested before testing and PM review | Owner asked to raise the PR now; tester run (19 cases) continues and its evidence is added to the same branch; PM review still to follow                                                                                                                                                                                                                                                                                  |
| 2026-11-26T05:27:36Z | Tester              | Tests executed                            | 17/19 passed, 2 failed (TC-12 home doesn't show new classes after Done; TC-02 home shows no class without activity), 0 blocked                                                                                                                                                                                                                                                                                            |
| 2026-11-26T05:27:36Z | Tester              | Evidence generated                        | test-evidence.xlsx with 20 screenshots                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-26T05:30:16Z | Product manager     | PM requested changes                      | Already live (#74/#75); follow-up fix required: home must show the student's classes right after Done (no Open a class to begin card when enrolled), focus back to My subjects after Escape, unit test for server input limits; AC-1,2,4,5 met; AC-3, AC-6 partly                                                                                                                                                         |
| 2026-11-26T05:31:25Z | Test master         | Test cases updated after PM review        | TC-02, TC-12 now expect the student's classes (code, title, Open) on the home page with no generic card, immediately after Done without reload; TC-17 checks focus returns to My subjects after Escape/X/Done; added TC-20 (removal updates home without reload), TC-21 (no classes keeps Open a class to begin card), TC-22 (max ~3 classes + dashboard link), TC-23 (unit test for input schema limits); 23 cases total |
| 2026-11-26T05:35:23Z | Developer           | Changes after PM review complete          | Home shows Your classes card (3 most recent, Open links, refreshes after Done/removal); focus returns to My subjects; schema unit tests + bun run test; Chromium mock checks 32/32; commit 8ef15eb                                                                                                                                                                                                                        |
| 2026-11-26T14:32:08Z | Tester | Re-test executed | Re-test after PM review: TC-02, TC-12, TC-17, TC-20..TC-23, regression TC-01, TC-03, TC-09, TC-13, TC-19: 11/12 passed (TC-12 fails at its last step: after visiting one class, home shows only the Continue card); total 22/23 passed, 1 failed, 0 blocked |
| 2026-11-26T14:32:08Z | Tester | Evidence regenerated | test-evidence.xlsx, 24 screenshots |
| 2026-11-26T14:34:07Z | Product manager | PM approved | Follow-up fix 8ef15eb re-verified: Your classes card on home right after Done, focus returns to My subjects, schema unit tests 6/6; AC-1..AC-6 met; TC-12 last step: test expectation wrong (Continue card after activity is the intended design) |
