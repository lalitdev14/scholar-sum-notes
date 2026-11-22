/**
 * Where a PowerPoint deck's exact PDF copy is stored (see `pptx-to-pdf.ts`). Plain helpers with
 * no imports, so both the browser and server functions can use them.
 */

/** Storage path of a deck's PDF copy: `<uid>/<classId>/<uuid>.pptx` → `….converted.pdf`. */
export function pdfCopyPath(deckPath: string): string {
  return `${deckPath.replace(/\.pptx$/i, "")}.converted.pdf`;
}

/** The storage files of a slide deck: the deck itself and, for a PowerPoint, its PDF copy. */
export function slideStorageFiles(deckPath: string): string[] {
  return /\.pptx$/i.test(deckPath) ? [deckPath, pdfCopyPath(deckPath)] : [deckPath];
}
