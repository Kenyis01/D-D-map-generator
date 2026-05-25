import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DnD Map Generator",
  description: "Generate tactical D&D maps from natural language prompts."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cinzel:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="min-h-screen">
          <header className="border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-30">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
              <a href="/" className="flex items-center gap-2">
                <span className="text-2xl">🗺️</span>
                <span className="font-serif-title text-xl text-accent">
                  DnD Map Generator
                </span>
              </a>
              <nav className="flex items-center gap-3 text-sm">
                <a href="/" className="text-muted hover:text-text">
                  Gallery
                </a>
                <a href="/generate" className="btn-primary">
                  New map
                </a>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
          <footer className="border-t border-border py-6 text-center text-xs text-muted">
            <p>Built with Next.js · Supabase · Groq LLM</p>
            <p className="mt-1">
              Sprites:{" "}
              <a
                href="https://github.com/iwenzhou/kenney"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-accent"
              >
                Kenney (CC0)
              </a>
              {" · "}
              <a
                href="https://github.com/ElizaWy/LPC"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-accent"
              >
                Liberated Pixel Cup (CC-BY-SA 3.0)
              </a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
