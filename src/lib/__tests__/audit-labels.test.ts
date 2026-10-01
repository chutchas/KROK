import { describe, expect, it } from "vitest";
import { actionKind, actionLabel, describeAudit } from "../audit-labels";

describe("audit labels", () => {
  it("แปล action ที่รู้จักเป็นภาษาคน", () => {
    expect(actionLabel("form.delete", "th")).toBe("ลบฟอร์ม");
    expect(actionLabel("member.invite", "en")).toBe("Invited a member");
  });
  it("action ที่ไม่รู้จัก → หมวด + กริยา ไม่โชว์รหัสดิบ", () => {
    expect(actionLabel("team.create", "th")).toBe("ทีม · สร้าง");
    expect(actionLabel("form.archive", "en")).toBe("Form · archived");
  });
  it("ทุก action ที่ระบบบันทึกจริงมีชื่อเฉพาะ (ไม่มีจุดในชื่อ)", () => {
    const all = ["form.publish", "form.update", "form.draft", "form.status", "form.delete", "form.visibility", "form.device_scope", "form.device_link", "form.device_unlink",
      "device.approved", "device.revoked", "device.pending", "device.delete", "dataset.create", "dataset.delete", "dataset.pull_config", "dataset.push_key_rotate", "dataset.push_key_revoke",
      "submission.create", "submission.approved", "submission.rejected", "member.invite", "member.invite_resend", "member.role_change", "member.remove",
      "workspace.rename", "plan.change", "intake.key_rotate", "intake.key_revoke", "attachment.add", "attachment.remove"];
    for (const a of all) {
      expect(actionLabel(a, "th")).not.toContain(".");
      expect(actionLabel(a, "en")).not.toContain(".");
    }
  });
  it("สีป้าย", () => {
    expect(actionKind("form.delete")).toBe("fail");
    expect(actionKind("dataset.push_key_revoke")).toBe("fail");
    expect(actionKind("form.publish")).toBe("pass");
    expect(actionKind("form.update")).toBe("na");
  });
  it("รายละเอียดอ่านง่าย ไม่มี JSON", () => {
    const d = describeAudit({ action: "form.publish", target_type: "form", meta: { title: "ตรวจรถ", fields: 12, requires_approval: true, approval_steps: 2, visibility: "teams" } }, "th");
    expect(d).toEqual([
      { k: "ฟอร์ม", v: "ตรวจรถ" },
      { k: "การมองเห็น", v: "เฉพาะทีมที่เลือก" },
      { k: "จำนวนช่อง", v: "12" },
      { k: "การอนุมัติ", v: "2 ขั้น" },
    ].map((x) => ({ ...x, warn: undefined })));
  });
  it("ใช้ชื่อจริงจาก server ก่อน · ถูกลบแล้วแสดงข้อความแทนรหัส", () => {
    expect(describeAudit({ action: "form.delete", target_type: "form", meta: {} }, "th", { targetName: "ใบเบิก" })[0]).toMatchObject({ k: "ฟอร์ม", v: "ใบเบิก" });
    expect(describeAudit({ action: "device.delete", target_type: "device", meta: {} }, "th")[0].v).toBe("(ถูกลบแล้ว)");
  });
  it("เชิญสมาชิก: อีเมล บทบาท(ชื่อที่ตั้ง) และส่งเมลไม่สำเร็จ = เตือน", () => {
    const d = describeAudit({ action: "member.invite", target_type: "invite", meta: { email: "a@b.co", role_key: "qa", teams: 2, emailed: false, email_error: "x" } }, "th", { roleNames: { qa: "ฝ่ายคุณภาพ" } });
    expect(d.map((x) => x.v)).toEqual(["a@b.co", "ฝ่ายคุณภาพ", "2", "ส่งไม่สำเร็จ"]);
    expect(d[3].warn).toBe(true);
  });
});
