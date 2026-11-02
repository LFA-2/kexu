/** Drop the offline cache and service worker, then reload from the network. */
export async function hardReload() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("kexu-")).map((k) => caches.delete(k)));
    const registrations = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((registrations ?? []).map((r) => r.unregister()));
  } finally {
    window.location.reload();
  }
}
