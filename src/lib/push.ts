import { supabase } from "@/lib/supabase";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushState =
  /** No Push API: a desktop browser without it, or iOS Safari in a tab. */
  | "unsupported"
  /** iOS exposes notifications only to home-screen apps, so this device must install first. */
  | "needs-install"
  | "denied"
  | "off"
  | "on";

function isIOS() {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

/** The registration from pwa.tsx; absent in development, where no worker is registered. */
function registration() {
  return navigator.serviceWorker.getRegistration(`${BASE_PATH}/`);
}

function toKey(base64Url: string) {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function getPushState(): Promise<PushState> {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Returns an error message, or null once this device will receive pushes. */
export async function enablePush(): Promise<string | null> {
  if (!VAPID_PUBLIC_KEY) return "這個版本沒有設定推播金鑰，請重新部署。";

  // First, before any other await: Safari only grants the prompt while the tap
  // that called this is still fresh, and a token refresh could outlast it.
  if ((await Notification.requestPermission()) !== "granted") {
    return "你剛剛選了不允許。要改的話到 iPhone 的「設定 → 通知」找這個 App。";
  }

  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) return "請先登入。";

  const reg = await registration();
  if (!reg) return "離線功能還沒就緒，請關掉 App 重新打開再試。";

  let sub: PushSubscription;
  try {
    sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toKey(VAPID_PUBLIC_KEY),
      }));
  } catch {
    return "這台裝置無法註冊通知。";
  }

  const keys = sub.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) {
    await sub.unsubscribe().catch(() => {});
    return "這台裝置無法註冊通知。";
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: "endpoint" },
    );
  if (error) {
    await sub.unsubscribe().catch(() => {});
    return "儲存失敗，請確認網路後再試。";
  }
  return null;
}

export async function disablePush() {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

/** Fire-and-forget: the task is already saved, so a failed push must not surface. */
export function notifyAssignee(taskId: number) {
  void supabase.functions.invoke("notify-task", { body: { task_id: taskId } });
}
