"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, ChevronRight, LifeBuoy } from "lucide-react";
import Icon from "@/components/Icon";
import { Card, Field } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { HELP_ARTICLES } from "@/lib/help-articles";

export default function HelpClient() {
  const { lang } = useT();
  const L = lang === "en" ? "en" : "th";
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // เปิดจาก "เปิดคู่มือ" ในปุ่มวิธีใช้ (/help#approval) → กางบทความนั้นแล้วเลื่อนไปหา · เปลี่ยน # ระหว่างเปิดหน้าอยู่ก็ตามไป
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id || !HELP_ARTICLES.some((a) => a.id === id)) return;
      setOpenId(id);
      requestAnimationFrame(() => document.getElementById(`help-${id}`)?.scrollIntoView({ block: "start" }));
    };
    void Promise.resolve().then(fromHash);
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  // กาง/พับ = อัปเดต # ในลิงก์ (ส่งต่อให้คนอื่นได้) — replace ไม่เพิ่มประวัติ Back
  const toggle = (id: string, open: boolean) => {
    const next = open ? null : id;
    setOpenId(next);
    window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
  };

  const list = useMemo(() => searchHelp(q), [q]);

  return (
    // ชิดซ้ายเต็มความกว้างเหมือนหน้าอื่น — จำกัดความกว้างเฉพาะช่องค้นหา/เนื้อหา (อ่านง่ายบนจอกว้าง)
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{L === "en" ? "Help" : "คู่มือการใช้งาน"}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
          {L === "en" ? "Short how-tos for the trickier parts of KROK. Can't find it? Contact the team below." : "วิธีทำงานที่ซับซ้อนใน KROK แบบสั้น ๆ — หาไม่เจอ ติดต่อทีมงานได้ท้ายหน้า"}
        </p>
      </div>

      <div style={{ position: "relative", maxWidth: 640 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", display: "inline-flex" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
        <Field type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={L === "en" ? "Search help" : "ค้นหาคู่มือ"}
          placeholder={L === "en" ? "Search, e.g. approval, LINE, dataset" : "ค้นหา เช่น อนุมัติ, LINE, ชุดข้อมูล"} style={{ width: "100%", boxSizing: "border-box", minHeight: 48, paddingLeft: 36 }} />
      </div>
      <p role="status" aria-live="polite" style={{ margin: "-8px 0 0", fontSize: ".82rem", color: "var(--ink-3)" }}>
        {q.trim() ? (L === "en" ? `${list.length} found` : `พบ ${list.length} เรื่อง`) : ""}
      </p>

      {/* รายการเดียวในการ์ดเดียว คั่นด้วยเส้น (แบบหน้ารายการฟอร์ม) — เดิมการ์ดละเรื่อง สูงและห่างเกิน */}
      {list.length > 0 && (
      <Card style={{ padding: "4px 20px" }}>
        {list.map((a, i) => {
          const open = openId === a.id;
          return (
              <section key={a.id} id={`help-${a.id}`} style={{ scrollMarginTop: 80, padding: "12px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>
                  <button type="button" aria-expanded={open} onClick={() => toggle(a.id, open)}
                    style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 44, padding: 0, border: "none", background: "none", color: "var(--ink)", fontFamily: "inherit", fontSize: "1rem", fontWeight: 700, textAlign: "left", cursor: "pointer" }}>
                    <span>{a.title[L]}</span>
                    <span aria-hidden style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: "var(--ink-3)" }}><Icon icon={ChevronRight} className="h-4 w-4" /></span>
                  </button>
                </h2>
                <p style={{ margin: "2px 0 0", color: "var(--ink-2)", fontSize: ".88rem" }}>{a.summary[L]}</p>
                {open && (
                  <div style={{ marginTop: 10, fontSize: ".92rem", lineHeight: 1.6, maxWidth: 820 }}>
                    <ol style={{ margin: 0, paddingLeft: 22, listStyle: "decimal" }}>{a.steps[L].map((s, i) => <li key={i}>{s}</li>)}</ol>
                    {a.notes && (
                      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
                        <b style={{ fontSize: ".84rem" }}>{L === "en" ? "Good to know" : "ควรรู้"}</b>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 18, listStyle: "disc", fontSize: ".86rem", color: "var(--ink-2)" }}>{a.notes[L].map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                    {a.where && (
                      <Link href={a.where.href} style={{ display: "inline-flex", alignItems: "center", gap: 2, marginTop: 10, minHeight: 44, color: "var(--accent-text)", fontWeight: 600 }}>
                        {a.where.label[L]} <Icon icon={ChevronRight} className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                )}
              </section>
          );
        })}
      </Card>
      )}
        {!list.length && (
          <Card>
            <p style={{ margin: "0 0 8px", color: "var(--ink-2)" }}>{L === "en" ? "Nothing matches — pick a topic below or ask the team." : "ไม่พบเรื่องที่ตรง — เลือกจากหัวข้อทั้งหมดด้านล่าง หรือถามทีมงาน"}</p>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 2 }}>
              {HELP_ARTICLES.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => { setQ(""); toggle(a.id, false); requestAnimationFrame(() => document.getElementById(`help-${a.id}`)?.scrollIntoView({ block: "start" })); }}
                    style={{ minHeight: 44, padding: 0, border: "none", background: "none", color: "var(--accent-text)", fontFamily: "inherit", fontSize: ".92rem", cursor: "pointer", textAlign: "left" }}>
                    {a.title[L]}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

      <Link href="/help/contact" style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>
        <Icon icon={LifeBuoy} className="h-5 w-5" />
        <span style={{ flex: 1 }}><b>{L === "en" ? "Still stuck?" : "ยังติดอยู่?"}</b> <span style={{ color: "var(--ink-2)" }}>{L === "en" ? "Contact the KROK team" : "ติดต่อทีม KROK"}</span></span>
        <Icon icon={ChevronRight} className="h-4 w-4" />
      </Link>
    </div>
  );
}

// ---- ค้นหาคู่มือ: จัดอันดับ (ชื่อ > คำค้น > สรุป > เนื้อหา) · ภาษาไทยไม่เว้นวรรคก็เจอ ----
const squash = (x: string) => x.toLowerCase().replace(/\s+/g, "");
const bigrams = (x: string) => { const out: string[] = []; for (let i = 0; i < x.length - 1; i++) out.push(x.slice(i, i + 2)); return out; };
function searchHelp(q: string) {
  const raw = q.trim().toLowerCase();
  if (!raw) return HELP_ARTICLES;
  const words = raw.split(/\s+/).filter(Boolean);
  const qs = squash(raw);
  const scored = HELP_ARTICLES.map((a, idx) => {
    const fields = [
      { t: `${a.title.th} ${a.title.en}`, w: 10 },
      { t: a.keywords, w: 5 },
      { t: `${a.summary.th} ${a.summary.en}`, w: 3 },
      { t: [...a.steps.th, ...a.steps.en, ...(a.notes?.th ?? []), ...(a.notes?.en ?? [])].join(" "), w: 1 },
    ].map((f) => ({ low: f.t.toLowerCase(), sq: squash(f.t), w: f.w }));
    const all = fields.map((f) => f.sq).join("|");
    // ตรงทุกคำ (แบบเว้นวรรค) หรือทั้งวลีเมื่อตัดช่องว่าง
    const exact = words.every((w) => all.includes(squash(w))) || all.includes(qs);
    let score = 0;
    for (const f of fields) {
      if (f.sq.includes(qs)) score += f.w * 2;
      for (const w of words) if (f.low.includes(w)) score += f.w;
    }
    if (!exact) {
      // ไทยไม่เว้นวรรค/สะกดผิดนิดหน่อย: นับคู่ตัวอักษรของคำค้นที่พบ — ≥ 70% ถือว่าใกล้เคียง
      // ให้น้ำหนักตามช่องเหมือนตอนตรงตัว (ชื่อ > คำค้น > สรุป > เนื้อหา) — "ลายเซน" ได้บทความลายเซ็นก่อน
      const bg = bigrams(qs);
      if (!bg.length) return null;
      const ratio = (hay: string) => bg.filter((g) => hay.includes(g)).length / bg.length;
      if (ratio(all) < 0.7) return null;
      score = fields.reduce((sum, f) => sum + f.w * ratio(f.sq), 0);
    }
    return { a, score, idx };
  }).filter((x): x is { a: (typeof HELP_ARTICLES)[number]; score: number; idx: number } => !!x);
  scored.sort((x, y) => y.score - x.score || x.idx - y.idx);
  // ตัดผลที่ห่างจากอันดับแรกมาก (< 40%) — ท้ายรายการไม่ยาวและไม่เกี่ยว
  const top = scored[0]?.score ?? 0;
  return scored.filter((x) => x.score >= top * 0.4).map((x) => x.a);
}
