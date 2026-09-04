"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export interface ProfileInput {
  first_name: string;
  last_name: string;
  phone: string;
  position: string;
  language: "th" | "en";
}

export async function saveProfile(input: ProfileInput): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };

  const clean = {
    user_id: session.userId,
    first_name: input.first_name.trim().slice(0, 80),
    last_name: input.last_name.trim().slice(0, 80),
    phone: input.phone.trim().slice(0, 40),
    position: input.position.trim().slice(0, 80),
    language: input.language === "en" ? "en" : "th",
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").upsert(clean, { onConflict: "user_id" });
  if (error) return { error: error.message };

  // ซิงก์ชื่อที่แสดง (display_name) กับ membership rows เพื่อให้หน้า Team/Dashboard เห็นตรงกัน
  const display = [clean.first_name, clean.last_name].filter(Boolean).join(" ").trim();
  if (display) {
    await supabase.from("memberships").update({ name: display }).eq("user_id", session.userId);
    await supabase.auth.updateUser({ data: { display_name: display } });
  }

  revalidatePath("/settings/profile");
  return { ok: true };
}
