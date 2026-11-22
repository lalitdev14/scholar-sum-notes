# REQ-2026-11-21-powerpoint-slides-show-their-real-design: PowerPoint slides show their real design

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| ID           | REQ-2026-11-21-powerpoint-slides-show-their-real-design |
| Status       | Changes requested                                       |
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

**Changes after PM review** (commit `5178a72`)

1. One set of navigation: `openDeck` no longer adds pptx-preview's in-slide arrows and "N/M"
   counter (`.pptx-preview-wrapper-prev/-next/-pagination` are never created), so "0/32" and the
   second set of arrows are gone. The toolbar arrows now stop at the first/last slide instead of
   the library wrapping round.
2. Everything uses the slide on screen: the only ways to change slide (toolbar arrows, bookmark
   jump, saved position on open) all go through the app, which updates "Slide N / M" from the
   viewer. Checked on the class page (1440px and 390px; `combo` and `unreadable_slide8` decks): on
   open, after 3× next, after previous, after a bookmark jump to 30 and at the last slide, the slide
   drawn, the toolbar counter, "Bookmarked slide N" and the AI overview slide were the same N every
   time; no library controls in the page; no page errors.
3. Full counter on phones: the counter no longer shrinks or truncates (`shrink-0
whitespace-nowrap`). Below the `sm` breakpoint a PowerPoint deck's counter shows "N / M" (the
   word "Slide" stays for screen readers), with tighter toolbar gaps and button padding. Measured
   with a 128-slide deck: "128 / 128" in full, no horizontal scroll, all toolbar buttons on screen
   and on one line at 360px and 390px (at 320px the buttons wrap to a second line, still complete).
   Desktop ("Slide 128 / 128") and PDF ("Page 1 / 2", also on phones) wording unchanged.

## 8. Test summary (tester)

| Total | Pass | Fail | Blocked | Evidence             |
| ----- | ---- | ---- | ------- | -------------------- |
| 20    | 18   | 2    | 0       | `test-evidence.xlsx` |

Run on the dev server (branch `claude/pptx-faithful-slides`, commit `5b1ef0c`), Chromium 1440x900
(390x844 for TC-19), fake session with mocked Supabase and server functions (AI overview mocked).
Test decks were generated for the cases (python-pptx, damaged copies, LibreOffice 24 exports) and
are not committed. TC-13/14 (and the TC-08/TC-19 checks) were compared with the previous build
(preprod base `756b744`) on a second dev server. 48 screenshots in `evidence/`.

**Failures** (both pre-existing; the previous build behaves the same, and `LectureSlideViewer.tsx`
is not changed by this build):

- **TC-08**: the pptx-preview library's own in-slide pagination reads "0/32" (not "1/32") when a
  deck opens, and its small in-slide next arrow advances the slide (title "Slide 5 of 32") while the
  app counter stays at "Slide 4 / 32". Everything else passed: 32/32 slides drawn with their colour
  backgrounds, 0 text-only, slide 10 picture, app arrows, counter and last slide correct.
- **TC-19**: at 390px the toolbar counter is cut off with an ellipsis ("Slide 2 …"; "Slide 1 / 32"
  needs 76px, the span gets 66px), so "Slide N / M" isn't fully visible on a phone. Slides are drawn,
  whole and centred; controls visible; no horizontal scroll; no page errors.

**Notes**: TC-06 used an OMML equation (with PowerPoint-style picture fallback) exported through
LibreOffice, because LibreOffice Math isn't installed on the test machine; both equations show as
pictures. TC-07: the LibreOffice round trip itself removes the red colour and white title colour
from the file; the viewer draws what the file contains. TC-09: the app has no typed slide-number
field for PowerPoint decks; the slide jump was tested through the Bookmarks list (out-of-range input
not applicable). TC-13/14: slides 1, 2, 3 and 5 are pixel-identical to the previous build; slide 4
differs only through the intended picture-background fix (now fills the slide). TC-15: of three
damaged variants, two were still drawn (normaliser repaired them); the one-stop-gradient variant
shows slide 3 as text with the note and logs the reason.

## 9. Product manager verification

| Field       | Value                 |
| ----------- | --------------------- |
| Decision    | Changes requested     |
| Verified by | Product manager agent |
| Date        | 2026-11-22            |

What I checked myself (dev server, branch `claude/pptx-faithful-slides`, Chromium, class page with
mocked backend, generated decks only): `recitation-32` (32 damaged slides), `dmg-combined`,
`lo-formula` (LibreOffice export with formula) and `good-16x9`, walking every slide; the library's
in-slide arrows; Bookmark after using them; and the toolbar at 390px. The design work itself is good:
every slide drew with its real background, pictures and formatted text, the formula showed as its
pictures, 0 text-only slides, 0 page errors. Blocking problem: the in-slide controls put the viewer
out of step with the app. On `recitation-32` at "Slide 4 / 32" I pressed the library's in-slide next
arrow: the slide shown became "Slide 5 of 32" (in-slide "5/32"), the toolbar stayed "Slide 4 / 32",
and **Bookmark then saved "Bookmarked slide 4"**, a slide the student isn't looking at. The same
applies to the AI overview and the toolbar arrows, which carry on from the wrong number. On open the
in-slide counter says "0/32". Every PowerPoint deck shows two sets of arrows and two counters that
can disagree. That fails AC-3 ("arrows, page counter, … bookmarks and AI overview work") and the
user's goal ("Slide N / M match the lecture"), and it can attach a student's bookmarks to the wrong
slide. The previous build has the same problem, but this requirement explicitly covers it and the fix
is small, so it is not deferred.

Notes per acceptance criterion:

| AC   | Met?   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1 | Yes    | TC-01..TC-05 pass. I checked myself: `dmg-combined` and `recitation-32` draw 5/5 and 32/32 slides with pictures, colour and picture backgrounds and formatted text, and no text-only note.                                                                                                                                                                                                                                                                                                                   |
| AC-2 | Yes    | TC-06 and TC-07 pass. I checked myself: on `lo-formula` the picture shows, the orange background shows, and both equations show as their pictures (not blank, no error). Caveats are documented (OMML isn't typeset; EMF/WMF previews stay blank).                                                                                                                                                                                                                                                           |
| AC-3 | Partly | Count and order are right ("Slide 1 / 32" … "Slide 32 / 32"), and app arrows, bookmark jump and AI overview work when only the toolbar is used (TC-09, TC-10, TC-11, TC-18 pass). **TC-08 fails**: the in-slide counter shows "0/32" on open, and the in-slide arrows change the slide without updating the toolbar counter, so Bookmark and AI overview act on the wrong slide (I reproduced this). **TC-19 fails**: at 390px the counter is cut to "Slide 2 …" (needs 76px, gets 66px; I reproduced this). |
| AC-4 | Yes    | TC-12, TC-13 and TC-14 pass: 16:9 and 4:3 slides are whole and centred and pixel-identical to the previous build, apart from the intended picture-background fix. My `good-16x9` walk matched.                                                                                                                                                                                                                                                                                                               |
| AC-5 | Yes    | TC-15: the one-stop-gradient slide shows as text with the note, the other slides draw, and the console names the reason. The other two damaged variants were repaired and drawn, which is better than required.                                                                                                                                                                                                                                                                                              |
| AC-6 | Yes    | TC-16 and TC-17 pass. Corrupt, truncated and not-a-PowerPoint files each show a clear message; `.ppt` and `.key` are refused with a message. I saw 0 page errors in all my runs.                                                                                                                                                                                                                                                                                                                             |

**Required changes** (back to step 2, then re-run steps 3–4):

1. **One set of navigation for PowerPoint decks.** Hide the pptx-preview library's own in-slide
   pagination (the "N/M" counter and its prev/next arrows: `.pptx-preview-wrapper-pagination`,
   `.pptx-preview-wrapper-prev`, `.pptx-preview-wrapper-next`), for example with scoped CSS on the
   viewer host or by removing them after `init()`. The toolbar arrows, the "Slide N / M" counter,
   the bookmark list and the keyboard (if supported) are the only way to change slides. If the
   developer keeps any library control instead, it must update the app's current slide (counter,
   Bookmark, AI overview) on every change and must never show "0/M". Hiding them is preferred.
2. **Bookmark and AI overview always use the slide on screen.** After any navigation, the slide
   drawn, the toolbar "Slide N / M", "Bookmarked slide N" and the AI overview's slide must all be
   the same N.
3. **Phone counter fully visible.** At 390px wide (and down to 360px) the toolbar shows the whole
   counter, with no ellipsis, for up to 3-digit decks (e.g. "Slide 32 / 32" and "Slide 128 / 128"),
   with no horizontal page scroll and all toolbar buttons still reachable. For example: don't let
   the counter shrink (`shrink-0 whitespace-nowrap`) and make room by tightening the gaps, or drop
   the word "Slide"/"Page" below the `sm` breakpoint ("32 / 32"). Desktop text stays
   "Slide N / M"; PDF stays "Page N / M".
4. **Retest:** TC-08 and TC-19 must pass. Add a check to TC-08 that the in-slide controls are not
   shown (or that each one stays in sync), and that Bookmark after every navigation saves the slide
   shown. Re-run TC-01, TC-09..TC-12, TC-18 and TC-20 (PDF) as regression, then regenerate
   `test-evidence.xlsx`.

Not blocking (follow-up): we never had the real "Recitation9" file. After this ships to pre-prod,
the product owner should open Recitation9 there and compare it with Brightspace. If any slide still
shows as text, its `[slides]` console line names the reason.

## 10. Audit trail

Append rows with `node scripts/req/audit.mjs <folder> "<Role>" "<Action>" "<Details>"`.

| Time (UTC)           | Role                | Action                             | Details                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-21T23:44:57Z | Requirement analyst | Requirement created                | PowerPoint slides show their real design                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-21T23:45:18Z | Requirement analyst | Requirement ready for build        | 6 acceptance criteria (AC-1..AC-6); example deck Recitation9 (32 slides, text-only today)                                                                                                                                                                                                                                                                                |
| 2026-11-21T23:47:27Z | Test master         | Test cases written                 | 20 test cases covering AC-1..AC-6                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-22T00:26:15Z | Developer           | Build complete                     | Package normaliser (pptx-normalize.ts) + per-slide reload/fallbacks in pptx-deck.ts; damaged/LibreOffice decks draw 32/32 with design; commit c3d4e91                                                                                                                                                                                                                    |
| 2026-11-22T01:03:46Z | Tester              | Tests executed                     | 18/20 passed, 2 failed, 0 blocked                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-22T01:03:46Z | Tester              | Evidence generated                 | test-evidence.xlsx with 48 screenshots                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-22T01:09:09Z | Product manager     | PM requested changes               | AC-1,2,4,5,6 met; AC-3 partly: hide library in-slide arrows/counter (out of sync, 0/M, bookmark saves wrong slide) and show full Slide N / M at 390px; retest TC-08, TC-19                                                                                                                                                                                               |
| 2026-11-22T01:10:25Z | Test master         | Test cases updated after PM review | TC-08 revised (in-slide controls absent or in sync, never 0/M, Bookmark toast = slide shown = counter after every step); TC-19 revised (390px and 360px, full counter incl. 128-slide deck, no horizontal scroll, all toolbar buttons reachable); TC-11, TC-13, TC-20 tightened; TC-21 added (slide/counter/Bookmark/AI overview agree across all navigation). 21 cases. |
| 2026-11-22T01:18:03Z | Developer | Changes after PM review complete | Library in-slide arrows/counter removed (toolbar is the only navigation; drawn slide, counter, bookmark and AI overview always agree); counter shown in full on phones (360/390px); commit 5178a72 |
