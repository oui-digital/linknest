/* TemplatesShowcase — Grid of template preview cards using real template data.
   Imports TEMPLATES from @/lib/templates. Server component. */

import { TEMPLATES } from "@/lib/templates";
import Image from "next/image";

export default function TemplatesShowcase() {
  return (
    <section id="templates" className="py-16 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* Header */}
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="font-serif text-[clamp(28px,4vw,44px)] leading-[1.15] tracking-[-0.01em] text-indigo">
            Start with taste. Make it yours.
          </h2>
          <p className="mt-4 text-lg text-slate">
            Choose from eight templates, including two Pro layouts. These previews show LinkNest&apos;s actual rendered pages.
          </p>
        </div>

        {/* Template grid */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="group relative overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-white shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
            >
              <div className="relative aspect-[640/470] overflow-hidden" style={{ backgroundColor: template.defaultTheme.colorBackground }}>
                <Image src={`/marketing/templates/${template.id}.webp`} alt={`Example page rendered with the ${template.name} template`} width={640} height={470} loading="lazy" className="h-full w-full object-cover" />
              </div>

              {/* Info */}
              <div className="flex items-start justify-between gap-2 p-4">
                <div>
                  <h3 className="font-medium text-indigo">{template.name}</h3>
                  <p className="mt-1 text-sm leading-snug text-slate line-clamp-2">
                    {template.description}
                  </p>
                </div>
                {template.tier === "pro" && (
                  <span className="shrink-0 rounded-full bg-amber/10 px-2.5 py-0.5 text-[11px] font-bold text-amber">
                    PRO
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
