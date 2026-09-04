import type { CSSProperties } from "react";

/**
 * KROK — โลโก้มาร์ค "Inspect Lens"
 * วงชัตเตอร์ผ่าสี่ส่วนล้อมเครื่องหมายถูก = งานผ่านเพราะถูกตรวจ ไม่ใช่เพราะถูกกด
 *
 * variant  full     — วงมีร่องผ่าสี่ด้าน ใช้ตั้งแต่ 28px ขึ้นไป
 *          compact  — วงตัน เครื่องหมายถูกหนาขึ้น ใช้ที่ 16–26px และทำ favicon
 * mode     auto     — ตาม token ธีม (--brand-mark-*) สลับ light/dark ให้เอง
 *          light    — ตรึงชุดสีสำหรับพื้นสว่าง (ramp ลึกขึ้นให้ contrast ผ่าน)
 *          dark     — ตรึงชุดสีสำหรับพื้นมืด เช่นการ์ด navy ที่ไม่เปลี่ยนตามธีม
 * tone     mono     — สีเดียวตาม currentColor สำหรับพิมพ์ ปั๊ม หรือ fax
 */

type Variant = "full" | "compact";
type Mode = "auto" | "light" | "dark";
type Tone = "brand" | "mono";

const PALETTE: Record<Exclude<Mode, "auto">, [string, string, string, string]> = {
  light: ["#10b981", "#0891b2", "#2f6fe0", "#0f172a"],
  dark: ["#6ee7b7", "#22d3ee", "#5b93f5", "#f8fafc"],
};

const AUTO: [string, string, string, string] = [
  "var(--brand-mark-1, #10b981)",
  "var(--brand-mark-2, #0891b2)",
  "var(--brand-mark-3, #2f6fe0)",
  "var(--brand-mark-ink, #0f172a)",
];

const RING_FULL =
  "M20 5H44A15 15 0 0 1 59 20V44A15 15 0 0 1 44 59H20A15 15 0 0 1 5 44V20A15 15 0 0 1 20 5Z" +
  "M26 18H38A8 8 0 0 1 46 26V38A8 8 0 0 1 38 46H26A8 8 0 0 1 18 38V26A8 8 0 0 1 26 18Z";
const RING_COMPACT =
  "M21 4H43A17 17 0 0 1 60 21V43A17 17 0 0 1 43 60H21A17 17 0 0 1 4 43V21A17 17 0 0 1 21 4Z" +
  "M27 19H37A8 8 0 0 1 45 27V37A8 8 0 0 1 37 45H27A8 8 0 0 1 19 37V27A8 8 0 0 1 27 19Z";

const CHECK_FULL = "M25.5 32.5L30.5 37.5L39 26.5";
const CHECK_COMPACT = "M25 32.5L30.5 38L39.5 26.5";

export function LogoMark({
  size = 28,
  variant = "full",
  mode = "auto",
  tone = "brand",
  title,
  style,
}: {
  size?: number;
  variant?: Variant;
  mode?: Mode;
  tone?: Tone;
  title?: string;
  style?: CSSProperties;
}) {
  const compact = variant === "compact";
  const mono = tone === "mono";
  const [c1, c2, c3, ink] = mode === "auto" ? AUTO : PALETTE[mode];
  // id ต้องต่างกันต่อชุดสี ไม่งั้น instance ที่ mode ต่างกันจะไปใช้ gradient ตัวแรกที่เจอ
  const gid = `krokGrad-${mode}`;
  const mid = "krokMask";

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      <defs>
        {!mono ? (
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={c1} />
            <stop offset="0.45" stopColor={c2} />
            <stop offset="1" stopColor={c3} />
          </linearGradient>
        ) : null}
        {!compact ? (
          <mask id={mid} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
            <rect width="64" height="64" fill="#fff" />
            <g fill="#000" transform="rotate(45 32 32)">
              <rect x="29.5" y="-6" width="5" height="76" />
              <rect x="-6" y="29.5" width="76" height="5" />
            </g>
          </mask>
        ) : null}
      </defs>
      <path
        d={compact ? RING_COMPACT : RING_FULL}
        fillRule="evenodd"
        fill={mono ? "currentColor" : `url(#${gid})`}
        mask={compact ? undefined : `url(#${mid})`}
      />
      <path
        d={compact ? CHECK_COMPACT : CHECK_FULL}
        fill="none"
        stroke={mono ? "currentColor" : ink}
        strokeWidth={compact ? 6.5 : 5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoLockup({
  size = 28,
  subtitle,
  mode = "auto",
}: {
  size?: number;
  subtitle?: string;
  mode?: Mode;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} mode={mode} title="KROK" />
      <span>
        <b
          className="brand-text"
          style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.15rem", letterSpacing: ".02em" }}
        >
          KROK
        </b>
        {subtitle ? (
          <small style={{ color: "var(--ink-3)", fontSize: ".7rem", display: "block", lineHeight: 1 }}>
            {subtitle}
          </small>
        ) : null}
      </span>
    </span>
  );
}

export default LogoMark;
