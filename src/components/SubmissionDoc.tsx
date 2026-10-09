"use client";
import { useMemo } from "react";
import FormPaperFill from "@/components/FormPaperFill";
import DocPaperField from "@/components/paper/DocPaperField";
import { matchAnswersToFields, type StoredAnswer } from "@/lib/doc-answers";
import type { FormSchema } from "@/lib/form-schema";
import type { ResolvedTheme } from "@/lib/theme";
import { useT } from "@/i18n/LanguageProvider";

// ============================================================
// เอกสาร A4 ของใบที่ส่งแล้ว = กระดาษแผ่นเดียวกับที่ผู้กรอกเห็นตอนกรอกแบบกระดาษ
// (ตำแหน่งช่องตาม schema.layout ของเวอร์ชันที่กรอก · ฟอร์มที่ไม่ได้จัดหน้า = จัดอัตโนมัติแบบเดียวกับหน้ากรอก)
// ใช้ทั้งแท็บ "เอกสาร A4" (variant doc) และหน้าพิมพ์/ทำ PDF (variant print)
// ============================================================
export default function SubmissionDoc({
  schema, title, icon, answers, photos, theme, filler, submittedAt, docNo, variant,
}: {
  schema: FormSchema;
  title: string;
  icon: string;
  answers: StoredAnswer[];
  /** key รูป (slot key / ลายเซ็น / รูปในแถว) → URL */
  photos: Record<string, string>;
  theme?: ResolvedTheme;
  filler: string;
  submittedAt: string | null;
  docNo: string;
  variant: "doc" | "print";
}) {
  const { lang } = useT();
  const byField = useMemo(() => matchAnswersToFields(schema, answers), [schema, answers]);
  const photoUrl = (k: string) => photos[k];
  // รูปแบบวันที่เดียวกับหัวกระดาษตอนกรอก · เวลาไทยเสมอ (เครื่องทำ PDF อยู่ UTC)
  const date = submittedAt
    ? new Date(submittedAt).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric" })
    : undefined;
  return (
    <FormPaperFill
      schema={schema}
      icon={icon}
      title={title}
      theme={theme}
      variant={variant}
      meta={{ filler, date, docNo }}
      photoUrl={photoUrl}
      renderField={(f) => <DocPaperField f={f} a={byField[f.id]} photoUrl={photoUrl} />}
    />
  );
}
