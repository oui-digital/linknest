import { PLAN_FACTS } from "@/lib/pricing";

const faqs = [
  { question: "What can I put on my LinkNest page?", answer: "Add link cards with thumbnails and descriptions, headings, text, images, social icons, an announcement banner, an email sign-up form, and supported YouTube, Vimeo, Spotify or Calendly embeds. Feature a key link and arrange blocks visually." },
  { question: "Is LinkNest free?", answer: `Yes. Free includes one page, up to ${PLAN_FACTS.free.max_blocks_per_page} links and blocks, ${PLAN_FACTS.free.templates} templates, email sign-ups for up to ${PLAN_FACTS.free.max_subscribers} confirmed subscribers, and ${PLAN_FACTS.free.analytics_days} days of reporting. No credit card is required to start.` },
  { question: "Can I collect email sign-ups?", answer: `Yes. Add an email block to your published page. Visitors confirm by email before joining your list. Free supports ${PLAN_FACTS.free.max_subscribers} confirmed subscribers across your workspace; Pro removes that limit and adds CSV export. LinkNest does not send newsletters.` },
  { question: "What does the analytics report show?", answer: `See page views, link clicks, top links and referring sites. Counts also appear beside blocks in the editor. Free includes ${PLAN_FACTS.free.analytics_days} days and Pro includes up to ${PLAN_FACTS.pro.analytics_days} days. Clicks per view divides total clicks by views; it is not a unique-visitor conversion rate.` },
  { question: "How can I customize a page?", answer: `Start with a template and arrange your content. Free offers curated palettes and ${PLAN_FACTS.free.fonts} system fonts. Pro adds premium templates, custom hex colors, ${PLAN_FACTS.pro.googleFonts}+ Google Fonts, ${PLAN_FACTS.pro.buttonStyles} button styles and badge removal.` },
  { question: "Can I manage more than one page?", answer: `Pro supports up to ${PLAN_FACTS.pro.max_pages} pages. You can duplicate a page as a draft to reuse its design and blocks. Analytics and published status do not copy over.` },
  { question: "What happens when I cancel Pro?", answer: "Pro lasts through your paid period. After a seven-day downgrade grace period, the oldest published page remains live under the Free one-page limit; additional pages are unpublished and kept as drafts. You can upgrade again to publish them." },
  { question: "Will my page appear in Google immediately?", answer: "You can share a published page right away. Newly published Free pages are kept out of search indexing for their first 14 days. Search engines decide when and whether to index eligible pages." },
];

export default function FAQ() {
  return (
    <section id="faq" className="bg-cloud py-20 lg:py-28">
      <div className="mx-auto max-w-[780px] px-5 sm:px-8">
        <h2 className="text-center font-serif text-[clamp(30px,4vw,44px)] text-indigo">Questions before you start?</h2>
        <div className="mt-10 space-y-3">
          {faqs.map(({ question, answer }) => (
            <details key={question} className="group overflow-hidden rounded-2xl border border-black/5 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-semibold text-indigo [&::-webkit-details-marker]:hidden">
                {question}<span className="text-xl text-coral transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="px-6 pb-6 leading-relaxed text-slate">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
