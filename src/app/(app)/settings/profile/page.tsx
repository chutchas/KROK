import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ProfileClient, { type ProfileData } from "./ProfileClient";
import Link from "next/link";
import { Card } from "@/components/ui";
import { T } from "@/i18n/T";
import { privacyRequestHref } from "@/lib/legal";
import DeleteAccountCard from "./DeleteAccountCard";
import TwoFactorCard from "./TwoFactorCard";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name, phone, position, language, avatar_url")
    .eq("user_id", session.userId)
    .maybeSingle();

  const profile: ProfileData = {
    first_name: data?.first_name ?? "",
    last_name: data?.last_name ?? "",
    phone: data?.phone ?? "",
    position: data?.position ?? "",
    language: data?.language === "en" ? "en" : "th",
    email: session.email,
    role: session.role,
    avatar_url: data?.avatar_url ?? "",
    user_id: session.userId,
  };

  // สิทธิของเจ้าของข้อมูล (PDPA ม.30–36): ขอสำเนา / ขอลบ — ส่งคำขอทางอีเมลผู้ให้บริการ
  const subj = (what: string) => `[KROK PDPA] ${what} — ${session.email} (${session.userId})`;
  const copyHref = privacyRequestHref(subj("ขอสำเนาข้อมูลส่วนบุคคล"));
  const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 12px", fontSize: ".86rem", color: "var(--ink)", textDecoration: "none", background: "var(--surface)" };

  return (
    <>
      <ProfileClient initial={profile} />
      <div style={{ marginTop: 16, minWidth: 0 }}><TwoFactorCard /></div>
      <div style={{ marginTop: 16, minWidth: 0 }}>
        <Card>
          <h3 style={{ fontSize: "1rem", margin: "0 0 4px" }}><T k="legal.myData" /></h3>
          <p style={{ color: "var(--ink-2)", fontSize: ".86rem", margin: "0 0 10px" }}><T k="legal.myDataHint" /></p>
          {copyHref ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <a href={copyHref} style={btn}><T k="legal.reqCopy" /></a>
            </div>
          ) : (
            <p style={{ color: "var(--ink-3)", fontSize: ".82rem", margin: "0 0 12px" }}><T k="legal.noEmail" /></p>
          )}
          <DeleteAccountCard email={session.email} />
          <div style={{ marginTop: 10, fontSize: ".82rem" }}>
            <Link href="/privacy" target="_blank"><T k="legal.privacy" /></Link> · <Link href="/terms" target="_blank"><T k="legal.terms" /></Link>
          </div>
        </Card>
      </div>
    </>
  );
}
