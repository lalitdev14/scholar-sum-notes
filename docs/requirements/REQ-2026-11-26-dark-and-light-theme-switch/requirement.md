# REQ-2026-11-26-dark-and-light-theme-switch: Dark and light theme switch

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-dark-and-light-theme-switch            |
| Status       | PR raised |
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

Code commit `113d6d2` on `claude/theme-toggle`.

**How it works**

- `src/lib/theme.ts`: theme helpers. The theme is the `dark` class plus `color-scheme` on
  `<html>`. The choice is saved in `localStorage` under `lectureloop:theme` (`"light"` /
  `"dark"`). With no saved value, `prefers-color-scheme` decides, and the open app follows
  device changes live. A choice made in another tab is picked up via the `storage` event.
- `src/routes/__root.tsx`: a small inline script (`THEME_INIT_SCRIPT`) at the top of `<head>`
  applies the theme before first paint. The CSP already allows inline scripts
  (`script-src 'self' 'unsafe-inline'`, checked on the built server's headers). Adding a hash
  would turn `'unsafe-inline'` off and break TanStack's inline hydration scripts, so the CSP
  is unchanged. The Sonner `<Toaster>` gets the current theme.
- `src/components/ThemeToggle.tsx`: the sun/moon button (`data-testid="theme-toggle"`).
  The icon and the accessible name ("Switch to dark theme" / "Switch to light theme") switch
  through CSS `dark:` variants, so they are right from the first paint with no hydration
  flicker. It is a native `<button>` with a `focus-visible` outline.
- `src/theme.css` (imported from `styles.css` with one line): CSS variables for the bold
  palette (`--bold-*`) and the signed-in home palette (`--home-*`), exposed as Tailwind colours
  (`bg-bold-page`, `text-bold-ink`, `border-home-line`, …). The `:root` values are the
  original hex colours exactly. `.dark` overrides them. It also adds dark overrides for the
  base `body` background (white in light) and the `h1–h3` colour (near-black in light).
- `src/lib/bold-theme.ts`: `INK`, `SOFT_GREY`, `VIOLET` now map to variables. New exports:
  `INK_PANEL` for dark panels and the header, `VIOLET_TEXT` for violet text, which is
  lightened in dark. The button and block class helpers use the token classes.
- Converted users: `LandingBold.tsx`, `auth.tsx`, `dashboard.tsx`, `WelcomeHome.tsx`. The
  university colour used as text on the home page is lightened in dark (`--home-accent`).
  `AuthenticatedHeader.tsx` keeps its university-colour bar and gains the toggle.
- Toggle added to the public headers on `about.tsx`, `contact.tsx`, `plans.tsx` and
  `LegalPage.tsx` (privacy/terms).
- `src/lib/error-page.ts` (the static server error page) now runs the same init script and
  has dark styles. The NYU search warning in `SemesterSubjectsDialog` has dark colours.
- All other pages (class workspace, My notes, admin, plans, dialogs, popovers, menus, selects,
  tooltips) already use the shadcn tokens, which have `.dark` values in `styles.css`. Slide,
  PDF and handwriting page content (canvas, thumbnails, notebook pages) stays as authored.

**Acceptance criteria**

| AC | How it is met |
| -- | ------------- |
| AC-1 | `ThemeToggle` in the signed-in header, the landing header, the sign-in header and the minimal public headers. On the landing header at 390 px the spacing was tightened (gap, padding) so logo, toggle, Sign in and Get started fit with no horizontal scroll (measured: page width 390). |
| AC-2 | The click toggles the class on `<html>` with no reload. The icon and name switch by CSS. |
| AC-3 | Saved in `localStorage["lectureloop:theme"]`. With no saved value the init script uses `prefers-color-scheme`. Unit tests in `src/lib/theme.test.ts`. |
| AC-4 | The init script runs in `<head>` before the stylesheet/body. Checked: `<html>` already has `dark` at the first `readystatechange` after navigation. |
| AC-5 | Bold and home palettes have dark values. Measured contrast: body text #b8b8c5 on #0f0f15 9.7:1, muted #9d9dac on #1a1a23 6.5:1, violet text #a593ff on #0f0f15 7.5:1, home muted #a19cab on #1a1820 6.6:1. |
| AC-6 | Light values are the original hex colours. The only visual change in Light is the new button, plus slightly tighter landing-header spacing below 640 px. |
| AC-7 | shadcn dialogs, popovers, dropdowns, selects and tooltips use `bg-popover`/`bg-background` tokens. The Sonner toaster gets `theme`. |
| AC-8 | Native button: Tab reaches it and Enter/Space toggle it. The `focus-visible` outline is white on the dark headers and `ring` colour on the plain public headers. Checked with Playwright (Tab → Enter). |
| AC-9 | `bun run typecheck`, `bun test src` (20 pass, including 3 new) and `bun run build` pass. No new dependency. |

**Notes for the tester**

- localStorage key: `lectureloop:theme` (`"light"` or `"dark"`). Clear it to get the device default.
- Button: `data-testid="theme-toggle"`, or `getByRole("button", { name: "Switch to dark theme" })`
  / `"Switch to light theme"`.
- Device theme: Playwright `browser.newContext({ colorScheme: "dark" })` or
  `page.emulateMedia({ colorScheme: "dark" })`.
- Theme state: `document.documentElement.classList.contains("dark")` and
  `document.documentElement.style.colorScheme`.
- `src/styles.css` was already not Prettier-formatted before this change. Only one import
  line was added, and it was not reformatted, to avoid merge conflicts with
  `claude/motion-polish`.

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
| 2026-11-26T17:27:36Z | Test master | Test cases written | 24 cases covering AC-1..AC-9 |
| 2026-11-26T20:33:28Z | Developer | Build complete | Commit 113d6d2: ThemeToggle in all headers, no-flash head script, bold/home palettes as CSS vars with dark values; typecheck, 20 unit tests, build pass; landing/sign-in screenshots checked in both themes |
| 2026-11-26T20:34:03Z | Product owner | Steps 4-5 waived | Product owner asked for the PR before testing ('generate pr'); test cases written, test run and PM review not done |
