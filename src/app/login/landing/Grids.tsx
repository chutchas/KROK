"use client";
import {
  Boxes, Camera, Factory, FileText, HardHat, Lock, PenTool, QrCode,
  ScanBarcode, Sparkles, Truck, Upload, UtensilsCrossed, Warehouse, WifiOff, Workflow, Wrench, Bell,
} from "lucide-react";
import Icon from "@/components/Icon";
import type { IconType } from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import Reveal from "./Reveal";

const CAPS: { icon: IconType; t: MessageKey; d: MessageKey }[] = [
  { icon: Sparkles, t: "lp.cap.1t", d: "lp.cap.1d" },
  { icon: Upload, t: "lp.cap.2t", d: "lp.cap.2d" },
  { icon: FileText, t: "lp.cap.3t", d: "lp.cap.3d" },
  { icon: Lock, t: "lp.cap.4t", d: "lp.cap.4d" },
  { icon: Camera, t: "lp.cap.5t", d: "lp.cap.5d" },
  { icon: ScanBarcode, t: "lp.cap.6t", d: "lp.cap.6d" },
  { icon: PenTool, t: "lp.cap.7t", d: "lp.cap.7d" },
  { icon: Boxes, t: "lp.cap.8t", d: "lp.cap.8d" },
  { icon: QrCode, t: "lp.cap.9t", d: "lp.cap.9d" },
  { icon: Workflow, t: "lp.cap.10t", d: "lp.cap.10d" },
  { icon: Bell, t: "lp.cap.11t", d: "lp.cap.11d" },
  { icon: WifiOff, t: "lp.cap.12t", d: "lp.cap.12d" },
];

export function Capabilities() {
  const { t } = useT();
  return (
    <section className="lp-sec" style={{ background: "var(--surface-2)" }}>
      <div className="lp-wrap">
        <div className="lp-center lp-head-sm">
          <Reveal><span className="lp-eyebrow">{t("lp.cap.eyebrow")}</span></Reveal>
          <Reveal delay={60}>
            <h2 className="lp-h2">{t("lp.cap.t1")} <span className="lp-grad">{t("lp.cap.t2")}</span></h2>
          </Reveal>
        </div>
        <div className="lp-grid-4">
          {CAPS.map((c, i) => (
            <Reveal key={c.t} delay={(i % 4) * 60} className="lp-cap">
              <span className="lp-tile"><Icon icon={c.icon} className="h-5 w-5" /></span>
              <b>{t(c.t)}</b>
              <p>{t(c.d)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const CASES: { icon: IconType; t: MessageKey; d: MessageKey; g: MessageKey }[] = [
  { icon: Factory, t: "lp.uc.1t", d: "lp.uc.1d", g: "lp.uc.1g" },
  { icon: Warehouse, t: "lp.uc.2t", d: "lp.uc.2d", g: "lp.uc.2g" },
  { icon: Truck, t: "lp.uc.3t", d: "lp.uc.3d", g: "lp.uc.3g" },
  { icon: HardHat, t: "lp.uc.4t", d: "lp.uc.4d", g: "lp.uc.4g" },
  { icon: UtensilsCrossed, t: "lp.uc.5t", d: "lp.uc.5d", g: "lp.uc.5g" },
  { icon: Wrench, t: "lp.uc.6t", d: "lp.uc.6d", g: "lp.uc.6g" },
];

export function UseCases() {
  const { t } = useT();
  return (
    <section className="lp-sec" id="usecases">
      <div className="lp-wrap">
        <div className="lp-center lp-head-sm">
          <Reveal><span className="lp-eyebrow">{t("lp.uc.eyebrow")}</span></Reveal>
          <Reveal delay={60}>
            <h2 className="lp-h2">{t("lp.uc.t1")} <span className="lp-grad">{t("lp.uc.t2")}</span></h2>
          </Reveal>
          <Reveal delay={120}><p className="lp-lead" style={{ marginTop: 14 }}>{t("lp.uc.sub")}</p></Reveal>
        </div>
        <div className="lp-grid-3">
          {CASES.map((c, i) => (
            <Reveal key={c.t} delay={(i % 3) * 70} className="lp-uc">
              <div className="lp-uc-top">
                <span className="lp-tile"><Icon icon={c.icon} className="h-5 w-5" /></span>
                <h4>{t(c.t)}</h4>
              </div>
              <p>{t(c.d)}</p>
              <div className="lp-uc-tags">
                {t(c.g).split(",").map((g) => <span key={g}>{g}</span>)}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

