import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { LinkBlock } from "./link-block";
import { HeaderBlock } from "./header-block";
import { TextBlock } from "./text-block";
import { DividerBlock } from "./divider-block";
import { ImageBlock } from "./image-block";
import { SocialsBlock } from "./socials-block";

type Block = InferSelectModel<typeof blocks>;

interface BlockRendererProps {
  block: Block;
  /** "preview" = the editor or dashboard preview; interactive blocks render inert. */
  mode?: "public" | "preview";
  resolvedStyle?: React.CSSProperties;
}

export function BlockRenderer({ block, resolvedStyle }: BlockRendererProps) {
  if (!block.isVisible) return null;

  switch (block.type) {
    case "link":
      return <LinkBlock block={block} resolvedStyle={resolvedStyle} />;
    case "header":
      return <HeaderBlock block={block} />;
    case "text":
      return <TextBlock block={block} />;
    case "divider":
      return <DividerBlock />;
    case "image":
      return <ImageBlock block={block} />;
    case "socials":
      return <SocialsBlock block={block} />;
    default:
      return null;
  }
}
