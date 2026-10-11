import { DM_Serif_Display } from "next/font/google";

/**
 * Self-hosted DM Serif Display. Generated from GOOGLE_FONTS (src/lib/templates/theme.ts);
 * next/font needs literal arguments, so the weights are repeated here and a
 * test keeps them equal to the shared list.
 */
export const WEIGHTS = ["400"] as const;

export const font = DM_Serif_Display({
  weight: ["400"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
