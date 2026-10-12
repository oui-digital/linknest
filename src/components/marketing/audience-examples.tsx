import Link from "next/link";
import { ExamplePage } from "./example-page";

const audiences = [
  { kind: "creator" as const, label: "Creators and small brands", description: "Share a new release, let people watch, and invite them to subscribe.", href: "/features/email-capture" },
  { kind: "service" as const, label: "Freelancers and service businesses", description: "Show your portfolio, explain your services, and offer a booking step.", href: "/features/embeds" },
  { kind: "multi" as const, label: "Several brands or projects", description: "Keep distinct projects organized, with up to five pages on Pro.", href: "/features/customization" },
];

export default function AudienceExamples() {
  return (
    <section id="examples" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-coral">Made for your next step</p>
        <h2 className="mt-4 font-serif text-[clamp(32px,4vw,48px)] text-indigo">A page that fits the work you do.</h2>
        <p className="mt-3 max-w-2xl text-slate">These sample pages use LinkNest’s actual layouts and content blocks.</p>
        <div className="mt-10 grid gap-7 lg:grid-cols-3">
          {audiences.map((audience) => (
            <article key={audience.kind} className="overflow-hidden rounded-2xl border border-black/5 bg-cloud shadow-[var(--shadow-sm)]">
              <div className="h-[330px] overflow-hidden [&_.ln-page]:min-h-0"><ExamplePage kind={audience.kind} /></div>
              <div className="p-6">
                <h3 className="text-lg font-bold text-indigo">{audience.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate">{audience.description}</p>
                <Link href={audience.href} className="mt-4 inline-block text-sm font-semibold text-indigo underline decoration-coral underline-offset-4">See how it works →</Link>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate">Examples are fictional. Buttons and forms in these previews are for illustration only.</p>
      </div>
    </section>
  );
}
