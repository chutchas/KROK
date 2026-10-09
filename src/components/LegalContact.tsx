import { LEGAL } from "@/lib/legal";

/** หัวข้อ "ติดต่อ" ของหน้าข้อกำหนด / นโยบายความเป็นส่วนตัว */
export default function LegalContact({ en = false }: { en?: boolean }) {
  const lines = en ? LEGAL.addressEn : LEGAL.address;
  const tel = LEGAL.phone.replace(/[^\d+]/g, "");
  return (
    <p>
      <b>{LEGAL.name}</b><br />
      {lines.map((l, i) => <span key={i}>{l}<br /></span>)}
      {LEGAL.phone && <>{en ? "Tel" : "โทร"}: <a href={`tel:${tel}`} className="krok-touch44">{LEGAL.phone}</a><br /></>}
      {en ? "Email" : "อีเมล"}: <a href={`mailto:${LEGAL.email}`} className="krok-touch44">{LEGAL.email}</a>
    </p>
  );
}
