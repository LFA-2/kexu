"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Share, X } from "lucide-react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const INSTALL_HINT_KEY = "kexu-install-hint-dismissed";

/** Right after launch a reload is barely noticeable; later it could interrupt typing. */
const SILENT_RELOAD_MS = 10000;

/** Whether this page's own scripts are in the offline cache, i.e. it runs the cached build. */
async function runningCachedBuild() {
  const script = [...document.scripts].find((s) => s.src.includes("/_next/static/"));
  if (!script) return true;
  return !!(await caches.match(script.src, { ignoreSearch: true }));
}

export function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;

    navigator.serviceWorker
      .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
      .then((reg) => {
        registration = reg;
        // A worker from an older release may still be waiting for the old "update" button.
        reg.waiting?.postMessage("SKIP_WAITING");
      })
      .catch(() => {});

    const onControllerChange = async () => {
      if (reloading || (await runningCachedBuild())) return;
      if (performance.now() < SILENT_RELOAD_MS) {
        reloading = true;
        window.location.reload();
      } else setOutdated(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Home-screen apps are resumed rather than reloaded, so poll on resume.
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!outdated) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-teal-700/30 bg-card px-4 py-3 shadow-lg">
      <p className="flex-1 text-sm text-ink">有新版本可以更新</p>
      <Button size="sm" onClick={() => window.location.reload()}>
        立即更新
      </Button>
    </div>
  );
}

function getInstallHintVisible() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const isIOS =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return isIOS && !standalone && localStorage.getItem(INSTALL_HINT_KEY) !== "1";
}

const noopSubscribe = () => () => {};

export function InstallHint() {
  const initiallyVisible = useSyncExternalStore(
    noopSubscribe,
    getInstallHintVisible,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);

  if (!initiallyVisible || dismissed) return null;

  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-ink">
      <Share className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="flex-1 leading-relaxed">
        安裝到 iPhone：點 Safari 下方的「分享」，再選「加入主畫面」，登入同一個帳號就能看到同一份資料。
      </p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(INSTALL_HINT_KEY, "1");
          setDismissed(true);
        }}
        className="text-muted-foreground hover:text-ink"
        aria-label="不再顯示"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
