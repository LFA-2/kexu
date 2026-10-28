import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || "http://localhost", key || "missing", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "kexu-auth",
  },
});

export function describeError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  if (/invalid login credentials/i.test(message)) return "Email 或密碼錯誤。";
  if (/already registered|already been registered/i.test(message)) return "這個 Email 已經註冊過了，請直接登入。";
  if (/password should be at least|weak password/i.test(message)) return "密碼至少需要 8 個字元。";
  if (/unable to validate email|invalid email/i.test(message)) return "Email 格式不正確。";
  if (/rate limit|too many/i.test(message)) return "嘗試太多次了，請稍後再試。";
  if (/failed to fetch|network/i.test(message)) return "無法連線，請確認網路後再試。";
  return message || "發生未知錯誤。";
}
