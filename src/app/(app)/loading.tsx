// แสดงระหว่างเปลี่ยนหน้า (route transition) — ฉากหลังเบลอ + spinner
export default function Loading() {
  return (
    <div
      aria-label="loading"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "color-mix(in srgb, var(--ground) 55%, transparent)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "3px solid var(--line)",
            borderTopColor: "var(--accent)",
            display: "inline-block",
            animation: "krok-spin .7s linear infinite",
          }}
        />
      </div>
      <style>{`@keyframes krok-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
