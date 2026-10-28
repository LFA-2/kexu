"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Share, X } from "lucide-react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const INSTALL_HINT_KEY = "kexu-install-hint-dismissed";

export function UpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;

    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        // Only an update if a previous version already controls the page.
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          setWaiting(worker);
        }
      };
      check();
      worker.addEventListener("statechange", check);
    };

    navigator.serviceWorker
      .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
      .then((reg) => {
        registration = reg;
        track(reg.waiting);
        reg.addEventListener("updatefound", () => track(reg.installing));
      })
      .catch(() => {});

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
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

  if (!waiting) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-teal-700/30 bg-white px-4 py-3 shadow-lg">
      <p className="flex-1 text-sm text-ink">課序有新版本</p>
      <Button size="sm" onClick={() => waiting.postMessage("SKIP_WAITING")}>
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
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border/70 bg-white px-4 py-3 text-sm text-ink">
      <Share className="mt-0.5 size-4 shrink-0 text-teal-700" />
      <p className="flex-1 leading-relaxed">
        安裝到 iPhone：點 Safari 下方的「分享」，再選「加入主畫面」。資料只存在這支手機裡。
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
