# REQ-2026-11-26-dark-and-light-theme-switch: Dark and light theme switch

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-dark-and-light-theme-switch            |
| Status       | Ready for build   |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/theme-toggle` |
| PR           | (added in step 6) |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> add a button to switch theme dark and bright

## 2. Problem / goal

LectureLoop only has a light look. The design tokens already contain a `.dark` palette, but
nothing switches to it, and the "bold" pages (landing, sign-in, home, dashboard, header) use
fixed light colours. Students who study late want a dark theme they can switch to with one
button, and back to light.

## 3. Scope

**In scope**

- A theme button in the signed-in header and in the public (landing/sign-in) header that
  switches between Light and Dark.
- First visit follows the device setting (light/dark); once the student picks, the choice is
  remembered on that device and applied on every page with no flash of the wrong theme on load.
- Every page looks right and readable in both themes: landing, sign-in and other public pages,
  home, dashboard, class workspace (notes, summary, slides, transcript panels), My notes,
  plans, admin, dialogs, toasts, menus.

**Out of scope**

- Syncing the choice across devices/accounts.
- Changing the content of lecture slides, PDFs or handwriting ink colours (slides/pages stay as
  authored; only the surrounding UI is themed).
- A third "System" option in the button (device setting is only the starting default).

## 4. User stories

- As a student, I want a button to switch between dark and light, so that I can study
  comfortably at night.
- As a student, I want my choice remembered, so that I don't switch every time.

## 5. Acceptance criteria

| ID   | Criterion |
| ---- | --------- |
| AC-1 | A theme button (sun/moon icon) is visible in the signed-in header and the public header on desktop and at 390 px. It has an accessible name that says which theme it switches to (e.g. "Switch to dark theme"). |
| AC-2 | Pressing it switches the whole app between Light and Dark immediately, without a page reload; the icon changes to match. |
| AC-3 | With no saved choice, the theme follows the device's light/dark setting. After pressing the button, the choice is saved on the device and used on later visits and on every page, regardless of the device setting. |
| AC-4 | There is no flash of the other theme when loading or reloading any page (the theme is applied before first paint). |
| AC-5 | In Dark, all pages listed in scope have dark backgrounds with readable text and controls (text contrast at least WCAG AA 4.5:1 for body text); no white panels left over from the fixed light palette, except slide/PDF/handwriting page content. |
| AC-6 | In Light, every page looks as it does today (no visual regressions). |
| AC-7 | Dialogs, popovers, dropdowns, selects, toasts and tooltips follow the chosen theme. |
| AC-8 | The theme switch can be used with the keyboard (Tab to it, Enter/Space switches) and has a visible focus ring. |
| AC-9 | Typecheck, unit tests and build pass; no new dependency unless needed (`next-themes` is acceptable but not required). |

## 6. Design / technical notes

- Tokens: `src/styles.css` already defines `:root` and `.dark` (`@custom-variant dark`). Apply
  the theme by toggling the `dark` class (and `color-scheme`) on `<html>`.
- No-flash: a tiny inline script in the root document head (`src/routes/__root.tsx`) reads
  `localStorage` (key e.g. `lectureloop:theme`) and `prefers-color-scheme` before render; CSP in
  `vite.config.ts` may need a hash/nonce for it.
- Bold palette: `src/lib/bold-theme.ts` (INK, VIOLET, SOFT_GREY, bg-white blocks) and its users
  (`LandingBold.tsx`, `AuthenticatedHeader.tsx`, `auth.tsx`, `WelcomeHome.tsx`, dashboard, notes,
  class page) need dark values — e.g. CSS variables with `.dark` overrides instead of fixed hex.
- Another branch (`claude/motion-polish`) is changing `src/styles.css` and some of these
  components for animations; keep theme edits focused to ease merging.

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
| 2026-11-26T17:26:19Z | Requirement analyst | Requirement created | Dark and light theme switch |
| 2026-11-26T17:26:43Z | Requirement analyst | Requirement ready for build | 9 ACs; whole app incl. bold pages; device default, saved per device |
