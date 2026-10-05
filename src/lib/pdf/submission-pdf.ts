import "server-only";
import { mix } from "@/lib/theme";
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
  ink2: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  panel: "#f8fafc",
  brand: "#2f6fe0",
  brandSoft: "#eaf1ff",
  fail: "#dc2626",
  failSoft: "#fdeeee",
  pass: "#15803d",
  passSoft: "#e9f7ee",
  amber: "#b45309",
  amberSoft: "#fef6e7",
};

export interface PdfAnswer {
  label: string;
  type: string;
  display?: string;
  note?: string;
  fail?: boolean;
  photo?: Buffer | null;
  rows?: Record<string, string>[];
  columns?: { id: string; label: string; type?: string }[];
  /** ฟิลด์หลายรูป: ทุกรูปพร้อมคำบรรยาย */
  photos?: { caption: string; photo: Buffer }[];
  /** รูปถ่ายต่อแถวของตาราง (วาดเป็นตารางรูปใต้ตาราง) */
  rowPhotos?: { caption: string; photo: Buffer }[];
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
  /** พิกัดตอนส่ง (ฟอร์มที่เปิด GPS) — ข้อความ + ลิงก์แผนที่ */
  geo?: { text: string; url: string } | null;
  answers: PdfAnswer[];
  history?: { label: string; reviewer: string; approved: boolean; note?: string; at: string }[];
  review?: { approved: boolean; reviewer: string; at: string; note?: string } | null;
  /** การแสดงรูปถ่าย (ตั้งในฟอร์ม) — ไม่ระบุ = thumb (รูปในแถวของฟิลด์ เหมือนเดิม) */
  photoLayout?: { mode: "thumb" | "grid" | "appendix" | "hidden"; cols: number; heightMm: number };
  /** ธีมของฟอร์ม/workspace: สีแถบหัว · สีหลัก (หัวตาราง) · โลโก้ (PNG/JPEG) · ข้อความท้าย */
  brand?: { header?: string; primary?: string; logo?: Buffer | null; footer?: string };
}

const MM = 2.8346; // pt ต่อ มม.

// ลบ emoji / สัญลักษณ์ที่ Garuda ไม่มี glyph (ไม่งั้นขึ้นเป็นกล่องว่าง)
// เก็บไทย ละติน ตัวเลข วรรคตอน และ ° ไว้
export function clean(s?: string): string {
  if (!s) return "";
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const PAGE = { w: 595.28, h: 841.89 }; // A4 pt
const M = 44; // ขอบซ้าย/ขวา/บน
const FOOTER_H = 30; // พื้นที่ท้ายกระดาษ (เลขหน้า) — เนื้อหาห้ามลงมาในส่วนนี้
const BOTTOM = PAGE.h - M - FOOTER_H + 14; // เส้นล่างสุดของเนื้อหา
const CONTENT_W = PAGE.w - M * 2;

function statusColors(s?: SubmissionPdfData["statusColor"]): { fg: string; bg: string } {
  if (s === "pass") return { fg: C.pass, bg: C.passSoft };
  if (s === "fail") return { fg: C.fail, bg: C.failSoft };
  if (s === "amber") return { fg: C.amber, bg: C.amberSoft };
  return { fg: C.muted, bg: C.panel };
}

/** สร้าง PDF ใบส่งฟอร์มเป็น Buffer (เรียกจาก API route) */
export function buildSubmissionPdf(data: SubmissionPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fonts = loadFonts();
    // ขอบล่างของ pdfkit ตั้งให้ตรงกับ BOTTOM — ข้อความที่ยาวเกินจะไม่ถูกตัดขึ้นหน้าใหม่เอง
    // เพราะเราเช็กพื้นที่ (ensure) ก่อนวาดทุกครั้ง
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: M, bottom: PAGE.h - BOTTOM, left: M, right: M },
      bufferPages: true,
      info: { Title: clean(data.formTitle) || "KROK", Author: clean(data.tenantName), Creator: "KROK" },
    });
    doc.registerFont("th", fonts.reg);
    doc.registerFont("th-bold", fonts.bold);

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // หัวตาราง: สีหลักของธีมแบบอ่อน
    const brandSoft = data.brand?.primary ? mix(data.brand.primary, "#ffffff", 0.88) : C.brandSoft;
    let y = M;
    const newPage = () => { doc.addPage(); y = M; };
    const ensure = (need: number) => { if (y + need > BOTTOM && y > M) newPage(); };

    // ---------- Header ----------
    const brandColor = data.brand?.header || C.brand;
    const tenant = clean(data.tenantName);
    let logoDrawn = false;
    if (data.brand?.logo) {
      // โลโก้บริษัทแทนเครื่องหมาย KROK (สูง 26pt กว้างไม่เกิน 120pt)
      try {
        doc.image(data.brand.logo, M, y - 6, { fit: [120, 26], valign: "center" });
        logoDrawn = true;
      } catch { /* ไฟล์เสีย/ชนิดที่ pdfkit ไม่รองรับ → ใช้หัวแบบเดิม */ }
    }
    if (logoDrawn) {
      if (tenant) doc.font("th-bold").fontSize(10).fillColor(C.ink2).text(tenant, M + 128, y + 1.5, { width: CONTENT_W / 2 - 128, lineBreak: false, ellipsis: true });
    } else {
      doc.roundedRect(M, y, 14, 14, 3).fill(brandColor);
      doc.font("th-bold").fontSize(11).fillColor(C.ink).text("KROK", M + 20, y + 0.5, { lineBreak: false });
      if (tenant) {
        const kw = doc.font("th-bold").fontSize(11).widthOfString("KROK");
        doc.font("th").fontSize(9).fillColor(C.muted).text(`·  ${tenant}`, M + 26 + kw, y + 2.5, { width: CONTENT_W / 2, lineBreak: false, ellipsis: true });
      }
    }
    // เลขที่เอกสาร (ขวาบน)
    doc.font("th").fontSize(8.5).fillColor(C.muted).text("เลขที่เอกสาร", M, y - 1, { width: CONTENT_W, align: "right", lineBreak: false });
    doc.font("th-bold").fontSize(11).fillColor(C.ink).text(data.docNo, M, y + 10, { width: CONTENT_W, align: "right", lineBreak: false });
    y += 34;

    // ชื่อฟอร์ม + ป้ายสถานะ
    const badge = clean(data.statusLabel);
    doc.font("th-bold").fontSize(9.5);
    const bw = doc.widthOfString(badge) + 20;
    const titleW = CONTENT_W - bw - 12;
    const title = clean(data.formTitle) || "ฟอร์ม";
    doc.font("th-bold").fontSize(18);
    const titleH = doc.heightOfString(title, { width: titleW });
    doc.fillColor(C.ink).text(title, M, y, { width: titleW });
    const sc = statusColors(data.statusColor);
    doc.roundedRect(PAGE.w - M - bw, y + 4, bw, 20, 10).fill(sc.bg);
    doc.font("th-bold").fontSize(9.5).fillColor(sc.fg).text(badge, PAGE.w - M - bw, y + 8.5, { width: bw, align: "center", lineBreak: false });
    y += Math.max(titleH, 28) + 4;
    // เส้นใต้ชื่อเอกสาร = สีแถบหัวของธีม
    if (data.brand?.header) doc.rect(M, y, CONTENT_W, 2).fill(data.brand.header);
    y += 8;

    // ---------- กล่องข้อมูลเอกสาร (4 ช่อง) ----------
    const meta: [string, string][] = [
      ["ผู้กรอก", clean(data.userName) || "—"],
      ["วันเวลาที่ส่ง", data.submittedAt],
      ["ใช้เวลากรอก", data.durationS != null ? fmtDuration(data.durationS) : "—"],
      ["เวอร์ชันฟอร์ม", `v${data.formVersion}`],
    ];
    const boxH = 46;
    const cellW = CONTENT_W / meta.length;
    doc.roundedRect(M, y, CONTENT_W, boxH, 8).fill(C.panel);
    doc.roundedRect(M, y, CONTENT_W, boxH, 8).lineWidth(0.6).stroke(C.line);
    meta.forEach(([k, v], i) => {
      const x = M + i * cellW + 12;
      if (i > 0) doc.moveTo(M + i * cellW, y + 10).lineTo(M + i * cellW, y + boxH - 10).lineWidth(0.6).stroke(C.line);
      doc.font("th").fontSize(8).fillColor(C.muted).text(k, x, y + 9, { width: cellW - 20, lineBreak: false, ellipsis: true });
      doc.font("th-bold").fontSize(10).fillColor(C.ink).text(v, x, y + 22, { width: cellW - 20, lineBreak: false, ellipsis: true });
    });
    y += boxH + 12;
    if (data.geo) {
      doc.font("th").fontSize(8.5).fillColor(C.muted).text("ตำแหน่งตอนส่ง: ", M, y, { continued: true, lineBreak: false })
        .fillColor(C.ink).text(data.geo.text, { link: data.geo.url, underline: true, lineBreak: false });
      y += 16;
    }

    // ---------- แถบสรุปผล ----------
    const rc = data.resultFail ? { fg: C.fail, bg: C.failSoft } : { fg: C.pass, bg: C.passSoft };
    doc.roundedRect(M, y, CONTENT_W, 26, 6).fill(rc.bg);
    doc.rect(M, y, 4, 26).fill(rc.fg);
    doc.font("th-bold").fontSize(10.5).fillColor(rc.fg)
      .text(data.resultFail ? `ผลตรวจ: ไม่ผ่าน ${data.failCount} ข้อ` : "ผลตรวจ: ผ่านทุกข้อ", M + 14, y + 6.5, { lineBreak: false });
    y += 26 + 16;

    // ---------- รายการคำตอบ ----------
    const sectionTitle = (t: string) => {
      ensure(40);
      doc.font("th-bold").fontSize(11).fillColor(C.ink).text(t, M, y, { lineBreak: false });
      y += 18;
      doc.moveTo(M, y).lineTo(PAGE.w - M, y).lineWidth(1).stroke(C.ink);
      y += 2;
    };
    sectionTitle("รายละเอียด");

    const labelW = Math.round(CONTENT_W * 0.38);
    const PAD_X = 8;
    const valX = M + labelW + 14;
    const valW = CONTENT_W - labelW - 14 - PAD_X;

    const pl = data.photoLayout && data.photoLayout.mode !== "thumb" ? data.photoLayout : null;
    const collected: { caption: string; photo: Buffer }[] = [];
    for (const a of data.answers) {
      // ฟิลด์รูปถ่าย (ไม่ใช่ลายเซ็น) ตามที่ฟอร์มตั้งไว้: รวมเป็นกล่อง / แนบท้าย / ไม่พิมพ์
      const shots = a.type === "photo" ? (a.photos?.length ? a.photos : a.photo ? [{ caption: "", photo: a.photo }] : []) : [];
      if (pl && a.type === "photo") {
        if (pl.mode === "hidden") continue;
        if (pl.mode === "grid") {
          // กล่องรูปของฟิลด์ (ตามที่ตั้งในฟอร์ม): ชื่อฟิลด์ + รูปเรียงตามจำนวนต่อแถว พร้อมชื่อใต้รูป
          ensure(30 + Math.round(pl.heightMm * MM));
          doc.font("th-bold").fontSize(9.5).fillColor(C.ink).text(clean(a.label) || "—", M + 8, y + 7, { width: CONTENT_W - 16 });
          y = shots.length
            ? drawPhotoGrid(doc, shots, y + 24, newPage, { per: pl.cols, boxH: Math.round(pl.heightMm * MM) })
            : (doc.font("th").fontSize(9).fillColor(C.faint).text("—", M + 8, y + 24), y + 44);
          doc.moveTo(M, y - 6).lineTo(PAGE.w - M, y - 6).lineWidth(0.5).stroke(C.line);
          continue;
        }
        // appendix: รูปใหญ่ไปหน้าแนบท้าย (แถวนี้แสดงรูปย่อ)
        for (const p of shots) {
          const cap = [clean(a.label), clean(p.caption)].filter(Boolean).join(" — ") || "—";
          collected.push({ caption: `${collected.length + 1}. ${cap}`, photo: p.photo });
        }
      }
      // ฟิลด์หลายรูป (แบบรูปในแถว): ชื่อฟิลด์ + จำนวนรูป แล้ววาดรูปเป็นตารางใต้แถว
      if (!pl && a.type === "photo" && a.photos && a.photos.length > 1) {
        const rowH = 26;
        ensure(rowH + 120);
        doc.font("th").fontSize(9.5).fillColor(C.muted).text(clean(a.label) || "—", M + 8, y + 7, { width: CONTENT_W * 0.38 - 8 });
        doc.font("th-bold").fontSize(10).fillColor(C.ink).text(`${a.photos.length} รูป`, M + Math.round(CONTENT_W * 0.38) + 14, y + 7);
        y = drawPhotoGrid(doc, a.photos, y + rowH, newPage);
        doc.moveTo(M, y - 6).lineTo(PAGE.w - M, y - 6).lineWidth(0.5).stroke(C.line);
        continue;
      }
      if (a.type === "table" && a.columns && a.columns.length) {
        y = drawTable(doc, a, y + 8, newPage, brandSoft) + 4;
        if (a.rowPhotos?.length) y = drawPhotoGrid(doc, a.rowPhotos, y, newPage);
        continue;
      }
      const aLabel = clean(a.label) || "—";
      const aDisplay = clean(a.display) || "—";
      const aNote = clean(a.note);
      const isSig = a.type === "signature";

      doc.font("th").fontSize(9.5);
      const labelH = doc.heightOfString(aLabel, { width: labelW - PAD_X });
      const noteH = aNote ? doc.font("th").fontSize(8.5).heightOfString(aNote, { width: labelW - PAD_X }) + 3 : 0;

      // ขนาดรูปที่จะวาด (ถ้ามี)
      let img: { w: number; h: number } | null = null;
      if (a.photo) {
        try {
          // openImage มีใน runtime แต่ไม่มีใน @types/pdfkit
          const dims = (doc as unknown as { openImage: (b: Buffer) => { width: number; height: number } }).openImage(a.photo);
          const thumb = pl?.mode === "appendix" && a.type === "photo"; // รูปใหญ่อยู่หน้าแนบท้าย
          const maxW = isSig ? 190 : thumb ? 90 : Math.min(valW, 300);
          const maxH = isSig ? 80 : thumb ? 60 : 200;
          const sc2 = Math.min(maxW / dims.width, maxH / dims.height, 1);
          img = { w: dims.width * sc2, h: dims.height * sc2 };
        } catch { img = null; }
      }
      const valH = img ? img.h : doc.font("th-bold").fontSize(10).heightOfString(aDisplay, { width: valW });
      const rowH = Math.max(labelH + noteH, valH) + 14;

      ensure(rowH);
      const top = y;
      if (a.fail) {
        doc.rect(M, top, CONTENT_W, rowH).fill(C.failSoft);
        doc.rect(M, top, 3, rowH).fill(C.fail);
      }
      doc.font("th").fontSize(9.5).fillColor(a.fail ? C.fail : C.muted).text(aLabel, M + PAD_X, top + 7, { width: labelW - PAD_X });
      if (aNote) doc.font("th").fontSize(8.5).fillColor(C.fail).text(aNote, M + PAD_X, top + 7 + labelH + 3, { width: labelW - PAD_X });

      if (a.photo && img) {
        doc.image(a.photo, valX, top + 7, { width: img.w, height: img.h });
        if (isSig) doc.moveTo(valX, top + 7 + img.h).lineTo(valX + Math.max(img.w, 160), top + 7 + img.h).lineWidth(0.6).stroke(C.faint);
      } else if (a.photo && !img) {
        doc.font("th").fontSize(9).fillColor(C.faint).text("(ไม่สามารถแสดงรูปได้)", valX, top + 7, { width: valW });
      } else {
        doc.font("th-bold").fontSize(10).fillColor(a.fail ? C.fail : C.ink).text(aDisplay, valX, top + 7, { width: valW });
      }
      y = top + rowH;
      doc.moveTo(M, y).lineTo(PAGE.w - M, y).lineWidth(0.5).stroke(C.line);
    }

    const gridOpts = pl ? { per: pl.cols, boxH: Math.round(pl.heightMm * MM) } : undefined;

    // ---------- ประวัติการอนุมัติ ----------
    if (data.history && data.history.length) {
      y += 18;
      sectionTitle("ประวัติการอนุมัติ");
      for (const h of data.history) {
        const hNote = clean(h.note);
        doc.font("th").fontSize(9);
        const noteH = hNote ? doc.heightOfString(`“${hNote}”`, { width: CONTENT_W - 24 }) + 3 : 0;
        const rowH = 34 + noteH;
        ensure(rowH);
        const top = y;
        const dc = h.approved ? C.pass : C.fail;
        doc.circle(M + 6, top + 13, 3.5).fill(dc);
        doc.font("th-bold").fontSize(10).fillColor(C.ink).text(`${clean(h.label)}`, M + 18, top + 6, { width: CONTENT_W * 0.55, lineBreak: false, ellipsis: true });
        doc.font("th-bold").fontSize(9.5).fillColor(dc).text(h.approved ? "อนุมัติ" : "ตีกลับ", M, top + 6, { width: CONTENT_W, align: "right", lineBreak: false });
        doc.font("th").fontSize(8.5).fillColor(C.muted).text(`โดย ${clean(h.reviewer) || "—"}  ·  ${h.at}`, M + 18, top + 20, { width: CONTENT_W - 18, lineBreak: false, ellipsis: true });
        if (hNote) doc.font("th").fontSize(9).fillColor(C.ink2).text(`“${hNote}”`, M + 18, top + 33, { width: CONTENT_W - 24 });
        y = top + rowH;
        doc.moveTo(M, y).lineTo(PAGE.w - M, y).lineWidth(0.5).stroke(C.line);
      }
    }

    // ---------- หน้าภาพประกอบท้ายเอกสาร ----------
    if (pl?.mode === "appendix" && collected.length) {
      newPage();
      sectionTitle("ภาพประกอบ");
      y = drawPhotoGrid(doc, collected, y + 4, newPage, gridOpts);
    }

    // ---------- ท้ายกระดาษ (ทุกหน้า) ----------
    // วาดใต้ขอบล่างของเนื้อหา → ต้องปิดขอบล่างชั่วคราว ไม่งั้น pdfkit ขึ้นหน้าใหม่ (หน้าว่าง) ให้เอง
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const saved = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const fy = PAGE.h - M + 6;
      doc.moveTo(M, fy - 8).lineTo(PAGE.w - M, fy - 8).lineWidth(0.5).stroke(C.line);
      doc.font("th").fontSize(7.5).fillColor(C.faint);
      doc.text(`${clean(data.formTitle)} · เลขที่ ${data.docNo} · สร้างโดย KROK`, M, fy, { width: CONTENT_W - 70, lineBreak: false, ellipsis: true });
      doc.text(`หน้า ${i - range.start + 1}/${range.count}`, PAGE.w - M - 70, fy, { width: 70, align: "right", lineBreak: false });
      // ข้อความท้ายเอกสารของธีม (ที่อยู่/รหัสเอกสาร) — บรรทัดเดียว
      const ft = clean((data.brand?.footer || "").replace(/\s*\n\s*/g, " · "));
      if (ft) doc.font("th").fontSize(7.5).fillColor(C.muted).text(ft, M, fy + 11, { width: CONTENT_W, align: "center", lineBreak: false, ellipsis: true });
      doc.page.margins.bottom = saved;
    }

    doc.end();
  });
}

// รูปของแถวตาราง: เรียง 4 รูปต่อแถว คำบรรยายใต้รูป · ขึ้นหน้าใหม่ทีละแถวรูป
function drawPhotoGrid(doc: PDFKit.PDFDocument, photos: { caption: string; photo: Buffer }[], startY: number, newPage: () => void, opts?: { per: number; boxH: number }): number {
  const PER = Math.min(4, Math.max(1, opts?.per ?? 4)), GAP = 8, CAP_H = 14;
  const BOX_H = Math.min(BOTTOM - M - CAP_H - 10, Math.max(40, opts?.boxH ?? 104));
  const w = (CONTENT_W - GAP * (PER - 1)) / PER;
  let y = startY;
  for (let i = 0; i < photos.length; i += PER) {
    if (y + BOX_H + CAP_H > BOTTOM) { newPage(); y = M; }
    photos.slice(i, i + PER).forEach((p, j) => {
      const x = M + j * (w + GAP);
      doc.rect(x, y, w, BOX_H).lineWidth(0.5).stroke(C.line);
      try {
        const dims = (doc as unknown as { openImage: (b: Buffer) => { width: number; height: number } }).openImage(p.photo);
        const sc = Math.min((w - 6) / dims.width, (BOX_H - 6) / dims.height, 1);
        const iw = dims.width * sc, ih = dims.height * sc;
        doc.image(p.photo, x + (w - iw) / 2, y + (BOX_H - ih) / 2, { width: iw, height: ih });
      } catch {
        doc.font("th").fontSize(8).fillColor(C.faint).text("(ไม่สามารถแสดงรูปได้)", x, y + BOX_H / 2 - 5, { width: w, align: "center", lineBreak: false });
      }
      doc.font("th").fontSize(7.5).fillColor(C.muted).text(clean(p.caption), x, y + BOX_H + 2, { width: w, lineBreak: false, ellipsis: true });
    });
    y += BOX_H + CAP_H + 6;
  }
  return y + 6;
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s} วินาที`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาที ${s % 60} วินาที`;
  return `${Math.floor(m / 60)} ชม. ${m % 60} นาที`;
}

// ตาราง — ความสูงแถวตามข้อความ (สูงสุด 3 บรรทัด) · ข้ามหน้าแล้ววาดหัวตารางซ้ำ
function drawTable(doc: PDFKit.PDFDocument, a: PdfAnswer, startY: number, newPage: () => void, headFill: string = C.brandSoft): number {
  const cols = a.columns!;
  const rows = a.rows || [];
  const colW = CONTENT_W / cols.length;
  const PADX = 5;
  const PADY = 5;
  const LINE = 11.5;
  let y = startY;
  const brk = (need: number) => { if (y + need > BOTTOM) { newPage(); y = M; return true; } return false; };

  const cellH = (txt: string, bold: boolean) => {
    doc.font(bold ? "th-bold" : "th").fontSize(bold ? 8.5 : 9);
    return Math.min(doc.heightOfString(txt, { width: colW - PADX * 2 }), LINE * 3);
  };
  const drawRow = (vals: string[], header: boolean) => {
    const h = Math.max(...vals.map((v) => cellH(v, header))) + PADY * 2;
    if (header) doc.rect(M, y, CONTENT_W, h).fill(headFill);
    vals.forEach((v, i) => {
      doc.font(header ? "th-bold" : "th").fontSize(header ? 8.5 : 9).fillColor(C.ink)
        .text(v, M + i * colW + PADX, y + PADY, { width: colW - PADX * 2, height: LINE * 3, ellipsis: true });
    });
    doc.lineWidth(0.5).strokeColor(C.line);
    doc.rect(M, y, CONTENT_W, h).stroke();
    for (let i = 1; i < cols.length; i++) doc.moveTo(M + i * colW, y).lineTo(M + i * colW, y + h).stroke();
    y += h;
    return h;
  };
  const headVals = cols.map((c) => clean(c.label) || "—");
  const headH = Math.max(...headVals.map((v) => cellH(v, true))) + PADY * 2;

  // ชื่อตาราง + หัว + แถวแรก ต้องอยู่หน้าเดียวกัน
  brk(18 + headH + 24);
  doc.font("th").fontSize(9.5).fillColor(C.muted).text(clean(a.label) || "—", M, y, { width: CONTENT_W });
  y = doc.y + 4;
  drawRow(headVals, true);

  const bodyRows = rows.length ? rows.map((r) => cols.map((c) => clean(r[c.id]) || "—")) : [cols.map((_, i) => (i === 0 ? "—" : ""))];
  for (const vals of bodyRows) {
    const h = Math.max(...vals.map((v) => cellH(v, false))) + PADY * 2;
    if (brk(h)) drawRow(headVals, true);
    drawRow(vals, false);
  }
  return y + 10;
}
