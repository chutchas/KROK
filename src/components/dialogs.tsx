"use client";
// ============================================================
// KROK · หน้าต่างยืนยัน/แจ้งเตือนของแอป — แทน window.confirm / alert ของ browser
//
// เรียกได้จากที่ไหนก็ได้ (ไม่ต้องใช้ hook):
//   if (!(await confirmDialog({ message: "ลบ?", danger: true }))) return;
//   await alertDialog("บันทึกไม่สำเร็จ");
// <DialogHost /> วางครั้งเดียวที่ root layout (ภายใน LanguageProvider)
//
// เหตุผล: กล่องของ browser บล็อกทั้งหน้า, หน้าตาไม่เข้ากับแอป, บนมือถือบางเครื่องดูเหมือนหน้าเว็บค้าง
// ============================================================
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** ปุ่มยืนยันสีแดง (ลบ/ยกเลิก/ย้อนกลับไม่ได้) */
  danger?: boolean;
}

type Req =
  | { id: number; kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; kind: "alert"; opts: ConfirmOptions; resolve: (v: boolean) => void };

let queue: Req[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(kind: Req["kind"], opts: ConfirmOptions): Promise<boolean> {
  // ไม่มี DialogHost (เช่น หน้าแยกที่ไม่มี layout หลัก) → ใช้กล่องของ browser แทน กันการกดแล้วเงียบ
  if (typeof window === "undefined") return Promise.resolve(false);
  if (listeners.size === 0) {
    if (kind === "alert") { window.alert(opts.message); return Promise.resolve(true); }
    return Promise.resolve(window.confirm(opts.message));
  }
  return new Promise((resolve) => {
    queue = [...queue, { id: ++seq, kind, opts, resolve }];
    emit();
  });
}

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  return push("confirm", typeof opts === "string" ? { message: opts } : opts);
}

export async function alertDialog(message: string, title?: string): Promise<void> {
  await push("alert", { message, title });
}

function settle(id: number, v: boolean) {
  const r = queue.find((q) => q.id === id);
  queue = queue.filter((q) => q.id !== id);
  emit();
  r?.resolve(v);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => queue;
const EMPTY: Req[] = []; // ค่าเดิมทุกครั้ง — React ต้องการ snapshot ที่คงที่
const serverSnapshot = (): Req[] => EMPTY;

export function DialogHost() {
  const reqs = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const cur = reqs[0];
  if (!cur) return null;
  return <DialogView key={cur.id} req={cur} />;
}

function DialogView({ req }: { req: Req }) {
  const { t } = useT();
  const titleId = useId();
  const okRef = useRef<HTMLButtonElement>(null);
  const isAlert = req.kind === "alert";
  const { opts } = req;

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); settle(req.id, isAlert); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req.id, isAlert]);

  return (
    <div role={isAlert ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={opts.title ? titleId : undefined} aria-describedby={`${titleId}-m`}
      onClick={() => settle(req.id, isAlert)}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,10,14,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 420, background: "var(--surface)", color: "var(--ink)", borderRadius: 12, padding: 18, boxShadow: "var(--shadow)", paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}>
        {opts.title && <h3 id={titleId} style={{ margin: "0 0 8px", fontSize: "1.02rem" }}>{opts.title}</h3>}
        <p id={`${titleId}-m`} style={{ margin: 0, fontSize: ".92rem", color: "var(--ink-2)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{opts.message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
          {!isAlert && <Button onClick={() => settle(req.id, false)}>{opts.cancelLabel || t("common.cancel")}</Button>}
          <Button ref={okRef} variant={opts.danger ? "danger" : "primary"} onClick={() => settle(req.id, true)}>
            {opts.confirmLabel || (isAlert ? t("common.ok") : opts.danger ? t("common.delete") : t("common.confirm"))}
          </Button>
        </div>
      </div>
    </div>
  );
}
