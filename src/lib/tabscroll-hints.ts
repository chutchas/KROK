// แถบแท็บที่เลื่อนแนวนอนได้ (.krok-tabscroll): ตั้ง data-more="left|right|left right" ตามที่ยังมีแท็บซ่อนอยู่
// CSS ใช้ทำขอบจาง — เห็นว่ายังมีแท็บต่อ และไม่จางเมื่อเลื่อนสุดแล้ว/ไม่ล้นจอ
// ผูกครั้งเดียวทั้งแอป: MutationObserver จับแถบที่โผล่ทีหลัง (โหลดข้อมูลช้า/เปลี่ยนแท็บ) ได้ทุกเมื่อ
function update(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  const parts: string[] = [];
  if (max > 2 && el.scrollLeft > 2) parts.push("left");
  if (max > 2 && el.scrollLeft < max - 2) parts.push("right");
  const v = parts.join(" ");
  if ((el.dataset.more ?? "") !== v) el.dataset.more = v;
}

export function attachTabScrollHints(root: HTMLElement = document.body): () => void {
  const bound = new WeakSet<HTMLElement>();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver((es) => es.forEach((e) => update(e.target as HTMLElement))) : null;
  const onScroll = (e: Event) => update(e.currentTarget as HTMLElement);
  const bind = (el: HTMLElement) => {
    if (bound.has(el)) { update(el); return; }
    bound.add(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    ro?.observe(el);
    update(el);
  };
  const scan = () => root.querySelectorAll<HTMLElement>(".krok-tabscroll").forEach(bind);
  scan();
  // แท็บเพิ่ม/ลด (ลูกของแถบเปลี่ยน) หรือแถบใหม่โผล่ → สแกนรอบถัดไป (รวมหลายการเปลี่ยนเป็นครั้งเดียว)
  let queued = 0;
  const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(() => {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; scan(); });
  }) : null;
  mo?.observe(root, { childList: true, subtree: true });
  return () => {
    mo?.disconnect(); ro?.disconnect();
    if (queued) cancelAnimationFrame(queued);
    root.querySelectorAll<HTMLElement>(".krok-tabscroll").forEach((el) => el.removeEventListener("scroll", onScroll));
  };
}
