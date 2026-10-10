import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { parseBlockContent } from "@/lib/blocks/content";

type Block = InferSelectModel<typeof blocks>;

export function TextBlock({ block }: { block: Block }) {
  const content = parseBlockContent("text", block.content);
  const text = content.text || block.label || "";

  return (
    // pre-line: the editor field is a multi-line textarea, so its line breaks
    // are content. Runs of spaces still collapse.
    <p
      className="w-full whitespace-pre-line wrap-anywhere"
      style={{
        fontFamily: "var(--ln-font-body)",
        fontSize: "var(--ln-font-size-base)",
        color: "var(--ln-color-text-muted)",
        lineHeight: "var(--ln-line-height-body)",
      }}
    >
      {text}
    </p>
  );
}
