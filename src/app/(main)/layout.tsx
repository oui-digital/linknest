import type { Metadata } from "next";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import "../globals.css";

// preload: false — these two faces were being preloaded at high priority on
// EVERY route, including public link pages, which render entirely in the fonts
// their own theme selects. That put ~53 KiB of unused font fetches ahead of the
// avatar that is usually the LCP element. Both faces use font-display: swap, so
// dropping the preload costs the marketing and dashboard pages only a swap-in
// on first paint. The variables stay on <body>, which globals.css and the
// .font-serif utility depend on.
const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  variable: "--font-heading",
  subsets: ["latin"],
  preload: false,
});

const dmSans = DM_Sans({
  weight: ["400", "500", "700"],
  variable: "--font-body",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  // The icon used to be the app/icon.svg file convention, which applied to
  // every route and would have overridden a page's own favicon; it is a
  // static file now and each root layout declares it.
  icons: { icon: "/icon.svg" },
  title: "LinkNest — Your Links Deserve a Home",
  description:
    "The link-in-bio tool that makes you look professional in seconds. Gorgeous templates, brand-level customization, and blazing performance.",
};

/**
 * Root layout for the site: marketing, auth, dashboard, legal, report and
 * subscribe pages. Public pages have their own root layout under
 * (public)/[username] so that <html lang> can follow the page's language.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSerifDisplay.variable} ${dmSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
