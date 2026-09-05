"use client";

import { useState } from "react";
import { Check, Palette } from "lucide-react";
import { useAppShell } from "@/context/AppShellContext";
import type { Theme } from "@/lib/theme";

const THEMES: Theme[] = ["snow", "light", "dark"];

/** A small global theme control shared by every route, including public pages. */
export default function ThemeSwitcher() {
  const { theme, setTheme } = useAppShell();
  const [open, setOpen] = useState(false);
  const activeTheme = THEMES.includes(theme) ? theme : "light";

  return (
    <div className="fixed right-4 top-4 z-[100]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Current theme: ${activeTheme}`}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-3 py-2 text-[11px] font-medium text-[var(--muted-foreground)] shadow-sm backdrop-blur transition-colors hover:border-[var(--primary)]/50 hover:text-[var(--foreground)]"
      >
        <Palette size={14} aria-hidden="true" />
        <span>theme: {activeTheme}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose theme"
          className="absolute right-0 mt-2 min-w-[132px] rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-lg backdrop-blur"
        >
          {THEMES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              onClick={() => {
                setTheme(option);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--background)]"
            >
              <span>{option}</span>
              {activeTheme === option && <Check size={14} className="text-[var(--primary)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
