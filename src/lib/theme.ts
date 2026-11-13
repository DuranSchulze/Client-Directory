"use client";

import { useSyncExternalStore } from "react";

// The theme lives on <html data-theme>, set before first paint by the inline script in app/layout.tsx
// (saved choice, else the OS preference). Keys differ from the Scraper's so the two apps keep their own choice.
export type Theme = "dark" | "light";
export const THEME_KEY = "directory.theme";
const EVENT = "directory:theme";

const read = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
const apply = (next: Theme) => { document.documentElement.dataset.theme = next; };

export function toggleTheme() {
  const next: Theme = read() === "dark" ? "light" : "dark";
  apply(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    apply(e.newValue === "light" ? "light" : "dark");
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}

export const useTheme = (): Theme => useSyncExternalStore(subscribe, read, () => "dark");
