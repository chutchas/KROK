"use client";
// ตั้งค่า › พื้นที่ — รายชื่อกลางของ workspace ที่ฟิลด์ "พื้นที่" ในฟอร์มใช้เป็นตัวเลือก
import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import Icon from "@/components/Icon";
import { Button, Card, Field, Notice } from "@/components/ui";
import { useAreaT as useT } from "@/i18n/ns/area";
import { AREA_CODE_RE } from "@/lib/form-schema";
import type { AreaRow } from "@/lib/areas";
import { createArea, reorderAreas, updateArea } from "./actions";

export default function AreasClient({ initial, missing }: { initial: AreaRow[]; missing: boolean }) {
  const { t } = useT();
  const [rows, setRows] = useState<AreaRow[]>(initial);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const codeOk = AREA_CODE_RE.test(code.trim());
  const canAdd = codeOk && !!name.trim() && !busy;
  // กดเพิ่มทั้งที่ยังกรอกไม่ครบ → บอกว่าขาดอะไร (เดิมปุ่มกดไม่ได้เฉย ๆ)
  const [tried, setTried] = useState(false);

  async function add() {
    if (busy) return;
    if (!canAdd) { setTried(true); return; }
    setBusy("add"); setErr("");
    const r = await createArea(code.trim(), name.trim());
    setBusy(null);
    if ("error" in r) { setErr(r.error); return; }
    setRows((xs) => [...xs, r.area]);
    setCode(""); setName(""); setTried(false);
  }

  async function patch(id: string, p: { name?: string; active?: boolean }) {
    const before = rows;
    setRows((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    setBusy(id); setErr("");
    const r = await updateArea(id, p);
    setBusy(null);
    if ("error" in r) { setErr(r.error); setRows(before); }
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const before = rows;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    setBusy("order"); setErr("");
    const r = await reorderAreas(next.map((x) => x.id));
    setBusy(null);
    if ("error" in r) { setErr(r.error); setRows(before); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* หัวหน้าเพจ: นอกการ์ด ขนาดเดียวกับทุกหน้า */}
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("area.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("area.sub")}</p>
        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "6px 0 0" }}>{t("area.codeNote")}</p>
        {missing && <Notice kind="error">{t("area.missing")}</Notice>}
        {err && <p role="alert" style={{ color: "var(--fail)", fontSize: ".85rem", marginTop: 10 }}>{err}</p>}
      </div>

      {!missing && (
        <Card>
          <h2 style={{ fontSize: "1rem", margin: "0 0 10px" }}>{t("area.addTitle")}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: "0 0 140px" }}>
              <label htmlFor="area-code" style={lbl}>{t("area.code")}</label>
              <Field id="area-code" value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} placeholder={t("area.codePh")}
                style={{ fontFamily: "monospace" }} aria-invalid={!!code && !codeOk} />
              {(!!code || tried) && !codeOk && <span role="alert" style={{ fontSize: ".78rem", color: "var(--fail)" }}>{code ? t("area.codeBad") : t("area.codeRequired")}</span>}
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label htmlFor="area-name" style={lbl}>{t("area.name")}</label>
              <Field id="area-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t("area.namePh")}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }} aria-invalid={tried && !name.trim() ? true : undefined} />
              {tried && !name.trim() && <span role="alert" style={{ fontSize: ".78rem", color: "var(--fail)" }}>{t("area.nameRequired")}</span>}
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <Button variant="primary" onClick={add} loading={busy === "add"}>
                <Icon icon={Plus} className="h-4 w-4" /> {t("area.add")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!missing && (
        <Card>
          {rows.length === 0 ? (
            <p style={{ color: "var(--ink-3)", fontSize: ".9rem", margin: 0 }}>{t("area.empty")}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {rows.map((a, i) => (
                <AreaItem key={a.id} a={a} first={i === 0} last={i === rows.length - 1} busy={busy !== null}
                  onUp={() => move(i, -1)} onDown={() => move(i, 1)} onPatch={(p) => patch(a.id, p)} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function AreaItem({ a, first, last, busy, onUp, onDown, onPatch }: {
  a: AreaRow; first: boolean; last: boolean; busy: boolean;
  onUp: () => void; onDown: () => void; onPatch: (p: { name?: string; active?: boolean }) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(a.name);
  const dirty = name.trim() !== a.name && !!name.trim();
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, opacity: a.active ? 1 : 0.6, flexWrap: "wrap" }}>
      <span style={{ display: "inline-flex", flexDirection: "column" }}>
        <button onClick={onUp} disabled={first || busy} aria-label={t("area.moveUp")} style={arrow(first || busy)}><Icon icon={ChevronUp} className="h-3.5 w-3.5" /></button>
        <button onClick={onDown} disabled={last || busy} aria-label={t("area.moveDown")} style={arrow(last || busy)}><Icon icon={ChevronDown} className="h-3.5 w-3.5" /></button>
      </span>
      <code style={{ fontSize: ".82rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px", minWidth: 56, textAlign: "center" }}>{a.code}</code>
      <Field value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label={t("area.name")}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) onPatch({ name: name.trim() }); }}
        style={{ flex: "1 1 180px", minWidth: 0 }} />
      {dirty && <Button onClick={() => onPatch({ name: name.trim() })} disabled={busy}>{t("common.save")}</Button>}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".84rem", color: "var(--ink-2)", cursor: "pointer" }}>
        <input type="checkbox" checked={a.active} disabled={busy} onChange={(e) => onPatch({ active: e.target.checked })}
          style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
        {a.active ? t("area.active") : t("area.inactive")}
      </label>
    </li>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: ".8rem", color: "var(--ink-2)", marginBottom: 4 };
const arrow = (off: boolean): React.CSSProperties => ({
  border: "none", background: "none", padding: 0, color: "var(--ink-3)", cursor: off ? "default" : "pointer", opacity: off ? 0.3 : 1, display: "flex",
});
