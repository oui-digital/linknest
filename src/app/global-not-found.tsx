import type { Metadata } from "next";
import "./globals.css";
import { NotFoundView } from "@/components/route-fallbacks";

/**
 * 404 for URLs that match no route at all (`/a/b/c`).
 *
 * There is no single root layout any more — public pages have their own, with
 * a per-page <html lang> — so Next renders this file on its own, without a
 * layout. It therefore has to be a complete document.
 */
export const metadata: Metadata = {
  title: "Not Found — LinkNest",
  icons: { icon: "/icon.svg" },
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="antialiased">
        <NotFoundView />
      </body>
    </html>
  );
}
