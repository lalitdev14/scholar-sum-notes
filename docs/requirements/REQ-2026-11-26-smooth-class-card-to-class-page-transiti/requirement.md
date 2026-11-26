# REQ-2026-11-26-smooth-class-card-to-class-page-transiti: Smooth class card to class page transition

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-smooth-class-card-to-class-page-transiti            |
| Status       | Ready for build   |
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
| 2026-11-26T23:39:50Z | Requirement analyst | Requirement created | Smooth class card to class page transition |
| 2026-11-26T23:39:50Z | Requirement analyst | Requirement ready for build | 7 ACs |
