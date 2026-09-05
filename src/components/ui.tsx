"use client";
import React from "react";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "default" | "ghost" | "danger";
  loading?: boolean;
};
export function Button({ variant = "default", style, loading, disabled, children, ...rest }: BtnProps) {
  const base: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: ".95rem",
    cursor: "pointer",
    borderRadius: 8,
    padding: "10px 18px",
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink)",
    transition: "opacity .15s",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
  const v: Record<string, React.CSSProperties> = {
    primary: { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)", fontWeight: 600 },
    default: {},
    ghost: { background: "none", border: "none", color: "var(--ink-2)" },
    danger: { color: "var(--fail)" },
  };
  return (
    <button {...rest} disabled={disabled || loading} style={{ ...base, ...v[variant], ...style, ...(loading ? { opacity: 0.75, cursor: "default" } : {}) }}>
      {loading && <BtnSpinner />}
      {children}
    </button>
  );
}

// สปินเนอร์เล็กในปุ่ม (ใช้ currentColor ให้เข้ากับสีปุ่ม)
function BtnSpinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14, height: 14, borderRadius: "50%", flex: "0 0 auto",
        border: "2px solid currentColor", borderTopColor: "transparent",
        opacity: 0.9, display: "inline-block", animation: "krok-sp 0.7s linear infinite",
      }}
    >
      <style>{`@keyframes krok-sp{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}

// ปุ่มที่จัดการสถานะ "กำลังประมวลผล" ให้เอง — แสดงสปินเนอร์ระหว่างรอ onClick แบบ async
export function AsyncButton({
  onClick,
  ...rest
}: Omit<BtnProps, "onClick"> & { onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void> }) {
  const [pending, setPending] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);
  async function handle(e: React.MouseEvent<HTMLButtonElement>) {
    if (pending) return;
    try {
      setPending(true);
      await onClick?.(e);
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  return <Button {...rest} loading={pending || rest.loading} onClick={handle} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: 20,
        boxShadow: "var(--shadow)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: "11px 12px",
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "var(--surface)",
        color: "var(--ink)",
        fontFamily: "inherit",
        fontSize: "1rem",
        ...props.style,
      }}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        padding: "11px 12px",
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "var(--surface)",
        color: "var(--ink)",
        fontFamily: "inherit",
        fontSize: "1rem",
        resize: "vertical",
        minHeight: 70,
        ...props.style,
      }}
    />
  );
}

export function Pill({ kind, children }: { kind: "pass" | "fail" | "na"; children: React.ReactNode }) {
  const c = {
    pass: { background: "var(--pass-soft)", color: "var(--pass)" },
    fail: { background: "var(--fail-soft)", color: "var(--fail)" },
    na: { background: "var(--code-bg)", color: "var(--ink-2)" },
  }[kind];
  return (
    <span
      style={{
        fontSize: ".72rem",
        fontWeight: 700,
        borderRadius: 20,
        padding: "3px 11px",
        whiteSpace: "nowrap",
        ...c,
      }}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 15,
        height: 15,
        border: "2px solid var(--line)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "krok-sp 1s linear infinite",
        verticalAlign: "-3px",
      }}
    >
      <style>{`@keyframes krok-sp{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}

export function Notice({
  kind = "info",
  children,
}: {
  kind?: "info" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${kind === "error" ? "var(--fail)" : "var(--amber)"}`,
        background: kind === "error" ? "var(--fail-soft)" : "var(--accent-soft)",
        color: "var(--ink-2)",
        borderRadius: "0 8px 8px 0",
        padding: "10px 14px",
        fontSize: ".9rem",
        margin: "12px 0",
      }}
    >
      {children}
    </div>
  );
}
