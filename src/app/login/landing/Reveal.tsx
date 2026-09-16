"use client";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/** สังเกตว่า element เข้ามาในจอหรือยัง — ใช้ครั้งเดียวแล้วเลิกสังเกต */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** ห่อเนื้อหาให้ค่อย ๆ เลื่อนขึ้นตอนเลื่อนถึง — ปิดอัตโนมัติเมื่อผู้ใช้ตั้ง reduced motion (จัดการใน CSS) */
export default function Reveal({
  children,
  delay = 0,
  className = "",
  style,
  id,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.08);
  return (
    <div
      ref={ref}
      id={id}
      className={`lp-rv${inView ? " is-in" : ""}${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}
