"use client";
import BrandLibrary from "@/components/BrandLibrary";
import { useT } from "@/i18n/LanguageProvider";
import type { BrandAsset } from "@/lib/branding-library";

export default function MediaClient({ assets, failed }: { assets: BrandAsset[]; failed: boolean }) {
  const { t } = useT();
  return <BrandLibrary assets={assets} error={failed ? t("brand.lib.loadFail") : null} canDelete />;
}
