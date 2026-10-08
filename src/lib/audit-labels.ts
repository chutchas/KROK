// ============================================================
// KROK · แปล audit action / meta เป็นภาษาที่ผู้ใช้ทั่วไปอ่านเข้าใจ
// action ที่ไม่รู้จัก → ประกอบจาก "หมวด + กริยา" (เช่น form.archive → "ฟอร์ม · เก็บถาวร")
// ============================================================
type Lang = "th" | "en";
type L = { th: string; en: string };

const ACTIONS: Record<string, L> = {
  "form.publish": { th: "เผยแพร่ฟอร์มใหม่", en: "Published a form" },
  "form.update": { th: "แก้ไขฟอร์ม", en: "Edited a form" },
  "form.draft": { th: "บันทึกฟอร์มฉบับร่าง", en: "Saved a form draft" },
  "form.status": { th: "เปลี่ยนสถานะฟอร์ม", en: "Changed form status" },
  "form.delete": { th: "ลบฟอร์ม", en: "Deleted a form" },
  "form.visibility": { th: "เปลี่ยนสิทธิ์การมองเห็นฟอร์ม", en: "Changed who can see a form" },
  "form.device_scope": { th: "ตั้งค่าเครื่องที่ใช้กรอกฟอร์ม", en: "Changed allowed devices for a form" },
  "form.device_link": { th: "อนุญาตเครื่องให้กรอกฟอร์ม", en: "Allowed a device for a form" },
  "form.device_unlink": { th: "ยกเลิกเครื่องจากฟอร์ม", en: "Removed a device from a form" },
  "device.approved": { th: "อนุมัติเครื่อง", en: "Approved a device" },
  "device.revoked": { th: "ระงับเครื่อง", en: "Blocked a device" },
  "device.pending": { th: "ตั้งเครื่องเป็นรออนุมัติ", en: "Set a device to pending" },
  "device.delete": { th: "ลบเครื่อง", en: "Deleted a device" },
  "dataset.create": { th: "สร้างชุดข้อมูล", en: "Created a dataset" },
  "dataset.delete": { th: "ลบชุดข้อมูล", en: "Deleted a dataset" },
  "dataset.pull_config": { th: "ตั้งค่าดึงข้อมูลจากระบบภายนอก", en: "Set up data pull from an external system" },
  "dataset.push_key_rotate": { th: "ออกกุญแจรับข้อมูลใหม่ (ชุดข้อมูล)", en: "Issued a new data-push key" },
  "dataset.push_key_revoke": { th: "ยกเลิกกุญแจรับข้อมูล (ชุดข้อมูล)", en: "Revoked the data-push key" },
  "submission.create": { th: "ส่งฟอร์ม", en: "Submitted a form" },
  "submission.approved": { th: "อนุมัติเอกสาร", en: "Approved a submission" },
  "submission.rejected": { th: "ตีกลับเอกสาร", en: "Rejected a submission" },
  "member.invite": { th: "เชิญสมาชิก", en: "Invited a member" },
  "member.invite_resend": { th: "ส่งคำเชิญซ้ำ", en: "Resent an invite" },
  "member.role_change": { th: "เปลี่ยนบทบาทสมาชิก", en: "Changed a member's role" },
  "member.remove": { th: "นำสมาชิกออก", en: "Removed a member" },
  "workspace.rename": { th: "เปลี่ยนชื่อ workspace", en: "Renamed the workspace" },
  "area.create": { th: "เพิ่มพื้นที่", en: "Added an area" },
  "area.update": { th: "แก้ไขพื้นที่", en: "Edited an area" },
  "plan.change": { th: "เปลี่ยนแพ็กเกจ", en: "Changed plan" },
  "intake.key_rotate": { th: "ออกกุญแจ API รับข้อมูลเข้าฟอร์มใหม่", en: "Issued a new form intake API key" },
  "intake.key_expiry": { th: "เปลี่ยนวันหมดอายุกุญแจ API รับข้อมูลเข้าฟอร์ม", en: "Changed form intake API key expiry" },
  "intake.key_revoke": { th: "ยกเลิกกุญแจ API รับข้อมูลเข้าฟอร์ม", en: "Revoked the form intake API key" },
  "attachment.add": { th: "แนบไฟล์ประกอบฟอร์ม", en: "Added a form attachment" },
  "attachment.remove": { th: "ลบไฟล์ประกอบฟอร์ม", en: "Removed a form attachment" },
  "platform.plans.update": { th: "แก้ไขแพ็กเกจของแพลตฟอร์ม", en: "Updated platform plans" },
  "platform.payment.update": { th: "แก้ไขการตั้งค่าการชำระเงิน", en: "Updated payment settings" },
  "platform.ai.update": { th: "แก้ไขการตั้งค่า AI", en: "Updated AI settings" },
};

const SUBJECT: Record<string, L> = {
  form: { th: "ฟอร์ม", en: "Form" }, device: { th: "เครื่อง", en: "Device" }, dataset: { th: "ชุดข้อมูล", en: "Dataset" },
  submission: { th: "เอกสาร", en: "Submission" }, member: { th: "สมาชิก", en: "Member" }, workspace: { th: "Workspace", en: "Workspace" },
  plan: { th: "แพ็กเกจ", en: "Plan" }, intake: { th: "API รับข้อมูล", en: "Intake API" }, attachment: { th: "ไฟล์แนบ", en: "Attachment" },
  platform: { th: "แพลตฟอร์ม", en: "Platform" }, team: { th: "ทีม", en: "Team" }, role: { th: "บทบาท", en: "Role" }, webhook: { th: "Webhook", en: "Webhook" },
};
const VERB: Record<string, L> = {
  create: { th: "สร้าง", en: "created" }, update: { th: "แก้ไข", en: "updated" }, delete: { th: "ลบ", en: "deleted" },
  remove: { th: "นำออก", en: "removed" }, add: { th: "เพิ่ม", en: "added" }, archive: { th: "เก็บถาวร", en: "archived" },
  restore: { th: "กู้คืน", en: "restored" }, rename: { th: "เปลี่ยนชื่อ", en: "renamed" }, approve: { th: "อนุมัติ", en: "approved" },
  approved: { th: "อนุมัติ", en: "approved" }, rejected: { th: "ตีกลับ", en: "rejected" }, cancel: { th: "ยกเลิก", en: "cancelled" },
  invite: { th: "เชิญ", en: "invited" }, publish: { th: "เผยแพร่", en: "published" },
};

/** ชื่อการกระทำที่คนอ่านเข้าใจ */
export function actionLabel(action: string, lang: Lang): string {
  const hit = ACTIONS[action];
  if (hit) return hit[lang];
  const [subj, ...rest] = action.split(".");
  const verb = rest.join(".");
  const s = SUBJECT[subj]?.[lang] ?? subj;
  const v = VERB[rest[rest.length - 1]]?.[lang] ?? verb.replace(/[_.]/g, " ");
  return v ? `${s} · ${v}` : s;
}

/** โทนสีป้าย: ลบ/ระงับ/ตีกลับ = แดง · สร้าง/เผยแพร่/อนุมัติ = เขียว · อื่น ๆ = เทา */
export function actionKind(action: string): "pass" | "fail" | "na" {
  if (/(delete|remove|revoke|rejected|archive|cancel|unlink)/.test(action)) return "fail";
  if (/(create|publish|approve|link$|invite$|add$)/.test(action)) return "pass";
  return "na";
}

const STATUS: Record<string, L> = {
  active: { th: "เปิดใช้งาน", en: "Active" }, published: { th: "เปิดใช้งาน", en: "Active" }, paused: { th: "พักชั่วคราว", en: "Paused" },
  closed: { th: "ปิด", en: "Closed" }, archived: { th: "เก็บถาวร", en: "Archived" }, draft: { th: "ฉบับร่าง", en: "Draft" },
};
const VIS: Record<string, L> = {
  all: { th: "ทุกคนใน workspace", en: "Everyone in workspace" }, public: { th: "สาธารณะ (ใครมีลิงก์ก็กรอกได้)", en: "Public link" },
  teams: { th: "เฉพาะทีมที่เลือก", en: "Selected teams" }, users: { th: "เฉพาะคนที่เลือก", en: "Selected people" },
};
const SCOPE: Record<string, L> = { any: { th: "ทุกเครื่องที่อนุมัติแล้ว", en: "Any approved device" }, selected: { th: "เฉพาะเครื่องที่เลือก", en: "Selected devices" } };
const DS_KIND: Record<string, L> = { file: { th: "อัปโหลดไฟล์", en: "File upload" }, api_pull: { th: "ดึงจาก API", en: "Pull from API" }, api_push: { th: "ระบบภายนอกส่งเข้ามา", en: "Pushed by external system" } };
const SOURCE: Record<string, L> = { public: { th: "ลิงก์สาธารณะ", en: "Public link" }, api: { th: "ระบบภายนอก (API)", en: "External system (API)" } };
const RESULT: Record<string, L> = { pass: { th: "ผ่าน", en: "Pass" }, fail: { th: "ไม่ผ่าน", en: "Fail" } };
const ROLE: Record<string, L> = { owner: { th: "เจ้าของ", en: "Owner" }, admin: { th: "ผู้ดูแล", en: "Admin" }, designer: { th: "ผู้ออกแบบฟอร์ม", en: "Designer" }, operator: { th: "ผู้กรอก", en: "Operator" }, user: { th: "ผู้ใช้", en: "User" } };

const K: Record<string, L> = {
  form: { th: "ฟอร์ม", en: "Form" }, device: { th: "เครื่อง", en: "Device" }, dataset: { th: "ชุดข้อมูล", en: "Dataset" }, member: { th: "สมาชิก", en: "Member" },
  email: { th: "อีเมล", en: "Email" }, role: { th: "บทบาท", en: "Role" }, status: { th: "สถานะ", en: "Status" }, visibility: { th: "การมองเห็น", en: "Visibility" },
  fields: { th: "จำนวนช่อง", en: "Fields" }, approval: { th: "การอนุมัติ", en: "Approval" }, scope: { th: "เครื่องที่ใช้ได้", en: "Devices" },
  kind: { th: "แหล่งข้อมูล", en: "Source" }, rows: { th: "จำนวนแถว", en: "Rows" }, host: { th: "ปลายทาง", en: "Host" }, file: { th: "ไฟล์", en: "File" },
  size: { th: "ขนาด", en: "Size" }, source: { th: "ช่องทาง", en: "Channel" }, result: { th: "ผล", en: "Result" }, by: { th: "ผู้กรอก", en: "Filled by" },
  ref: { th: "เลขอ้างอิง", en: "Reference" }, step: { th: "ขั้นที่", en: "Step" }, note: { th: "หมายเหตุ", en: "Note" }, name: { th: "ชื่อใหม่", en: "New name" },
  plan: { th: "แพ็กเกจ", en: "Plan" }, teams: { th: "ทีม", en: "Teams" }, mailed: { th: "อีเมลเชิญ", en: "Invite email" }, key: { th: "กุญแจ", en: "Key" },
expiry: { th: "อายุ key", en: "Key lifetime" },   provider: { th: "ผู้ให้บริการ", en: "Provider" }, model: { th: "โมเดล", en: "Model" }, enabled: { th: "เปิดใช้", en: "Enabled" }, purpose: { th: "ใช้สำหรับ", en: "Purpose" },
};

export interface AuditCtx {
  /** ชื่อเป้าหมายจาก target_id (ฟอร์ม/เครื่อง/ชุดข้อมูล/สมาชิก) */
  targetName?: string;
  /** ชื่อฟอร์มจาก meta.form_id (กรณีเป้าหมายเป็นเครื่อง) */
  formName?: string;
  roleNames?: Record<string, string>;
}

const str = (v: unknown) => (v == null ? "" : String(v));
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** รายละเอียดเป็นคู่ "หัวข้อ: ค่า" ที่อ่านเข้าใจ (ข้ามค่าเทคนิค เช่น id อีเมลระบบ) */
export function describeAudit(
  r: { action: string; target_type: string | null; meta: Record<string, unknown> | null },
  lang: Lang,
  ctx: AuditCtx = {},
): { k: string; v: string; warn?: boolean }[] {
  const m = r.meta || {};
  const out: { k: string; v: string; warn?: boolean }[] = [];
  const push = (key: keyof typeof K, v: string, warn?: boolean) => { if (v) out.push({ k: K[key][lang], v, warn }); };
  const yes = lang === "en" ? "Yes" : "ใช่";
  const no = lang === "en" ? "No" : "ไม่";
  const pick = (map: Record<string, L>, v: unknown) => { const s = str(v); return map[s]?.[lang] ?? s; };

  // เป้าหมาย (ชื่อจริงจากฐานข้อมูล ถ้ายังมีอยู่ ไม่งั้นใช้ชื่อที่บันทึกไว้ใน meta)
  const tt = r.target_type;
  const subjKey: keyof typeof K | null =
    tt === "form" ? "form" : tt === "device" ? "device" : tt === "dataset" ? "dataset" : tt === "user" ? "member" : null;
  const nameFromMeta = str(tt === "dataset" ? m.name : m.title);
  const gone = subjKey === "member"
    ? (lang === "en" ? "(no longer in workspace)" : "(ไม่อยู่ใน workspace แล้ว)")
    : (lang === "en" ? "(deleted)" : "(ถูกลบแล้ว)");
  if (subjKey) push(subjKey, ctx.targetName || nameFromMeta || gone);
  else if (tt === "submission" && ctx.targetName) push("form", ctx.targetName);
  if (ctx.formName) push("form", ctx.formName);

  if (m.email) push("email", str(m.email));
  const roleKey = str(m.role_key || m.role);
  if (roleKey) push("role", ctx.roleNames?.[roleKey] || ROLE[roleKey]?.[lang] || roleKey);
  if (Array.isArray(m.teams) ? m.teams.length : Number(m.teams) > 0) push("teams", `${Array.isArray(m.teams) ? m.teams.length : m.teams}`);
  if ("emailed" in m) {
    push("mailed", m.emailed ? (lang === "en" ? "Sent" : "ส่งแล้ว") : (lang === "en" ? "Not sent" : "ส่งไม่สำเร็จ"), !m.emailed);
  }
  if (m.status) push("status", pick(STATUS, m.status));
  if (m.visibility || m.mode) push("visibility", pick(VIS, m.visibility || m.mode));
  if (m.fields != null) push("fields", str(m.fields));
  if (m.requires_approval != null)
    push("approval", m.requires_approval ? (lang === "en" ? `${str(m.approval_steps) || 1} step(s)` : `${str(m.approval_steps) || 1} ขั้น`) : (lang === "en" ? "None" : "ไม่ต้องอนุมัติ"));
  if (m.scope) push("scope", pick(SCOPE, m.scope));
  if (m.kind && tt === "dataset") push("kind", pick(DS_KIND, m.kind));
  if (m.rows != null) push("rows", Number(m.rows).toLocaleString());
  if (m.host) push("host", str(m.host));
  if (tt !== "dataset" && r.action.startsWith("attachment.") && m.name) push("file", str(m.name));
  if (r.action === "workspace.rename" && m.name) push("name", str(m.name));
  if (typeof m.size === "number") push("size", fmtSize(m.size));
  if (m.source) push("source", str(m.source_name) ? `${pick(SOURCE, m.source)} · ${str(m.source_name)}` : pick(SOURCE, m.source));
  if (m.result) push("result", pick(RESULT, m.result), m.result === "fail");
  if (m.user_name) push("by", str(m.user_name));
  if (m.ref) push("ref", str(m.ref));
  if (typeof m.step === "number") push("step", str(m.step + 1));
  if (m.note) push("note", str(m.note));
  if (m.plan) push("plan", str(m.plan));
  if (m.prefix) push("key", `${str(m.prefix)}…`);
  if ("expires_days" in m) push("expiry", m.expires_days == null ? (lang === "en" ? "Never expires" : "ไม่หมดอายุ") : (lang === "en" ? `${str(m.expires_days)} days` : `${str(m.expires_days)} วัน`));
  if (m.provider) push("provider", str(m.provider));
  if (m.model) push("model", str(m.model));
  if (m.purpose) push("purpose", str(m.purpose));
  if ("enabled" in m) push("enabled", m.enabled ? yes : no);
  if (Array.isArray(m.plans)) push("plan", m.plans.join(", "));
  return out;
}
