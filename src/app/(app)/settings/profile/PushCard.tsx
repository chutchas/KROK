"use client";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { BellRing, BellOff, Smartphone, Trash2, Send } from "lucide-react";
import { AsyncButton, Button, Card, Notice } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { PUSH_GROUPS, urlB64ToBytes, type PushGroup } from "@/lib/push-types";
import { getPushState, removePushSubscription, savePushSubscription, sendTestPush, setPushPrefs, type PushState } from "./push-actions";

type Support = "ok" | "ios-install" | "unsupported";

function detectSupport(): Support {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

function deviceLabel(ua: string): string {
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return ua.slice(0, 40) || "—";
}

/** แจ้งเตือนเด้งบนเครื่อง (Web Push · 0067) — เปิดต่อเครื่อง + เลือกประเภท */
export default function PushCard() {
  const { t, lang } = useT();
  const [state, setState] = useState<PushState | null>(null);
  const [support, setSupport] = useState<Support>("ok");
  const [myEndpoint, setMyEndpoint] = useState<string | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "na">("na");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await getPushState();
    if ("error" in r) return;
    setState(r);
  }, []);

  useEffect(() => {
    const s = detectSupport();
    setSupport(s);
    void load();
    if (s !== "ok") return;
    setPerm(Notification.permission);
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setMyEndpoint(sub?.endpoint ?? null)).catch(() => {});
  }, [load]);

  const err = (m: string) => setMsg({ kind: "err", text: localizeServerMsg(m, lang) });

  async function enable() {
    setMsg(null);
    if (!state?.publicKey) return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p !== "granted") { err(t("push.permDenied")); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(state.publicKey) as BufferSource });
      const r = await savePushSubscription(sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }, navigator.userAgent);
      if ("error" in r) { err(r.error); return; }
      setMyEndpoint(sub.endpoint);
      setMsg({ kind: "ok", text: t("push.enabled") });
      await load();
    } catch (e) {
      err(e instanceof Error ? e.message : String(e));
    }
  }

  async function disableHere() {
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe().catch(() => {}); }
    } catch { /* ข้าม */ }
    setMyEndpoint(null);
    await load();
  }

  async function test() {
    if (!myEndpoint) return;
    const r = await sendTestPush(myEndpoint);
    if ("error" in r) err(r.error);
    else setMsg({ kind: "ok", text: t("push.testSent") });
  }

  async function toggleGroup(g: PushGroup, on: boolean) {
    if (!state) return;
    const off = on ? state.offGroups.filter((x) => x !== g) : [...state.offGroups, g];
    setState({ ...state, offGroups: off });
    const r = await setPushPrefs(off);
    if ("error" in r) err(r.error);
  }

  const registered = !!myEndpoint && !!state?.devices.some((d) => d.endpoint === myEndpoint);

  return (
    <Card>
      <h3 id="push" style={{ fontSize: "1rem", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6 }}><Icon icon={BellRing} className="h-4 w-4" /> {t("push.title")}</h3>
      <p style={{ color: "var(--ink-2)", fontSize: ".86rem", margin: "0 0 10px" }}>{t("push.sub")}</p>

      {!state ? <p style={{ color: "var(--ink-3)", fontSize: ".85rem", margin: 0 }}>{t("common.loading")}</p>
        : state.missing ? <Notice>{t("push.needMigration")}</Notice>
        : !state.configured ? <Notice>{t("push.notConfigured")}</Notice>
        : (
          <>
            {support === "ios-install" && <Notice>{t("push.iosInstall")}</Notice>}
            {support === "unsupported" && <Notice>{t("push.unsupported")}</Notice>}
            {support === "ok" && perm === "denied" && <Notice kind="error">{t("push.blocked")}</Notice>}

            {support === "ok" && perm !== "denied" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {registered ? (
                  <>
                    <span style={{ color: "var(--pass)", fontSize: ".88rem", fontWeight: 600 }}>{t("push.onHere")}</span>
                    <AsyncButton onClick={test} style={{ padding: "8px 12px", fontSize: ".85rem" }}><Icon icon={Send} className="h-4 w-4" /> {t("push.test")}</AsyncButton>
                    <AsyncButton variant="ghost" onClick={disableHere} style={{ padding: "8px 12px", fontSize: ".85rem" }}><Icon icon={BellOff} className="h-4 w-4" /> {t("push.offHere")}</AsyncButton>
                  </>
                ) : (
                  <AsyncButton variant="primary" onClick={enable} style={{ padding: "9px 14px" }}><Icon icon={BellRing} className="h-4 w-4" /> {t("push.enableHere")}</AsyncButton>
                )}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: ".86rem", fontWeight: 600, marginBottom: 4 }}>{t("push.types")}</div>
              <div style={{ display: "grid", gap: 2 }}>
                {PUSH_GROUPS.map((g) => (
                  <label key={g} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".88rem", cursor: "pointer", minHeight: 36 }}>
                    <input type="checkbox" checked={!state.offGroups.includes(g)} onChange={(e) => void toggleGroup(g, e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                    {t(`push.g.${g}`)}
                  </label>
                ))}
              </div>
            </div>

            {state.devices.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: ".86rem", fontWeight: 600, marginBottom: 4 }}>{t("push.devices")}</div>
                {state.devices.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--line)", fontSize: ".85rem" }}>
                    <Icon icon={Smartphone} className="h-4 w-4" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {deviceLabel(d.ua)}{d.endpoint === myEndpoint && <b style={{ color: "var(--accent-text)", marginLeft: 6 }}>{t("push.thisDevice")}</b>}
                      <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".74rem" }}>
                        {new Date(d.createdAt).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })}
                      </small>
                    </span>
                    <Button variant="ghost" aria-label={t("common.delete")} onClick={async () => { await removePushSubscription(d.id); if (d.endpoint === myEndpoint) setMyEndpoint(null); await load(); }} style={{ padding: "6px 10px", color: "var(--fail)" }}>
                      <Icon icon={Trash2} className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      {msg && <p role={msg.kind === "err" ? "alert" : "status"} style={{ fontSize: ".84rem", color: msg.kind === "err" ? "var(--fail)" : "var(--pass)", margin: "10px 0 0" }}>{msg.text}</p>}
    </Card>
  );
}
