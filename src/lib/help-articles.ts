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
  /** ปุ่มวิธีใช้อยู่ตรงจุดนั้นแล้ว → ข้ามขั้นแรก ๆ ที่บอกว่า "ไปที่…" (เริ่มแสดงที่ขั้นนี้) */
  tipFrom?: number;
  /** หน้าที่ไปทำงานนี้ */
  where?: { href: string; label: L };
  keywords: string;
};

export const HELP_ARTICLES: HelpArticle[] = [
  // งานพื้นฐานที่ทุกคนเจอก่อน (คนกรอก → คนสร้าง/ผู้ดูแล) แล้วค่อยเรื่องเฉพาะทาง
  {
    id: "create-form",
    title: { th: "สร้างฟอร์มใหม่", en: "Create a new form" },
    summary: { th: "ให้ AI ร่างจากคำอธิบาย ไฟล์ฟอร์มเดิม หรือเทมเพลต แล้วปรับแก้ก่อนเผยแพร่", en: "Let AI draft it from a description, an existing paper form or a template, then adjust before publishing." },
    tipFrom: 1,
    steps: {
      th: [
        "ไปที่เมนู \"สร้างฟอร์ม\"",
        "เลือกวิธีสร้าง: \"พิมพ์อธิบาย (AI)\" พิมพ์ว่าอยากได้ฟอร์มตรวจอะไรแล้วกด \"สร้างด้วย AI\" · \"จากไฟล์ฟอร์มเดิม\" อัปโหลดรูปถ่าย/สแกน/PDF ของฟอร์มกระดาษ · \"จากเทมเพลต\" เลือกแบบสำเร็จรูป",
        "ปรับต่อ: พิมพ์ในช่อง \"ให้ AI แก้ฟอร์ม…\" หรือแตะช่องบนฟอร์มเพื่อแก้ชื่อ ชนิด และตั้งเป็นช่องจำเป็น · ใช้ \"เพิ่มช่อง\" / \"เพิ่มขั้นตอน\" และลากเพื่อจัดลำดับ",
        "สลับดูตัวอย่าง \"มือถือ\" (หน้าจอคนกรอก) และ \"กระดาษ\" (หน้าตาเอกสาร A4)",
        "กด \"เผยแพร่\" เมื่อพร้อมให้คนหน้างานกรอก หรือ \"บันทึกร่าง\" ไว้แก้ต่อทีหลัง",
      ],
      en: [
        "Go to the \"Create form\" menu",
        "Pick a method: \"Describe (AI)\" — type what the checklist is for and tap \"Create with AI\" · \"From existing form\" — upload a photo/scan/PDF of the paper form · \"From a template\" — pick a ready-made one",
        "Refine: type in \"Ask AI to edit the form…\" or tap a field to change its name, type and whether it's required · use \"Add field\" / \"Add step\" and drag to reorder",
        "Switch the preview between \"Mobile\" (what fillers see) and \"Paper\" (the A4 document)",
        "Tap \"Publish\" when field staff should start filling it, or \"Save draft\" to keep working later",
      ],
    },
    notes: {
      th: [
        "ร่างยังไม่ไปถึงคนหน้างาน (ทั้งออนไลน์และออฟไลน์) จนกว่าจะเผยแพร่",
        "แก้ฟอร์มที่เผยแพร่แล้ว = ได้เวอร์ชันใหม่ ใบที่ส่งไปแล้วยังผูกกับเวอร์ชันเดิม ดูย้อนหลัง/กู้คืนได้ที่ ⋯ → \"ประวัติเวอร์ชัน\"",
        "จากไฟล์: อ่าน PDF ได้สูงสุด 6 หน้าแรก",
      ],
      en: [
        "Drafts don't reach field staff (online or offline) until you publish",
        "Editing a published form creates a new version; past submissions stay tied to the version they used — see or restore in \"Version history\"",
        "From a file: only the first 6 pages of a PDF are read",
      ],
    },
    where: { href: "/studio", label: { th: "ไปหน้าสร้างฟอร์ม", en: "Go to Create form" } },
    keywords: "สร้างฟอร์ม create form studio ai เทมเพลต template อัปโหลด upload pdf เผยแพร่ publish ร่าง draft เวอร์ชัน",
  },
  {
    id: "offline",
    title: { th: "กรอกฟอร์มตอนไม่มีเน็ต", en: "Fill forms without internet" },
    summary: { th: "เปิดแอปตอนมีเน็ตไว้ก่อน แล้วกรอกและส่งได้ตามปกติ ระบบส่งให้เองเมื่อกลับมาออนไลน์", en: "Open the app once while online, then fill and submit as usual — it sends automatically when you're back online." },
    steps: {
      th: [
        "เปิดแอปตอนมีเน็ตสักครั้ง (ไม่ต้องกดดาวน์โหลด) — ระบบเตรียมฟอร์มที่คุณมีสิทธิ์ไว้ในเครื่องเอง และอัปเดตทุกครั้งที่เปิดแอปตอนออนไลน์",
        "ตอนไม่มีเน็ต แอปจะพาไปหน้า \"ฟอร์มที่กรอกออฟไลน์ได้\" — เลือกฟอร์มแล้วกรอกตามปกติ ถ่ายรูปและเซ็นชื่อได้",
        "กดส่ง — ขึ้น \"บันทึกไว้แบบออฟไลน์แล้ว\" และป้าย \"รอส่ง n รายการ\" ที่แถบด้านบน",
        "เมื่อกลับมามีเน็ต ระบบส่งให้เอง (แตะป้ายเพื่อส่งทันทีก็ได้) จนขึ้น \"ส่งแล้ว\"",
      ],
      en: [
        "Open the app once while online (no download button needed) — the forms you can use are prepared on this device and refreshed whenever you open the app online",
        "With no internet, the app takes you to \"Forms available offline\" — pick one and fill as usual, including photos and signatures",
        "Submit — you'll see \"Saved offline\" and a \"n waiting to send\" badge in the top bar",
        "When you're back online it sends by itself (or tap the badge to send now) until it shows \"Sent\"",
      ],
    },
    notes: {
      th: [
        "อย่าออกจากระบบหรือล้างข้อมูลเบราว์เซอร์ตอนที่ยังมีรายการรอส่ง — ร่างในเครื่องจะหาย",
        "ใช้ออฟไลน์ไม่ได้: ฟอร์มกรอกหลายคน ช่องที่ให้ AI ตรวจรูป/อ่านเอกสาร และฟอร์มที่เพิ่งสร้างหลังเปิดแอปครั้งล่าสุด",
        "ฟอร์มที่ล็อกเครื่อง: เครื่องต้องได้รับอนุมัติตอนออนไลน์มาก่อน",
        "ขึ้น \"ส่งไม่ได้\" = ข้อมูลยังอยู่ในเครื่อง แตะดูเหตุผล (เช่น ฟอร์มถูกปิด หรือพื้นที่เต็ม)",
        "iPhone/Safari อาจลบข้อมูลในเครื่องถ้าไม่ได้เปิดแอปราว 7 วัน — เปิดแอปตอนมีเน็ตเป็นระยะ",
      ],
      en: [
        "Don't sign out or clear browser data while items are waiting to send — local drafts are deleted",
        "Not available offline: multi-person forms, AI photo checks/document reading, and forms created after you last opened the app",
        "Device-locked forms: the device must have been approved while online",
        "\"Couldn't send\" means the data is still on the device — tap to see why (e.g. form closed, storage full)",
        "iPhone/Safari may clear local data if the app isn't opened for about 7 days — open it online now and then",
      ],
    },
    keywords: "ออฟไลน์ offline ไม่มีเน็ต no internet รอส่ง queue sync ซิงก์ ส่งไม่ได้",
  },
  {
    id: "signature",
    title: { th: "เซ็นชื่อในฟอร์ม", en: "Sign a form" },
    summary: { th: "เซ็นด้วยนิ้วหรือเมาส์ในกรอบ ล้างแล้วเซ็นใหม่ได้ ลายเซ็นแสดงในเอกสาร PDF", en: "Sign with a finger or mouse in the box; clear and redo anytime. The signature appears in the PDF." },
    steps: {
      th: [
        "โหมดมือถือ: เซ็นในกรอบ \"เซ็นชื่อในกรอบนี้\" ยกนิ้วแล้วบันทึกเอง (ขึ้น \"✓ เซ็นแล้ว\")",
        "โหมดกระดาษ: แตะ \"แตะเพื่อเซ็น\" เซ็นในแผ่นเต็มจอ แล้วกด \"บันทึกลายเซ็น\"",
        "เซ็นผิด กด \"ล้างลายเซ็น\" แล้วเซ็นใหม่",
        "ถ้าฟอร์มให้พิมพ์ชื่อกำกับ พิมพ์ชื่อผู้เซ็นตัวบรรจงในช่องใต้ลายเซ็น",
      ],
      en: [
        "Mobile view: sign in the \"Sign in this box\" area — it saves when you lift your finger (shows \"✓ Signed\")",
        "Paper view: tap \"Tap to sign\", sign on the full-screen pad, then \"Save signature\"",
        "Made a mistake? Tap \"Clear signature\" and sign again",
        "If the form asks for a printed name, type the signer's name under the signature",
      ],
    },
    notes: {
      th: [
        "ลายเซ็นเก็บเป็นรูป นับรวมในพื้นที่ไฟล์ของแพ็กเกจ และเซ็นตอนออฟไลน์ได้",
        "ผู้สร้างฟอร์มตั้งได้ที่ช่องลายเซ็น → \"ให้พิมพ์ชื่อผู้เซ็นกำกับ\"",
      ],
      en: [
        "Signatures are stored as images, count toward file storage, and work offline",
        "Form creators can turn on \"Ask for a printed name\" in the signature field settings",
      ],
    },
    keywords: "ลายเซ็น signature เซ็น sign ชื่อผู้เซ็น ล้างลายเซ็น",
  },
  {
    id: "fix-submitted",
    title: { th: "แก้ไขใบที่ส่งแล้ว (ส่งผิด/ต้องแก้)", en: "Fix a submission that was already sent" },
    summary: { th: "ใบที่ส่งแล้วแก้ทับไม่ได้ (เก็บเป็นหลักฐานตามจริง) — ส่งใบใหม่แทน หรือใช้การตีกลับ/ส่งกลับ", en: "Sent submissions can't be overwritten (they're kept as evidence) — send a new one, or use send back/reject." },
    steps: {
      th: [
        "กรอกผิด: กรอกใบใหม่ที่ถูกต้อง แล้วให้เจ้าของหรือแอดมินลบใบเดิม (เปิดเอกสาร → ปุ่มลบ — ไปอยู่ในถังขยะ กู้คืนได้)",
        "ฟอร์มที่ต้องอนุมัติ: ผู้อนุมัติกด \"ตีกลับ\" พร้อมเหตุผล — ผู้กรอกเห็นเหตุผลในเอกสาร แล้วส่งใบใหม่",
        "ฟอร์มกรอกหลายคน (ส่งต่องาน): ก่อนงานจบ ส่งกลับไปขั้นก่อนหน้าด้วย \"ส่งกลับไปแก้ไข\" ให้คนนั้นแก้แล้วส่งต่อ",
        "ใบไม่ผ่านที่แก้ปัญหาแล้ว: ไม่ต้องแก้ใบ — บันทึกการแก้ไขด้วย \"ปิดเรื่อง\" ในเอกสาร",
      ],
      en: [
        "Wrong entry: fill a new, correct one, then have an owner or admin delete the old one (open it → Delete — it goes to the trash and can be restored)",
        "Forms with approval: the approver taps \"Reject\" with a reason — the filler sees it on the document and sends a new one",
        "Multi-person forms: before the job finishes, use \"Send back for correction\" to return it to an earlier step",
        "A failed submission that's been fixed: don't edit it — record the fix with \"Close issue\" on the document",
      ],
    },
    notes: {
      th: ["ระบบไม่ให้แก้ทับเพื่อให้ตรวจสอบย้อนหลังได้ (audit) — ทุกการลบ/กู้คืน/ปิดเรื่องมีประวัติ"],
      en: ["Overwriting is blocked so records stay auditable — every delete/restore/close-out is logged"],
    },
    keywords: "แก้ไข แก้ใบ ส่งผิด กรอกผิด edit fix wrong resubmit ส่งใหม่ ตีกลับ reject ส่งกลับ ลบ delete ถังขยะ trash",
  },
  {
    id: "print-pdf",
    title: { th: "พิมพ์และดาวน์โหลด PDF", en: "Print and download PDF" },
    summary: { th: "เอกสารที่ส่งแล้วพิมพ์ได้ทั้งแบบ A4 และแบบสรุป ดาวน์โหลด PDF และรูปทั้งหมดได้", en: "Print submitted documents as A4 or summary, and download the PDF and all photos." },
    tipFrom: 1,
    steps: {
      th: [
        "เปิดเอกสารที่ส่งแล้ว (จากแดชบอร์ด รายงาน หรือการแจ้งเตือน)",
        "เลือกแท็บ \"เอกสาร A4\" (หน้าตาเหมือนฟอร์มกระดาษ) หรือ \"สรุป\" (รายการคำตอบ)",
        "กด \"ดาวน์โหลด PDF\" — ได้ไฟล์ตามแท็บที่เลือก · หรือ \"พิมพ์\" เพื่อสั่งเครื่องพิมพ์",
        "มีรูปในเอกสาร: กด \"ดาวน์โหลดรูปทั้งหมด\" ได้ไฟล์ zip",
      ],
      en: [
        "Open a submitted document (from the dashboard, reports or a notification)",
        "Choose the \"A4 document\" tab (looks like the paper form) or \"Summary\" (list of answers)",
        "Tap \"Download PDF\" for the selected tab, or \"Print\" to send it to a printer",
        "With photos: \"Download all photos\" gives a zip file",
      ],
    },
    notes: {
      th: [
        "แท็บ A4 มีเฉพาะฟอร์มที่จัดหน้ากระดาษไว้ · ทำ PDF ไม่สำเร็จ ใช้ \"เปิดหน้าพิมพ์ A4\" แล้วเลือก \"บันทึกเป็น PDF\" ของเบราว์เซอร์",
        "พิมพ์ฟอร์มเปล่า: หน้าสร้างฟอร์ม → มุมมอง \"กระดาษ\" → \"พิมพ์\"",
        "QR ของฟอร์ม: หน้าฟอร์มทั้งหมด → ปุ่ม ⋯ ของฟอร์ม → \"QR Code ฟอร์ม\" → \"ดาวน์โหลด\" (รูป PNG ไปพิมพ์ติดหน้างาน)",
      ],
      en: [
        "The A4 tab exists only for forms with a paper layout · if the PDF fails, use \"Open A4 print page\" and the browser's \"Save as PDF\"",
        "Blank form: Create form → \"Paper\" view → \"Print\"",
        "Form QR: All forms → the form's ⋯ button → \"Form QR code\" → \"Download\" (PNG to print and post on site)",
      ],
    },
    keywords: "พิมพ์ print pdf ดาวน์โหลด download a4 สรุป summary รูป photos zip qr",
  },
  {
    id: "export-excel",
    title: { th: "ส่งออกข้อมูลเป็น Excel", en: "Export data to Excel" },
    summary: { th: "เลือกฟอร์มและช่วงเวลา แล้วส่งออกเป็นไฟล์ .xlsx (กดค้นหาเพื่อดูตัวอย่างก่อนได้)", en: "Pick a form and period, then export a .xlsx file (search first to preview if you like)." },
    tipFrom: 1,
    steps: {
      th: [
        "ไปที่เมนู \"รายงาน\"",
        "ตั้งตัวกรอง: ฟอร์ม ช่วงเวลา ผลลัพธ์ (ผ่าน/ไม่ผ่าน/ปิดเรื่องแล้ว) และสถานะอนุมัติ",
        "(ไม่บังคับ) กด \"ค้นหา\" เพื่อดูตัวอย่างก่อน",
        "กด \"ส่งออก Excel (.xlsx)\"",
      ],
      en: [
        "Go to the \"Reports\" menu",
        "Set filters: form, period, result (pass/fail/closed out) and approval status",
        "(Optional) tap \"Search\" to preview",
        "Tap \"Export Excel (.xlsx)\"",
      ],
    },
    notes: {
      th: [
        "อยากได้คำตอบแยกเป็นคอลัมน์รายช่อง ต้องเลือกฟอร์มเดียว (ช่องตารางแยกชีตให้) · เลือก \"ทุกฟอร์ม\" ได้แค่ข้อมูลสรุปต่อใบ",
        "สูงสุด 100,000 แถวต่อไฟล์",
        "สมาชิกทั่วไปส่งออกได้เฉพาะใบที่ตัวเองส่ง",
      ],
      en: [
        "For one column per field, pick a single form (table fields get their own sheets) · \"All forms\" gives a per-submission summary only",
        "Up to 100,000 rows per file",
        "Regular members can only export their own submissions",
      ],
    },
    where: { href: "/reports", label: { th: "ไปหน้ารายงาน", en: "Go to Reports" } },
    keywords: "excel xlsx ส่งออก export รายงาน report ดาวน์โหลด ตาราง คอลัมน์",
  },
  {
    id: "invite-roles",
    title: { th: "เชิญคนเข้า workspace และกำหนดบทบาท", en: "Invite people and set roles" },
    summary: { th: "เชิญทางอีเมล เลือกบทบาท และสร้างบทบาทเองเพื่อกำหนดเมนูที่แต่ละคนเข้าได้", en: "Invite by email, choose a role, and create custom roles to control which menus people can use." },
    steps: {
      th: [
        "ตั้งค่า → ทีม → \"เชิญสมาชิกใหม่\": ใส่อีเมล เลือกสิทธิ์ (และทีม/แผนก ถ้ามี) แล้วกด \"เชิญ\"",
        "ผู้ถูกเชิญได้อีเมล — สมัครหรือเข้าสู่ระบบด้วยอีเมลนั้นแล้วเข้า workspace เอง · อีเมลไม่ถึง ใช้ \"คัดลอกลิงก์เชิญ\" ส่งทางแชตได้",
        "อยากได้บทบาทแบบอื่น: ตั้งค่า → บทบาท → \"เพิ่มบทบาท\" ตั้งชื่อ (เช่น หัวหน้ากะ, QA) แล้วเลือกเมนูที่เข้าได้",
        "เปลี่ยนบทบาทของคนเดิมได้ที่รายชื่อสมาชิกในหน้าทีม",
      ],
      en: [
        "Settings → Team → \"Invite a new member\": enter the email, choose a role (and team, optional), then \"Invite\"",
        "The invitee gets an email — they sign up or sign in with that email and join automatically · if the email doesn't arrive, use \"Copy invite link\" and send it by chat",
        "Need another kind of role: Settings → Roles → \"Add role\", name it (e.g. Shift lead, QA) and pick its menus",
        "Change someone's role from the member list on the Team page",
      ],
    },
    notes: {
      th: [
        "บทบาทของระบบ: เจ้าของ (ทุกอย่าง), แอดมิน (จัดการได้ทุกเมนู), สมาชิก (กรอกฟอร์ม + แดชบอร์ด)",
        "คำเชิญที่ยังไม่ตอบรับนับรวมในจำนวนผู้ใช้ของแพ็กเกจ",
        "ลบบทบาทที่สร้างเอง = คนที่ใช้บทบาทนั้นกลายเป็นสมาชิก",
        "ทีม/แผนก ใช้กำหนดว่าใครเห็นฟอร์มไหน",
      ],
      en: [
        "Built-in roles: Owner (everything), Admin (manages all menus), Member (fill forms + dashboard)",
        "Pending invites count toward your plan's user limit",
        "Deleting a custom role turns its people into Members",
        "Teams control who sees which forms",
      ],
    },
    where: { href: "/settings/team", label: { th: "ไปหน้าทีม", en: "Go to Team" } },
    keywords: "เชิญ invite สมาชิก member ทีม team บทบาท role สิทธิ์ permission เมนู admin owner ผู้ดูแล แอดมิน เจ้าของ",
  },
  {
    id: "approval",
    tipFrom: 1,
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
    tipFrom: 1,
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
    tipFrom: 1,
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
      th: ["ปิดเรื่องได้เฉพาะผู้จัดการ (เจ้าของ แอดมิน หรือบทบาทที่จัดการ workspace ได้)", "ปิดแล้วเปิดกลับได้ ต้องใส่เหตุผล — ประวัติการปิด/เปิดเก็บไว้ทั้งหมด", "ดูใบที่ยังค้างได้ที่ รายงาน → ผลลัพธ์ \"ไม่ผ่าน · ยังไม่ปิดเรื่อง\""],
      en: ["Only managers (owner, admin, or roles that can manage the workspace) can close", "You can reopen with a reason — the full close/reopen history is kept", "Find open ones in Reports → result \"Fail · not closed\""],
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
    tipFrom: 1,
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
    tipFrom: 1,
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
    tipFrom: 1,
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
      th: ["เจ้าของและแอดมินเห็นทุกฟอร์มเสมอ", "ต้องสร้างทีมก่อนที่ ตั้งค่า → ทีม"],
      en: ["Admins always see every form", "Create teams first in Settings → Team"],
    },
    keywords: "ใครเห็น การมองเห็น visibility ทีม team public สาธารณะ qr แชร์ share",
  },
  {
    id: "dashboard",
    tipFrom: 1,
    title: { th: "จัดแดชบอร์ดด้วยแม่แบบและการ์ด", en: "Set up the dashboard with templates and cards" },
    summary: { th: "เริ่มจากแม่แบบตามลักษณะงาน แล้วเพิ่ม แก้ หรือลบการ์ดทีละใบ", en: "Start from a template for your kind of work, then add, edit or remove cards one by one." },
    steps: {
      th: [
        "ไปที่แดชบอร์ด → แท็บ \"ส่วนกลาง\" (ทุกคนเห็น · เฉพาะเจ้าของหรือแอดมินแก้ได้) หรือ \"ของฉัน\" (เห็นคนเดียว)",
        "กด \"ใช้แม่แบบ\" (ถ้ามีการ์ดอยู่แล้ว กด \"จัดการการ์ด\" ก่อน ปุ่มจะโผล่ขึ้นมา) แล้วเลือกแบบที่ใกล้งานที่สุด — งานตรวจ/ความปลอดภัย, บันทึกข้อมูลประจำวัน, งานอนุมัติ หรือตามพื้นที่ (แม่แบบนี้มีเมื่อตั้งพื้นที่ไว้แล้ว · แบบที่มีป้าย \"แนะนำ\" ระบบเลือกจากข้อมูลจริงของคุณ)",
        "ถ้ามีการ์ดอยู่แล้ว เลือก \"ต่อท้าย\" (เพิ่มเฉพาะการ์ดที่ยังไม่มี · การ์ดที่มีแล้วจะมีป้ายบอก) หรือ \"แทนที่\" (เปลี่ยนทั้งชุด) แล้วกดปุ่มด้านล่าง",
        "อยากปรับต่อ กด \"จัดการการ์ด\" — เพิ่มการ์ด แก้ (ไอคอนดินสอ) ลบ หรือเลื่อนลำดับขึ้น/ลง (ลากวางได้บนคอม)",
        "เพิ่มการ์ดเอง: เลือกรูปแบบ (ตัวเลข / กราฟแนวโน้ม / อันดับฟอร์ม / ค้างปิดเรื่อง / ข้อที่ไม่ผ่านบ่อย / ตามพื้นที่) → ฟอร์ม → ค่าที่แสดง → ช่วงเวลา → บันทึก",
      ],
      en: [
        "Go to Dashboard → the \"Shared\" tab (everyone sees it · only owners/admins edit) or \"Mine\" (only you)",
        "Tap \"Use a template\" (if you already have cards, tap \"Manage cards\" first to reveal it) and pick the closest fit — Inspection/safety, Daily records, Approvals or By area (shown once areas are set up · the \"Recommended\" one is chosen from your real data)",
        "If you already have cards, choose \"Add after current cards\" (adds only cards you don't have yet · existing ones are marked) or \"Replace all current cards\" (swap the whole set), then press the button at the bottom",
        "To fine-tune, tap \"Manage cards\" — add, edit (pencil), remove or move up/down (drag on desktop)",
        "Add a card yourself: pick a format (stat / trend / ranking / open failures / top failed items / by area) → form → metric → period → save",
      ],
    },
    notes: {
      th: [
        "การ์ดตัวเลขและอันดับฟอร์ม สลับช่วงบนการ์ดได้ (วันนี้ / 7 / 14 / 30 วัน) · กราฟแนวโน้มและข้อที่ไม่ผ่านบ่อยสลับได้ 7 / 14 / 30 วัน (วันเดียวไม่มีแนวโน้ม) · การ์ด \"เดือนนี้\"/\"ทั้งหมด\" ไม่มีปุ่มสลับ — ช่วงที่เลือกจำไว้ในเครื่องของคุณ ไม่เปลี่ยนแดชบอร์ดของคนอื่น",
        "ใช้แม่แบบแล้วเปลี่ยนใจ กด \"เลิกทำ\" ที่แถบด้านล่างได้ภายใน 8 วินาที",
        "ในกราฟแนวโน้ม แตะแท่ง (หรือกดลูกศรซ้าย/ขวา) เพื่อดูค่าของวันนั้น กด \"แสดงผลรวม\" เพื่อกลับ",
        "สมาชิกที่ไม่ใช่ผู้จัดการเห็นตัวเลขเฉพาะฟอร์มที่ตัวเองมีสิทธิ์",
        "ใบไม่ผ่าน รออนุมัติ และรอบตรวจเลยกำหนด แสดงที่แถบ \"ต้องดูตอนนี้\" ด้านบนเสมอ ไม่ต้องทำการ์ดซ้ำ",
      ],
      en: [
        "Stat and ranking cards switch period on the card (today / 7 / 14 / 30 days) · trend and top-failure cards switch 7 / 14 / 30 days (one day has no trend) · \"This month\"/\"All time\" cards have no switch — your choice is remembered on this device and doesn't change anyone else's dashboard",
        "Changed your mind after applying a template? Tap \"Undo\" in the bar at the bottom within 8 seconds",
        "On a trend chart, tap a bar (or use the left/right arrows) to see that day's value",
        "Members who aren't managers only see numbers for forms they can access",
        "Failures, pending approvals and overdue rounds always show in the \"Needs attention\" strip at the top — no need for duplicate cards",
      ],
    },
    where: { href: "/dashboard", label: { th: "ไปหน้าแดชบอร์ด", en: "Go to Dashboard" } },
    keywords: "แดชบอร์ด dashboard แม่แบบ template การ์ด card widget กราฟ chart สรุป ส่วนกลาง ของฉัน ต่อท้าย แทนที่",
  },
];

export function helpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}
