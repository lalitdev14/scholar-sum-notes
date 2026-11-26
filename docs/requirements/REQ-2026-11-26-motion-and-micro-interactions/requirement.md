# REQ-2026-11-26-motion-and-micro-interactions: Motion and micro-interactions

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-motion-and-micro-interactions            |
| Status       | PR raised |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/motion-polish` |
| PR           | https://github.com/lalitdev14/scholar-sum-notes/pull/83 |

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

Built on `claude/motion-polish` (code commit `c953f8e`). No new dependencies: CSS keyframes,
transitions, the View Transitions API and a little JavaScript.

| AC | How it is met |
| -- | ------------- |
| AC-1 | `src/styles.css` "Motion" block: `--motion-fast` 140 ms, `--motion-base` 220 ms, `--motion-slow` 360 ms, `--motion-ease-out`, `--motion-ease-in-out`, `--motion-spring` (linear(), peak 1.035 = 3.5% overshoot; cubic fallback without linear()), `--motion-rise`, `--motion-stagger` 45 ms. All `motion-*` classes/keyframes use them. |
| AC-2 | One `@media (prefers-reduced-motion: reduce)` block: rise/pop/flip/roll/panel entrances become a plain fade; shake, float, record ring pulse, card tilt, button glow and view-transition morph are off; tab highlight and record pill jump instead of sliding; level bars stay still and show the level by brightness; chips are removed at once. Sonner's own reduced-motion rule disables toast transitions. |
| AC-3 | `SemesterSubjectsDialog`: result rows (`data-testid="nyu-result"`) use `motion-rise` with `--i` per row across both groups, 45 ms apart, capped at 5 (last row done by ~0.59 s). The Add button label rolls up to "✓ Added" (and back) only when pressed. "To add" chips (`chosen-chip`) pop in; removing one (X or the Added button) shrinks it out (140 ms, `data-leaving`), and it is already out of the list that "Done" saves. |
| AC-4 | Toasts (`[data-sonner-toast]`) start at translateY(14px) scale(.96) and settle on the spring (360 ms); dismissed toasts slide 24 px sideways and fade in 220 ms. Sonner's stacking (collapsed back toasts hide their text) is unchanged. |
| AC-5 | `useTabIndicator` (`src/hooks/use-tab-indicator.ts`) slides one highlight to the selected `role="tab"`: built into `TabsList` (Type / Handwrite / Transcribe, `data-testid="tab-indicator"`), the Slides / Summary underline (`view-tab-indicator`) and both slide-deck tab bars. Panels (`motion-tab-panel`) rise/fade in when they become active. Radix keyboard switching is untouched; tabs keep their own highlight until the indicator is placed. |
| AC-6 | `UploadProgress.tsx`: the "Add slides" button shows a ring (`role="progressbar"`, `data-testid="upload-progress"`, aria-valuenow) that fills while uploading (estimated from file size, since Supabase uploads report no progress; caps at 88% until stored, 97% while saving), then a green ✓ pops (`upload-done`, label "Uploaded") for 1.4 s. Errors: ring disappears, same toast as before. PDF pages enter one after another (`motion-flip-in`, 70 ms apart, capped). |
| AC-7 | `AudioTranscriber`: while recording, a ring pulses around the record control (box-shadow, 1.4 s) and 5 level bars (`data-testid="level-bars"`, `--lv` per bar) follow an AnalyserNode on the microphone at ~15 fps (reuses the open mic stream, or opens one for the bars). Meter stops and bars reset whenever status leaves "recording". |
| AC-8 | One record button (`data-testid="record-button"`, `data-state` idle/recording/paused/saving): round red button with a dot (text "Start transcribing" / "Resume" beside it); recording → 12.75 rem pill "Recording · m:ss" (updates each second) + bars, dot morphs to a stop square; stopping pauses (as the old Pause button did) and reverses. Accessible name: "Start recording" / "Stop recording" / "Start recording (resume)". "Finish & save", Discard, the status/timer line (`recording-timer`) and the 40-minute limit are unchanged. |
| AC-9 | Floating icons (`motion-float`, `data-testid="empty-float"`): dashboard "No enrolled subjects yet", class page summary and slides empty states, notes page "Nothing saved in this subject yet". Sign-in/sign-up form: an invalid value (browser validation, e.g. bad email or empty field) shakes that field once and an inline message slides open below it (`email-error`, `password-error`, `name-error`, `aria-invalid`); wrong email/password also shakes the password field with "That email and password don't match." (toast kept). Typing in the field closes it. |
| AC-10 | Default-variant buttons get `motion-glow` (a soft light at the cursor); dashboard class cards (`data-testid="class-card"`) and the home "Continue" card get `motion-tilt` (≤ 4°, `MAX_TILT_DEG`). Both only inside `@media (hover: hover) and (pointer: fine)` with no reduced motion; one delegated pointermove listener (mouse only) in `__root.tsx`. |
| AC-11 | Dashboard cards, the home "Continue" card and home class rows carry `view-transition-name: class-<id>`; the class page header (`data-testid="class-header"`) has the same name. Their Links and the class page "Back to dashboard" use TanStack `viewTransition`; browsers without `document.startViewTransition` navigate normally. Browser Back is a normal navigation (no morph). |
| AC-12 | `AudioPlayer` reports the share played (timeupdate / play / seeked; falls back to the saved duration when the file has none); `TranscriptText` splits the transcript into sentence parts (≤ 25 words) and highlights the estimated part (`data-testid="transcript-now"`, `data-now`), scrolling it into view in the transcript box. Pausing keeps it; seeking moves it. In `RecordingsList` (class page) and the notes page transcript view. When "Improve with audio" finishes, the improved transcript fades in and an "Improved" badge pops next to the title (`improved-badge`). Logic in `src/lib/transcript-follow.ts` with unit tests. |
| AC-13 | Entrances use 220–360 ms (staggers capped); exits 140–220 ms; animations use fill-mode "backwards" so nothing keeps a transform; leaving chips are `inert` and pointer-events none; nothing on the TipTap editor or the pen canvas (only the tab panel around them fades on a tab switch). |
| AC-14 | Behaviour unchanged apart from motion (the record button replaces Start/Pause/Resume with the same actions). Checks: `bun run typecheck` pass; `bun test src` 24 pass (new `transcript-follow.test.ts`); `bun run build` pass; `prettier --check` pass on all changed TS/TSX files (`styles.css` was not Prettier-formatted before and was left as is); eslint on changed files: 0 errors. |

**Files:** `src/styles.css`, `src/lib/motion.ts`, `src/lib/transcript-follow.ts`,
`src/lib/transcript-follow.test.ts`, `src/hooks/use-tab-indicator.ts`,
`src/components/UploadProgress.tsx`, `src/components/ui/tabs.tsx`,
`src/components/ui/button.tsx`, `src/components/SemesterSubjectsDialog.tsx`,
`src/components/AudioTranscriber.tsx`, `src/components/AudioPlayer.tsx`,
`src/components/TranscriptText.tsx`, `src/components/RecordingsList.tsx`,
`src/components/LectureSlideViewer.tsx`, `src/components/WelcomeHome.tsx`,
`src/routes/__root.tsx`, `src/routes/auth.tsx`, `src/routes/_authenticated/class.$classId.tsx`,
`src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/notes.tsx`.

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
| 2026-11-26T17:27:02Z | Test master | Test cases written | 33 cases covering AC-1..AC-14 |
| 2026-11-26T20:36:03Z | Developer | Build complete | Commit c953f8e; AC-1..AC-14 built with CSS tokens/keyframes, tab indicator hook, upload progress, record morph + mic meter, transcript follow, view transitions; typecheck, 24 unit tests, build and prettier pass |
| 2026-11-26T20:36:39Z | Product owner | Steps 4-5 waived | Product owner asked for the PR before testing ('generate pr'); test cases written, test run and PM review not done |
| 2026-11-26T20:37:03Z | Release | PR raised | lalitdev14/scholar-sum-notes#83 into preprod |
