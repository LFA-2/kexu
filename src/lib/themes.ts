export const THEME_KEY = "kexu-theme";

export const THEMES = [
  {
    id: "default",
    name: "預設",
    hint: "現在的配色",
    themeColor: "#e9eef2",
    preview: { bg: "#e9eef2", card: "#ffffff", accent: "#14212b" },
  },
  {
    id: "black",
    name: "極致黑",
    hint: "深色",
    themeColor: "#0c0f12",
    preview: { bg: "#0c0f12", card: "#171c21", accent: "#2dd4bf" },
  },
  {
    id: "white",
    name: "白",
    hint: "白底綠按鈕",
    themeColor: "#f5f7f6",
    preview: { bg: "#f5f7f6", card: "#ffffff", accent: "#06c755" },
  },
  {
    id: "ocean",
    name: "海洋",
    hint: "藍色",
    themeColor: "#eef3f8",
    preview: { bg: "#eef3f8", card: "#ffffff", accent: "#1d4ed8" },
  },
  {
    id: "sakura",
    name: "櫻花",
    hint: "粉色",
    themeColor: "#fbf4f6",
    preview: { bg: "#fbf4f6", card: "#ffffff", accent: "#db2777" },
  },
  {
    id: "grape",
    name: "葡萄",
    hint: "紫色",
    themeColor: "#f4f2f8",
    preview: { bg: "#f4f2f8", card: "#ffffff", accent: "#6d28d9" },
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const THEME_IDS = new Set<string>(THEMES.map((theme) => theme.id));

export function isThemeId(value: string | null): value is ThemeId {
  return value !== null && THEME_IDS.has(value);
}

export function readTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    /* private mode */
  }
  return "default";
}

const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  if (id === "default") delete root.dataset.theme;
  else root.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* private mode */
  }
  const theme = THEMES.find((item) => item.id === id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme?.themeColor ?? "#e9eef2");
  for (const listener of listeners) listener();
}

/** Runs before paint so a saved theme does not flash the default colors. */
export const THEME_BOOT_SCRIPT = `(() => {
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var c = ${JSON.stringify(Object.fromEntries(THEMES.filter((theme) => theme.id !== "default").map((theme) => [theme.id, theme.themeColor])))};
    if (!c[t]) return;
    document.documentElement.dataset.theme = t;
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", c[t]);
  } catch (e) {}
})();`;
