import type { FormSchema } from "@/lib/form-schema";
import type { Attachment } from "@/lib/attachments";
import type { WorkspaceBranding } from "@/lib/theme";

/** ฟอร์มหนึ่งใบที่เก็บไว้ในเครื่องเพื่อกรอกตอนออฟไลน์ (props ที่หน้ากรอกต้องใช้) */
export interface OfflineForm {
  formId: string;
  title: string;
  icon: string;
  version: number;
  requiresApproval: boolean;
  approvalChain: unknown[];
  requireDevice: boolean;
  schema: FormSchema;
  attachments: Attachment[];
}

export interface OfflineBundle {
  /** ลายนิ้วมือของเนื้อหา — เหมือนเดิม = ไม่ต้องดาวน์โหลดซ้ำ */
  hash: string;
  savedAt: string;
  tenantId: string;
  tenantName: string;
  userId: string;
  userName: string;
  branding: WorkspaceBranding | null;
  forms: OfflineForm[];
}
