// pdfjs-dist ไม่มี type ของไฟล์ worker — ใช้แค่ส่งต่อให้ pdfjs (globalThis.pdfjsWorker)
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
