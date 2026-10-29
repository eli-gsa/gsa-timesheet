import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { LOGO_ASPECT, LOGO_PNG_BASE64 } from "@/lib/logoData";
import { formatNumber, monthLabelLong } from "@/lib/invoicing";
import { fmtHours } from "@/lib/types";

export type InvoiceLine = {
  project: string;
  halfHours: number;
  rate: number | null;
  amount: number;
};

export type InvoiceData = {
  number: string;
  agentName: string;
  month: string; // YYYY-MM
  currency: string;
  lines: InvoiceLine[];
  totalHalfHours: number;
  total: number;
};

const A4 = { w: 595.28, h: 841.89 };
const M = 56; // page margin
const INK = rgb(0.043, 0.043, 0.043);
const MUTED = rgb(0.42, 0.42, 0.4);
const RULE = rgb(0.82, 0.81, 0.78);

// Standard PDF fonts only cover Latin-1; anything outside it (or a stray
// control character) would make drawText throw. Fold accents to plain
// letters first ("Zoë" -> "Zoe"), then replace whatever is left.
function safe(s: string): string {
  const folded = s
    .replace(/[\u2013\u2014\u2212]/g, "-") // en/em dash, minus
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  return folded.replace(/[^\x20-\x7E¡-ÿ]/g, "?");
}

function fit(font: PDFFont, text: string, size: number, maxW: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
  return t + "…";
}

export async function buildInvoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${safe(inv.number)}`);
  pdf.setProducer("GSA Timesheet");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));

  const right = (page: PDFPage, text: string, xRight: number, y: number, size: number, font: PDFFont, color = INK) => {
    const t = safe(text);
    page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
  };
  const left = (page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = INK) => {
    page.drawText(safe(text), { x, y, size, font, color });
  };
  const hline = (page: PDFPage, y: number, thickness: number, color = RULE) => {
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness, color });
  };

  // Column right edges for the numeric columns; the project column takes the rest.
  const colHours = 350;
  const colRate = 440;
  const colAmount = A4.w - M;
  const projectW = colHours - M - 70;

  let page = pdf.addPage([A4.w, A4.h]);

  // --- Header: logo left, title + number right ---------------------------
  const logoW = 132;
  const logoH = logoW / LOGO_ASPECT;
  page.drawImage(logo, { x: M, y: A4.h - M - logoH, width: logoW, height: logoH });
  right(page, "INVOICE", A4.w - M, A4.h - M - 16, 20, bold);
  right(page, inv.number, A4.w - M, A4.h - M - 34, 11, regular, MUTED);

  // --- Details block -----------------------------------------------------
  let y = A4.h - M - logoH - 46;
  const details: [string, string][] = [
    ["AGENT", inv.agentName],
    ["PERIOD", monthLabelLong(inv.month)],
    ["INVOICE NUMBER", inv.number],
    ["CURRENCY", inv.currency],
  ];
  const colW = (A4.w - 2 * M) / 2;
  details.forEach(([label, value], i) => {
    const x = M + (i % 2) * colW;
    const row = Math.floor(i / 2);
    const yy = y - row * 40;
    left(page, label, x, yy, 8, regular, MUTED);
    left(page, fit(bold, value, 12, colW - 16), x, yy - 15, 12, bold);
  });
  y -= 40 + 52;

  // --- Table -------------------------------------------------------------
  const drawTableHeader = (p: PDFPage, yy: number) => {
    left(p, "PROJECT", M, yy, 8, regular, MUTED);
    right(p, "HOURS", colHours, yy, 8, regular, MUTED);
    right(p, "RATE", colRate, yy, 8, regular, MUTED);
    right(p, "AMOUNT", colAmount, yy, 8, regular, MUTED);
    hline(p, yy - 7, 1, INK);
  };
  drawTableHeader(page, y);
  y -= 7;

  const rowH = 24;
  const bottomLimit = M + 120; // leave room for totals on the last page
  for (const line of inv.lines) {
    if (y - rowH < bottomLimit) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M - 8;
      drawTableHeader(page, y);
      y -= 7;
    }
    const ty = y - 16;
    left(page, fit(regular, line.project, 11, projectW), M, ty, 11, regular);
    right(page, fmtHours(line.halfHours * 0.5), colHours, ty, 11, regular);
    right(page, line.rate === null ? "-" : formatNumber(line.rate), colRate, ty, 11, regular, line.rate === null ? MUTED : INK);
    right(
      page,
      line.rate === null ? "-" : formatNumber(line.amount),
      colAmount,
      ty,
      11,
      regular,
      line.rate === null ? MUTED : INK
    );
    y -= rowH;
    hline(page, y, 0.5);
  }

  // --- Totals ------------------------------------------------------------
  y -= 10;
  if (y < M + 70) {
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - M - 8;
  }
  left(page, "Total hours", M, y - 12, 11, regular, MUTED);
  right(page, fmtHours(inv.totalHalfHours * 0.5), colHours, y - 12, 11, bold);
  y -= 34;
  hline(page, y + 14, 1, INK);
  left(page, "TOTAL DUE", M, y - 6, 12, bold);
  right(page, `${inv.currency} ${formatNumber(inv.total)}`, colAmount, y - 6, 14, bold);

  if (inv.lines.some((l) => l.rate === null)) {
    left(page, "A dash means no rate has been set for that project; it is not included in the total.", M, y - 34, 8.5, regular, MUTED);
  }

  // --- Page numbers (only when it runs to more than one page) --------------
  const pages = pdf.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      p.drawText(t, { x: A4.w / 2 - regular.widthOfTextAtSize(t, 8) / 2, y: M - 20, size: 8, font: regular, color: MUTED });
    });
  }

  return pdf.save();
}
