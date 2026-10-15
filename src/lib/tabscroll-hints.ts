// แถบแท็บที่เลื่อนแนวนอนได้ (.krok-tabscroll): ตั้ง data-more="left|right|left right" ตามที่ยังมีแท็บซ่อนอยู่
// CSS ใช้ทำขอบจาง — เห็นว่ายังมีแท็บต่อ และไม่จางเมื่อเลื่อนสุดแล้ว/ไม่ล้นจอ
function update(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  const parts: string[] = [];
  if (max > 2 && el.scrollLeft > 2) parts.push("left");
  if (max > 2 && el.scrollLeft < max - 2) parts.push("right");
  const v = parts.join(" ");
  if ((el.dataset.more ?? "") !== v) el.dataset.more = v;
}

/** ผูกกับทุกแถบในหน้า — คืนฟังก์ชันถอด */
export function attachTabScrollHints(root: ParentNode = document): () => void {
  const els = Array.from(root.querySelectorAll<HTMLElement>(".krok-tabscroll"));
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver((es) => es.forEach((e) => update(e.target as HTMLElement))) : null;
  const onScroll = (e: Event) => update(e.currentTarget as HTMLElement);
  for (const el of els) { update(el); el.addEventListener("scroll", onScroll, { passive: true }); ro?.observe(el); }
  return () => { for (const el of els) el.removeEventListener("scroll", onScroll); ro?.disconnect(); };
}
