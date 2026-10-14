// คู่มือการใช้งานสั้น ๆ — แหล่งเดียวของทั้งหน้า /help และปุ่ม "วิธีใช้" (HelpTip) ข้างฟีเจอร์ที่ซับซ้อน
// เขียนตามงานที่ทำ ("จะ…ยังไง") ไม่ใช่ "ปุ่มนี้ทำอะไร" · แก้ฟีเจอร์แล้วแก้ข้อความที่นี่ที่เดียว
export type HelpLang = "th" | "en";
type L = { th: string; en: string };
export type HelpArticle = {
  id: string;
  title: L;
  /** 1 บรรทัด — แสดงในปุ่มวิธีใช้และรายการค้นหา */
  summary: L;
  steps: { th: string[]; en: string[] };
  /** หมายเหตุที่มักพลาด */
  notes?: { th: string[]; en: string[] };
  /** หน้าที่ไปทำงานนี้ */
  where?: { href: string; label: L };
  keywords: string;
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "approval",
    title: { th: "ตั้งให้ฟอร์มต้องผ่านการอนุมัติ", en: "Require approval for a form" },
    summary: { th: "ใบที่ส่งจะเข้าคิวรออนุมัติ ไหลตามลำดับผู้อนุมัติทีละขั้น", en: "Submissions wait in an approval queue and move through approvers one step at a time." },
    steps: {
      th: [
        "เปิดฟอร์มในหน้าสร้างฟอร์ม → ตั้งค่าฟอร์ม → แท็บ \"อนุมัติ\"",
        "เปิด \"ต้องผ่านการอนุมัติ\"",
        "กด \"เพิ่มขั้น\" แล้วเลือกผู้อนุมัติของแต่ละขั้น เช่น หัวหน้ากะ → QA → ผู้จัดการ (ใส่ชื่อบทบาทกำกับได้)",
        "บันทึกฟอร์ม — ใบที่ส่งหลังจากนี้จะรออนุมัติ ผู้อนุมัติได้รับแจ้งเตือนและกดอนุมัติหรือตีกลับได้ที่เมนู \"อนุมัติ\"",
      ],
      en: [
        "Open the form in Studio → Form settings → \"Approval\" tab",
        "Turn on \"Requires approval\"",
        "Tap \"Add step\" and pick an approver for each step, e.g. shift lead → QA → manager (you can label each role)",
        "Save the form — new submissions wait for approval; approvers are notified and approve or send back from the \"Approvals\" menu",
      ],
    },
    notes: {
      th: ["ไม่เพิ่มขั้นเลย = ผู้จัดการคนใดก็ได้อนุมัติได้ 1 ขั้น", "ทุกขั้นต้องเลือกผู้อนุมัติ ไม่อย่างนั้นบันทึกฟอร์มไม่ได้", "ใบที่ส่งไปก่อนเปิดการอนุมัติไม่ถูกย้อนเข้าคิว"],
      en: ["No steps = any manager can approve in a single step", "Every step needs an approver or the form won't save", "Submissions sent before you turned approval on are not queued"],
    },
    where: { href: "/approvals", label: { th: "ไปหน้าอนุมัติ", en: "Go to Approvals" } },
    keywords: "อนุมัติ approval approver สายอนุมัติ ลำดับ ตีกลับ reject chain",
  },
  {
    id: "defects",
    title: { th: "ให้ตัวเลือกบางตัวนับเป็นไม่ผ่าน (ข้อบกพร่อง)", en: "Make some choices count as a fail (defects)" },
    summary: { th: "เช่น เลือก \"ชำรุด\" หรือ \"ขาด\" แล้วใบนั้นเป็นผลไม่ผ่านอัตโนมัติ", en: "E.g. picking \"Damaged\" or \"Missing\" marks the whole submission as failed." },
    steps: {
      th: [
        "ในหน้าแก้ไขฟอร์ม แตะช่องแบบ \"เลือก\" ที่พิมพ์ตัวเลือกเอง",
        "ใต้รายการตัวเลือก กด \"ตั้งตัวเลือกที่นับเป็นข้อบกพร่อง\"",
        "แตะตัวเลือกที่ถ้าเลือกแล้วถือว่าไม่ผ่าน (แตะซ้ำเพื่อยกเลิก)",
        "บันทึกฟอร์ม",
      ],
      en: [
        "In the form editor, tap a \"Select\" field with typed-in choices",
        "Below the choices, tap \"Set choices that count as defects\"",
        "Tap the choices that mean a fail (tap again to undo)",
        "Save the form",
      ],
    },
    notes: {
      th: ["ช่องแบบ ผ่าน/ไม่ผ่าน นับเองอยู่แล้ว ไม่ต้องตั้ง", "คอลัมน์แบบเลือกในตารางตั้งได้เหมือนกัน · ตัวเลือกจากชุดข้อมูลตั้งไม่ได้", "ถ้าระบบเห็นตัวเลือกที่ดูเหมือนข้อบกพร่องแต่ยังนับเป็นผ่าน จะขึ้นแถบถามให้กดยืนยัน", "เปลี่ยนแล้วมีผลกับใบที่ส่งหลังจากนี้เท่านั้น"],
      en: ["Pass/Fail fields already count on their own", "Select columns in tables work the same · choices from a dataset can't be marked", "If a choice looks like a defect but still counts as a pass, a banner asks you to confirm", "Changes apply to new submissions only"],
    },
    keywords: "ข้อบกพร่อง ไม่ผ่าน fail defect ตัวเลือก ชำรุด ขาด options",
  },
  {
    id: "close-failure",
    title: { th: "ปิดเรื่องใบที่ไม่ผ่าน", en: "Close out a failed submission" },
    summary: { th: "หลังแก้ไขแล้ว บันทึกว่าแก้อย่างไร ใบจะย้ายจาก \"ยังไม่ปิดเรื่อง\" เป็น \"ปิดเรื่องแล้ว\"", en: "After fixing the issue, record what was done; the submission moves from \"open\" to \"closed\"." },
    steps: {
      th: [
        "เปิดใบที่ไม่ผ่าน (จากแดชบอร์ด, รายงาน หรือการแจ้งเตือน)",
        "กด \"ปิดเรื่อง\" ในกล่องสีแดงด้านบน",
        "เขียนว่าแก้อย่างไร เช่น \"เปลี่ยนสายพานใหม่ ตรวจซ้ำผ่านแล้ว\" แล้วกดยืนยัน",
        "ผู้กรอกได้รับแจ้งว่าปิดเรื่องแล้ว และบันทึกการปิดเรื่องพิมพ์ไปกับเอกสารได้",
      ],
      en: [
        "Open the failed submission (from the dashboard, reports or a notification)",
        "Tap \"Close\" in the red box at the top",
        "Write what was fixed, e.g. \"Replaced the belt, re-checked OK\", then confirm",
        "The filler is notified, and the close-out record prints with the document",
      ],
    },
    notes: {
      th: ["ปิดเรื่องได้เฉพาะผู้จัดการ (owner / admin / designer)", "ปิดแล้วเปิดกลับได้ ต้องใส่เหตุผล — ประวัติการปิด/เปิดเก็บไว้ทั้งหมด", "ดูใบที่ยังค้างได้ที่ รายงาน → ผลลัพธ์ \"ไม่ผ่าน · ยังไม่ปิดเรื่อง\""],
      en: ["Only managers (owner / admin / designer) can close", "You can reopen with a reason — the full close/reopen history is kept", "Find open ones in Reports → result \"Fail · not closed\""],
    },
    where: { href: "/reports?result=fail_open", label: { th: "ดูใบที่ยังไม่ปิดเรื่อง", en: "See open failures" } },
    keywords: "ปิดเรื่อง ไม่ผ่าน close failure แก้ไข corrective action เปิดเรื่องกลับ reopen",
  },
  {
    id: "datasets",
    title: { th: "ใช้รายชื่อขององค์กรเป็นตัวเลือกในฟอร์ม (ชุดข้อมูล)", en: "Use your own lists as form choices (datasets)" },
    summary: { th: "เช่น รายชื่อลูกค้า สาขา รหัสสินค้า ทะเบียนรถ — แก้ที่เดียว ทุกฟอร์มได้ค่าใหม่", en: "E.g. customers, branches, product codes, plates — update once, every form follows." },
    steps: {
      th: [
        "ไปที่เมนู \"ชุดข้อมูล\" → สร้างชุดข้อมูล แล้วเลือกที่มา: อัปโหลด CSV/Excel, ดึงจาก API หรือรับจาก API",
        "ไฟล์: แถวแรกต้องเป็นหัวคอลัมน์",
        "ในหน้าแก้ไขฟอร์ม แตะช่องแบบ \"เลือก\" → ที่มาของตัวเลือก เลือก \"จากชุดข้อมูล\"",
        "เลือกชุดข้อมูลและคอลัมน์ที่จะแสดงให้ผู้กรอกเห็น แล้วบันทึกฟอร์ม",
      ],
      en: [
        "Go to \"Datasets\" → Create dataset, and pick a source: CSV/Excel upload, pull from an API, or receive via API",
        "Files: the first row must be the column headers",
        "In the form editor, tap a \"Select\" field → option source \"From dataset\"",
        "Pick the dataset and the column shown to fillers, then save the form",
      ],
    },
    notes: {
      th: ["กรองตามคำตอบช่องก่อนหน้าได้ เช่น เลือกสาขาแล้วเหลือเฉพาะเครื่องจักรของสาขานั้น", "อัปเดตตาม key = เพิ่ม/แก้แถว ไม่ลบของเดิม · แทนที่ทั้งชุด = แถวที่ไม่มีในรอบใหม่จะหายไป"],
      en: ["You can filter by an earlier answer, e.g. pick a branch to see only its machines", "Update by key = add/edit rows, never delete · Replace all = rows missing from the new import are removed"],
    },
    where: { href: "/datasets", label: { th: "ไปหน้าชุดข้อมูล", en: "Go to Datasets" } },
    keywords: "ชุดข้อมูล dataset ตัวเลือก dropdown csv excel api รายชื่อ ลูกค้า สาขา",
  },
  {
    id: "notify",
    title: { th: "รับแจ้งเตือนทาง LINE หรืออีเมล", en: "Get notified on LINE or email" },
    summary: { th: "แจ้งเมื่อมีการส่งฟอร์ม อนุมัติ หรือตีกลับ — เลือกแจ้งเฉพาะผลไม่ผ่านได้", en: "Alerts when forms are submitted, approved or sent back — optionally only failures." },
    steps: {
      th: [
        "ไปที่ ตั้งค่า → เชื่อมต่อ → แจ้งเตือน LINE / Email",
        "LINE: ใส่ Channel access token จาก LINE Official Account และ ID ผู้รับ (userId หรือ groupId) — บอทต้องเป็นเพื่อนหรืออยู่ในกลุ่มก่อน",
        "อีเมล: ใส่ค่า SMTP ของบริษัท อีเมลผู้ส่ง และอีเมลผู้รับ",
        "เลือกเหตุการณ์ที่จะแจ้ง → บันทึก → กด \"ทดสอบส่ง\"",
      ],
      en: [
        "Go to Settings → Integrations → LINE / Email notifications",
        "LINE: enter the Channel access token from your LINE Official Account and the recipient ID (userId or groupId) — the bot must be a friend / in the group first",
        "Email: enter your company SMTP details, the sender and recipients",
        "Pick which events to send → Save → \"Send test\"",
      ],
    },
    notes: {
      th: ["กดทดสอบได้หลังบันทึกแล้ว", "การแจ้งเตือนในกระดิ่งของแอปทำงานเสมอ ไม่ต้องตั้ง"],
      en: ["Save before testing", "In-app bell notifications always work, no setup needed"],
    },
    where: { href: "/settings/integrations", label: { th: "ไปหน้าเชื่อมต่อ", en: "Go to Integrations" } },
    keywords: "แจ้งเตือน line email อีเมล smtp notify notification",
  },
  {
    id: "devices",
    title: { th: "ให้กรอกฟอร์มได้เฉพาะเครื่องของบริษัท", en: "Allow filling only on company devices" },
    summary: { th: "เครื่องที่ยังไม่ได้รับอนุมัติจะเปิดกรอกฟอร์มนั้นไม่ได้", en: "Devices that aren't approved can't open that form." },
    steps: {
      th: [
        "ในฟอร์มที่ต้องการ: ตั้งค่าฟอร์ม → แท็บ \"ใครใช้ได้\" → เปิด \"เฉพาะเครื่องที่อนุมัติแล้ว\" แล้วบันทึกฟอร์ม",
        "ให้คนหน้างานเปิดฟอร์มนั้นบนเครื่องที่จะใช้ — เครื่องจะเข้ารายการ \"รออนุมัติ\" เอง",
        "ไปที่ ตั้งค่า → อุปกรณ์ แล้วกดอนุมัติเครื่องนั้น",
        "ถ้าเลือก \"เฉพาะเครื่องที่เลือกไว้\" ให้ติ๊กเครื่องในตาราง เครื่อง × ฟอร์ม ของหน้าอุปกรณ์ด้วย",
      ],
      en: [
        "In the form: Form settings → \"Who can use\" tab → turn on \"Approved devices only\", then save",
        "Have the worker open that form on their device — it joins the \"Pending\" list by itself",
        "Go to Settings → Devices and approve it",
        "With \"Selected devices only\", also tick the device in the Device × Form table on the Devices page",
      ],
    },
    notes: {
      th: ["ฟอร์มสาธารณะ (เปิดจาก QR โดยคนนอก) ล็อกเครื่องไม่ได้", "ล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเบราว์เซอร์ = เครื่องต้องขออนุมัติใหม่"],
      en: ["Public forms (opened from a QR by outsiders) can't be device-locked", "Clearing browser data or switching browsers means the device must be approved again"],
    },
    where: { href: "/settings/devices", label: { th: "ไปหน้าอุปกรณ์", en: "Go to Devices" } },
    keywords: "อุปกรณ์ เครื่อง device ล็อก อนุมัติเครื่อง tablet",
  },
  {
    id: "doc-no",
    title: { th: "ตั้งเลขที่เอกสารอัตโนมัติ", en: "Set automatic document numbers" },
    summary: { th: "เช่น FL-6910-0001 — รันเลขเองทุกใบ แสดงบนเอกสารและ PDF", en: "E.g. FL-6910-0001 — numbered automatically, shown on the document and PDF." },
    steps: {
      th: [
        "ตั้งค่าฟอร์ม → แท็บ \"การกรอก\" → เลขที่เอกสาร",
        "ใส่ตัวขึ้นต้น เช่น FL- หรือ QC/ (ว่าง = ใช้รหัส 8 ตัวแบบเดิม)",
        "เลือกว่าจะเริ่มนับ 1 ใหม่เมื่อขึ้นปีหรือเดือนใหม่ ปี พ.ศ./ค.ศ. และจำนวนหลัก — ดูตัวอย่างเลขใบแรกได้ทันที",
        "บันทึกฟอร์ม",
      ],
      en: [
        "Form settings → \"Filling\" tab → Document number",
        "Enter a prefix, e.g. FL- or QC/ (empty = the old 8-character code)",
        "Choose when to restart at 1 (new year / month), BE or CE year, and digits — the first number previews instantly",
        "Save the form",
      ],
    },
    notes: {
      th: ["ฟอร์มที่ใช้ตัวขึ้นต้นเดียวกันจะนับเลขต่อกัน ไม่ซ้ำ", "ใบที่กรอกออฟไลน์ได้เลขตอนส่งขึ้นระบบ", "ใบที่ส่งไปแล้วคงเลขเดิม"],
      en: ["Forms sharing a prefix share one counter (no duplicates)", "Offline submissions get their number when they sync", "Existing submissions keep their numbers"],
    },
    keywords: "เลขที่เอกสาร เลขรัน document number running prefix",
  },
  {
    id: "visibility",
    title: { th: "กำหนดว่าใครเห็นฟอร์ม", en: "Choose who sees a form" },
    summary: { th: "ให้เห็นทั้ง workspace เฉพาะทีม เฉพาะบางคน หรือเปิดให้คนนอกกรอกผ่าน QR/ลิงก์", en: "Everyone, selected teams, selected people, or public via QR/link." },
    steps: {
      th: [
        "ตั้งค่าฟอร์ม → แท็บ \"ใครใช้ได้\" → ใครเห็นฟอร์มนี้",
        "เลือก สาธารณะ / ทุกคนใน workspace / เฉพาะทีม / เฉพาะรายบุคคล",
        "ถ้าเลือกเฉพาะทีมหรือรายบุคคล ต้องเลือกอย่างน้อย 1 ทีม/คน",
        "สาธารณะ = คนนอกที่มีลิงก์กรอกได้โดยไม่ต้องล็อกอิน — เอาลิงก์และ QR ได้จากปุ่ม \"แชร์\" ในหน้าฟอร์มทั้งหมด",
      ],
      en: [
        "Form settings → \"Who can use\" tab → Who sees this form",
        "Pick Public / Everyone in the workspace / Selected teams / Selected people",
        "Teams or people need at least one selected",
        "Public = anyone with the link can fill it without signing in — get the link and QR from \"Share\" in All forms",
      ],
    },
    notes: {
      th: ["ผู้ดูแลเห็นทุกฟอร์มเสมอ", "ต้องสร้างทีมก่อนที่ ตั้งค่า → ทีม"],
      en: ["Admins always see every form", "Create teams first in Settings → Team"],
    },
    keywords: "ใครเห็น การมองเห็น visibility ทีม team public สาธารณะ qr แชร์ share",
  },
];

export function helpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}
