import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// ---------------------------------------------------------------------------
// Fills `public/receipt.pdf` — the printed Vision Properties stationery — with
// the data for one booking or one payment, and hands back the bytes.
//
// The template is used AS IS: it is loaded, its single page is kept untouched,
// and values are drawn on top of the blank rules the form already prints. No
// element of the artwork is redrawn, moved or restyled, so what downloads is
// the office's own receipt with the blanks completed.
//
// Every coordinate below was measured off the template itself (the dotted rules
// were located by scanning a 288-dpi render of it), so a value sits exactly on
// the line its label points at. Coordinates are in PDF points with the ORIGIN AT
// THE TOP-LEFT — the same frame the measurements were taken in — and are flipped
// to pdf-lib's bottom-left origin at draw time.
// ---------------------------------------------------------------------------

const TEMPLATE = path.join(process.cwd(), "public", "receipt.pdf");

// Template page box, from `pdfinfo`: 419.52 x 595.2 pt (A5 portrait).
const PAGE_H = 595.2;

// The finished receipt is issued on A4, because A4 is what every office printer
// in the building is loaded with. The stationery's own page is A5, so printing
// it as-is put the whole receipt in the top corner of the sheet with the bottom
// half blank. The artwork is NOT redrawn or re-laid-out for this: the filled A5
// page is placed on an A4 page and scaled up whole, so the receipt keeps the
// exact proportions the template was designed with and simply arrives at the
// size of the paper it is printed on. A5 (0.7049 w/h) and A4 (0.7072) differ by
// a quarter of a percent, so the scaled page fills the sheet edge to edge.
const A4_W = 595.28;
const A4_H = 841.89;

const INK = rgb(0.05, 0.05, 0.12);

// A blank the form prints a dotted rule for. `y` is the rule itself; text sits
// just above it. `x1`/`x2` are the ends of that rule.
//
// `y2` marks a slot that may run onto a SECOND line — the baseline for it, in
// the blank the form leaves under that rule. Only the three fields whose real
// values genuinely outrun one line have it (a full postal address, a long email,
// an amount in words that reaches crores), and each `y2` was placed in verified
// empty space so a wrapped value never touches the artwork or the next label.
interface Slot {
  x1: number;
  x2: number;
  y: number;
  y2?: number;
  size?: number; // preferred size, shrunk to fit when the value is long
  center?: boolean;
}

const SLOTS = {
  // Header — "Receipt No :" has no rule, so the value goes in the gap between
  // the label and the navy title block (which starts at x=128.8).
  receiptNo: { x1: 74.5, x2: 127.5, y: 93.5, size: 8.5 },
  date: { x1: 335.2, x2: 397.5, y: 98.2, size: 8.5 },

  // Customer details
  name: { x1: 85.0, x2: 294.0, y: 140.8 },
  age: { x1: 331.2, x2: 400.2, y: 140.8 },
  fatherOrSpouse: { x1: 116.8, x2: 259.2, y: 157.8 },
  email: { x1: 299.0, x2: 398.8, y: 157.8, y2: 166.6 },
  phone: { x1: 80.5, x2: 202.5, y: 175.1 },
  nominee: { x1: 272.2, x2: 399.5, y: 175.1 },
  address: { x1: 56.8, x2: 400.2, y: 193.6, y2: 202.6 },
  anniversary: { x1: 69.0, x2: 136.5, y: 210.6, size: 8.5 },
  dob: { x1: 181.0, x2: 268.2, y: 211.8, size: 8.5 },
  occupation: { x1: 331.0, x2: 400.2, y: 211.8, size: 8.5 },

  // Plot details
  project: { x1: 74.8, x2: 199.2, y: 250.2 },
  location: { x1: 262.0, x2: 399.2, y: 250.2 },

  // Payment details
  amount: { x1: 93.8, x2: 202.5, y: 326.8 },
  mode: { x1: 278.5, x2: 400.2, y: 326.8 },
  amountWords: { x1: 88.2, x2: 251.5, y: 344.5, y2: 351.6, size: 8.5 },
  tentativeRegDate: { x1: 331.8, x2: 398.5, y: 348.1, size: 8.5 },
  directorNameId: { x1: 95.0, x2: 197.8, y: 364.9, size: 8.5 },
  partnerNameId: { x1: 300.5, x2: 397.2, y: 364.9, size: 8.5 },
} satisfies Record<string, Slot>;

// The three white cells of the Plot No. / Sector / Total Area strip. That strip
// is a ruled box rather than a set of dotted lines, so values are centred in it
// (box runs y 261.0 -> 286.5; 277.6 puts a ~10pt line on its optical centre).
const BOX_BASELINE = 277.6;
const BOXES = {
  plotNo: { x1: 68.2, x2: 144.5, y: BOX_BASELINE, size: 11, center: true },
  sector: { x1: 192.8, x2: 271.5, y: BOX_BASELINE, size: 11, center: true },
  totalSqft: { x1: 319.8, x2: 398.0, y: BOX_BASELINE, size: 11, center: true },
} satisfies Record<string, Slot>;

export interface ReceiptFields {
  receiptNo: string;
  date: string;
  name?: string | null;
  age?: string | null;
  fatherOrSpouse?: string | null;
  email?: string | null;
  phone?: string | null;
  nominee?: string | null;
  address?: string | null;
  anniversary?: string | null;
  dob?: string | null;
  occupation?: string | null;
  project?: string | null;
  location?: string | null;
  plotNo?: string | null;
  sector?: string | null;
  totalSqft?: string | null;
  amount?: string | null;
  mode?: string | null;
  amountWords?: string | null;
  tentativeRegDate?: string | null;
  directorNameId?: string | null;
  partnerNameId?: string | null;
}

// The template's own fonts are subset to the glyphs it already prints, so they
// cannot render arbitrary customer data; Helvetica is embedded for the values.
// It is WinAnsi-encoded, so anything outside that range is folded to its closest
// Latin form rather than thrown away — a stray "₹" or a curly apostrophe in a
// name must not blank out the whole field.
const FOLD: Record<string, string> = {
  "₹": "Rs.", "‘": "'", "’": "'", "“": '"', "”": '"',
  "–": "-", "—": "-", "−": "-", "•": "-", " ": " ",
  "…": "...", "·": "-",
};

function sanitize(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch in FOLD) { out += FOLD[ch]; continue; }
    const c = ch.codePointAt(0)!;
    // Printable WinAnsi range; everything else (Tamil, emoji, control codes)
    // would throw at encode time, so it is dropped.
    if (c === 0x20 || (c >= 0x21 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff)) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

// Values are written at their natural size when they fit and shrunk when they do
// not, down to a floor that is still legible in print. A slot with a second line
// available wraps onto it before shrinking that far. Truncation is the last
// resort — a customer's address should read in full, small, rather than be cut.
const MIN_SIZE = 4.6;

// A value only moves onto its second line when keeping it on one would shrink it
// past this. Wrapping is not free: it costs a mid-word break for anything without
// spaces, and it pushes text down into the gap the next row needs. Splitting
// "…@gmail.com" after the "c" to gain a fraction of a point reads as a broken
// form; the same address set whole, one point smaller, reads as a filled one.
const SINGLE_LINE_FLOOR = 7.0;

// Greedy word wrap, with a fallback to breaking mid-token: an email address or a
// long project code has no spaces to break at, and dropping half of it would be
// worse than splitting it across the two lines.
function wrap(text: string, font: PDFFont, width: number, size: number): string[] {
  const lines: string[] = [];
  let line = "";

  const push = () => { if (line) { lines.push(line); line = ""; } };
  const fits = (t: string) => font.widthOfTextAtSize(t, size) <= width;

  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) { line = candidate; continue; }
    push();
    if (fits(word)) { line = word; continue; }
    // Unbreakable token wider than the line — split it character by character.
    let chunk = "";
    for (const ch of word) {
      if (fits(chunk + ch)) { chunk += ch; continue; }
      lines.push(chunk);
      chunk = ch;
    }
    line = chunk;
  }
  push();
  return lines;
}

// The largest size at which the value lays out within the lines it is allowed.
function layout(text: string, font: PDFFont, width: number, preferred: number, maxLines: number) {
  for (let size = preferred; size > MIN_SIZE; size -= 0.25) {
    const lines = wrap(text, font, width, size);
    if (lines.length <= maxLines) return { size, lines, truncated: false };
  }
  const lines = wrap(text, font, width, MIN_SIZE);
  if (lines.length <= maxLines) return { size: MIN_SIZE, lines, truncated: false };

  // Past the floor even wrapped — keep as much as fits and mark the cut, so a
  // shortened value is never mistaken for the whole of one.
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, MIN_SIZE) > width) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}...`;
  return { size: MIN_SIZE, lines: kept, truncated: true };
}

function draw(page: PDFPage, font: PDFFont, slot: Slot, raw: string | null | undefined) {
  const text = sanitize(String(raw ?? ""));
  if (!text) return;

  const width = slot.x2 - slot.x1 - 3;
  // Two lines must clear each other within the gap the form leaves, so a wrapped
  // value is capped by that gap rather than by the preferred size.
  const ceiling = slot.y2 ? Math.min(slot.size ?? 9.5, (slot.y2 - slot.y) / 1.15) : (slot.size ?? 9.5);

  const single = layout(text, font, width, slot.size ?? 9.5, 1);
  let { size, lines } = single;

  if (slot.y2) {
    const wrapped = layout(text, font, width, ceiling, 2);
    // A wrap that lands on a space keeps the value readable; one that cuts
    // through a word does not. `lines.join(" ")` reconstructs the original only
    // when every break fell between words.
    const onWordBoundary = wrapped.lines.join(" ") === text;

    // Two reasons to take the second line, and only these two: the value would
    // otherwise be set too small to read comfortably, or it would otherwise be
    // cut short. Anything that already fits legibly on its own rule stays there,
    // which keeps the row clear of the row beneath it.
    const tooSmallOnOneLine =
      onWordBoundary && wrapped.size > single.size && single.size < SINGLE_LINE_FLOOR;
    const savesTheWholeValue = single.truncated && !wrapped.truncated;

    if (tooSmallOnOneLine || savesTheWholeValue) ({ size, lines } = wrapped);
  }

  lines.forEach((line, i) => {
    const drawn = font.widthOfTextAtSize(line, size);
    const x = slot.center ? slot.x1 + (slot.x2 - slot.x1 - drawn) / 2 : slot.x1 + 2;
    const y = i === 0 ? slot.y : slot.y2!;
    // Measurements are top-left origin; pdf-lib draws from the bottom-left.
    // 2.2pt of clearance keeps the baseline off the printed rule.
    page.drawText(line, { x, y: PAGE_H - (y - 2.2), size, font, color: INK });
  });
}

// Read once per server process — the template is ~8.5MB and never changes at
// runtime, so re-reading it per download would be pure I/O for no gain.
let templateBytes: Buffer | null = null;
async function loadTemplate(): Promise<Buffer> {
  if (!templateBytes) templateBytes = await readFile(TEMPLATE);
  return templateBytes;
}

export async function renderReceiptPdf(fields: ReceiptFields): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await loadTemplate());
  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const [key, slot] of Object.entries(SLOTS)) {
    draw(page, font, slot, fields[key as keyof ReceiptFields]);
  }
  for (const [key, slot] of Object.entries(BOXES)) {
    draw(page, font, slot, fields[key as keyof ReceiptFields]);
  }

  toA4(page);

  // Names the file in a viewer's title bar and in a phone's share sheet, where
  // the filename from Content-Disposition is not always what gets shown.
  pdf.setTitle(`Receipt ${fields.receiptNo}`);
  return pdf.save();
}

// Enlarges the finished page from the stationery's A5 to A4, in place.
//
// The page itself is scaled — artwork, rules and the values just drawn onto them
// together, by one factor, so every proportion is exactly as designed and only
// the size changes. Nothing is re-laid-out and nothing is redrawn.
//
// The scale is uniform rather than stretched to A4 exactly: A5 and A4 differ in
// shape by a quarter of a percent, so height is the binding dimension and the
// scaled page is 1.9pt narrower than the sheet. The page boxes are then widened
// to full A4 around it — a negative origin puts that difference as half a point
// of margin down each side, which centres the receipt on the paper.
function toA4(page: PDFPage): void {
  const scale = Math.min(A4_W / page.getWidth(), A4_H / page.getHeight());
  page.scale(scale, scale);

  const xOffset = -(A4_W - page.getWidth()) / 2;
  page.setMediaBox(xOffset, 0, A4_W, A4_H);
  // A viewer that finds a CropBox honours it over the MediaBox, and the template
  // carries one from Photoshop — left alone, it would crop the enlarged page back
  // to a corner of itself.
  page.setCropBox(xOffset, 0, A4_W, A4_H);
}

// Filenames the office can file without renaming: VPT1A2B3C-24-Aug-2026.pdf.
export function receiptFilename(receiptNo: string, name?: string | null): string {
  const who = sanitize(String(name ?? "")).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${receiptNo}${who ? `-${who}` : ""}.pdf`.slice(0, 120);
}
