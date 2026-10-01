"use client";
import Icon from "@/components/Icon";
import { Field } from "@/components/ui";
import { Plus, Trash2, ScanLine, FileText, X, Info, Coins, WifiOff } from "lucide-react";
import {
  FILL_TARGET_TYPES,
  MAX_DOC_SOURCES_PER_STEP,
  MAX_FILL_MAP,
  MAX_SCAN_SOURCES_PER_STEP,
  type FillMapEntry,
  type FillParse,
  type FillSource,
  type FormStep,
} from "@/lib/form-schema";
import { useT } from "@/i18n/LanguageProvider";

let sc = 0;
const newSrcId = (p: string) => `${p}_${Date.now().toString(36)}${(sc++).toString(36)}`;

const box: React.CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 9, background: "var(--surface)", padding: 11,
};
const sel: React.CSSProperties = {
  padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)",
  color: "var(--ink)", fontFamily: "inherit", fontSize: ".85rem",
};
const smallBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)",
  color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600,
  display: "inline-flex", alignItems: "center", gap: 5,
};

/**
 * ตั้งค่า "แหล่งเติมข้อมูล" ของหนึ่งขั้นตอน
 *
 * หลักคิด: ข้อมูล 1 แหล่ง → เติมได้หลายฟิลด์ ถ่าย/สแกนครั้งเดียวจบ
 * จัดกลุ่มฟิลด์ที่มาจากเอกสารใบเดียวกันไว้ด้วยกัน = ปุ่มเดียว = จ่ายครั้งเดียว
 */
export default function FillSourcesPanel({
  step,
  onChange,
}: {
  step: FormStep;
  onChange: (sources: FillSource[]) => void;
}) {
  const { t } = useT();
  const sources = step.fill_sources ?? [];
  const eligible = step.fields.filter((f) => FILL_TARGET_TYPES.includes(f.type));
  const docCount = sources.filter((s) => s.kind === "doc").length;
  const scanCount = sources.filter((s) => s.kind === "scan").length;

  const takenBy = new Map<string, string>();
  for (const s of sources) for (const m of s.map) takenBy.set(m.field_id, s.id);

  function patch(id: string, p: Partial<FillSource>) {
    onChange(sources.map((s) => (s.id === id ? { ...s, ...p } : s)));
  }
  function remove(id: string) {
    onChange(sources.filter((s) => s.id !== id));
  }
  function add(kind: FillSource["kind"]) {
    const free = eligible.find((f) => !takenBy.has(f.id));
    if (!free) return;
    onChange([
      ...sources,
      kind === "scan"
        ? { id: newSrcId("sc"), label: "สแกนรหัส", kind, parse: "raw" as FillParse, map: [{ field_id: free.id, key: free.label || free.id }] }
        : { id: newSrcId("doc"), label: "ถ่ายเอกสาร", kind, keep_photo: true, map: [{ field_id: free.id, key: free.label || free.id }] },
    ]);
  }

  if (eligible.length === 0) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <Icon icon={ScanLine} className="h-4 w-4 text-[var(--accent)]" />
        <b style={{ fontSize: ".9rem" }}>{t("fs.panelTitle")}</b>
      </div>
      <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "0 0 10px" }}>
        {t("fs.panelSub")}
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {sources.map((src) => (
          <SourceCard
            key={src.id}
            src={src}
            eligible={eligible}
            takenBy={takenBy}
            onPatch={(p) => patch(src.id, p)}
            onRemove={() => remove(src.id)}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          style={smallBtn}
          disabled={scanCount >= MAX_SCAN_SOURCES_PER_STEP || eligible.every((f) => takenBy.has(f.id))}
          onClick={() => add("scan")}
        >
          <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("fs.addScan")}
          <span style={{ color: "var(--pass, #10b981)", fontWeight: 700 }}>{t("fs.free")}</span>
        </button>
        <button
          style={smallBtn}
          disabled={docCount >= MAX_DOC_SOURCES_PER_STEP || eligible.every((f) => takenBy.has(f.id))}
          onClick={() => add("doc")}
        >
          <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("fs.addDoc")}
        </button>
      </div>

      {docCount > 0 && (
        <p style={{ color: "var(--ink-3)", fontSize: ".76rem", margin: "8px 0 0", display: "flex", alignItems: "flex-start", gap: 5 }}>
          <span style={{ marginTop: 1, display: "inline-flex" }}><Icon icon={Info} className="h-3.5 w-3.5 shrink-0" /></span>
          <span>
            {t("fs.preferScan")}
          </span>
        </p>
      )}
    </div>
  );
}

function SourceCard({
  src,
  eligible,
  takenBy,
  onPatch,
  onRemove,
}: {
  src: FillSource;
  eligible: FormStep["fields"];
  takenBy: Map<string, string>;
  onPatch: (p: Partial<FillSource>) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const isScan = src.kind === "scan";
  const parse: FillParse = src.parse ?? "raw";
  // scan แบบ raw ได้ค่าเดียว → ผูกได้ฟิลด์เดียว
  const singleValue = isScan && parse === "raw";
  const canAddMore = !singleValue && src.map.length < MAX_FILL_MAP;

  function patchMap(i: number, p: Partial<FillMapEntry>) {
    onPatch({ map: src.map.map((m, mi) => (mi === i ? { ...m, ...p } : m)) });
  }

  return (
    <div style={{ ...box, borderColor: isScan ? "var(--line)" : "var(--accent)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 9 }}>
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".74rem", fontWeight: 700,
            padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
            background: isScan ? "var(--surface-2, var(--surface))" : "var(--accent-soft)",
            border: "1px solid var(--line)", color: isScan ? "var(--ink-2)" : "var(--accent)",
          }}
        >
          <Icon icon={isScan ? ScanLine : FileText} className="h-3.5 w-3.5" />
          {isScan ? t("fs.badgeScan") : t("fs.badgeDoc")}
        </span>
        <Field
          value={src.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={isScan ? t("fs.labelPhScan") : t("fs.labelPhDoc")}
          style={{ flex: 1, minWidth: 150 }}
        />
        <button
          onClick={onRemove}
          title={t("fs.removeSource")}
          style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--fail)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon icon={Trash2} className="h-4 w-4" />
        </button>
      </div>

      {/* ตัวเลือกเฉพาะชนิด */}
      {isScan ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 9 }}>
          <select
            value={parse}
            style={sel}
            onChange={(e) => {
              const next = e.target.value as FillParse;
              onPatch({ parse: next, map: next === "raw" ? src.map.slice(0, 1) : src.map });
            }}
          >
            <option value="raw">{t("fs.parseRaw")}</option>
            <option value="json">{t("fs.parseJson")}</option>
            <option value="regex">{t("fs.parseRegex")}</option>
          </select>
          {parse === "regex" && (
            <Field
              value={src.pattern || ""}
              onChange={(e) => onPatch({ pattern: e.target.value })}
              placeholder="(?<po>[A-Z0-9-]+)\\|(?<lot>\\w+)"
              style={{ flex: 1, minWidth: 200, fontFamily: "monospace", fontSize: ".82rem" }}
            />
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: 9 }}>
          <Field
            value={src.doc_hint || ""}
            onChange={(e) => onPatch({ doc_hint: e.target.value })}
            placeholder={t("fs.docHintPh")}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".82rem", color: "var(--ink-2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={src.keep_photo !== false}
              onChange={(e) => onPatch({ keep_photo: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
            />
            {t("fs.keepPhoto")}
          </label>
        </div>
      )}

      {/* ฟิลด์ที่จะถูกเติม */}
      <div style={{ display: "grid", gap: 6 }}>
        {src.map.map((m, i) => {
          const options = eligible.filter((f) => !takenBy.has(f.id) || takenBy.get(f.id) === src.id);
          return (
            <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select value={m.field_id} style={{ ...sel, flex: "1 1 150px" }} onChange={(e) => patchMap(i, { field_id: e.target.value })}>
                {options.map((f) => (
                  <option key={f.id} value={f.id}>{f.label || f.id}</option>
                ))}
              </select>
              {!singleValue && (
                <>
                  <span style={{ color: "var(--ink-3)", fontSize: ".8rem" }}>←</span>
                  <Field
                    value={m.key}
                    onChange={(e) => patchMap(i, { key: e.target.value })}
                    placeholder={isScan ? (parse === "json" ? t("fs.keyPhProperty") : t("fs.keyPhGroup")) : t("fs.keyPhDoc")}
                    style={{ flex: "1 1 130px", minWidth: 110 }}
                  />
                </>
              )}
              {!isScan && (
                <Field
                  value={m.hint || ""}
                  onChange={(e) => patchMap(i, { hint: e.target.value })}
                  placeholder={t("fs.hintPh")}
                  style={{ flex: "1 1 130px", minWidth: 110 }}
                />
              )}
              {src.map.length > 1 && (
                <button
                  onClick={() => onPatch({ map: src.map.filter((_, mi) => mi !== i) })}
                  style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--fail)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon icon={X} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {canAddMore && (() => {
          const free = eligible.find((f) => !takenBy.has(f.id));
          return (
            <button
              style={{ ...smallBtn, justifySelf: "start", opacity: free ? 1 : 0.5 }}
              disabled={!free}
              onClick={() => free && onPatch({ map: [...src.map, { field_id: free.id, key: free.label || free.id }] })}
            >
              <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("fs.addFieldToGroup")}
            </button>
          );
        })()}
      </div>

      <p style={{ color: "var(--ink-3)", fontSize: ".74rem", margin: "9px 0 0", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {isScan ? (
          <>
            <Icon icon={WifiOff} className="h-3.5 w-3.5" /> {t("fs.scanFootnote")}
          </>
        ) : (
          <>
            <Icon icon={Coins} className="h-3.5 w-3.5" /> {t("fs.docFootnote")}
          </>
        )}
      </p>
    </div>
  );
}
