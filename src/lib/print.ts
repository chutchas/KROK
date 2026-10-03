"use client";
// รูปในหน้าเอกสารใช้ loading="lazy" (เลื่อนถึงค่อยโหลด) → ก่อนพิมพ์ต้องบังคับโหลดให้ครบ ไม่งั้นรูปที่ยังไม่เลื่อนถึงจะว่างบนกระดาษ

/** เปลี่ยนรูป lazy ทั้งหน้าเป็นโหลดทันที คืน promise ที่รอโหลดเสร็จ (สูงสุด timeoutMs) */
export function loadAllImages(timeoutMs = 4000): Promise<void> {
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imgs) if (img.loading === "lazy") img.loading = "eager";
  const pending = imgs.filter((i) => !i.complete).map((i) => new Promise<void>((res) => {
    i.addEventListener("load", () => res(), { once: true });
    i.addEventListener("error", () => res(), { once: true });
  }));
  if (!pending.length) return Promise.resolve();
  return Promise.race([Promise.all(pending).then(() => undefined), new Promise<void>((res) => setTimeout(res, timeoutMs))]);
}

/** ปุ่มพิมพ์ทุกปุ่มใช้ตัวนี้แทน window.print() */
export async function printWhenReady(): Promise<void> {
  await loadAllImages();
  window.print();
}
