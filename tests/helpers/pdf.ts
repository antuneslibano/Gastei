import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { linesFromItems, type Line, type RawTextItem } from '../../src/lib/payslip/pdfLines';

export interface TextOp { x: number; y: number; text: string; size?: number; bold?: boolean; align?: 'left' | 'right' }

/** Gera um PDF A4 simples com textos posicionados (y medido a partir do topo). Aceita várias páginas. */
export async function makePdf(input: TextOp[] | TextOp[][]): Promise<Uint8Array> {
  const pages = (Array.isArray(input[0]) ? input : [input]) as TextOp[][];
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const ops of pages) {
  const page = doc.addPage([595, 842]);
  for (const op of ops) {
    const f = op.bold ? bold : font;
    const size = op.size ?? 9;
    const w = f.widthOfTextAtSize(op.text, size);
    page.drawText(op.text, { x: op.align === 'right' ? op.x - w : op.x, y: 842 - op.y, size, font: f });
  }
  }
  return doc.save();
}

export async function pdfToLines(data: Uint8Array): Promise<Line[]> {
  const doc = await getDocument({ data }).promise;
  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...linesFromItems(content.items as RawTextItem[], p));
  }
  return lines;
}
