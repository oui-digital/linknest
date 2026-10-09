import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { parseBlockContent } from "@/lib/blocks/content";

type Block = InferSelectModel<typeof blocks>;

export function TextBlock({ block }: { block: Block }) {
  const content = parseBlockContent("text", block.content);
  const text = content.text || block.label || "";

  return (
    <p
      className="w-full"
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
