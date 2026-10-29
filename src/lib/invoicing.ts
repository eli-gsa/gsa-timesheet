// Shared helpers for the Invoicing page and invoice PDF. Pure (no React, no
// server-only APIs) so both Server and Client Components can import them.

export const COMMON_CURRENCIES = ["GBP", "USD", "EUR", "ZAR", "AUD", "CAD", "NGN", "KES", "AED", "INR"];
export const DEFAULT_CURRENCY = "GBP";

export type RateCell = { rate: number | null; inherited: boolean };

export function isMonth(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
export function isCurrency(s: string | undefined | null): s is string {
  return !!s && /^[A-Z]{3}$/.test(s);
}

export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelLong(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Amount for one cell: half-hour count x hourly rate, rounded to cents. Every
// total is a sum of these rounded cells, so the figures on screen, in the CSV
// and on the invoice always add up exactly.
export function lineAmount(halfHours: number, rate: number | null): number {
  if (rate === null || halfHours <= 0) return 0;
  return Math.round(halfHours * 0.5 * rate * 100) / 100;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "GBP 1,234.50": the ISO code rather than a symbol, which is unambiguous
// across currencies (many share "$") and renders in any font.
export function formatMoney(n: number, currency: string): string {
  return `${currency} ${formatNumber(n)}`;
}

// Next invoice number after `last`: bump the trailing digits, keeping their
// width (INV-2026-0007 -> INV-2026-0008). If there's no previous number, or it
// doesn't end in digits, start a fresh INV-<year>-0001.
export function nextInvoiceNumber(last: string | null | undefined, fallbackYear: number): string {
  const m = last ? /^(.*?)(\d+)$/.exec(last.trim()) : null;
  if (!m) return `INV-${fallbackYear}-0001`;
  const next = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return `${m[1]}${next}`;
}

export function isValidInvoiceNumber(s: string): boolean {
  return s.length >= 1 && s.length <= 40 && /^[A-Za-z0-9][A-Za-z0-9 _\-./#]*$/.test(s);
}

export function currencyOptions(): { code: string; label: string }[] {
  let all: string[] = [];
  try {
    all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
  } catch {
    all = [];
  }
  const codes = Array.from(new Set([...COMMON_CURRENCIES, ...all]));
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "currency" });
  } catch {
    names = null;
  }
  const label = (c: string) => {
    let n: string | undefined;
    try {
      n = names?.of(c);
    } catch {
      n = undefined;
    }
    return n && n !== c ? `${c} — ${n}` : c;
  };
  const common = COMMON_CURRENCIES.map((c) => ({ code: c, label: label(c) }));
  const rest = codes
    .filter((c) => !COMMON_CURRENCIES.includes(c))
    .sort()
    .map((c) => ({ code: c, label: label(c) }));
  return [...common, ...rest];
}

// CSV cell: quote when needed, and neutralise spreadsheet formula injection
// (a name starting with = + - @ would otherwise be executed by Excel).
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
