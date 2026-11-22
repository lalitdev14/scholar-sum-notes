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

Commit `c3d4e91` on `claude/pptx-faithful-slides`. Files: `src/lib/pptx-normalize.ts` (new),
`src/lib/pptx-deck.ts`, `package.json`/`bun.lock` (`jszip` ^3.10.2 listed explicitly; it is the
same copy pptx-preview uses, bundled once in the slide viewer chunk). `LectureSlideViewer.tsx` is
unchanged.

**Root causes found** (by reading pptx-preview 1.0.7 and loading generated decks in Chromium):

1. The library loads slides in one loop with one `try/catch`: the first slide that throws is
   dropped **together with every slide after it**, silently. With all slides dropped the old
   fallback showed the whole deck as text (the Recitation9 symptom). Throws we reproduced:
   - a slide's layout (or layout's master, master's theme) not found by name: layouts missing
     from `[Content_Types].xml`, Override part names whose case differs from the zip, targets such
     as `./../x`, `../../ppt/x`, non-standard part names, strict-OOXML relationship URIs, or a
     slide with no layout link;
   - a `[Content_Types].xml` Override for a part that isn't in the zip (stops the whole deck);
   - a slide placeholder that its layout doesn't have (common in slides copied between decks):
     the library reads `.source` of nothing;
   - a picture whose image relationship is missing or linked (`r:link`);
   - any other bad shape, e.g. a shape geometry without a formula, or a gradient with one stop.
2. `presentation.xml` without `p:defaultTextStyle` (LibreOffice exports) makes every master fail
   halfway (unhandled promise rejections = page errors) so master shapes are never loaded.
3. Master/layout decorations (logo, colour bars) are drawn only when flagged `userDrawn="1"`,
   which PowerPoint writes and LibreOffice/python-pptx don't.
4. `mc:AlternateContent` is ignored, so equations (OMML) and OLE objects (MathType, embedded
   sheets) were blank although the file stores a fallback picture.
5. Picture backgrounds get a size without units, so they were drawn at the image's own size
   instead of filling the slide. SVG images get MIME `image/*` and don't show.
6. Slides are ordered by file number, not by the deck's slide list.

**What was changed**

- `normalizePptx()` (runs before the library sees the file) rebuilds the package: content types
  from the parts actually in the zip (correct type per slide, layout, master, theme, notes,
  presentation, charts, diagrams; missing-part Overrides dropped; Default types per extension);
  every relationship target resolved against its owner and rewritten as `../x` (works with the
  library's `replace("../","ppt/")`); non-standard part and media names renamed; missing
  slide→layout→master→theme links added; `p:sldSz` and `p:defaultTextStyle` added if missing;
  `mc:AlternateContent` → its fallback (equation/object picture); bare OMML → plain text; OLE
  frames → their preview picture (PNG/JPEG/GIF/SVG); slide/layout `p:bgRef` → solid fill;
  master/layout decorations flagged `userDrawn`; orphan placeholders positioned like the master's
  placeholder of the same type; pictures with a missing image removed; slide parts not in the
  slide list not shown. Inter-tag whitespace is removed (the library's own XML parser turns it into
  stray nodes). Parts that need no change are copied as they are.
- `openDeck()`: while loading, a layout/master/theme lookup that fails returns an existing one
  (logged); layout placeholder lookups never return nothing; slides the library still dropped are
  re-loaded one at a time with the library's own loader (first as they are, then leaving out one
  shape at a time, then charts/diagrams/tables, then pictures, then groups); slides are put in
  presentation order; a shape that throws while drawing is skipped; picture backgrounds get the
  intended size; SVG media get `image/svg+xml`. The existing repair and the text-only fallback stay
  as the last resort.
- Every reason is logged with `console.warn("[slides] …")`: a grouped list of package fixes, missing
  layouts/masters/themes, "N of M slides were dropped while loading", the exact error per slide,
  which shape was left out, and why a slide is shown as text only.
- A file that isn't a PowerPoint package (not a zip, no presentation part, or the library can't
  read it) throws: "This file couldn't be opened as a PowerPoint deck. It may be damaged: save it
  again as .pptx, or upload a PDF." (the viewer shows it in place of the slides).

**How each criterion is met** (checked in Chromium on the dev server: `pptx-preview` + `openDeck`
directly, and the real class page with mocked Supabase; decks made with python-pptx and
LibreOffice 24, plus damaged copies of a 32-slide deck. Test decks are not committed.)

| AC   | How it is met / evidence                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | 32-slide deck with pictures, colour and picture backgrounds, damaged as: no layout/master/theme Overrides, no Overrides at all, Override for a missing part, part-name case mismatch, `/ppt/…`, `./../…`, `../../ppt/…` targets, strict URIs, renamed parts/media, missing links, a mix of all. Before: 0/32 slides drawn for most. After: 32/32 drawn with pictures and backgrounds, 0 text-only. |
| AC-2 | LibreOffice exports (pptx→pptx, pptx→odp→pptx, odp with a formula object): pictures, solid and picture backgrounds drawn; equations come from the fallback picture, or as text when there is no picture. Master decorations now drawn; the 11 page errors per LibreOffice deck are gone.                                                                                                           |
| AC-3 | Class page, 32-slide decks (incl. damaged ones): "Slide 1 / 32" on load, next/previous arrows, last slide "Slide 32 / 32", bookmark ("Bookmarked slide 32"), jump via bookmark to "Slide 30 / 32", AI overview reads the slide headline. A deck whose slide list order differs from file numbers is shown in slide-list order.                                                                     |
| AC-4 | Old vs new `openDeck` compared pixel by pixel on 4:3 and 16:9 decks (PowerPoint's default template via python-pptx) and a chart/table deck: identical, except for intended fixes (picture backgrounds now fill the slide; equation fallback picture now shown). Fit-by-height and centring unchanged.                                                                                              |
| AC-5 | A slide with a one-stop gradient background (invalid; the library can't read it) shows its text with the existing note, the other 31 slides draw; console: `[slides] slide 8 (ppt/slides/slide8.xml) could not be read: TypeError …` and `[slides] slide 8 is shown as text only`. A slide with one bad shape is drawn without just that shape (logged).                                           |
| AC-6 | No page errors in any run above. Not-a-zip, truncated zip and a non-PowerPoint zip show the clear message above (the uploader already refuses non-.pptx/.pdf files with "Choose a PDF or PowerPoint (.pptx) file.").                                                                                                                                                                               |

**Known limitations**

- OMML equations are not typeset: they show as the picture saved with them, or as plain text
  (`E=mc2`) when the file has no picture.
- MathType / Equation Editor objects whose preview is EMF/WMF stay blank: browsers can't draw
  EMF/WMF. Converting the deck to PDF (or re-saving the equations as pictures) shows them.
- Slide/layout `p:bgRef` theme backgrounds are drawn as a solid colour (a theme gradient or
  picture fill isn't reproduced). Connectors on masters/layouts are still not drawn (library).
- Fonts that aren't available in the browser are substituted (out of scope).
- We had no copy of "Recitation9"; the fixes target every way we found the library drops slides,
  and the console log names the reason if a deck still shows text-only slides.

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
| 2026-11-21T23:47:27Z | Test master         | Test cases written          | 20 test cases covering AC-1..AC-6                                                         |
| 2026-11-22T00:26:15Z | Developer | Build complete | Package normaliser (pptx-normalize.ts) + per-slide reload/fallbacks in pptx-deck.ts; damaged/LibreOffice decks draw 32/32 with design; commit c3d4e91 |
