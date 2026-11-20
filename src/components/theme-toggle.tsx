"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggleTheme() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("secretly-theme", dark ? "dark" : "light");
    } catch {
      // The current tab still works when storage is unavailable.
    }
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme}>
      <Sun className="theme-sun" size={19} aria-hidden="true" />
      <Moon className="theme-moon" size={19} aria-hidden="true" />
      <span className="theme-light-label sr-only">Switch to light mode</span>
      <span className="theme-dark-label sr-only">Switch to dark mode</span>
    </button>
  );
}
