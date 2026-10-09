"use client";
import { Check } from "lucide-react";
import Icon from "@/components/Icon";
import Link from "next/link";
import { useLp as useT } from "@/i18n/landing";
import { DEFAULT_PLANS, planFeatures, type Plan } from "@/lib/plans";
import Reveal from "./Reveal";

/** การ์ดท้าย: องค์กรขนาดใหญ่ (คุยกันก่อน) — ไม่ได้มาจากแคตตาล็อก */
const CONTACT = { name: "lp.pr.entN", sub: "lp.pr.entS", amount: "lp.pr.entA", per: "lp.pr.entP", features: "lp.pr.entF", cta: "lp.pr.entC" } as const;

/** จำนวนข้อสิทธิ์หลักที่แสดงบนหน้า home (ที่เหลือดูในหน้าแผน) */
const MAX_LINES = 7;

export default function Pricing({ onLogin, plans = DEFAULT_PLANS }: { onLogin: () => void; plans?: Plan[] }) {
  const { t, lang } = useT();
  const en = lang === "en";
  return (
    <section className="lp-sec lp-sec-alt" id="pricing">
      <div className="lp-wrap">
        <Reveal><h2 className="lp-h2">{t("lp.pr.t")}</h2></Reveal>
        <Reveal delay={60}><p className="lp-lead" style={{ marginTop: 10 }}>{t("lp.pr.sub")}</p></Reveal>
        <div className="lp-grid-plans">
          {plans.map((p, i) => {
            const feats = planFeatures(p, en).filter((f) => !f.off);
            const extras = en ? p.extrasEn : p.extras;
            const core = feats.slice(0, Math.min(MAX_LINES, feats.length - extras.length));
            const lines = [...core.map((f) => f.text), ...extras];
            return (
              <Reveal key={p.key} delay={i * 60} className={`lp-price${p.highlight ? " is-hi" : ""}`}>
                {p.highlight && <span className="lp-price-tag">{t("lp.pr.popular")}</span>}
                <h3>{en ? p.nameEn : p.name}</h3>
                <div className="lp-price-sub">{en ? p.descEn : p.desc}</div>
                <div className="lp-price-amt tabnum">{p.priceThb > 0 ? `${p.priceThb.toLocaleString("en-US")} ฿` : t("lp.pr.free")}</div>
                <div className="lp-price-per">{p.priceThb > 0 ? t("lp.pr.month") : t("lp.pr.forever")}</div>
                <ul>
                  {lines.map((f) => (
                    <li key={f}>
                      <Icon icon={Check} className="h-[15px] w-[15px]" strokeWidth={2.4} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={onLogin} className={`lp-btn lp-btn-sm ${p.highlight ? "lp-btn-primary" : "lp-btn-ghost"}`}>
                  {t("lp.pr.cta")}
                </button>
              </Reveal>
            );
          })}
        </div>
        {/* องค์กรขนาดใหญ่: แถบแนวนอนใต้แพ็กเกจ (ไม่ให้การ์ดตกบรรทัดเดี่ยว) */}
        <Reveal delay={120} className="lp-price lp-price-ent">
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <h3>{t(CONTACT.name)}</h3>
              <div className="lp-price-sub" style={{ minHeight: 0, marginBottom: 6 }}>{t(CONTACT.sub)}</div>
              <div style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, fontSize: "1.25rem" }}>{t(CONTACT.amount)} <span className="lp-price-per" style={{ fontWeight: 400 }}>· {t(CONTACT.per)}</span></div>
            </div>
            <ul style={{ flex: "2 1 320px", margin: 0 }}>
              {t(CONTACT.features).split(",").map((f) => (
                <li key={f}>
                  <Icon icon={Check} className="h-[15px] w-[15px]" strokeWidth={2.4} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/contact?from=pricing" className="lp-btn lp-btn-sm lp-btn-ghost" style={{ flex: "0 0 auto", textDecoration: "none" }}>{t(CONTACT.cta)}</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
