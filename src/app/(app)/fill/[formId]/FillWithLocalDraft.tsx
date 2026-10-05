"use client";
import { useEffect, useState, type ComponentProps } from "react";
import FillWizard from "./FillWizard";
import { getLocalDraft, type LocalDraft } from "@/lib/offline-store";

type Props = ComponentProps<typeof FillWizard>;

/**
 * หน้ากรอกปกติ (ออนไลน์) + ร่างที่บันทึกในเครื่องตอนออฟไลน์
 * มีร่างในเครื่องของฟอร์มนี้ → เปิดต่อจากร่างนั้น (บันทึกอัตโนมัติรอบถัดไปจะส่งขึ้น server แล้วลบออกจากเครื่อง)
 */
export default function FillWithLocalDraft(props: Props) {
  const [local, setLocal] = useState<LocalDraft | null>(null);
  useEffect(() => {
    if (props.caseData || props.publicMode) return;
    let alive = true;
    getLocalDraft(props.userId, props.formId).then((d) => {
      if (!alive || !d || d.tenantId !== props.tenantId) return;
      // เปิดร่างบน server ใบอื่นอยู่ → ไม่ทับด้วยร่างในเครื่อง
      if (props.draft && d.serverDraftId && d.serverDraftId !== props.draft.id) return;
      setLocal(d);
    });
    return () => { alive = false; };
  }, [props.caseData, props.publicMode, props.userId, props.formId, props.tenantId, props.draft]);
  return <FillWizard key={local ? `local:${local.updatedAt}` : "server"} {...props} localDraft={local} />;
}
