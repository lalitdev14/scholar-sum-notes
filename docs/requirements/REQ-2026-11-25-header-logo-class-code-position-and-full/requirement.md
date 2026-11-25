# REQ-2026-11-25-header-logo-class-code-position-and-full: Header logo, class code position and full name greeting

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| ID           | REQ-2026-11-25-header-logo-class-code-position-and-full |
| Status       | Ready for build                                         |
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

| Time (UTC)           | Role                | Action                      | Details                                                               |
| -------------------- | ------------------- | --------------------------- | --------------------------------------------------------------------- |
| 2026-11-25T19:07:41Z | Requirement analyst | Requirement created         | Header logo, class code position and full name greeting               |
| 2026-11-25T19:07:41Z | Requirement analyst | Requirement ready for build | 3 small header/greeting fixes from screenshots; 4 acceptance criteria |
