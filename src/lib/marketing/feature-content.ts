import { PLAN_FACTS } from "@/lib/pricing";

export type FeatureSlug = "email-capture" | "link-analytics" | "embeds" | "customization" | "open-in-browser";

export type FeatureContent = {
  slug: FeatureSlug;
  label: string;
  title: string;
  description: string;
  eyebrow: string;
  intro: string;
  example: "creator" | "service" | "multi";
  sections: { title: string; body: string }[];
  steps: string[];
  faqs: { question: string; answer: string }[];
};

export const FEATURES: Record<FeatureSlug, FeatureContent> = {
  "email-capture": {
    slug: "email-capture", label: "Email capture", eyebrow: "Grow your audience",
    title: "Collect email sign-ups from your link-in-bio page",
    description: "Add a customizable email form to your LinkNest page. Build a confirmed subscriber list, manage contacts and export them with Pro.",
    intro: "A social profile is a good place to be found. An email list gives interested people a way to hear from you again. Put a clear invitation beside your content, so visitors can subscribe at the moment they want more.",
    example: "creator",
    sections: [
      { title: "A form that belongs on your page", body: "Add the email sign-up block anywhere in your page. Write your own heading, supporting text and button label, and let your page’s colors carry through. Visitors see the form alongside your links, videos and work." },
      { title: "Confirmed subscribers, under your control", body: `Visitors receive a confirmation email before joining your list. You can view and remove subscribers in your dashboard. Free includes up to ${PLAN_FACTS.free.max_subscribers} confirmed subscribers across your pages; Pro offers unlimited subscribers and CSV export for use with your email service.` },
      { title: "Clear limits and consent", body: "When the Free list reaches its cap, new sign-ups close. Confirmation links expire after 48 hours, and unconfirmed requests are cleaned up after seven days. LinkNest collects contacts; it does not send campaigns or automatically sync them to another platform." },
    ],
    steps: ["Add an email sign-up block in the editor and write a specific invitation.", "Publish the page and share your LinkNest URL.", "Review confirmed subscribers in your dashboard; export with Pro."],
    faqs: [
      { question: "How many subscribers can I collect?", answer: `Free allows ${PLAN_FACTS.free.max_subscribers} confirmed subscribers across the workspace. Pro removes that cap and adds CSV export.` },
      { question: "What happens when my Free list is full?", answer: "The public page shows that sign-ups are closed when the cap is known. A submission that reaches the limit at the same moment receives a closed message." },
      { question: "Does LinkNest send newsletters?", answer: "No. LinkNest collects confirmed sign-ups. Pro lets you export your list as CSV for a separate email service." },
    ],
  },
  "link-analytics": {
    slug: "link-analytics", label: "Link analytics", eyebrow: "Understand what works",
    title: "See which links and sources earn attention",
    description: "LinkNest analytics show page views, link clicks, top links and referring sites, with counts beside blocks in the editor.",
    intro: "A page view tells you someone arrived. LinkNest also shows which links they chose, which content ranks highest, and which sites sent them. Use that feedback to decide what to feature next.",
    example: "creator",
    sections: [
      { title: "From overview to individual links", body: "Compare views and link clicks over time, then inspect your top links. Social icon destinations can have their own click breakdown. Counts next to blocks in the editor make it easier to connect a result to the content you are changing." },
      { title: "Know where visits started", body: "The report lists referring sites when the browser provides a source. Recognized Instagram, Facebook, Messenger and Threads in-app visits can also be attributed to those apps. Visits with no reliable source remain Direct / unknown." },
      { title: "A metric with a clear meaning", body: "Clicks per view is total link clicks divided by page views in the chosen window. Someone can click more than one link, so it can exceed 100%. It is not a unique-visitor conversion rate or a measure of purchases." },
    ],
    steps: ["Publish your page and share its URL.", "Open analytics from your dashboard or check counts beside editor blocks.", `Compare ${PLAN_FACTS.free.analytics_days} days on Free or up to ${PLAN_FACTS.pro.analytics_days} days on Pro.`],
    faqs: [
      { question: "What does Free include?", answer: `Free includes ${PLAN_FACTS.free.analytics_days} days of views, clicks, top links and sources. Pro includes up to ${PLAN_FACTS.pro.analytics_days} days.` },
      { question: "Does LinkNest track unique visitors or sales?", answer: "No. The report shows page views and interactions, not unique visitors or sales attribution." },
      { question: "Why do some sources say Direct / unknown?", answer: "Browsers and apps do not always provide a referrer. The report keeps those visits rather than assigning an unverified source." },
    ],
  },
  embeds: {
    slug: "embeds", label: "Content & bookings", eyebrow: "More than a list of links",
    title: "Put video, music and bookings on your bio page",
    description: "Show supported YouTube, Vimeo and Spotify content, or offer Calendly booking from a LinkNest page.",
    intro: "Your audience can explore a video, listen to music or find a booking step without leaving your page just to learn what the link contains. Put the content beside your most important cards and social profiles.",
    example: "service",
    sections: [
      { title: "Four supported providers", body: "Paste a YouTube or Vimeo video, a supported Spotify track, album, playlist, episode, show or artist, or a Calendly link. LinkNest recognizes supported URLs and creates the right presentation in the editor." },
      { title: "Visitors choose when to load media", body: "Media uses a click-to-load player so a third-party iframe does not load before the visitor asks for it. Each embed keeps a link to its source when a visitor prefers to open the provider directly or a frame is unavailable." },
      { title: "A clearer path from interest to action", body: "A creator can pair a release with a video or playlist. A service business can place recent work beside a Calendly booking option. Featured cards and an announcement banner can point to the most timely next step." },
    ],
    steps: ["Add an embed block and paste a supported provider URL.", "Set its title and place it among your other content.", "Preview, publish and let visitors choose whether to load it."],
    faqs: [
      { question: "Can I paste any embed code?", answer: "No. LinkNest currently supports URLs from YouTube, Vimeo, Spotify and Calendly, not arbitrary HTML or scripts." },
      { question: "Do embeds load automatically?", answer: "The media player loads after a visitor chooses to play or open it. A source link remains available below the embed." },
    ],
  },
  customization: {
    slug: "customization", label: "Design & templates", eyebrow: "Make it yours",
    title: "Make your link-in-bio page feel like your brand",
    description: "Build with templates, rich cards, grid layouts and sharing controls. LinkNest Pro adds custom colors, Google Fonts and more pages.",
    intro: "Start with a layout that fits your work, then choose what visitors see first. A page can carry a portfolio, a prominent booking link, a launch announcement and your social profiles without looking like a plain link list.",
    example: "service",
    sections: [
      { title: "Cards with more context", body: "Add a thumbnail and description to a link, or feature one as the main call to action. Include headings, text, images and social icons where they help visitors decide what to open." },
      { title: "Layouts that adapt to your work", body: `Choose from ${PLAN_FACTS.pro.templates} templates: ${PLAN_FACTS.free.templates} on Free and ${PLAN_FACTS.pro.premiumTemplates} more on Pro. The grid templates use two columns even on phones. Links and images can be wide, while Bento also supports tall tiles.` },
      { title: "Branding beyond the page", body: `Set a page language, avatar description, social sharing image and favicon. Edit SEO title and description for eligible public pages. Pro adds custom hex colors, ${PLAN_FACTS.pro.googleFonts}+ Google Fonts, badge removal and room for ${PLAN_FACTS.pro.max_pages} pages.` },
      { title: "Repeat a design without starting over", body: "Duplicate a page as a draft to reuse its content and styling. It receives its own URL and starts with fresh analytics; subscriber and moderation history are not copied. Duplication still follows your plan’s page limit." },
    ],
    steps: ["Pick a template and add your content blocks.", "Highlight your most important action and adjust styling to fit your brand.", "Preview on mobile, publish, and reuse a page as a draft when another project needs one."],
    faqs: [
      { question: "What customization is free?", answer: `Free includes ${PLAN_FACTS.free.templates} templates, curated palettes, ${PLAN_FACTS.free.fonts} system fonts and ${PLAN_FACTS.free.buttonStyles} button styles.` },
      { question: "What does Pro add?", answer: `Pro adds ${PLAN_FACTS.pro.premiumTemplates} premium templates, custom hex colors, ${PLAN_FACTS.pro.googleFonts}+ Google Fonts, ${PLAN_FACTS.pro.buttonStyles} button styles, badge removal and up to ${PLAN_FACTS.pro.max_pages} pages.` },
      { question: "Does duplication copy subscribers or analytics?", answer: "No. The copy is a draft with new block IDs and a fresh URL. It references the same workspace subscriber list but does not copy its records or past analytics." },
    ],
  },
  "open-in-browser": {
    slug: "open-in-browser", label: "Browser option", eyebrow: "A choice for social visitors",
    title: "Offer visitors an option to open your page in their browser",
    description: "On supported Meta in-app mobile browsers, LinkNest can show visitors an Open in browser option or instructions. The page still works if they stay.",
    intro: "Social apps often open bio links inside their own browser. LinkNest can offer an optional way to open your page in the visitor’s regular browser when it recognizes supported Instagram, Facebook, Messenger or Threads contexts.",
    example: "creator",
    sections: [
      { title: "The visitor stays in control", body: "A small bar offers the option when a supported in-app browser is detected. The visitor can choose it, dismiss it or continue browsing your page normally. Page owners can turn the bar off." },
      { title: "Best effort across devices", body: "The available handoff method differs by app and operating system. If the browser cannot complete it, the bar provides manual instructions. Availability can change when social apps update their browsers." },
      { title: "Understand where visits came from", body: "Recognized visits from the supported apps can be attributed to those sources in LinkNest analytics even when the in-app browser omits a normal referrer. This identifies a source, not a completed handoff or purchase." },
    ],
    steps: ["Keep the browser option enabled in your page settings.", "Share your LinkNest page in a supported Meta app.", "Visitors can open their browser, follow instructions or stay on the page."],
    faqs: [
      { question: "Does it work on every social app?", answer: "No. The option currently targets recognized mobile Instagram, Facebook, Messenger and Threads in-app browsers." },
      { question: "Will it always open Safari or Chrome?", answer: "No. Handoff methods are best effort and social apps can change how they handle them. Visitors can use the fallback instructions or keep using your page." },
      { question: "Can I turn the option off?", answer: "Yes. Page owners can disable the Open in browser bar in settings." },
    ],
  },
};

export const FEATURE_LIST = Object.values(FEATURES);
