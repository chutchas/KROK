"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { switchWorkspace, createWorkspace } from "@/lib/workspace-actions";
import { useT } from "@/i18n/LanguageProvider";
import { ChevronDown, Check, Plus } from "lucide-react";
import Icon from "@/components/Icon";
import { alertDialog } from "@/components/dialogs";

export interface WorkspaceItem {
  tenantId: string;
  tenantName: string;
  role: "owner" | "admin" | "designer" | "operator";
}

/** กล่องตัวอักษรย่อของ workspace (ตัวแรกของชื่อ) — ใช้บนแถบบน, ในเมนูสลับ และบรรทัดบนหัวข้อหน้า */
export function WsAvatar({ name, size = 26 }: { name: string; size?: number }) {
  const ch = (Array.from(name.trim())[0] || "W").toUpperCase();
  return (
    <span aria-hidden style={{ width: size, height: size, flex: "0 0 auto", borderRadius: Math.round(size * 0.28), display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "var(--accent-soft)", color: "var(--accent-text)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
      fontWeight: 700, fontSize: Math.round(size * 0.5), lineHeight: 1, fontFamily: "var(--font-anuphan)" }}>{ch}</span>
  );
}

/** ปุ่ม/ป้าย workspace ปัจจุบัน: [ตัวย่อ] ชื่อตัวหนา ▾ */
function WsChipBody({ name, chevron }: { name: string; chevron: boolean }) {
  return (
    <>
      <WsAvatar name={name} />
      <span className="krok-ws-name" style={{ fontWeight: 600, fontSize: ".9rem", color: "var(--ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{name}</span>
      {chevron && <span style={{ flex: "0 0 auto", display: "inline-flex", color: "var(--ink-3)" }}><Icon icon={ChevronDown} className="h-4 w-4" /></span>}
    </>
  );
}

const chipStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "4px 10px 4px 4px", borderRadius: 10,
  border: "1px solid var(--line)", background: "var(--surface)", fontFamily: "inherit", textAlign: "left",
};

/** ป้าย workspace แบบกดไม่ได้ (มี workspace เดียวและไม่ใช่ผู้ดูแล) */
export function WorkspaceChip({ name }: { name: string }) {
  return <span className="krok-ws-chip" title={name} style={chipStyle}><WsChipBody name={name} chevron={false} /></span>;
}

export default function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: WorkspaceItem[];
  activeId: string;
}) {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = workspaces.find((w) => w.tenantId === activeId);

  async function pick(id: string) {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    await switchWorkspace(id);
    setBusy(false);
    setOpen(false);
    router.push("/dashboard");
    router.refresh();
  }

  async function doCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const res = await createWorkspace(name);
    setBusy(false);
    if ("error" in res) {
      await alertDialog(res.error);
      return;
    }
    setName("");
    setCreating(false);
    setOpen(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div ref={boxRef} style={{ position: "relative", minWidth: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="krok-ws-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${t("ws.switch")} · ${active?.tenantName ?? ""}`}
        style={{ ...chipStyle, cursor: "pointer" }}
      >
        <WsChipBody name={active?.tenantName ?? ""} chevron />
      </button>

      {open && (
        <div
          className="krok-ws-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0, // ปุ่มอยู่ฝั่งขวาของแถบบน → เมนูชิดขอบขวาของปุ่ม
            minWidth: 240,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(10,14,18,.16)",
            padding: 6,
            zIndex: 40,
          }}
        >
          <div style={{ fontSize: ".7rem", color: "var(--ink-3)", padding: "6px 10px 4px", fontWeight: 600, letterSpacing: ".03em" }}>
            {t("ws.yours")}
          </div>
          {workspaces.map((w) => {
            const on = w.tenantId === activeId;
            return (
              <button
                key={w.tenantId}
                onClick={() => pick(w.tenantId)}
                disabled={busy}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  background: on ? "var(--accent-soft)" : "transparent",
                  color: "var(--ink)",
                  fontFamily: "inherit",
                  fontSize: ".9rem",
                }}
              >
                <WsAvatar name={w.tenantName} size={22} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.tenantName}</span>
                {on && <span style={{ color: "var(--accent-text)", display: "inline-flex" }}><Icon icon={Check} className="h-4 w-4" /></span>}
              </button>
            );
          })}

          <div style={{ borderTop: "1px solid var(--line)", margin: "6px 4px" }} />

          {creating ? (
            <form onSubmit={doCreate} style={{ padding: "4px 6px 6px", display: "grid", gap: 6 }}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("ws.namePlaceholder")}
                style={{ padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: ".85rem" }}
                >
                  {busy ? "…" : t("ws.createBtn")}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem" }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: "var(--accent-text)", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500 }}
            >
              <Icon icon={Plus} className="h-4 w-4" /> {t("ws.create")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
