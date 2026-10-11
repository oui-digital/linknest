import { Source_Serif_4 } from "next/font/google";

/**
 * Self-hosted Source Serif 4. Generated from GOOGLE_FONTS (src/lib/templates/theme.ts);
 * next/font needs literal arguments, so the weights are repeated here and a
 * test keeps them equal to the shared list.
 */
export const WEIGHTS = ["400", "500", "700"] as const;

export const font = Source_Serif_4({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
