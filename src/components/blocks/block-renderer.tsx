import type { InferSelectModel } from "drizzle-orm";
import type { blocks } from "@/lib/db/schema";
import { LinkBlock } from "./link-block";
import { HeaderBlock } from "./header-block";
import { TextBlock } from "./text-block";
import { DividerBlock } from "./divider-block";
import { ImageBlock } from "./image-block";
import { SocialsBlock } from "./socials-block";
import { EmbedBlock } from "./embed-block";
import { EmailCaptureForm } from "./email-capture-form";
import { parseBlockContent } from "@/lib/blocks/content";

type Block = InferSelectModel<typeof blocks>;

interface BlockRendererProps {
  block: Block;
  /** "preview" = the editor or dashboard preview; interactive blocks render inert. */
  mode?: "public" | "preview";
  resolvedStyle?: React.CSSProperties;
  /** Grid templates: render links and images as square-ish tiles. */
  tile?: boolean;
}

export function BlockRenderer({
  block,
  mode = "public",
  resolvedStyle,
  tile = false,
}: BlockRendererProps) {
  if (!block.isVisible) return null;

  switch (block.type) {
    case "link":
      return <LinkBlock block={block} resolvedStyle={resolvedStyle} tile={tile} />;
    case "header":
      return <HeaderBlock block={block} />;
    case "text":
      return <TextBlock block={block} />;
    case "divider":
      return <DividerBlock />;
    case "image":
      return <ImageBlock block={block} tile={tile} />;
    case "socials":
      return <SocialsBlock block={block} />;
    case "embed":
      return <EmbedBlock block={block} mode={mode} />;
    case "email_capture":
      return (
        <EmailCaptureForm
          blockId={block.id}
          copy={parseBlockContent("email_capture", block.content)}
        />
      );
    default:
      return null;
  }
}
