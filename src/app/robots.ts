import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated surfaces and endpoints have no crawl value and should
        // never appear in results.
        disallow: ["/dashboard/", "/onboarding", "/api/", "/check-email", "/subscribe/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
