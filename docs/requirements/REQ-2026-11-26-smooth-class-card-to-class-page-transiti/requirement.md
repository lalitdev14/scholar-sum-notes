# REQ-2026-11-26-smooth-class-card-to-class-page-transiti: Smooth class card to class page transition

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-smooth-class-card-to-class-page-transiti            |
| Status       | In test   |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/class-open-transition` |
| PR           | (added in step 6) |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> class card from dashboard opening into notes editor this trasnsition is not smooth , fix that

## 2. Problem / goal

Opening a class from the dashboard (or the home page) uses a View Transition that morphs the
class card into the class page header (REQ-2026-11-26-motion-and-micro-interactions, AC-11).
The product owner reports it is **not smooth**. Likely causes (to confirm by recording frames):
the tall card is stretched into a one-line header (snapshot images scaled to a very different
aspect ratio, text distorts); the class page's data is not loaded when the new snapshot is
taken, so the header shows a placeholder ("Class") and content pops in after the morph; the
whole-page cross-fade of a heavy page; hover tilt/lift transforms captured in the snapshot.

## 3. Scope

**In scope:** the dashboard → class page and home → class page open transition, and the
"Back to dashboard" transition. **Out of scope:** other animations; page content changes.

## 4. User stories

- As a student, I want opening a class to feel like one smooth motion, so that the app feels
  fast and polished.

## 5. Acceptance criteria

| ID   | Criterion |
| ---- | --------- |
| AC-1 | Opening a class from a dashboard class card plays one continuous motion of about 300–450 ms: the card's box moves/resizes into the class header position with no visible stretching or squashing of text (text is not scaled non-uniformly) and no flash of an empty/white page. |
| AC-2 | When the transition ends, the class page header already shows the real class name and code (no "Class" placeholder swapping in afterwards); the rest of the page fades in without jumping layout during the transition. Class data is prefetched (e.g. on hover/focus/touch of the card) so it is ready when clicked. |
| AC-3 | The hover lift/tilt of the card does not cause a jump at the start of the transition. |
| AC-4 | The same applies when opening a class from the home page cards, and "Back to dashboard" morphs back smoothly. |
| AC-5 | If the class data is slow (> ~300 ms), navigation still happens promptly (no frozen click) and the page shows its normal loading state without a broken morph. |
| AC-6 | With reduced motion, navigation is instant or a short fade; browsers without View Transitions navigate normally. |
| AC-7 | No regressions in the class page, dashboard or home; typecheck, tests and build pass. |

## 6. Design / technical notes

- Files: `src/styles.css` (`::view-transition-*` rules near "18 · Class card ↔ class page
  header"), `src/routes/_authenticated/dashboard.tsx`, `src/components/WelcomeHome.tsx`,
  `src/routes/_authenticated/class.$classId.tsx`, `src/lib/motion.ts`.
- Options: give the card and header a shared *background* element for the morph and
  cross-fade their contents separately (`::view-transition-old/new(name)` with
  `height:100%; object-fit:cover/none`, short fades); remove tilt/hover transforms before the
  snapshot; prefetch the class query (`queryClient.prefetchQuery` / router `preload="intent"`
  with a loader using `ensureQueryData`) so the header is ready; keep the root cross-fade short.
- Verify by recording frames of the transition with Playwright (mocked session) before and
  after.

## 7. Build summary (developer)

**Reproduced** with a production build (`node .output/server/index.mjs`), a mocked session and
Supabase answered by Playwright mocks with +150 ms latency, recording every frame with the CDP
screencast (Chromium 1280×800). Before/after strips: `evidence/dev-before.png`,
`evidence/dev-after.png` (real speed) and `evidence/dev-after-slow4x.png` (animations slowed 4×).

**Root causes found (before):**

1. *Stretched snapshots* — the default View Transition scales the snapshots to the group's
   width: the ~400×200 card was blown up ~3× toward the full-width one-line header (text
   huge and overflowing), and the header snapshot was squashed at the start.
2. *Placeholder header* — the class query only started after the new page rendered, i.e.
   after the new snapshot: the morph landed on "Class", and the real name swapped in at
   ~630 ms (after the animation).
3. *Frozen click* — nothing moved for ~215 ms after the click: the `_authenticated`
   `beforeLoad` called `supabase.auth.getUser()` (a network round trip) on every
   navigation, then the class page chunk was downloaded.
4. *White flash / ghosting* — the old page faded out in 140 ms while the new page faded in
   over 250 ms, so the page (and the purple app bar) washed out toward white mid-way.
5. *Other cards on top* — every card has its own transition name, so the other cards were
   separate layers lingering above the new page.
6. *Hover tilt/lift* captured in the card's start transform.

**Fixes per AC:**

- **AC-1** — Card and header get the `class-morph` view-transition class
  (`classTransitionStyle` in `src/lib/motion.ts`). In `src/styles.css` (section 18) the
  old/new snapshots fill the group with `object-fit: none` (top-left), so text is never
  scaled; the group (the box) moves/resizes, the image pair clips them with rounded corners,
  and old/new cross-fade (old 60–300 ms, new 120–360 ms). A box is drawn behind them
  (`installClassMorph`, installed in `__root.tsx`): it starts with the card's own background,
  radius and a soft shadow and ends as the header (transparent), so the box visibly travels.
  Morph length 360 ms (`--motion-slow`); measured ready→finished ≈ 380 ms. The root: old page
  stays underneath (no animation) and the new page fades in over 180 ms (no white dip); the
  app bar has its own layer (`site-header`) and stays still; cards without a counterpart fade
  in 180 ms.
- **AC-2** — Class queries moved to `src/lib/class-queries.ts` (`classQueryOptions`,
  `myNoteQueryOptions`, same keys as before). Cards and the home links use
  `preload="intent"` (hover/focus/touchstart → prefetch class + note and the route chunk).
  The class route's `beforeLoad` waits for that data at most 300 ms (`waitAtMost`), so the
  header has the real name and code on the first frame. Measured: transition starts ~7 ms
  after the click (was ~215 ms); header shows "Database Systems" on landing.
- **AC-3** — Clicking a tilted card sets `data-opening`, which removes the tilt/hover lift
  (eased by the card's existing transition, so no snap), before the snapshot.
- **AC-4** — Home "Continue where you left off" card and "Your classes" rows use the same
  class/attributes and prefetch. "Back to dashboard" is `preload="intent"`; the dashboard's
  `beforeLoad` loads profile/enrollments/class cards (≤ 300 ms) so the header morphs back
  into the card (box grows from transparent to the card colour), also in dark mode.
- **AC-5** — Waiting is capped at 300 ms and never throws; with class data taking 1.5 s the
  transition starts at ~306 ms and the page shows its normal "Class" loading header, filled
  in when the data arrives. The auth gate now reuses a server check made in the last 60 s for
  the same access token (the local session is still required, so a signed-out visitor is
  still sent to sign in), so clicks don't wait for a network round trip.
- **AC-6** — Reduced motion: all `::view-transition-*` animations stay off (existing rule)
  and the box isn't drawn → instant navigation (measured ~40 ms, no movement). Browsers
  without View Transitions navigate normally (router feature-detects); browsers without
  `view-transition-class` get the browser's default morph.
- **AC-7** — `bun run typecheck`, `bun test src` (94 pass, incl. new
  `src/lib/wait-at-most.test.ts`), `bun run build` pass; prettier/eslint clean on changed TS
  files (`src/styles.css` was not prettier-formatted before; only section 18 changed). No
  page errors or console errors in the recorded runs.

**Files:** `src/styles.css`, `src/lib/motion.ts`, `src/lib/class-queries.ts` (new),
`src/lib/wait-at-most.ts` (+ test, new), `src/routes/__root.tsx`,
`src/routes/_authenticated/route.tsx`, `src/routes/_authenticated/dashboard.tsx`,
`src/routes/_authenticated/class.$classId.tsx`, `src/components/WelcomeHome.tsx`,
`src/components/AuthenticatedHeader.tsx`.

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
| 2026-11-26T23:39:50Z | Requirement analyst | Requirement created | Smooth class card to class page transition |
| 2026-11-26T23:39:50Z | Requirement analyst | Requirement ready for build | 7 ACs |
| 2026-11-26T23:40:59Z | Test master | Test cases written | 14 cases covering AC-1..AC-7 |
| 2026-11-26T23:59:01Z | Developer | Build complete | Reproduced with CDP screencast frames (stretched snapshots, placeholder header, 215 ms frozen click from getUser per nav, root fade white dip, other cards on top, tilt). Fixed: unscaled morph box + cross-fade, prefetch on intent + 300 ms capped wait, auth check reuse, still app bar, tilt settle; typecheck/tests/build pass; evidence dev-before.png/dev-after.png |
