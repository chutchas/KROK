"use client";
import { useEffect, useState } from "react";
import { BarChart3, ClipboardCheck, Clock, QrCode, Smartphone, Sparkles } from "lucide-react";
import Icon from "@/components/Icon";
import type { IconType } from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import Reveal, { useInView } from "./Reveal";

const STEPS: { icon: IconType; t: MessageKey; d: MessageKey }[] = [
  { icon: Sparkles, t: "lp.flow.s1t", d: "lp.flow.s1d" },
  { icon: QrCode, t: "lp.flow.s2t", d: "lp.flow.s2d" },
  { icon: Smartphone, t: "lp.flow.s3t", d: "lp.flow.s3d" },
  { icon: ClipboardCheck, t: "lp.flow.s4t", d: "lp.flow.s4d" },
  { icon: Clock, t: "lp.flow.s5t", d: "lp.flow.s5d" },
  { icon: BarChart3, t: "lp.flow.s6t", d: "lp.flow.s6d" },
];

export default function Flow() {
  const { t } = useT();
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const [active, setActive] = useState(-1);

  // ไฮไลต์ไล่ทีละขั้นเมื่อแถบนี้อยู่ในจอ — ผู้ที่ตั้ง reduced motion จะไม่เห็นการไล่
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setActive(0);
    const id = setInterval(() => setActive((v) => (v + 1) % STEPS.length), 1600);
    return () => clearInterval(id);
  }, [inView]);

  return (
    <section className="lp-sec lp-sec-tight" id="how">
      <div className="lp-wrap lp-center">
        <Reveal>
          <span className="lp-eyebrow">{t("lp.flow.eyebrow")}</span>
        </Reveal>
        <Reveal delay={60}>
          <h2 className="lp-h2">
            {t("lp.flow.t1")} <span className="lp-grad">{t("lp.flow.t2")}</span>
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="lp-lead" style={{ maxWidth: 640, margin: "14px auto 0" }}>{t("lp.flow.sub")}</p>
        </Reveal>

        <div className="lp-flow" ref={ref}>
          {STEPS.map((s, i) => (
            <Reveal key={s.t} delay={i * 60} className={`lp-fnode${i === active ? " is-on" : ""}`}>
              <span className="lp-fdot">
                <Icon icon={s.icon} className="h-[22px] w-[22px]" />
              </span>
              <b>{t(s.t)}</b>
              <span>{t(s.d)}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
