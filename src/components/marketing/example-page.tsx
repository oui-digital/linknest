import { PublicPageView } from "@/components/templates/public-page-view";
import { marketingExample } from "@/lib/marketing/examples";

export function ExamplePage({ kind, templateId, focus }: { kind: "creator" | "service" | "multi"; templateId?: string; focus?: "email_capture" | "embed" }) {
  const example = marketingExample(kind, templateId, focus);
  return (
    <PublicPageView
      {...example}
      mode="preview"
      embedded
      showBadge={false}
      showReport={false}
      fonts={{ heading: null, body: null, remoteUrl: null }}
      frameClassName=""
    />
  );
}
