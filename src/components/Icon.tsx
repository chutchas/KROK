import type { ComponentType } from "react";

// ไอคอนเส้นบางแบบ minimal — ใช้ currentColor (สืบสีจากพาเรนต์) ปรับขนาดด้วย Tailwind (h-/w-)
export type IconType = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

export default function Icon({
  icon: I,
  className = "h-5 w-5",
  strokeWidth = 1.75,
}: {
  icon: IconType;
  className?: string;
  strokeWidth?: number;
}) {
  return <I className={className} strokeWidth={strokeWidth} aria-hidden />;
}
