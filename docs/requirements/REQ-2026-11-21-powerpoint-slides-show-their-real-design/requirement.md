# REQ-2026-11-21-powerpoint-slides-show-their-real-design: PowerPoint slides show their real design

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| ID           | REQ-2026-11-21-powerpoint-slides-show-their-real-design |
| Status       | Ready for build                                         |
| Requested by | Product owner                                           |
| Created      | 2026-11-21                                              |
| Branch       | `claude/powerpoint-slides-show-their-real-design`       |
| PR           | (added in step 6)                                       |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> there is a difference in the slide viewer (Recitation9 shows only text in LectureLoop; Brightspace shows the real slide with images, background and formula)

## 2. Problem / goal

Some PowerPoint decks show only plain text in the Slides panel ("This slide's design can't be shown here…"),
while the same deck opened elsewhere (for example Brightspace) shows the real slide: images, coloured
background, formulas and layout. Example: "Recitation9" (32 slides) in the student's Fundamental
algorithm class shows every slide as text.

Today's viewer (pptx-preview, plus the repair added in #66) drops slides it can't link to a layout and we
then fall back to text. Goal: decks that PowerPoint, Google Slides, Keynote or LibreOffice can open should
show their real design in LectureLoop, as close as possible to the original; text-only stays only as a
last resort for individual slides that truly can't be drawn.

## 3. Scope

**In scope**

- Find out why slides are dropped (log the real reason per slide in the browser console for debugging).
- Normalise the deck package before it is drawn so decks saved by other tools (missing or different
  `[Content_Types].xml` entries, unusual relationship paths such as `/ppt/...`, `./`, absolute or
  `..`-heavy targets, missing layout/master/theme links) are read like a PowerPoint-saved deck.
- Draw images, background colours/images and text formatting for those decks.
- Keep every slide's position and the slide count correct; navigation, page count, bookmarks, AI overview
  and zoom keep working.
- Keep text-only fallback, but only for a slide that still fails after normalisation.

**Out of scope**

- Animations, transitions, embedded video/audio playback.
- Pixel-perfect fonts that aren't available in the browser.
- Converting decks to PDF on the server (no converter on Vercel).
- Old `.ppt` and Keynote `.key` files (already refused with a message).

## 4. User stories

- As a student, I want my lecture PowerPoint to look like the professor's slides, so that I can follow the
  diagrams, formulas and images while I take notes.
- As a student, I want every slide in the right order with the right slide count, so that bookmarks and
  "Slide N / M" match the lecture.

## 5. Acceptance criteria

Each criterion is testable and has an ID that test cases refer to.

| ID   | Criterion                                                                                                                                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | A deck whose slides were previously shown as text because of package differences (layouts missing from `[Content_Types].xml`, or relationship targets written as `/ppt/...` or `./...`) now shows the slides with their real design: pictures, background colour/image and formatted text are drawn, not the text-only note. |
| AC-2 | A deck exported from LibreOffice Impress (`.pptx`) with pictures, a coloured background and a formula/equation shows pictures and background; the formula appears (as drawn or as its picture/text), never a blank or an error.                                                                                              |
| AC-3 | Slide count and order match the file (e.g. 32 slides → "Slide 1 / 32"), and the arrows, page counter, slide jump, bookmarks and AI overview work on these decks.                                                                                                                                                             |
| AC-4 | Normal PowerPoint-saved decks (4:3 and 16:9) look the same as before (no regression), whole and centred.                                                                                                                                                                                                                     |
| AC-5 | A slide that still cannot be drawn after normalisation shows its text with the existing note; the rest of the deck is drawn normally, and the browser console logs why the slide failed.                                                                                                                                     |
| AC-6 | No page errors; a corrupt or non-PowerPoint file still shows a clear error message instead of crashing the page.                                                                                                                                                                                                             |

## 6. Design / technical notes

- Files: `src/lib/pptx-deck.ts` (open/repair), `src/components/LectureSlideViewer.tsx` (viewer).
- Approach: before giving the file to pptx-preview, open it with JSZip (already a dependency of
  pptx-preview) and normalise the package: add missing `[Content_Types].xml` Overrides for every
  slide/layout/master/theme part found in the zip, normalise relationship targets so the library's
  `Target.replace("../","ppt/")` lookups resolve, then generate a new ArrayBuffer for the library.
  Keep the existing post-load repair and per-slide fallback as a safety net.
- Log per-slide drop/draw reasons with `console.warn("[slides] …")`.
- No database or environment changes. Bundle impact: JSZip is already in the slide viewer chunk.
- Test decks: python-pptx (with pictures + background), LibreOffice round-trips (`soffice --convert-to pptx`),
  and deliberately damaged variants. Real course files are not committed.

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

| Time (UTC)           | Role                | Action                      | Details                                                                                   |
| -------------------- | ------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| 2026-11-21T23:44:57Z | Requirement analyst | Requirement created         | PowerPoint slides show their real design                                                  |
| 2026-11-21T23:45:18Z | Requirement analyst | Requirement ready for build | 6 acceptance criteria (AC-1..AC-6); example deck Recitation9 (32 slides, text-only today) |
