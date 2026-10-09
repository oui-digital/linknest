import type { TemplateDefinition } from "@/lib/templates";
import { computeButtonStyleVars } from "@/lib/templates/theme";
import { getAvatarGradient } from "@/lib/avatar";

interface TemplateMiniPreviewProps {
  template: TemplateDefinition;
}

export function TemplateMiniPreview({ template }: TemplateMiniPreviewProps) {
  const t = template.defaultTheme;
  const btnVars = computeButtonStyleVars(t);
  const { gradient } = getAvatarGradient(template.id);

  const bgStyle: React.CSSProperties = {
    backgroundColor: t.colorBackground,
  };
  if (t.backgroundEffect === "gradient" && t.backgroundGradient) {
    bgStyle.backgroundImage = t.backgroundGradient;
  }

  const radius = Math.min(
    Number(btnVars["--ln-btn-radius"]?.replace("px", "") ?? t.buttonRadius),
    6,
  );
  const tileStyle: React.CSSProperties = {
    backgroundColor: btnVars["--ln-btn-bg"] ?? t.colorSurface,
              borderWidth: btnVars["--ln-btn-border-w"] ?? "0px",
              borderColor: btnVars["--ln-btn-border-c"] ?? "transparent",
              borderStyle: "solid",
              borderRadius: radius,
              boxShadow: btnVars["--ln-btn-shadow"] === "none" ? undefined : btnVars["--ln-btn-shadow"],
  };

  return (
    <div
      className="flex flex-col items-center overflow-hidden rounded"
      style={{
        ...bgStyle,
        height: 120,
        padding: "12px 8px",
        willChange: "transform",
        backfaceVisibility: "hidden",
        transform: "translateZ(0)",
        pointerEvents: "none",
      }}
    >
      {/* Mini avatar */}
      <div
        className="rounded-full"
        style={{
          width: 20,
          height: 20,
          background: gradient,
          flexShrink: 0,
        }}
      />

      {/* Title placeholder */}
      <div
        className="mt-2 rounded-sm"
        style={{
          width: 48,
          height: 6,
          backgroundColor: t.colorText,
          opacity: 0.8,
        }}
      />

      {/* Bio placeholder */}
      <div
        className="mt-1 rounded-sm"
        style={{
          width: 64,
          height: 4,
          backgroundColor: t.colorTextMuted,
          opacity: 0.5,
        }}
      />

      {/* Blocks: bars for stack layouts, tiles for the grid layouts */}
      {template.layout === "card-grid" || template.layout === "bento-grid" ? (
        <div className="mt-3 grid w-4/5 grid-cols-2 gap-1">
          {(template.layout === "bento-grid"
            ? ["col-span-2 h-2.5", "row-span-2 h-[22px]", "h-2.5", "h-2.5"]
            : ["h-3", "h-3", "h-3", "h-3"]
          ).map((cls, i) => (
            <div key={i} className={cls} style={tileStyle} />
          ))}
        </div>
      ) : (
        <div className="mt-3 flex w-full flex-col items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ ...tileStyle, width: "80%", height: 10 }} />
          ))}
        </div>
      )}
    </div>
  );
}
