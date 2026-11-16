/**
 * Builds one PDF from notebook page images (any page lengths) and downloads it.
 * Pages are converted to JPEG on a white background to keep the file small.
 * pdf-lib is loaded only when a PDF is made.
 */
export async function downloadNotebookPdf(title: string, pageImages: string[]) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("LectureLoop");
  const PAGE_WIDTH_PT = 612; // US Letter width; height follows each page's length

  for (const src of pageImages) {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const jpg = await (await fetch(canvas.toDataURL("image/jpeg", 0.86))).arrayBuffer();
    const embedded = await pdf.embedJpg(jpg);
    const height = (PAGE_WIDTH_PT * img.naturalHeight) / img.naturalWidth;
    const page = pdf.addPage([PAGE_WIDTH_PT, height]);
    page.drawImage(embedded, { x: 0, y: 0, width: PAGE_WIDTH_PT, height });
  }

  const bytes = await pdf.save();
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${
    title
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "notebook"
  }.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
