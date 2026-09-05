import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ProfileClient, { type ProfileData } from "./ProfileClient";

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

  return <ProfileClient initial={profile} />;
}
