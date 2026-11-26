# REQ-2026-11-26-semester-subjects-form-with-nyu-code-loo: Semester subjects form with NYU code lookup

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| ID           | REQ-2026-11-26-semester-subjects-form-with-nyu-code-loo |
| Status       | Changes requested                                       |
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

## 8. Test summary (tester)

| Total | Pass | Fail | Blocked | Evidence             |
| ----- | ---- | ---- | ------- | -------------------- |
| 19    | 17   | 2    | 0       | `test-evidence.xlsx` |

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

## 9. Product manager verification

| Field       | Value                 |
| ----------- | --------------------- |
| Decision    | Changes requested     |
| Verified by | Product manager agent |
| Date        | 2026-11-26            |

**Context.** At the product owner's request this was merged (#74) and released to production (#75)
before testing and this review (see the audit trail). This decision therefore asks for a **follow-up fix**
through the normal flow (developer, then test master, tester and PM), raised as a new PR into `preprod`. It is
not a rollback: nothing found here breaks existing features or loses data.

**What I checked myself.** Dev server with `NYU_CLASS_SEARCH_URL` pointing at the tester's local NYU mock,
the real `nyu-courses.server.ts` behind the tester's bridge, Chromium at 1440px and 390px, fake session and
mocked Supabase. No real student data was used.

- **New student (no classes):**
  - The "Your subjects this semester" pop-up opened automatically.
  - "algorithms" gave "BMIN-GA 1170 · Fundamental Algorithms" and "CS-GY 6033 · Design and Analysis of
    Algorithms I", each with Add.
  - I picked both, and the chosen list and "Done · add 2 subjects" were correct. Done gave the message
    "Added 2 subjects", with 2 classes created and 2 enrollments.
  - The pop-up didn't come back after a reload, and the "My subjects" icon button was shown.
  - The dashboard listed both classes.
- **NYU down (503):** the form showed "We couldn't reach NYU's class search. Please try again in a moment,
  or add the class yourself on the Dashboard → Add class.", with a link to `/dashboard`. The home page kept
  working.
- **Student with a class, at 390px:** no automatic pop-up. "My subjects" opened the form, which listed
  "Your classes: CS-GY 6033 … Remove". No horizontal scroll and 0 page errors.
- **TC-12 / TC-02 reproduced:**
  - Right after Done, and again after a reload, the home page still says **"Get started · Open a class to
    begin · Find your class by name or code on the dashboard · Find a class"**, while the message says
    "Added 2 subjects".
  - The new classes appear nowhere on the home page until the student has notes, handwriting or a visit
    in them.
  - The 390px home page for a student with a class shows the same generic card.
- **Focus after Escape:** after opening the form from the "My subjects" button and pressing Escape,
  focus lands on `BODY`, not back on the button.

**Judgement.**

- **TC-12 / TC-02 block approval.**
  - The user's goal is to set up classes from the home page in one step, and §3 says the class list
    ("Continue where you left off") reflects the new classes immediately.
  - What the student actually sees after pressing Done is the home page telling them to go and find a
    class. That contradicts the success message and sends a brand-new student, on their first visit, to
    the dashboard to look for something they just added.
  - This is the core moment of the feature, so it must be fixed.
- **Focus after Escape: fix in the same change.** AC-6 requires the form to work with the keyboard;
  returning focus to the button that opened it is the expected dialog behaviour, and it's a small fix.
- **Server input limits: accepted.** The limits exist in the server function's schema
  (`q` trimmed, 2–80 characters; term id), and the client caps the field at 80. The tester could only see
  them as rejected because auth runs first. Add a unit test as evidence (required change 3).
- **Already-enrolled courses can't be picked, so they are never reported as "skipped": accepted.**
  Showing "In your classes" instead of an Add button prevents duplicates even earlier than AC-3 asks, and
  no duplicate is ever created.

Notes per acceptance criterion:

| AC   | Met?   | Notes |
| ---- | ------ | ----- |
| AC-1 | Yes    | The automatic pop-up rules are correct: shown for a new student, not for one with classes, not again after Done or closing (TC-01, TC-03, TC-04 and the AC-1 part of TC-02; I checked myself). TC-02's failure is about the home card, which is covered under AC-3 / required change 1. |
| AC-2 | Yes    | NYU results show code and title, de-duplicated, with a term switch and "No NYU courses found" (TC-05..TC-08; I checked "algorithms" myself). |
| AC-3 | Partly | Picking, removing, Done, reusing an existing class, creating with NYU title/code/term, no duplicates and the summary message all work (TC-09..TC-11; I checked myself), and the dashboard shows the classes. **TC-12 fails**: the home page doesn't show the new classes and still says "Open a class to begin". |
| AC-4 | Yes    | The "My subjects" icon reopens the form with the current classes; Remove un-enrolls with confirmation and keeps notes (TC-13; I checked the reopen at 390px myself). |
| AC-5 | Yes    | NYU 503 or dropped connection or timeout gives a clear message with the Dashboard → Add class link, and the home page keeps working (TC-14, TC-15; I checked the 503 case myself). |
| AC-6 | Partly | The request is made server-side, only for signed-in users (TC-16); 390px works; 0 page errors; dashboard Enroll/Add class unchanged (TC-17..TC-19). Keyboard: focus isn't returned to "My subjects" after Escape (TC-17 observation; I reproduced it). Server limits are only evidenced indirectly. |

**Required changes** (follow-up fix: developer, then test master, tester and PM; new PR into `preprod`):

1. **The home page shows the student's classes as soon as they have any.** In `src/components/WelcomeHome.tsx`,
   when the student is enrolled in at least one class:
   - Never show the generic "Get started · Open a class to begin / Find a class" card.
   - Show their classes instead: code, title and an "Open" link to `/class/<id>`.
     - A class with activity keeps today's "Continue where you left off" card.
     - Without activity, show the most recently added class(es), at most about 3, plus a link to the
       dashboard for the rest.
   - It must update **right after Done**, without a reload. Refresh the home data when the dialog finishes,
     and also after a removal in the form.
   - Students with no classes still see the "Open a class to begin" card.
   - The layout must work at 1440px and 390px, with no horizontal scroll.
2. **Focus returns to the button.** Closing the form (Escape, X or Done) after opening it from the "My
   subjects" button returns focus to that button. After the automatic first-time pop-up, focus may go to
   that button too.
3. **Evidence for the server input limits.** Add a unit test for the search input schema: rejects `q`
   shorter than 2 or longer than 80 characters after trimming, and an invalid term id; accepts a normal
   query.
4. **Retest** (test master and tester):
   - TC-12 expects both new classes on the home page right after Done, without a reload, and no "Open a
     class to begin" card.
   - TC-02 expects a student with a class and no notes to see that class on the home page.
   - TC-17 also checks focus after Escape.
   - Then re-run TC-01, TC-03, TC-09, TC-13 and TC-19 as regression.

## 10. Audit trail

Append rows with `node scripts/req/audit.mjs <folder> "<Role>" "<Action>" "<Details>"`.

| Time (UTC)           | Role                | Action                      | Details                                                                                                                                                                      |
| -------------------- | ------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-26T04:59:18Z | Requirement analyst | Requirement created         | Semester subjects form with NYU code lookup                                                                                                                                  |
| 2026-11-26T04:59:18Z | Requirement analyst | Requirement ready for build | 6 acceptance criteria; source chosen by owner: live lookup on bulletins.nyu.edu (verified reachable from Vercel iad1, blocked from the test machine)                         |
| 2026-11-26T05:01:00Z | Test master         | Test cases written          | 19 test cases covering AC-1..AC-6                                                                                                                                            |
| 2026-11-26T05:09:00Z | Developer           | Build complete              | nyu-courses server functions + SemesterSubjectsDialog + WelcomeHome auto-open/Update my subjects; typecheck+build pass; unit 6/6, Chromium mock checks 36/36; commit bfa90a5 |
| 2026-11-26T05:13:38Z | Product owner | PR requested before testing and PM review | Owner asked to raise the PR now; tester run (19 cases) continues and its evidence is added to the same branch; PM review still to follow |
| 2026-11-26T05:27:36Z | Tester | Tests executed | 17/19 passed, 2 failed (TC-12 home doesn't show new classes after Done; TC-02 home shows no class without activity), 0 blocked |
| 2026-11-26T05:27:36Z | Tester | Evidence generated | test-evidence.xlsx with 20 screenshots |
| 2026-11-26T05:30:16Z | Product manager | PM requested changes | Already live (#74/#75); follow-up fix required: home must show the student's classes right after Done (no Open a class to begin card when enrolled), focus back to My subjects after Escape, unit test for server input limits; AC-1,2,4,5 met; AC-3, AC-6 partly |
