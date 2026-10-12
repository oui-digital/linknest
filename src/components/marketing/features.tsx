import Link from "next/link";
import { ExamplePage } from "./example-page";

const benefits = [
  { title: "Show more of what you do", body: "Put rich link cards, videos, music, social profiles and bookings together. Give the work that matters most a prominent place.", href: "/features/embeds", cta: "Explore content and bookings" },
  { title: "Grow an audience you can reach", body: "Let visitors join your email list right on your page. Every subscription uses confirmation, and Pro gives you unlimited subscribers plus CSV export.", href: "/features/email-capture", cta: "See email capture" },
  { title: "Learn what gets attention", body: "See views, link clicks, your top links and referring sites. Check counts beside blocks while you edit, then make better choices about what to feature.", href: "/features/link-analytics", cta: "See link analytics" },
];

export default function Features() {
  return (
    <section id="features" className="bg-sand py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="max-w-[700px]">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-coral">More than links</p>
          <h2 className="mt-4 font-serif text-[clamp(32px,4vw,48px)] leading-tight text-indigo">One page that works harder for you.</h2>
          <p className="mt-4 text-lg text-slate">Your audience should be able to explore your work, take the next step and stay in touch without hunting across profiles.</p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {benefits.map((benefit, index) => (
            <article key={benefit.href} className="rounded-2xl border border-black/5 bg-white p-7 shadow-[var(--shadow-sm)]">
              <span className="text-sm font-bold text-coral">0{index + 1}</span>
              <h3 className="mt-5 text-xl font-bold text-indigo">{benefit.title}</h3>
              <p className="mt-3 leading-relaxed text-slate">{benefit.body}</p>
              <Link href={benefit.href} className="mt-6 inline-block font-semibold text-indigo underline decoration-coral underline-offset-4 hover:text-coral">{benefit.cta} →</Link>
            </article>
          ))}
        </div>
        <div className="mt-16 grid items-center gap-10 lg:grid-cols-[1fr_420px]">
          <div>
            <h3 className="font-serif text-[clamp(28px,3vw,40px)] leading-tight text-indigo">A stronger page for every project.</h3>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate">Start with a polished template, then give key links more room with a thumbnail, description or featured style. Grid layouts make room for different sizes—even on mobile. Pro lets you manage five pages and duplicate one as a starting point for another project.</p>
            <Link href="/features/customization" className="mt-6 inline-block font-semibold text-indigo underline decoration-coral underline-offset-4">Explore page design →</Link>
          </div>
          <div className="max-h-[470px] overflow-hidden rounded-3xl border border-black/5 shadow-[var(--shadow-md)] [&_.ln-page]:min-h-0"><ExamplePage kind="service" /></div>
        </div>
        <div className="mt-16 rounded-2xl bg-indigo px-7 py-8 text-white sm:px-10">
          <h3 className="text-xl font-bold">Give visitors a browser option</h3>
          <p className="mt-2 max-w-3xl text-white/75">On supported Instagram, Facebook, Messenger and Threads mobile browsers, LinkNest can offer visitors an option to open your page in their browser. They can stay on the page either way.</p>
          <Link href="/features/open-in-browser" className="mt-4 inline-block font-semibold underline decoration-coral underline-offset-4">How it works →</Link>
        </div>
      </div>
    </section>
  );
}
