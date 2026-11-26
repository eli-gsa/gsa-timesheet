import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { LOGO_ASPECT, LOGO_PNG_BASE64 } from "@/lib/logoData";
import { formatNumber } from "@/lib/invoicing";
import { fit, safe } from "@/lib/invoicePdf";

export type BonusRow = { week: string; leads: number; rate: number; amount: number };
export type BonusSection = { heading: string | null; rows: BonusRow[] };

export type BonusReport = {
  campaign: string;
  currency: string;
  subtitle: string; // e.g. agent name, or "All selected agents"
  sections: BonusSection[]; // one per agent (campaign mode) or a single one
  generated: string; // display date
};

const A4 = { w: 595.28, h: 841.89 };
const M = 56;
const INK = rgb(0.043, 0.043, 0.043);
const MUTED = rgb(0.42, 0.42, 0.4);
const RULE = rgb(0.82, 0.81, 0.78);

export const rowAmount = (leads: number, rate: number) => Math.round(leads * rate * 100) / 100;

// Lead bonus statement: weeks x (leads, rate per lead, bonus), with subtotals per
// agent section and a grand total. The lead list itself is deliberately left out.
export async function buildLeadBonusPdf(rep: BonusReport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`Lead bonuses - ${rep.campaign}`));
  pdf.setProducer("GSA Timesheet");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));

  const right = (p: PDFPage, text: string, xr: number, y: number, size: number, font: PDFFont, color = INK) => {
    const t = safe(text);
    p.drawText(t, { x: xr - font.widthOfTextAtSize(t, size), y, size, font, color });
  };
  const left = (p: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = INK) => {
    p.drawText(safe(text), { x, y, size, font, color });
  };
  const hline = (p: PDFPage, y: number, t: number, color = RULE) =>
    p.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: t, color });

  const colLeads = 360;
  const colRate = 440;
  const colAmt = A4.w - M;
  const weekW = colLeads - M - 70;

  let page = pdf.addPage([A4.w, A4.h]);
  const logoW = 132;
  const logoH = logoW / LOGO_ASPECT;
  page.drawImage(logo, { x: M, y: A4.h - M - logoH, width: logoW, height: logoH });
  right(page, "LEAD BONUSES", A4.w - M, A4.h - M - 16, 20, bold);
  right(page, rep.generated, A4.w - M, A4.h - M - 34, 10, regular, MUTED);

  let y = A4.h - M - logoH - 46;
  const details: [string, string][] = [
    ["CAMPAIGN", rep.campaign],
    ["AGENT", rep.subtitle],
    ["CURRENCY", rep.currency],
  ];
  const colW = (A4.w - 2 * M) / 2;
  details.forEach(([label, value], i) => {
    const x = M + (i % 2) * colW;
    const yy = y - Math.floor(i / 2) * 40;
    left(page, label, x, yy, 8, regular, MUTED);
    left(page, fit(bold, value, 12, colW - 16), x, yy - 15, 12, bold);
  });
  y -= 40 * 2 + 12;

  const header = (p: PDFPage, yy: number) => {
    left(p, "WEEK", M, yy, 8, regular, MUTED);
    right(p, "LEADS", colLeads, yy, 8, regular, MUTED);
    right(p, "BONUS / LEAD", colRate, yy, 8, regular, MUTED);
    right(p, "BONUS", colAmt, yy, 8, regular, MUTED);
    hline(p, yy - 7, 1, INK);
  };
  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - M - 8;
  };

  const rowH = 22;
  let grandLeads = 0;
  let grand = 0;

  for (const sec of rep.sections) {
    if (y - 70 < M + 60) newPage();
    if (sec.heading) {
      left(page, fit(bold, sec.heading, 12, A4.w - 2 * M), M, y, 12, bold);
      y -= 16;
    }
    header(page, y);
    y -= 7;
    let secLeads = 0;
    let sec$ = 0;
    for (const r of sec.rows) {
      if (y - rowH < M + 60) {
        newPage();
        header(page, y);
        y -= 7;
      }
      const ty = y - 15;
      left(page, fit(regular, r.week, 10.5, weekW), M, ty, 10.5, regular);
      right(page, String(r.leads), colLeads, ty, 10.5, regular);
      right(page, formatNumber(r.rate), colRate, ty, 10.5, regular);
      right(page, formatNumber(r.amount), colAmt, ty, 10.5, regular);
      y -= rowH;
      hline(page, y, 0.5);
      secLeads += r.leads;
      sec$ += r.amount;
    }
    if (y - 30 < M + 40) newPage();
    left(page, sec.heading ? "Subtotal" : "Total", M, y - 17, 10.5, bold);
    right(page, String(secLeads), colLeads, y - 17, 10.5, bold);
    right(page, formatNumber(Math.round(sec$ * 100) / 100), colAmt, y - 17, 10.5, bold);
    y -= 40;
    grandLeads += secLeads;
    grand += sec$;
  }

  if (rep.sections.length > 1) {
    if (y < M + 70) newPage();
    hline(page, y + 14, 1, INK);
    left(page, "TOTAL", M, y - 6, 12, bold);
    right(page, String(grandLeads), colLeads, y - 6, 12, bold);
    right(page, `${rep.currency} ${formatNumber(Math.round(grand * 100) / 100)}`, colAmt, y - 6, 14, bold);
  }

  const pages = pdf.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      p.drawText(t, { x: A4.w / 2 - regular.widthOfTextAtSize(t, 8) / 2, y: M - 20, size: 8, font: regular, color: MUTED });
    });
  }
  return pdf.save();
}
