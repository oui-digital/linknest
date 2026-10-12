import Link from "next/link";
import { ExamplePage } from "./example-page";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-cloud pb-20 pt-28 sm:pt-32 lg:pb-28 lg:pt-40">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(232,224,240,0.5),transparent_50%)]" />
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-[610px]">
          <p className="inline-flex rounded-full bg-lavender px-4 py-2 text-sm font-semibold text-indigo">Free to start · No credit card required</p>
          <h1 className="mt-7 font-serif text-[clamp(42px,5.5vw,68px)] leading-[1.07] tracking-[-0.025em] text-indigo">A link-in-bio page for your <span className="text-coral">content, bookings, and audience.</span></h1>
          <p className="mt-6 max-w-[520px] text-lg leading-relaxed text-slate">Show more than a list of links. Share what you make, invite people to book or subscribe, and see what gets clicks—all in a page that feels like your brand.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="rounded-[10px] bg-coral px-7 py-3.5 text-center text-sm font-bold text-white transition-colors hover:bg-coral-hover">Create your free page</Link>
            <a href="#examples" className="rounded-[10px] border border-mist px-7 py-3.5 text-center text-sm font-semibold text-indigo transition-colors hover:border-indigo">Explore examples</a>
          </div>
          <p className="mt-4 text-sm text-slate">Start with a template. Make it yours as you grow.</p>
        </div>
        <div className="relative mx-auto w-full max-w-[420px] rounded-[32px] border-[10px] border-indigo bg-white shadow-[0_25px_90px_rgba(26,26,46,0.18)]">
          <div className="mx-auto mt-3 h-2 w-20 rounded-full bg-mist" aria-hidden="true" />
          <div className="mt-3 max-h-[560px] overflow-hidden rounded-b-[22px] [&_.ln-page]:min-h-0">
            <ExamplePage kind="creator" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-[22px] bg-gradient-to-t from-white to-transparent" />
        </div>
      </div>
    </section>
  );
}
