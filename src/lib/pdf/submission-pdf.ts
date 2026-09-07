import "server-only";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

// ฟอนต์ไทย Garuda (TLWG, เผยแพร่ต่อได้) — ฝังใน repo ที่ src/assets/fonts
// pdfkit ใช้ fontkit จัด layout จึงวางสระ/วรรณยุกต์ไทยถูกต้อง
// โหลดแบบ lazy + cache: ถ้า path เพี้ยนตอน runtime จะ throw เฉพาะตอนสร้าง PDF
// (route จับ error → 500 พร้อมข้อความ) ไม่พังตอน import ทั้งโมดูล
let _fonts: { reg: Buffer; bold: Buffer } | null = null;
function loadFonts(): { reg: Buffer; bold: Buffer } {
  if (_fonts) return _fonts;
  const dir = path.join(process.cwd(), "src/assets/fonts");
  _fonts = {
    reg: fs.readFileSync(path.join(dir, "Garuda-Regular.ttf")),
    bold: fs.readFileSync(path.join(dir, "Garuda-Bold.ttf")),
  };
  return _fonts;
}

// จานสีเอกสาร (โหมดพิมพ์ = สว่างเสมอ)
const C = {
  ink: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  brand: "#2f6fe0",
  brandSoft: "#eaf1ff",
  fail: "#dc2626",
  pass: "#16a34a",
  amber: "#d97706",
};

export interface PdfAnswer {
  label: string;
  type: string;
  display?: string;
  note?: string;
  fail?: boolean;
  photo?: Buffer | null;
  rows?: Record<string, string>[];
  columns?: { id: string; label: string }[];
}

export interface SubmissionPdfData {
  tenantName: string;
  formTitle: string;
  formIcon?: string;
  docNo: string;
  fullId: string;
  statusLabel: string;
  statusColor?: "pass" | "fail" | "amber" | "muted";
  resultFail: boolean;
  failCount: number;
  userName: string;
  submittedAt: string;
  durationS: number | null;
  formVersion: number;
  answers: PdfAnswer[];
  history?: { label: string; reviewer: string; approved: boolean; note?: string; at: string }[];
  review?: { approved: boolean; reviewer: string; at: string; note?: string } | null;
}

// ลบ emoji / สัญลักษณ์ที่ Garuda ไม่มี glyph (ไม่งั้นขึ้นเป็นกล่องว่าง)
// เก็บไทย ละติน ตัวเลข วรรคตอน และ ° ไว้
function clean(s?: string): string {
  if (!s) return "";
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const PAGE = { w: 595.28, h: 841.89 }; // A4 pt
const M = 48; // margin
const CONTENT_W = PAGE.w - M * 2;

function statusHex(s?: SubmissionPdfData["statusColor"]): string {
  if (s === "pass") return C.pass;
  if (s === "fail") return C.fail;
  if (s === "amber") return C.amber;
  return C.muted;
}

/** สร้าง PDF ใบส่งฟอร์มเป็น Buffer (เรียกจาก API route) */
export function buildSubmissionPdf(data: SubmissionPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fonts = loadFonts();
    const doc = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M }, bufferPages: true });
    doc.registerFont("th", fonts.reg);
    doc.registerFont("th-bold", fonts.bold);

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = M;
    const bottom = PAGE.h - M;

    const ensure = (need: number) => {
      if (y + need > bottom) {
        doc.addPage();
        y = M;
      }
    };

    // ---------- Header ----------
    // KROK wordmark
    doc.roundedRect(M, y, 16, 16, 3).fill(C.brand);
    doc.font("th-bold").fontSize(13).fillColor(C.ink).text("KROK", M + 22, y + 1);
    // status badge (ขวาบน)
    const badge = data.statusLabel;
    const bw = doc.font("th-bold").fontSize(10).widthOfString(badge) + 18;
    const sc = statusHex(data.statusColor);
    doc.roundedRect(PAGE.w - M - bw, y - 2, bw, 20, 5).lineWidth(1).stroke(sc);
    doc.fillColor(sc).text(badge, PAGE.w - M - bw, y + 3, { width: bw, align: "center" });
    y += 26;

    // form title (ตัด emoji icon ออก — Garuda ไม่มี glyph)
    doc.font("th-bold").fontSize(19).fillColor(C.ink).text(clean(data.formTitle) || "ฟอร์ม", M, y, { width: CONTENT_W });
    y = doc.y + 2;
    doc.font("th").fontSize(9).fillColor(C.faint)
      .text(`${clean(data.tenantName)} · เอกสารเลขที่ ${data.docNo}`, M, y);
    y = doc.y + 8;

    // rule
    doc.moveTo(M, y).lineTo(PAGE.w - M, y).lineWidth(1.5).stroke(C.ink);
    y += 12;

    // ---------- Meta grid ----------
    const meta: [string, string][] = [
      ["ผู้กรอก", clean(data.userName) || "—"],
      ["เวลาส่ง", data.submittedAt],
      ["ใช้เวลา", data.durationS != null ? `${data.durationS} วินาที` : "—"],
      ["เวอร์ชันฟอร์ม", `v${data.formVersion}`],
    ];
    const colW = CONTENT_W / 2;
    meta.forEach(([k, v], i) => {
      const col = i % 2;
      const mx = M + col * colW;
      if (col === 0 && i > 0) y += 18;
      const line0 = y;
      doc.font("th").fontSize(9.5).fillColor(C.muted).text(`${k}: `, mx, line0, { continued: true });
      doc.font("th-bold").fillColor(C.ink).text(v);
      if (col === 1) { /* stay same row */ }
    });
    y += 22;

    // result summary line
    doc.font("th-bold").fontSize(10).fillColor(data.resultFail ? C.fail : C.pass)
      .text(data.resultFail ? `พบปัญหา ${data.failCount} รายการ` : "ครบถ้วน", M, y);
    y = doc.y + 10;

    // ---------- Answers ----------
    for (const a of data.answers) {
      if (a.type === "table" && a.columns && a.columns.length) {
        drawTable(doc, a, () => y, (ny) => { y = ny; });
        continue;
      }
      // ปกติ: label ซ้าย + ค่าขวา (ถ้าเป็นรูป → เต็มความกว้างใต้ label)
      const labelW = 170;
      const valX = M + labelW + 12;
      const valW = CONTENT_W - labelW - 12;

      const aLabel = clean(a.label) || "—";
      const aDisplay = clean(a.display) || "—";
      const aNote = clean(a.note);

      // ประเมินความสูงที่ต้องใช้
      doc.font("th").fontSize(10);
      const labelH = doc.heightOfString(aLabel, { width: labelW });
      let valH = 0;
      if (a.photo) valH = 0; // รูปจัดการแยก
      else valH = doc.heightOfString(aDisplay, { width: valW });
      const noteH = aNote ? doc.font("th").fontSize(8.5).heightOfString(aNote, { width: labelW }) + 2 : 0;
      const rowH = Math.max(labelH + noteH, valH) + 10;

      ensure(a.photo ? labelH + 16 : rowH);

      const rowTop = y;
      doc.font("th").fontSize(10).fillColor(C.muted).text(aLabel, M, rowTop, { width: labelW });
      if (aNote) {
        // มาร์คเตือนด้วยจุดสีแดง (แทน emoji ที่ฟอนต์ไม่มี) แล้วตามด้วยข้อความสีแดง
        doc.font("th").fontSize(8.5).fillColor(C.fail).text(aNote, M, doc.y + 1, { width: labelW });
      }

      if (a.photo) {
        y = Math.max(doc.y, rowTop) + 6;
        try {
          const maxW = Math.min(CONTENT_W, 320);
          const maxH = 220;
          ensure(maxH + 8);
          doc.image(a.photo, M, y, { fit: [maxW, maxH] });
          // openImage มีใน runtime แต่ไม่มีใน @types/pdfkit → cast เพื่อคำนวณความสูงจริง
          const dims = (doc as unknown as { openImage: (b: Buffer) => { width: number; height: number } }).openImage(a.photo);
          const scale = Math.min(maxW / dims.width, maxH / dims.height);
          y += dims.height * scale + 10;
        } catch {
          doc.font("th").fontSize(9).fillColor(C.faint).text("(ไม่สามารถแสดงรูปได้)", M, y);
          y = doc.y + 8;
        }
      } else {
        doc.font("th-bold").fontSize(10).fillColor(a.fail ? C.fail : C.ink)
          .text(aDisplay, valX, rowTop, { width: valW });
        y = Math.max(rowTop + rowH, doc.y + 8);
      }

      // เส้นคั่นบาง
      doc.moveTo(M, y - 4).lineTo(PAGE.w - M, y - 4).lineWidth(0.5).stroke(C.line);
    }

    // ---------- Approval history ----------
    if (data.history && data.history.length) {
      ensure(30);
      y += 8;
      doc.font("th-bold").fontSize(11).fillColor(C.ink).text("ประวัติการอนุมัติ", M, y);
      y = doc.y + 4;
      for (const h of data.history) {
        ensure(28);
        const dc = h.approved ? C.pass : C.fail;
        doc.font("th-bold").fontSize(9.5).fillColor(dc)
          .text(`${clean(h.label)} — ${h.approved ? "อนุมัติ" : "ตีกลับ"}`, M, y, { continued: true });
        doc.font("th").fillColor(C.muted).text(`  โดย ${clean(h.reviewer)}  ·  ${h.at}`);
        y = doc.y + 1;
        const hNote = clean(h.note);
        if (hNote) {
          doc.font("th").fontSize(9).fillColor(C.ink).text(`“${hNote}”`, M + 6, y, { width: CONTENT_W - 6 });
          y = doc.y;
        }
        y += 5;
        doc.moveTo(M, y - 2).lineTo(PAGE.w - M, y - 2).lineWidth(0.5).stroke(C.line);
      }
    }

    // ---------- Footer (ทุกหน้า) ----------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fy = PAGE.h - M + 14;
      doc.font("th").fontSize(7.5).fillColor(C.faint);
      doc.text("สร้างโดย KROK · ฟอร์มดิจิทัลหน้างาน", M, fy, { lineBreak: false });
      doc.text(`${i + 1}/${range.count}`, PAGE.w - M - 60, fy, { width: 60, align: "right", lineBreak: false });
    }

    doc.end();
  });
}

// ตารางแบบกริด — จัดการ page break เอง (local y) และวาดเส้นแบ่งคอลัมน์ต่อแถว
// จึงถูกต้องแม้ตารางยาวข้ามหน้า
function drawTable(
  doc: PDFKit.PDFDocument,
  a: PdfAnswer,
  getY: () => number,
  setY: (n: number) => void
) {
  const cols = a.columns!;
  const rows = a.rows || [];
  const colW = CONTENT_W / cols.length;
  const rowH = 20;
  const bottom = PAGE.h - M;

  let y = getY();
  const brk = (need: number) => { if (y + need > bottom) { doc.addPage(); y = M; } };

  // เส้นขอบแถว: กรอบนอก + เส้นแบ่งคอลัมน์ (สูงเท่าแถวนี้ → ข้ามหน้าไม่เพี้ยน)
  const rowBorders = () => {
    doc.lineWidth(0.5).strokeColor(C.line);
    doc.rect(M, y, CONTENT_W, rowH).stroke();
    for (let i = 1; i < cols.length; i++) doc.moveTo(M + i * colW, y).lineTo(M + i * colW, y + rowH).stroke();
  };

  brk(40);
  doc.font("th").fontSize(9.5).fillColor(C.muted).text(clean(a.label) || "—", M, y);
  y = doc.y + 4;

  const drawHeader = () => {
    doc.rect(M, y, CONTENT_W, rowH).fill(C.brandSoft);
    cols.forEach((c, i) => {
      doc.font("th-bold").fontSize(8.5).fillColor(C.ink)
        .text(clean(c.label), M + i * colW + 5, y + 5, { width: colW - 10, ellipsis: true, lineBreak: false });
    });
    rowBorders();
    y += rowH;
  };

  brk(rowH * 2);
  drawHeader();

  if (!rows.length) {
    doc.font("th").fontSize(9).fillColor(C.faint).text("—", M + 5, y + 5);
    rowBorders();
    y += rowH;
  }
  for (const r of rows) {
    // ขึ้นหน้าใหม่ → วาดหัวตารางซ้ำ
    if (y + rowH > bottom) { doc.addPage(); y = M; drawHeader(); }
    cols.forEach((c, i) => {
      doc.font("th").fontSize(9).fillColor(C.ink)
        .text(clean(r[c.id]) || "—", M + i * colW + 5, y + 5, { width: colW - 10, ellipsis: true, lineBreak: false });
    });
    rowBorders();
    y += rowH;
  }
  setY(y + 10);
}
