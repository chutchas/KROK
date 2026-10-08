// ============================================================
// KROK · ทัวร์แนะนำการใช้งาน (ผู้ใช้ใหม่)
// ทัวร์สั้นแยกตามหน้า — เข้าหน้านั้นครั้งแรกจึงพาดู · ดู/ข้ามแล้วไม่พาซ้ำ (เก็บใน profiles.tours_seen)
// จุดที่ชี้ = element ที่มี data-tour="<target>" · หาไม่เจอ (ไม่มีสิทธิ์/ยังไม่แสดง) = ข้ามขั้นนั้นเอง
// ข้อความอยู่ใน dictionary: tour.<tourId>.<stepId>.t (หัวข้อ) / .b (รายละเอียด)
// ============================================================

export interface TourStep {
  id: string;
  /** ค่า data-tour ของ element ที่จะชี้ — ไม่ใส่ = กล่องกลางจอ (เช่น ต้อนรับ) */
  target?: string;
}

export interface TourDef {
  id: string;
  /** หน้านี้ใช้ทัวร์นี้ไหม */
  match: (path: string) => boolean;
  /** ต้องมี element นี้บนหน้าก่อนจึงเริ่มได้ (เช่น ทัวร์ editor รอจนเปิด editor) */
  requires?: string;
  steps: TourStep[];
}

export const TOURS: TourDef[] = [
  {
    id: "dashboard",
    match: (p) => p === "/dashboard",
    steps: [
      { id: "welcome" },
      { id: "nav", target: "nav" },
      { id: "ws", target: "ws" },
      { id: "summary", target: "dash-summary" },
      { id: "widget", target: "dash-add" },
      { id: "latest", target: "dash-latest" },
      { id: "menu", target: "menu" },
      { id: "profile", target: "profile" },
    ],
  },
  {
    // ทัวร์ editor มาก่อน: ถ้ากำลังแก้ฟอร์มอยู่ (มี canvas) ให้พาดู editor
    id: "studio-editor",
    match: (p) => p === "/studio",
    requires: "studio-canvas",
    steps: [
      { id: "canvas", target: "studio-canvas" },
      { id: "aside", target: "studio-aside" },
      { id: "publish", target: "studio-publish" },
    ],
  },
  {
    id: "studio",
    match: (p) => p === "/studio",
    requires: "studio-tabs",
    steps: [
      { id: "tabs", target: "studio-tabs" },
      { id: "modes", target: "studio-modes" },
    ],
  },
  {
    id: "forms",
    match: (p) => p === "/forms",
    steps: [
      { id: "tabs", target: "forms-tabs" },
      { id: "search", target: "forms-search" },
    ],
  },
  {
    id: "fill",
    match: (p) => p.startsWith("/fill/"),
    requires: "fill-submit",
    steps: [
      // มุมมอง/บันทึกร่างอยู่ในเมนู ⋯ บนแถบบน (หน้ากรอกแบบเต็มจอ)
      { id: "more", target: "fill-more" },
      { id: "submit", target: "fill-submit" },
    ],
  },
  {
    id: "datasets",
    match: (p) => p === "/datasets",
    steps: [{ id: "create", target: "ds-create" }],
  },
  {
    id: "approvals",
    match: (p) => p === "/approvals",
    steps: [{ id: "intro", target: "appr-title" }],
  },
  {
    id: "reports",
    match: (p) => p === "/reports",
    steps: [{ id: "export", target: "report-export" }],
  },
];

/** ทัวร์ที่ควรใช้กับหน้านี้ตอนนี้ (ตัวแรกที่ path ตรงและ element ที่ต้องมีปรากฏแล้ว) */
export function tourFor(path: string, has: (target: string) => boolean, skip: (id: string) => boolean = () => false): TourDef | null {
  for (const t of TOURS) {
    if (!t.match(path) || skip(t.id)) continue;
    if (t.requires && !has(t.requires)) continue;
    // ต้องมีอย่างน้อย 1 ขั้นที่แสดงได้
    if (t.steps.some((s) => !s.target || has(s.target))) return t;
  }
  return null;
}
