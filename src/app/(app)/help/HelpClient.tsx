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

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return HELP_ARTICLES;
    return HELP_ARTICLES.filter((a) => {
      const hay = [a.title.th, a.title.en, a.summary.th, a.summary.en, a.keywords, ...a.steps.th, ...a.steps.en, ...(a.notes?.th ?? []), ...(a.notes?.en ?? [])].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [q]);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820, margin: "0 auto" }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>{L === "en" ? "Help" : "คู่มือการใช้งาน"}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: "4px 0 0" }}>
          {L === "en" ? "Short how-tos for the trickier parts of KROK. Can't find it? Contact the team below." : "วิธีทำงานที่ซับซ้อนใน KROK แบบสั้น ๆ — หาไม่เจอ ติดต่อทีมงานได้ท้ายหน้า"}
        </p>
      </div>

      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", display: "inline-flex" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
        <Field type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={L === "en" ? "Search help" : "ค้นหาคู่มือ"}
          placeholder={L === "en" ? "Search, e.g. approval, LINE, dataset" : "ค้นหา เช่น อนุมัติ, LINE, ชุดข้อมูล"} style={{ width: "100%", boxSizing: "border-box", minHeight: 48, paddingLeft: 36 }} />
      </div>
      <p role="status" aria-live="polite" style={{ margin: "-8px 0 0", fontSize: ".82rem", color: "var(--ink-3)" }}>
        {q.trim() ? (L === "en" ? `${list.length} found` : `พบ ${list.length} เรื่อง`) : ""}
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {list.map((a) => {
          const open = openId === a.id;
          return (
            <Card key={a.id}>
              <section id={`help-${a.id}`} style={{ scrollMarginTop: 80 }}>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>
                  <button type="button" aria-expanded={open} onClick={() => toggle(a.id, open)}
                    style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 44, padding: 0, border: "none", background: "none", color: "var(--ink)", fontFamily: "inherit", fontSize: "1rem", fontWeight: 700, textAlign: "left", cursor: "pointer" }}>
                    <span>{a.title[L]}</span>
                    <span aria-hidden style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: "var(--ink-3)" }}><Icon icon={ChevronRight} className="h-4 w-4" /></span>
                  </button>
                </h2>
                <p style={{ margin: "2px 0 0", color: "var(--ink-2)", fontSize: ".88rem" }}>{a.summary[L]}</p>
                {open && (
                  <div style={{ marginTop: 10, fontSize: ".92rem", lineHeight: 1.6 }}>
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
            </Card>
          );
        })}
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
      </div>

      <Link href="/help/contact" style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>
        <Icon icon={LifeBuoy} className="h-5 w-5" />
        <span style={{ flex: 1 }}><b>{L === "en" ? "Still stuck?" : "ยังติดอยู่?"}</b> <span style={{ color: "var(--ink-2)" }}>{L === "en" ? "Contact the KROK team" : "ติดต่อทีม KROK"}</span></span>
        <Icon icon={ChevronRight} className="h-4 w-4" />
      </Link>
    </div>
  );
}
