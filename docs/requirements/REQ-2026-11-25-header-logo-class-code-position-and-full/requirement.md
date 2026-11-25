# REQ-2026-11-25-header-logo-class-code-position-and-full: Header logo, class code position and full name greeting

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| ID           | REQ-2026-11-25-header-logo-class-code-position-and-full |
| Status       | PR raised                                               |
| Requested by | Product owner                                           |
| Created      | 2026-11-25                                              |
| Branch       | `claude/header-polish`                                  |
| PR           | (added in step 6)                                       |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> 1. use the LectureLoop logo instead of the violet dot (sign-in/landing header). 2) class code should be before the university name (class page header). 3) Name should be full and in capital letters (home greeting shows 'lalit')

## 2. Problem / goal

Three small branding and header issues reported by the product owner with screenshots:

1. The black header on the sign-in page (and the landing page) shows a small violet square instead of the
   LectureLoop logo (the graduation-cap icon used next to "LectureLoop" in the purple app header).
2. On a class page, the class code badge (e.g. "CS-101") appears at the far right after the user's name; it should
   appear before the university chip ("New York University").
3. The signed-in home greeting shows only the first name in lower case ("Good afternoon, lalit."); it should show the
   full name with each word capitalised ("Good afternoon, Lalit Dev Jakher.").

## 3. Scope

**In scope**

- Sign-in page header and landing page header: graduation-cap logo (white) before "LectureLoop" instead of the violet square.
- Class page header: class code badge placed before the university chip, on desktop; mobile menu unchanged unless needed.
- Home greeting: full name from the profile, each word capitalised (e.g. "lalit dev jakher" → "Lalit Dev Jakher");
  keeps the purple italic style and the line break; long names wrap without breaking the layout.

**Out of scope**

- Other places that show the name (account chip, dashboard "Welcome back, <first name>.") — unchanged.
- Changing the stored name in the database.

## 4. User stories

- As a student, I want to see the LectureLoop logo on every page, so the site looks consistent.
- As a student, I want the class code next to the university, so the header reads naturally.
- As a student, I want to be greeted by my full, properly capitalised name.

## 5. Acceptance criteria

Each criterion is testable and has an ID that test cases refer to.

| ID   | Criterion                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | The sign-in page header and the landing page header show the graduation-cap LectureLoop logo (white) before the word "LectureLoop"; the violet square is gone; logo and text stay a link to the home page.                                                                                  |
| AC-2 | On a class page (desktop), the class code badge (e.g. "CS-101") appears immediately before the "New York University" chip, not after the user's name; pages without a class code are unchanged.                                                                                             |
| AC-3 | The home greeting shows the full name with each word capitalised (profile "lalit dev jakher" → "Lalit Dev Jakher"), in purple italics after the greeting line, followed by the greeting's punctuation; names already capitalised stay as they are; with no name the greeting shows no name. |
| AC-4 | No regressions: purple app header on other pages, account menu, mobile menu, greeting variations, phone width (390px) without horizontal scroll; no page errors.                                                                                                                            |

## 6. Design / technical notes

- Files: `src/routes/auth.tsx` and `src/components/LandingBold.tsx` (logo), `src/components/AuthenticatedHeader.tsx`
  (render `trailing` before the university chip), `src/components/WelcomeHome.tsx` (full name, capitalised).
- Logo: `GraduationCap` from lucide-react, the same icon as the app header.

## 7. Build summary (developer)

What was changed and how each acceptance criterion is met.

Code commit: `45b3bb7` on `claude/header-polish`.

- **AC-1** — `src/routes/auth.tsx` and `src/components/LandingBold.tsx`: the violet square in the black
  header is replaced by lucide `GraduationCap` (`h-5 w-5 shrink-0`, white, same as the purple app header),
  still inside the `/` link with aria-label "LectureLoop home" and the "LectureLoop" text.
- **AC-2** — `src/components/AuthenticatedHeader.tsx`: the `trailing` slot (class page passes the class code
  badge) now renders first in the right-hand group, immediately before the university chip, with a small
  gap. Below `lg` the chip is hidden, so on phones the badge sits just before the menu button. Pages without
  `trailing` render exactly as before.
- **AC-3** — `src/components/WelcomeHome.tsx`: `formatFullName()` shows the whole profile name, capitalising
  the first letter of each word; all-lower or all-upper names are title-cased ("lalit dev jakher" →
  "Lalit Dev Jakher", "LALIT DEV" → "Lalit Dev"), mixed-case names keep their casing ("McDonald").
  Purple italic span, line break and greeting punctuation unchanged; `break-words` lets long names wrap.
  Empty name → no name, as before.
- **AC-4** — Developer check in Chromium (dev server, fake session + mocked Supabase) at 1440px and 390px:
  /auth, /, /dashboard, /class/<id> and home greeting with names "lalit dev jakher", "LALIT DEV",
  "Ronald McDonald", a 4-word long name and an empty name; no page errors, no horizontal scroll.
  `bun run typecheck`, `bun run build`, eslint and prettier on touched files pass.

**Changes after PM review** (commit `006db59`)

- `formatFullName()` in `src/components/WelcomeHome.tsx`: for all-lower or all-upper names, the letter after a
  hyphen or apostrophe (`'` and `’`) is also capitalised: "maria rodriguez-villanueva" → "Maria Rodriguez-Villanueva",
  "sean o'brien" → "Sean O'Brien", "JEAN-LUC D'ARCY" → "Jean-Luc D'Arcy". Mixed-case names, "lalit dev jakher",
  "LALIT DEV" and empty/blank names behave as before.
- Verified in Chromium at 1440px and 390px (mocked data): the names above plus "sean o’brien", "lalit dev jakher",
  a blank name and a long hyphenated name (wraps, no horizontal scroll); no page errors. Typecheck, build, eslint
  and prettier pass.

## 8. Test summary (tester)

| Total | Pass | Fail | Blocked | Evidence             |
| ----- | ---- | ---- | ------- | -------------------- |
| 12    | 12   | 0    | 0       | `test-evidence.xlsx` |

Run on the dev server (branch `claude/header-polish` @ `60c57c6`), Chromium 1440x900 and 390x844,
fake session and mocked Supabase (profile returned as a one-element list for `maybeSingle()`), with
names "lalit dev jakher", "LALIT DEV", "Lalit Dev Jakher", "Anna McDonald", "lalit", empty, spaces only,
null and a long hyphenated name. Greeting variants were collected with Playwright's clock fixed at five
times of day (14 variants, including "?" ones). Headers were compared with the pre-change build
(`b2a7666`) on a second dev server. 12 screenshots in `evidence/`.

**Failures**

- **TC-10** (AC-3): a hyphenated name is capitalised only at the start: "rodriguez-villanueva" is shown
  as "Rodriguez-villanueva" (expected "Rodriguez-Villanueva"); `formatFullName` splits words on spaces
  only. Wrapping and layout are fine at 1440px and 390px (no overflow, no overlap, no horizontal scroll).
- **TC-11** (AC-4): the purple header's LectureLoop logo goes to `/dashboard`, not home `/`. This is
  pre-existing (the pre-change build links to `/dashboard` too) and not touched by this requirement; the
  account menu, purple header, dashboard "Welcome back, Lalit." and account chip are unchanged and work.

**Re-test after PM review** (2026-11-25, dev server at `23dc5dd`, code `006db59`): re-ran TC-06..TC-11,
all pass, so 12/12 passed in total (TC-01..05 and TC-12 not re-run, earlier Pass kept). TC-10:
"maria rodriguez-villanueva" → "Maria Rodriguez-Villanueva", "sean o'brien" → "Sean O'Brien",
"JEAN-LUC D'ARCY" → "Jean-Luc D'Arcy"; the long name shows as "Maria Fernanda De Los Angeles Gonzalez
Rodriguez-Villanueva" and wraps inside the column at 1440px and 390px with no horizontal scroll. TC-11
(revised): the purple header logo links to `/dashboard` (as in the previous build) and lands on the
dashboard from the class page and My notes. TC-06..TC-09 unchanged: still pass. The two failures listed
above are resolved. 13 screenshots in `evidence/`.

## 9. Product manager verification

| Field       | Value                 |
| ----------- | --------------------- |
| Decision    | Changes requested     |
| Verified by | Product manager agent |
| Date        | 2026-11-25            |

**What I checked myself.** Dev server, branch `claude/header-polish` at `235bdf5`, Chromium at 1440px and
390px, fake session and mocked Supabase. No real student data was used.

- **/auth and landing (/), signed out:** a white graduation-cap icon before "LectureLoop". Both are inside
  the link to `/` ("LectureLoop home"), the violet square is gone, there's no horizontal scroll and no page
  errors.
- **Class page:**
  - At 1440px the "CS-101" badge sits immediately before the "New York University" chip, then the account
    chip.
  - At 390px the badge sits before the menu button.
  - No horizontal scroll.
- **Home greeting** (clock fixed at 14:00):

  | Profile name                 | Greeting shown                                                         |
  | ---------------------------- | ---------------------------------------------------------------------- |
  | "lalit dev jakher"           | "How was class, _Lalit Dev Jakher_?" (purple italics, on its own line) |
  | "LALIT DEV"                  | "Lalit Dev"                                                            |
  | "Anna McDonald"              | kept as is                                                             |
  | empty                        | no name ("Halfway through the week.")                                  |
  | "maria rodriguez-villanueva" | **"Maria Rodriguez-villanueva."**                                      |
  | "sean o'brien"               | **"Sean O'brien."**                                                    |

  390px had no horizontal scroll, and there were 0 page errors throughout.

**The two failures, judged:**

- **TC-10 (hyphenated name): must be fixed now.**
  - The user asked for the name "full and in capital letters", and AC-3 says "each word capitalised".
  - In a name, each part of a hyphenated surname, and the part after an apostrophe, is a word of its own.
    "Rodriguez-villanueva" and "O'brien" look like typos, in the most visible line of the home page.
  - Hyphenated and apostrophe names are common in a university class, and the fix is a few lines in
    `formatFullName()`.
- **TC-11 (purple header logo goes to `/dashboard`, not `/`): not a defect, not blocking.**
  - AC-4 is about regressions. The pre-change build links to `/dashboard` too.
  - AC-1's "link to the home page" covers only the black sign-in and landing headers, which do link to `/`.
  - For a signed-in student, going to their dashboard from the app logo is reasonable and out of this
    request's scope.
  - The test case should be corrected to expect `/dashboard`, or to check only that the link is unchanged
    from the previous build.

Notes per acceptance criterion:

| AC   | Met?   | Notes                                                                                                                                                                                                                                                                         |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | Yes    | Tester's AC-1 cases pass. I checked myself: white graduation-cap logo before "LectureLoop" on /auth and /, at 1440px and 390px; link to `/` kept; violet square gone.                                                                                                         |
| AC-2 | Yes    | Tester's AC-2 cases pass. I checked myself: "CS-101" immediately before "New York University" at 1440px; before the menu button at 390px.                                                                                                                                     |
| AC-3 | Partly | Full name, purple italics, line break, punctuation, already-capitalised names and the empty name are all correct (I checked myself). **TC-10 fails**: hyphenated parts aren't capitalised ("Rodriguez-villanueva"), and I reproduced the same with an apostrophe ("O'brien"). |
| AC-4 | Yes    | Account menu, mobile menu, greeting variations, purple header, 390px without horizontal scroll and 0 page errors: the other AC-4 cases pass. TC-11 is pre-existing behaviour, not a regression (see above); fix the test case's expectation.                                  |

**Required changes** (back to the developer; then the test master updates TC-10/TC-11 and the tester
re-runs them):

1. **Capitalise every part of a name.** In `src/components/WelcomeHome.tsx` `formatFullName()`, when the
   name is all lower case or all upper case, also capitalise the first letter after a hyphen and after an
   apostrophe (`'` and `’`).
   - Examples: "maria rodriguez-villanueva" → "Maria Rodriguez-Villanueva", "sean o'brien" → "Sean O'Brien",
     "JEAN-LUC D'ARCY" → "Jean-Luc D'Arcy".
   - Mixed-case names stay exactly as typed ("Anna McDonald", "Anne-marie" if typed that way).
   - "lalit dev jakher" → "Lalit Dev Jakher" and "LALIT DEV" → "Lalit Dev" are unchanged.
2. **No other behaviour changes.** The empty, spaces-only and null name show no name; long names still wrap
   without horizontal scroll at 390px.
3. **Test-case update** (test master), then re-run TC-10 and TC-11 plus the other AC-3 cases.
   - TC-10 expects the results in change 1, including an apostrophe example.
   - TC-11 expects the signed-in purple-header logo to link to `/dashboard`, unchanged from the previous
     build.

**Follow-up, not blocking:** the account chip still shows the raw stored name ("lalit dev jakher"). §3 keeps
it out of scope, but the product owner may want the same capitalisation there in a later request.

## 10. Audit trail

Append rows with `node scripts/req/audit.mjs <folder> "<Role>" "<Action>" "<Details>"`.

| Time (UTC)           | Role                | Action                                 | Details                                                                                                                                                                                                                                       |
| -------------------- | ------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-25T19:07:41Z | Requirement analyst | Requirement created                    | Header logo, class code position and full name greeting                                                                                                                                                                                       |
| 2026-11-25T19:07:41Z | Requirement analyst | Requirement ready for build            | 3 small header/greeting fixes from screenshots; 4 acceptance criteria                                                                                                                                                                         |
| 2026-11-25T19:08:51Z | Test master         | Test cases written                     | 12 test cases covering AC-1..AC-4                                                                                                                                                                                                             |
| 2026-11-25T19:14:06Z | Developer           | Build complete                         | Logo on sign-in/landing headers, class code badge before university chip, full capitalised name in home greeting; typecheck/build/lint pass; verified in Chromium at 1440/390 with mocked data. Commit 45b3bb7                                |
| 2026-11-25T19:24:32Z | Tester              | Tests executed                         | 10/12 passed, 2 failed (TC-10 hyphenated name capitalisation; TC-11 purple logo goes to /dashboard, pre-existing), 0 blocked                                                                                                                  |
| 2026-11-25T19:24:32Z | Tester              | Evidence generated                     | test-evidence.xlsx with 12 screenshots                                                                                                                                                                                                        |
| 2026-11-25T19:27:04Z | Product manager     | PM requested changes                   | AC-1, AC-2, AC-4 met; AC-3 partly: capitalise after hyphen/apostrophe in formatFullName (Rodriguez-Villanueva, O'Brien); TC-11 is pre-existing (logo -> /dashboard), fix test expectation; re-run TC-10, TC-11, AC-3 cases                    |
| 2026-11-25T19:27:45Z | Test master         | Test cases updated after PM review     | TC-10 now expects capitals after hyphens and apostrophes (Maria Rodriguez-Villanueva, Sean O'Brien, Jean-Luc D'Arcy) plus the long-name wrap check; TC-11 expects the purple header logo to link to /dashboard; still 12 cases, ids unchanged |
| 2026-11-25T19:29:38Z | Developer           | Changes after PM review complete       | Greeting capitalises after hyphen/apostrophe (' and ’) for uniform-case names; mixed case unchanged; verified in Chromium 1440/390; typecheck/build/lint pass. Commit 006db59                                                                 |
| 2026-11-25T19:33:28Z | Product owner       | PR requested before final PM re-review | Owner asked to raise the PRs now (preprod and production); the re-test of TC-06..TC-11 runs in parallel and its evidence is added to the same branch                                                                                          |
| 2026-11-25T19:33:53Z | Tester | Re-test executed | Re-test after PM review: TC-06..TC-11 6/6 passed (hyphen/apostrophe names, logo to /dashboard); total 12/12 passed, 0 failed, 0 blocked |
| 2026-11-25T19:33:54Z | Tester | Evidence regenerated | test-evidence.xlsx, 13 screenshots |
