/* Footer — Deep indigo background, brand logo, link columns, copyright.
   Server component. */

import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-indigo pt-16 pb-8">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* Main footer content */}
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" aria-label="LinkNest home">
              <Image
                src="/linknest-logo-white.svg"
                alt="LinkNest"
                width={122}
                height={28}
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              Made for creators who care.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h3 className="text-[13px] font-bold tracking-[0.04em] uppercase text-white/90">
              Product
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                { label: "Features", href: "/features" },
                { label: "Templates", href: "/#templates" },
                { label: "Pricing", href: "/pricing" },
                { label: "FAQ", href: "/#faq" },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-white/60 transition-colors duration-200 hover:text-white"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h3 className="text-[13px] font-bold tracking-[0.04em] uppercase text-white/90">
              Legal
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Service", href: "/terms" },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 transition-colors duration-200 hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-white/10 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-white/50">
              &copy; {new Date().getFullYear()}{" "}
              <a
                href="https://oui.digital"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors duration-200 hover:text-white"
              >
                Oui Digital
              </a>
              . All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link
                href="/privacy"
                className="text-sm text-white/50 transition-colors duration-200 hover:text-white"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-white/50 transition-colors duration-200 hover:text-white"
              >
                Terms
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
