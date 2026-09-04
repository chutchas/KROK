import { ClipboardCheck } from "lucide-react";

// โลโก้มาร์ค KROK — กล่องไล่สีแบรนด์ + ไอคอนเช็คลิสต์สีขาว
export default function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <div
      className="hazard"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        boxShadow: "0 2px 6px rgba(47,111,224,.35)",
      }}
    >
      <ClipboardCheck color="#fff" strokeWidth={2} style={{ width: size * 0.58, height: size * 0.58 }} aria-hidden />
    </div>
  );
}
