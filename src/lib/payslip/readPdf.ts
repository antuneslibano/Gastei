import { linesFromItems, type Line, type RawTextItem } from './pdfLines';

// Build "legacy" do pdf.js: compatível com WebViews Android mais antigos.
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJs> | null = null;

async function getPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export class PdfPasswordError extends Error {
  constructor(public readonly wrongPassword: boolean) {
    super(wrongPassword ? 'Senha incorreta' : 'PDF protegido por senha');
  }
}

/** Lê o PDF e devolve as linhas de texto de todas as páginas. */
export async function readPdfLines(data: ArrayBuffer, password?: string): Promise<Line[]> {
  const pdfjs = await getPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data), password });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === 'PasswordException') throw new PdfPasswordError(e.code === 2);
    throw err;
  }
  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...linesFromItems(content.items as RawTextItem[], p));
  }
  await task.destroy();
  return lines;
}
