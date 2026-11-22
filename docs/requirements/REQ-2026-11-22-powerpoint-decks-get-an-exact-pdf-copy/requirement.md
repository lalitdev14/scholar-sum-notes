# REQ-2026-11-22-powerpoint-decks-get-an-exact-pdf-copy: PowerPoint decks get an exact PDF copy

| Field        | Value                                                 |
| ------------ | ----------------------------------------------------- |
| ID           | REQ-2026-11-22-powerpoint-decks-get-an-exact-pdf-copy |
| Status       | In test                                               |
| Requested by | Product owner                                         |
| Created      | 2026-11-22                                            |
| Branch       | `claude/pptx-pdf-copy`                                |
| PR           | (added in step 6)                                     |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> use PDF Studio's PPTX to PDF conversion: when a user uploads a pptx, make a PDF copy in the background, show the pptx first and switch to the PDF once it is available (so Write on slide works and slides look exactly like Brightspace)

## 2. Problem / goal

PowerPoint decks now draw in the browser (REQ-2026-11-21), but "Write on slide" and "Write on all slides" in the
handwriting notebook only work for PDF decks ("Open a PDF slide deck on the Slides side first."), and the browser
drawing can still differ from the original (fonts, formulas). Goal: every uploaded PowerPoint deck gets an exact PDF
copy made by PDF Studio's converter (LibreOffice on Render). The student sees the PowerPoint straight away, and the
viewer switches to the PDF copy as soon as it exists, so slides look like Brightspace and Write on slide works.

## 3. Scope

**In scope**

- After a `.pptx` upload, convert it in the background with PDF Studio's API
  (`POST https://pdf-studio-api-xy4g.onrender.com/api/convert/office-to-pdf`, multipart field `files`; returns a job
  `{id,status,outputs}`; poll `GET /api/jobs/<id>` until `status` is `done`/`failed`; download
  `outputs[0].url` (relative, signed) from the same host). No PDF Studio account. CORS already allows lectureloop.org,
  www.lectureloop.org and lectureloop-preprod.vercel.app.
- Save the PDF next to the deck in the student's own storage folder as `<deck path without .pptx>.converted.pdf`
  (no database change; existing storage rules allow `.pdf` in the user's folder).
- Show the PowerPoint first with a small "Preparing exact slides…" indicator; when the PDF is saved, switch the viewer
  to the PDF on the same slide number and show "Exact slides ready".
- When a deck with a PDF copy is opened later, open the PDF straight away.
- Decks uploaded before this feature (no PDF copy) are converted the first time they are opened.
- Deleting a deck also deletes its PDF copy.
- Failure/fallback: if the conversion fails, times out, or the PDF's page count differs from the deck's slide count
  (e.g. hidden slides), keep the PowerPoint view, don't show an error to the student beyond a quiet note, and try again
  the next time the deck is opened. Never convert the same deck twice at the same time.
- "Write on slide" / "Write on all slides" work on decks shown as PDF; while a PowerPoint deck is still being
  converted the message says so (instead of "Open a PDF slide deck…").
- Content Security Policy `connect-src` allows the converter host. Privacy page mentions that PowerPoint files are sent
  once to the PDF Studio server for conversion.

**Out of scope**

- Changes to PDF Studio itself (CORS already done by the product owner).
- Converting PDFs or other formats; server-side (Vercel) conversion.

## 4. User stories

- As a student, I want my uploaded PowerPoint to look exactly like the professor's slides, so I can follow formulas
  and diagrams.
- As a student, I want "Write on slide" to work on PowerPoint decks, so I can annotate any lecture.
- As a student, I want to start using the deck immediately after upload, without waiting for a conversion.

## 5. Acceptance criteria

Each criterion is testable and has an ID that test cases refer to.

| ID   | Criterion                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1 | After uploading a `.pptx`, the deck appears immediately in the PowerPoint viewer with a visible "Preparing exact slides…" indicator; the student can navigate and take notes meanwhile.                                                                            |
| AC-2 | The deck is converted in the background via PDF Studio and the PDF is saved as `<deck>.converted.pdf` in the student's own storage folder; the viewer then switches to the PDF on the same slide number, shows "Exact slides ready", and the indicator disappears. |
| AC-3 | Opening a deck that already has a PDF copy shows the PDF directly (no conversion request). Opening a deck uploaded earlier without a copy starts the conversion and switches when done.                                                                            |
| AC-4 | "Write on slide" and "Write on all slides" add the correct slide(s) as notebook pages for a deck shown as PDF; while a PowerPoint deck is still being converted, the message explains that the exact slides are being prepared.                                    |
| AC-5 | If the conversion fails or times out, or the PDF page count doesn't match the slide count, the PowerPoint view stays, no error dialog interrupts the student, and the next open retries. Only one conversion per deck runs at a time.                              |
| AC-6 | Deleting a deck deletes its PDF copy; bookmarks, slide counter, AI overview and zoom work after the switch; PDF uploads and the PowerPoint viewer behave as before (no regression); no page errors.                                                                |
| AC-7 | The site's security policy allows the converter host, and the privacy page says PowerPoint files are sent once to the PDF Studio server for conversion.                                                                                                            |

## 6. Design / technical notes

- Files likely affected: `src/routes/_authenticated/class.$classId.tsx` (upload, delete, deck tabs),
  `src/components/LectureSlideViewer.tsx` (choose PDF copy, switch), a new `src/lib/pptx-to-pdf.ts` (client for
  PDF Studio + storage), `src/components/HandwritingNotebook.tsx` (message), `vite.config.ts` (CSP connect-src),
  `src/routes/privacy.tsx`, possibly `src/routes/_authenticated/notes.tsx` / dashboard cleanups that delete slides.
- Converter (verified 2026-11-22): CORS OK for both production and pre-prod origins; a 2-slide deck converted in ~12 s;
  free Render plan may add a 30–60 s cold start; results expire after 60 minutes (download immediately). Limits:
  100 MB/file, 60 requests/min.
- Storage: bucket `lecture-slides`, path `<uid>/<classId>/<uuid>.converted.pdf`, contentType `application/pdf`.
- Bookmarks are stored by slide number; keep numbering 1:1 (reject copies whose page count differs).
- No database migration. Converter URL as a constant (optionally overridable by `VITE_PDF_CONVERTER_URL`).

## 7. Build summary (developer)

What was changed and how each acceptance criterion is met. Code commit: `2862bfd` on `claude/pptx-pdf-copy`.

**Changes**

- `src/lib/pptx-to-pdf.ts` (new): browser client for PDF Studio. `ensurePdfCopy(deckPath, deck)` posts the .pptx
  (multipart `files`) to `PDF_CONVERTER_URL/api/convert/office-to-pdf`, polls `/api/jobs/<id>` every 1.5 s (overall
  timeout 4 min), downloads `outputs[0].url`, checks it starts with `%PDF-` and that its page count (pdf.js) equals
  the deck's slide count (`p:sldId` entries in `ppt/presentation.xml`, hidden slides included; fallback
  `ppt/slides/slideN.xml`), then uploads it to `lecture-slides` at `<deck path without .pptx>.converted.pdf`
  (`application/pdf`; an "already exists" answer counts as success, since the bucket has no UPDATE policy for
  upsert). `downloadPdfCopy()` fetches an existing copy. One conversion per deck: an in-memory promise map
  (calls share the running conversion) plus a localStorage marker so a second tab waits for the first tab's copy.
  `forgetDeck()` stops a running conversion from saving a copy for a deck deleted meanwhile. Converter URL constant,
  overridable with `VITE_PDF_CONVERTER_URL`. Failures resolve to `null` with `console.warn("[slides] exact PDF copy
not made …: <reason>")`.
- `src/lib/slide-copy-path.ts` (new): `pdfCopyPath()` / `slideStorageFiles()` (no imports; used by browser and server).
- `src/components/LectureSlideViewer.tsx`: for a PowerPoint deck it first tries the PDF copy and, if present, renders
  it with the existing PDF branch (no conversion). Otherwise it shows the PowerPoint view with a
  "Preparing exact slides…" pill (`role=status`), starts/joins the conversion, and on success stores the current
  slide as the saved position, switches to the PDF on that page and toasts "Exact slides ready". On failure the pill
  becomes a quiet "PowerPoint view" note (tooltip explains it will be retried). A deck shown as its PDF copy keeps
  "Slide" as the unit for the counter and bookmarks.
- `src/lib/slide-capture.ts` + `src/components/HandwritingNotebook.tsx`: viewers register while a deck's exact slides
  are being prepared; "Write on slide"/"Write on all slides" then say "Exact slides are still being prepared for this
  PowerPoint. Try again in a moment." (otherwise the existing PDF message).
- `src/routes/_authenticated/class.$classId.tsx`: starts the conversion right after a .pptx upload (with the uploaded
  file); deleting a deck removes the deck and its `.converted.pdf`.
- `src/routes/_authenticated/dashboard.tsx` (class delete) and `src/lib/admin.functions.ts` (admin class delete) also
  remove the copies. Account deletion already removes the whole user folder.
- `vite.config.ts`: CSP `connect-src` adds `https://pdf-studio-api-xy4g.onrender.com`.
- `src/routes/privacy.tsx`: new sentence that PowerPoint files are sent once to the PDF Studio server (run by the
  LectureLoop team) for an exact PDF copy and not kept there (result expires after an hour).

**Acceptance criteria**

- AC-1: deck appears at once in the PowerPoint viewer with "Preparing exact slides…"; navigation and notes work meanwhile.
- AC-2: background conversion, copy saved as `<uid>/<classId>/<uuid>.converted.pdf`, switch on the same slide number,
  toast "Exact slides ready", pill removed.
- AC-3: copy downloaded first on open → PDF directly, no converter request; older decks without a copy convert on open.
- AC-4: PDF copy registers the existing slide capture, so Write on slide / all slides work; message while preparing.
- AC-5: failed/cancelled job, timeout, network error, non-PDF or page-count mismatch → PowerPoint view stays, no
  dialog or error toast, console.warn with reason, retried on next open; upload + viewer (and two viewers, e.g.
  full screen) share one conversion.
- AC-6: delete removes both files; bookmarks/counter/AI overview/zoom use the same 1:1 numbers on the PDF; PDF uploads
  untouched.
- AC-7: CSP and privacy page as above.

**Developer check** (Chromium, dev server, fake session, mocked Supabase and mocked converter via `page.route`
serving a PDF made by the real converter from the test deck): all of the above passed, including one converter POST
for upload+viewer, switch at slide 3/5, bookmark on slide 3, zoom 125 %, AI overview, Write on slide and Write on all
5 slides on the copy, reopen without conversion, delete removing both files, failure and page-mismatch fallbacks with
retry, PDF upload regression, and no page errors. Real converter checked with curl from this container (5-slide deck
→ 5-page PDF in ~11 s). `bun run typecheck` and `bun run build` pass.

**Limitations**

- The browser talks to the converter directly, so it only works on origins the converter's CORS allows (production and
  pre-prod); on localhost the conversion fails quietly and the PowerPoint view stays.
- Decks with hidden slides (LibreOffice leaves them out) or a converter page count that differs are never switched and
  are re-sent on every open (as the requirement asks: retry next open).
- If the tab is closed mid-conversion, nothing is saved; the next open starts again (a stale cross-tab marker can make
  another tab wait up to ~4.5 min before trying itself).
- PDF copies made before a deck is deleted elsewhere in an old tab could remain only if deletion happens outside this
  app's delete paths.
- After the switch the deck scrolls like other PDF decks (no previous/next arrows), as PDF decks already do.

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

| Time (UTC)           | Role                | Action                      | Details                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-22T17:02:06Z | Requirement analyst | Requirement created         | PowerPoint decks get an exact PDF copy                                                                                                                                                                                                                                                                                                |
| 2026-11-22T17:02:33Z | Requirement analyst | Requirement ready for build | 7 acceptance criteria; converter CORS verified for lectureloop.org and pre-prod; real conversion test 12 s                                                                                                                                                                                                                            |
| 2026-11-22T17:04:38Z | Test master         | Test cases written          | 22 test cases covering AC-1..AC-7                                                                                                                                                                                                                                                                                                     |
| 2026-11-22T17:13:45Z | Developer           | Build complete              | New src/lib/pptx-to-pdf.ts (PDF Studio client, validation, per-deck lock) + slide-copy-path.ts; viewer opens copy or converts and switches on same slide; Write-on-slide preparing message; deletes remove .converted.pdf; CSP + privacy. Verified in Chromium with mocked Supabase/converter; typecheck + build pass. Commit 2862bfd |
