"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

// ดัก error ที่ไม่มีใครจับ (สคริปต์พัง / promise reject) แล้วส่งไปบันทึก — วางใน root layout
export default function ErrorReporter() {
  useEffect(() => {
    const onErr = (ev: ErrorEvent) => {
      // error จากสคริปต์ข้ามโดเมน/extension ไม่มีรายละเอียด — ข้าม
      if (!ev.error && (!ev.message || ev.message === "Script error.")) return;
      reportClientError(ev.error ?? ev.message, "window");
    };
    const onRej = (ev: PromiseRejectionEvent) => reportClientError(ev.reason, "promise");
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
  return null;
}
