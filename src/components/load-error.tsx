"use client";

import { useEffect } from "react";

const RECOVERED_KEY = "kexu-recovered";

/** Drop the offline cache and service worker, then reload from the network. */
async function hardReload() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("kexu-")).map((k) => caches.delete(k)));
    const registrations = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((registrations ?? []).map((r) => r.unregister()));
  } finally {
    window.location.reload();
  }
}

export function LoadError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // A stale offline copy is the usual cause; retry once per session automatically.
    if (sessionStorage.getItem(RECOVERED_KEY)) return;
    sessionStorage.setItem(RECOVERED_KEY, "1");
    hardReload();
  }, []);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-medium text-ink">畫面載入失敗</p>
      <p className="text-sm text-muted-foreground">
        通常是舊版本的快取造成的，重新載入就會好。資料都存在雲端，不會遺失。
      </p>
      <button
        type="button"
        onClick={hardReload}
        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"
      >
        重新載入
      </button>
      <p className="break-all text-xs text-muted-foreground/70">{error.message}</p>
    </div>
  );
}
