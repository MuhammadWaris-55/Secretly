import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Resolve the palette before the first paint, including on a cold navigation.
const initializeTheme = `(() => {
  const system = matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    let preference;
    try { preference = localStorage.getItem("secretly-theme"); } catch {}
    document.documentElement.classList.toggle("dark",
      preference === "dark" || (preference !== "light" && system.matches));
  }
  apply();
  system.addEventListener("change", apply);
  window.addEventListener("storage", apply);
})();`;

export const metadata: Metadata = {
  title: "Secretly",
  description:
    "Scan your public GitHub repositories for exposed credentials and get guidance on how to fix them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
