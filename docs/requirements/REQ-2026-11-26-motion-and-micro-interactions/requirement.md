# REQ-2026-11-26-motion-and-micro-interactions: Motion and micro-interactions

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-motion-and-micro-interactions            |
| Status       | Ready for build   |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/motion-polish` |
| PR           | (added in step 6) |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> lets play with animations , add some animations to pop up forms or other components , check web for inspirations and revamp the User exoerience ... (after the motion preview) 2,3,4,8,9,12,14,18 looks good ,19, 20, 21

## 2. Problem / goal

LectureLoop works but feels static: dialogs, toasts, tabs, uploads and recording appear and
change instantly, with little feedback about what just happened. The product owner reviewed an
interactive motion preview (https://claude.ai/artifact/XcvCXJFiN7swfTdvRhk9XL) and picked the
moments to build: **2, 3, 4, 8, 9, 12, 14, 18, 19, 20** (21, the countdown, is its own
requirement: REQ-2026-11-26-next-lecture-countdown-from-nyu-section). The goal is quick, soft
motion that explains what happened, at the "Lively" strength, without slowing anyone down.

## 3. Scope

**In scope** (numbers match the preview)

- **Foundation:** shared motion tokens (durations, ease-out, a soft spring) used everywhere;
  reduced-motion support.
- **2 · Search results:** subject-search results rise in with a short stagger; "Add" rolls to
  "Added ✓"; chosen subjects pop into the "To add" list (and shrink out when removed).
- **3 · Toasts:** toasts rise in on a spring and leave sideways.
- **4 · Tabs glide:** the selected-tab highlight slides between tabs (e.g. Type / Handwrite /
  Transcribe and other tab bars in the class workspace); the panel content fades in.
- **8 · Uploading slides:** a progress indicator fills during slide upload, turns into a ✓,
  and slide thumbnails (where shown) enter one after another.
- **9 · Recording pulse:** while recording, a soft ring pulses around the record control and
  live level bars follow the microphone input.
- **12 · Empty states & errors:** empty-state illustrations float gently; an invalid form
  submission (e.g. sign-in) shakes the field once and the error message slides open.
- **14 · Hover polish (desktop):** a soft light follows the cursor on primary buttons; class
  cards tilt slightly on hover. Off on touch devices and with reduced motion.
- **18 · Class card opens into the class:** opening a class from the home page / dashboard
  morphs the card into the class page header (View Transitions), and back.
- **19 · Transcript follows along:** while a saved lecture recording plays, the part of the
  transcript being played is highlighted and kept in view; when "Improve with audio" finishes,
  the improved transcript animates in.
- **20 · Record button transforms:** the round record button stretches into a pill showing
  "Recording · m:ss" with level bars, and the dot morphs into a stop square; reverses on stop.

**Out of scope**

- Preview items 1, 5, 6, 7, 10, 11, 13, 15–17, 22–25 (not picked).
- The countdown (21) — separate requirement.
- Any animation on the notes editor typing area or the pen canvas.
- New animation libraries (use CSS / Web Animations / tw-animate-css already installed).

## 4. User stories

- As a student, I want quick visual feedback when I add a subject, upload slides, record or
  save, so that I know it worked without reading.
- As a student who turns on "reduce motion", I want the app to stay calm, so that it doesn't
  make me uncomfortable.
- As a student opening a class, I want the card to grow into the class, so that I keep my place.

## 5. Acceptance criteria

| ID    | Criterion |
| ----- | --------- |
| AC-1  | Motion tokens are defined once (CSS custom properties or a Tailwind theme extension): fast ≈140 ms, base ≈220 ms, slow ≈360 ms, an ease-out curve and a soft spring (≤ ~5% overshoot). The animations below use them. |
| AC-2  | With the OS "reduce motion" setting on, movement (slides, springs, scale, tilt, shake, pulse, float, view-transition morph) is removed; opacity/colour fades may remain; nothing is hidden or broken. |
| AC-3  | (2) In the subjects dialog, results rise in with a stagger of ~30–60 ms per row (whole list under ~0.6 s); pressing Add animates the button to "Added ✓"; the course appears in "To add" with a pop; removing it shrinks it out. |
| AC-4  | (3) Toasts enter with an upward spring and exit by sliding sideways and fading; several toasts stack without overlapping text. |
| AC-5  | (4) On the class workspace tab bars, the active-tab highlight slides to the newly selected tab and the panel content fades/rises in; keyboard tab switching still works. |
| AC-6  | (8) While slides upload, a visible progress indicator fills; on success it turns into a ✓ with a pop; newly shown slide thumbnails/pages enter one after another. Errors still show as today. |
| AC-7  | (9) While recording, a ring pulses around the record control and level bars move with the live microphone level; they stop when recording stops. |
| AC-8  | (20) Starting a recording morphs the round record button into a pill with "Recording · m:ss" (updating each second) and level bars, the dot morphing to a stop square; stopping reverses it. The button keeps an accessible name that says Start/Stop recording. |
| AC-9  | (12) Empty states (e.g. no classes, no notes) show a gently floating illustration/icon. Submitting the sign-in form with an invalid value shakes the field once and the error message slides open. |
| AC-10 | (14) On devices with a fine pointer and hover, primary buttons show a soft light following the cursor and class cards tilt ≤ 4°; none of this happens on touch devices. |
| AC-11 | (18) Opening a class from the home page or dashboard morphs the class card into the class page header (View Transitions API); going back morphs back. Browsers without the API navigate normally. |
| AC-12 | (19) While a saved lecture recording plays, the transcript part matching the playback position is highlighted and scrolled into view (position estimated from playback time when the transcript has no timestamps); pausing keeps the highlight; seeking moves it. When "Improve with audio" completes, the improved transcript fades in (and an "Improved" badge pops). |
| AC-13 | All entrance animations finish within ~400 ms (staggers excepted), exits are faster than entrances, nothing blocks clicks or typing while animating, and there is no animation on the notes editor or pen canvas. |
| AC-14 | No regressions: existing dialogs, toasts, uploads, recording, transcript and navigation behave as before apart from the motion; works at 390 px with no horizontal scroll; typecheck, unit tests and build pass. |

## 6. Design / technical notes

- Reference: the preview's CSS (tokens, keyframes) at the artifact link above; default
  strength "Lively". No new animation dependency.
- Likely files: `src/styles.css` (tokens, keyframes, reduced-motion), `src/components/ui/sonner.tsx`,
  `src/components/ui/tabs.tsx` (or the class workspace's own tab bar),
  `src/components/SemesterSubjectsDialog.tsx`, slide upload / `LectureSlideViewer.tsx`,
  `src/components/AudioTranscriber.tsx`, `src/components/AudioPlayer.tsx` + transcript view,
  `src/routes/auth.tsx`, home / dashboard class cards and `src/routes/_authenticated/class.$classId.tsx`.
- View Transitions: TanStack Router supports `viewTransition` on navigation; give the card and
  the class header the same `view-transition-name` (unique per class).
- Performance: animate only transform, opacity and small blur; level bars from an
  `AnalyserNode` at ~10–20 fps.
- Risk: the transcript highlight is approximate without timestamps; acceptable per AC-12.

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
| 2026-11-26T17:24:00Z | Requirement analyst | Requirement created | Motion and micro-interactions |
| 2026-11-26T17:24:54Z | Requirement analyst | Requirement ready for build | 14 ACs; preview items 2,3,4,8,9,12,14,18,19,20 picked by product owner; Lively strength |
