/**
 * 將 PDF 各位元組轉成 PNG data URL（伺服器端，供薪金確認後掛附件）。
 * 使用動態 require／import，避免 Turbopack 把 native canvas 打進 ESM chunk。
 */

const MAX_PAGES = 8;

export type PdfPageImage = {
  pageNumber: number;
  dataUrl: string;
  size: number;
  note: string;
};

export function pdfBytesToDataUrl(pdfBytes: Uint8Array): { dataUrl: string; size: number } {
  const b64 = Buffer.from(pdfBytes).toString('base64');
  return {
    dataUrl: `data:application/pdf;base64,${b64}`,
    size: pdfBytes.byteLength,
  };
}

export async function pdfBytesToPageImages(pdfBytes: Uint8Array): Promise<{
  pages: PdfPageImage[];
  truncated: boolean;
  totalPages: number;
}> {
  // Native binding — must stay external to the Next bundle
  const { createCanvas } = await import('@napi-rs/canvas');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    useSystemFonts: true,
    disableWorker: true,
  } as Record<string, unknown>);
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages || 1;
  const pageCount = Math.min(totalPages, MAX_PAGES);
  const pages: PdfPageImage[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const png = canvas.toBuffer('image/png');
    const b64 = png.toString('base64');
    const dataUrl = `data:image/png;base64,${b64}`;
    pages.push({
      pageNumber,
      dataUrl,
      size: png.byteLength,
      note: `薪金單 PDF 第 ${pageNumber} 頁`,
    });
  }

  return {
    pages,
    truncated: totalPages > MAX_PAGES,
    totalPages,
  };
}
