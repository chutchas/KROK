"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Camera, HardHat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/LanguageProvider";
import type { Lang, MessageKey } from "@/i18n/dictionaries";
import { saveProfile, saveAvatar } from "./actions";

export interface ProfileData {
  first_name: string;
  last_name: string;
  phone: string;
  position: string;
  language: Lang;
  email: string;
  role: "owner" | "admin" | "designer" | "operator";
  avatar_url: string;
  user_id: string;
}

export default function ProfileClient({ initial }: { initial: ProfileData }) {
  const router = useRouter();
  const { t, setLang } = useT();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [avatar, setAvatar] = useState(initial.avatar_url);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof ProfileData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg({ t: t("profile.avatarErrType"), err: true }); return; }
    if (file.size > 3 * 1024 * 1024) { setMsg({ t: t("profile.avatarErrSize"), err: true }); return; }
    setAvatarBusy(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${initial.user_id}/avatar_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const res = await saveAvatar(url);
      if ("error" in res) throw new Error(res.error);
      setAvatar(url);
      setMsg({ t: t("profile.avatarSaved") });
      router.refresh();
    } catch (err) {
      setMsg({ t: err instanceof Error ? err.message : t("profile.avatarErrType"), err: true });
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await saveProfile({
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      position: form.position,
      language: form.language,
    });
    setBusy(false);
    if ("error" in res) {
      setMsg({ t: res.error, err: true });
      return;
    }
    setLang(form.language); // ใช้ภาษาใหม่ทันที
    setMsg({ t: t("common.saved"), err: false });
    router.refresh();
  }

  const label: React.CSSProperties = { fontWeight: 600, fontSize: ".85rem", display: "block", marginBottom: 4 };
  const roleLabel = t(("role." + form.role) as MessageKey);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("profile.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("profile.subtitle")}</p>
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 16, marginBottom: 4, borderBottom: "1px solid var(--line)" }}>
          <div style={{ position: "relative", width: 72, height: 72, flex: "0 0 auto" }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--line)" }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--line)" }}>
                <Icon icon={HardHat} className="h-8 w-8" />
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              aria-label={t("profile.avatarChange")}
              style={{ position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "var(--accent-ink)", border: "2px solid var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Icon icon={Camera} className="h-4 w-4" />
            </button>
          </div>
          <div>
            <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.05rem", display: "block" }}>
              {[form.first_name, form.last_name].filter(Boolean).join(" ") || form.email.split("@")[0]}
            </b>
            <small style={{ color: "var(--ink-3)" }}>{avatarBusy ? t("profile.avatarUploading") : t("profile.avatarHint")}</small>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickAvatar} />
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>{t("profile.firstName")}</label>
              <Field value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <label style={label}>{t("profile.lastName")}</label>
              <Field value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>

          <div>
            <label style={label}>{t("profile.email")}</label>
            <Field value={form.email} readOnly disabled style={{ opacity: 0.7 }} />
            <p style={{ color: "var(--ink-3)", fontSize: ".76rem", margin: "4px 0 0" }}>{t("profile.emailReadonly")}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>{t("profile.phone")}</label>
              <Field value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="08x-xxx-xxxx" />
            </div>
            <div>
              <label style={label}>{t("profile.position")}</label>
              <Field value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="เช่น หัวหน้ากะ / QA" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>{t("profile.role")}</label>
              <div style={{ padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface-2, var(--code-bg))", color: "var(--ink-2)", fontSize: ".95rem" }}>
                {roleLabel}
              </div>
            </div>
            <div>
              <label style={label}>{t("profile.language")}</label>
              <select
                value={form.language}
                onChange={(e) => set("language", e.target.value)}
                style={{ width: "100%", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: "1rem" }}
              >
                <option value="th">ไทย</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

          <div>
            <Button variant="primary" type="submit" loading={busy}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
