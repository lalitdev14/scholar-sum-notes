# REQ-2026-11-25-header-logo-class-code-position-and-full: Header logo, class code position and full name greeting

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| ID           | REQ-2026-11-25-header-logo-class-code-position-and-full |
| Status       | In test                                                 |
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

| Time (UTC)           | Role                | Action                      | Details                                                                                                                                                                                                        |
| -------------------- | ------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-25T19:07:41Z | Requirement analyst | Requirement created         | Header logo, class code position and full name greeting                                                                                                                                                        |
| 2026-11-25T19:07:41Z | Requirement analyst | Requirement ready for build | 3 small header/greeting fixes from screenshots; 4 acceptance criteria                                                                                                                                          |
| 2026-11-25T19:08:51Z | Test master         | Test cases written          | 12 test cases covering AC-1..AC-4                                                                                                                                                                              |
| 2026-11-25T19:14:06Z | Developer           | Build complete              | Logo on sign-in/landing headers, class code badge before university chip, full capitalised name in home greeting; typecheck/build/lint pass; verified in Chromium at 1440/390 with mocked data. Commit 45b3bb7 |
