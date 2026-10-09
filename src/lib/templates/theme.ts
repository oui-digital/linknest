// src/lib/templates/theme.ts — ThemeTokens type definition and CSS pipeline

import { getContrastColor } from "@/lib/contrast";

export interface ThemeTokens {
  version: 1;

  // Colors
  colorBackground: string;
  colorSurface: string;
  colorPrimary: string;
  colorSecondary: string;
  colorText: string;
  colorTextMuted: string;
  colorAccent: string;

  // Typography
  fontHeading: string;
  fontBody: string;
  fontSizeBase: number;
  fontWeightHeading: number;
  lineHeightBody: number;

  // Spacing & Layout
  spacingUnit: number;
  contentMaxWidth: number;
  blockGap: number;
  pagePaddingX: number;
  pagePaddingY: number;

  // Borders & Shapes
  borderRadius: number;
  borderWidth: number;
  borderColor: string;

  // Buttons
  buttonStyle:
    | "filled"
    | "outline"
    | "ghost"
    | "pill"
    | "shadow"
    | "neon"
    | "glass"
    | "minimal";
  buttonRadius: number;
  buttonPaddingX: number;
  buttonPaddingY: number;

  // Effects
  shadow: "none" | "sm" | "md" | "lg";
  backgroundEffect: "none" | "gradient" | "pattern" | "blur";
  backgroundGradient?: string;

  // Branding
  hideBranding?: boolean;
}

/**
 * Compute button-specific CSS variables based on the active button style.
 */
export function computeButtonStyleVars(theme: ThemeTokens): Record<string, string> {
  // Page-level shadow from the template — applied to styles without their own effect
  const pageShadow = SHADOW_MAP[theme.shadow] ?? "none";

  switch (theme.buttonStyle) {
    case "outline":
      return {
        "--ln-btn-bg": "transparent",
        "--ln-btn-text": theme.colorPrimary,
        "--ln-btn-border-w": "2px",
        "--ln-btn-border-c": theme.colorPrimary,
        "--ln-btn-shadow": pageShadow,
        "--ln-btn-backdrop": "none",
      };

    case "pill":
      return {
        "--ln-btn-bg": theme.colorSurface,
        "--ln-btn-text": theme.colorPrimary,
        "--ln-btn-border-w": "0px",
        "--ln-btn-border-c": "transparent",
        "--ln-btn-shadow": pageShadow,
        "--ln-btn-backdrop": "none",
        "--ln-btn-radius": "999px",
      };

    case "shadow":
      return {
        "--ln-btn-bg": theme.colorSurface,
        "--ln-btn-text": theme.colorPrimary,
        "--ln-btn-border-w": "0px",
        "--ln-btn-border-c": "transparent",
        "--ln-btn-shadow": "0 4px 14px rgba(0,0,0,0.15)",
        "--ln-btn-backdrop": "none",
      };

    case "neon":
      return {
        "--ln-btn-bg": "transparent",
        "--ln-btn-text": theme.colorAccent,
        "--ln-btn-border-w": "2px",
        "--ln-btn-border-c": theme.colorAccent,
        "--ln-btn-shadow": `0 0 12px ${theme.colorAccent}66, 0 0 4px ${theme.colorAccent}33`,
        "--ln-btn-backdrop": "none",
      };

    case "glass": {
      const isRgba = theme.colorSurface.startsWith("rgba");
      return {
        "--ln-btn-bg": isRgba ? theme.colorSurface : `${theme.colorSurface}20`,
        "--ln-btn-text": theme.colorPrimary,
        "--ln-btn-border-w": "1px",
        "--ln-btn-border-c": isRgba ? "rgba(255,255,255,0.1)" : `${theme.colorSurface}30`,
        "--ln-btn-shadow": "none",
        "--ln-btn-backdrop": "blur(12px)",
      };
    }

    case "ghost":
    case "minimal":
      return {
        "--ln-btn-bg": "transparent",
        "--ln-btn-text": theme.colorPrimary,
        "--ln-btn-border-w": "0px",
        "--ln-btn-border-c": "transparent",
        "--ln-btn-shadow": "none",
        "--ln-btn-backdrop": "none",
      };

    case "filled":
    default:
      return {
        "--ln-btn-bg": theme.colorSurface,
        "--ln-btn-text": theme.colorPrimary,
        "--ln-btn-border-w": "0px",
        "--ln-btn-border-c": "transparent",
        "--ln-btn-shadow": pageShadow,
        "--ln-btn-backdrop": "none",
      };
  }
}

/**
 * Convert ThemeTokens to CSS custom properties for injection on the root element.
 */
export function themeToCssVars(theme: ThemeTokens): Record<string, string> {
  return {
    "--ln-color-bg": theme.colorBackground,
    "--ln-color-surface": theme.colorSurface,
    "--ln-color-primary": theme.colorPrimary,
    "--ln-color-secondary": theme.colorSecondary,
    "--ln-color-text": theme.colorText,
    "--ln-color-text-muted": theme.colorTextMuted,
    "--ln-color-accent": theme.colorAccent,

    "--ln-font-heading": theme.fontHeading,
    "--ln-font-body": theme.fontBody,
    "--ln-font-size-base": `${theme.fontSizeBase}px`,
    // A real heading scale. The page title and a header block both rendered at
    // base * 1.25, so the h1 had no visual precedence over an h2 — the ratio
    // was exactly 1.0 on every template.
    "--ln-font-size-h1": `${Math.round(theme.fontSizeBase * 1.75)}px`,
    "--ln-font-size-h2": `${Math.round(theme.fontSizeBase * 1.25)}px`,
    "--ln-font-weight-heading": `${theme.fontWeightHeading}`,
    "--ln-line-height-body": `${theme.lineHeightBody}`,

    "--ln-spacing-unit": `${theme.spacingUnit}px`,
    "--ln-content-max-width": `${theme.contentMaxWidth}px`,
    "--ln-block-gap": `${theme.blockGap}px`,
    "--ln-page-px": `${theme.pagePaddingX}px`,
    "--ln-page-py": `${theme.pagePaddingY}px`,

    "--ln-border-radius": `${theme.borderRadius}px`,
    "--ln-border-width": `${theme.borderWidth}px`,
    "--ln-border-color": theme.borderColor,

    "--ln-btn-radius": `${theme.buttonRadius}px`,
    "--ln-btn-px": `${theme.buttonPaddingX}px`,
    "--ln-btn-py": `${theme.buttonPaddingY}px`,

    // Button style vars (spread last so pill can override --ln-btn-radius)
    ...computeButtonStyleVars(theme),
  };
}

/**
 * Merge a partial theme update onto an existing theme.
 */
export function mergeTheme(
  base: ThemeTokens,
  partial: Partial<ThemeTokens>,
): ThemeTokens {
  return { ...base, ...partial, version: 1 };
}

// ─── Curated Color Palettes (Free Tier) ─────────────────────────────────────

export interface ColorPalette {
  id: string;
  name: string;
  colors: {
    colorBackground: string;
    colorSurface: string;
    colorPrimary: string;
    colorSecondary: string;
    colorText: string;
    colorTextMuted: string;
    colorAccent: string;
    borderColor: string;
  };
}

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "classic",
    name: "Classic",
    colors: {
      colorBackground: "#FFFFFF",
      colorSurface: "#F8F9FA",
      colorPrimary: "#1A1A2E",
      colorSecondary: "#6C63FF",
      colorText: "#1A1A1A",
      colorTextMuted: "#6B7280",
      colorAccent: "#6C63FF",
      borderColor: "#E5E7EB",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    colors: {
      colorBackground: "#0F0F1A",
      colorSurface: "#1A1A2E",
      colorPrimary: "#E0E0E0",
      colorSecondary: "#7C7CFF",
      colorText: "#E8E8E8",
      colorTextMuted: "#9CA3AF",
      colorAccent: "#7C7CFF",
      borderColor: "#2D2D44",
    },
  },
  {
    id: "warm",
    name: "Warm",
    colors: {
      colorBackground: "#FFF8F0",
      colorSurface: "#FFF0E0",
      colorPrimary: "#8B4513",
      colorSecondary: "#E07C4F",
      colorText: "#3D2B1F",
      colorTextMuted: "#856E52",
      colorAccent: "#E07C4F",
      borderColor: "#E8D5C4",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    colors: {
      colorBackground: "#F0F7FF",
      colorSurface: "#E0EFFF",
      colorPrimary: "#1E3A5F",
      colorSecondary: "#3B82F6",
      colorText: "#1A2A3A",
      colorTextMuted: "#627288",
      colorAccent: "#3B82F6",
      borderColor: "#CBD5E1",
    },
  },
  {
    id: "rose",
    name: "Rose",
    colors: {
      colorBackground: "#FFF5F7",
      colorSurface: "#FFE4E8",
      colorPrimary: "#831843",
      colorSecondary: "#EC4899",
      colorText: "#2D1B28",
      colorTextMuted: "#876977",
      colorAccent: "#EC4899",
      borderColor: "#F3D1D8",
    },
  },
];

// ─── System Fonts (Free Tier) ───────────────────────────────────────────────

export const SYSTEM_FONTS = [
  { id: "georgia", name: "Georgia", value: "Georgia, serif" },
  {
    id: "helvetica",
    name: "Helvetica",
    value: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  { id: "inter", name: "Inter", value: "Inter, system-ui, sans-serif" },
  { id: "mono", name: "Mono", value: "ui-monospace, monospace" },
  {
    id: "system",
    name: "System",
    value: "system-ui, -apple-system, sans-serif",
  },
  {
    id: "times",
    name: "Times",
    value: "'Times New Roman', Times, serif",
  },
];

// ─── Google Fonts (Pro Tier) ────────────────────────────────────────────────

export const GOOGLE_FONTS = [
  { id: "archivo", name: "Archivo", value: "'Archivo', sans-serif" },
  { id: "barlow", name: "Barlow", value: "'Barlow', sans-serif" },
  { id: "bitter", name: "Bitter", value: "'Bitter', serif" },
  { id: "cabin", name: "Cabin", value: "'Cabin', sans-serif" },
  { id: "crimson-text", name: "Crimson Text", value: "'Crimson Text', serif" },
  { id: "dm-sans", name: "DM Sans", value: "'DM Sans', sans-serif" },
  { id: "dm-serif", name: "DM Serif Display", value: "'DM Serif Display', serif" },
  { id: "fira-sans", name: "Fira Sans", value: "'Fira Sans', sans-serif" },
  { id: "inconsolata", name: "Inconsolata", value: "'Inconsolata', monospace" },
  { id: "jetbrains-mono", name: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { id: "josefin", name: "Josefin Sans", value: "'Josefin Sans', sans-serif" },
  { id: "karla", name: "Karla", value: "'Karla', sans-serif" },
  { id: "lato", name: "Lato", value: "'Lato', sans-serif" },
  { id: "libre-baskerville", name: "Libre Baskerville", value: "'Libre Baskerville', serif" },
  { id: "lora", name: "Lora", value: "'Lora', serif" },
  { id: "merriweather", name: "Merriweather", value: "'Merriweather', serif" },
  { id: "montserrat", name: "Montserrat", value: "'Montserrat', sans-serif" },
  { id: "nunito", name: "Nunito", value: "'Nunito', sans-serif" },
  { id: "open-sans", name: "Open Sans", value: "'Open Sans', sans-serif" },
  { id: "overpass", name: "Overpass", value: "'Overpass', sans-serif" },
  { id: "playfair", name: "Playfair Display", value: "'Playfair Display', serif" },
  { id: "poppins", name: "Poppins", value: "'Poppins', sans-serif" },
  { id: "quicksand", name: "Quicksand", value: "'Quicksand', sans-serif" },
  { id: "raleway", name: "Raleway", value: "'Raleway', sans-serif" },
  { id: "roboto", name: "Roboto", value: "'Roboto', sans-serif" },
  { id: "rubik", name: "Rubik", value: "'Rubik', sans-serif" },
  { id: "sora", name: "Sora", value: "'Sora', sans-serif" },
  { id: "source-serif", name: "Source Serif 4", value: "'Source Serif 4', serif" },
  { id: "space-grotesk", name: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { id: "work-sans", name: "Work Sans", value: "'Work Sans', sans-serif" },
];

// ─── Button Styles ──────────────────────────────────────────────────────────

export const FREE_BUTTON_STYLES = [
  "filled",
  "outline",
  "pill",
] as const;

export const PRO_BUTTON_STYLES = [
  "filled",
  "outline",
  "pill",
  "shadow",
  "neon",
  "glass",
] as const;

export const ALL_BUTTON_STYLES = PRO_BUTTON_STYLES;

// ─── Block-Level Style Overrides ─────────────────────────────────────────────

export const VALID_VARIANTS = ["primary", "secondary", "outline", "subtle"] as const;
export type BlockVariant = (typeof VALID_VARIANTS)[number];

export interface BlockStyleOverrides {
  variant?: BlockVariant;
  buttonStyle?: ThemeTokens["buttonStyle"];
  bgColor?: string;
  textColor?: string;
  borderRadius?: number;
  shadow?: "none" | "sm" | "md";
}

/**
 * Resolve preset variant → partial style overrides derived from the active theme.
 */
function resolveVariant(
  theme: ThemeTokens,
  variant: BlockVariant,
): Record<string, string> {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: theme.colorSurface,
        color: theme.colorPrimary,
      };
    case "secondary":
      return {
        backgroundColor: theme.colorSecondary + "20",
        color: theme.colorText,
      };
    case "outline":
      return {
        backgroundColor: "transparent",
        color: theme.colorText,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: theme.borderColor,
      };
    case "subtle":
      return {
        backgroundColor: theme.colorBackground,
        color: theme.colorTextMuted,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: theme.borderColor + "60",
      };
  }
}

const SHADOW_MAP: Record<string, string> = {
  none: "none",
  sm: "0 1px 3px rgba(0,0,0,0.08)",
  md: "0 4px 14px rgba(0,0,0,0.15)",
  lg: "0 8px 30px rgba(0,0,0,0.2)",
};

/**
 * Compute resolved inline styles for a single block based on its overrides.
 * Returns Record<string, string> (framework-agnostic).
 * Cast to React.CSSProperties at component boundaries.
 */
export function computeBlockResolvedStyle(
  theme: ThemeTokens,
  overrides: BlockStyleOverrides,
): Record<string, string> {
  if (!overrides || Object.keys(overrides).length === 0) {
    return {};
  }

  // 1. Start from variant if set
  let style: Record<string, string> = {};
  if (overrides.variant) {
    style = resolveVariant(theme, overrides.variant);
  }

  // 2. Apply buttonStyle override — compute vars and map to inline props
  if (overrides.buttonStyle) {
    const btnVars = computeButtonStyleVars({
      ...theme,
      buttonStyle: overrides.buttonStyle,
    });
    if (btnVars["--ln-btn-bg"]) style.backgroundColor = btnVars["--ln-btn-bg"];
    if (btnVars["--ln-btn-text"]) style.color = btnVars["--ln-btn-text"];
    if (btnVars["--ln-btn-border-w"]) style.borderWidth = btnVars["--ln-btn-border-w"];
    if (btnVars["--ln-btn-border-c"]) style.borderColor = btnVars["--ln-btn-border-c"];
    if (btnVars["--ln-btn-shadow"]) style.boxShadow = btnVars["--ln-btn-shadow"];
    if (btnVars["--ln-btn-backdrop"]) style.backdropFilter = btnVars["--ln-btn-backdrop"];
    if (btnVars["--ln-btn-radius"]) style.borderRadius = btnVars["--ln-btn-radius"];
  }

  // 3. Layer Pro custom overrides on top (these win over buttonStyle)
  if (overrides.bgColor) {
    style.backgroundColor = overrides.bgColor;
  }
  if (overrides.textColor) {
    style.color = overrides.textColor;
  }
  if (overrides.borderRadius !== undefined) {
    style.borderRadius = `${overrides.borderRadius}px`;
  }
  if (overrides.shadow) {
    style.boxShadow = SHADOW_MAP[overrides.shadow] ?? "none";
  }

  // 4. Auto-contrast: if bgColor set but textColor missing, flip text
  if (overrides.bgColor && !overrides.textColor) {
    style.color = getContrastColor(overrides.bgColor);
  }

  return style;
}

/**
 * A featured link is the page's main call to action: the theme's primary
 * colour with a contrasting label, slightly larger. Explicit per-block style
 * overrides (Pro) are layered on top and still win.
 */
export function featuredLinkStyle(theme: ThemeTokens): Record<string, string> {
  return {
    backgroundColor: theme.colorPrimary,
    color: getContrastColor(theme.colorPrimary),
    borderColor: theme.colorPrimary,
    fontWeight: "600",
    padding: "calc(var(--ln-btn-py) * 1.25) var(--ln-btn-px)",
  };
}
