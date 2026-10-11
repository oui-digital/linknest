import { Lato } from "next/font/google";

/**
 * Self-hosted Lato. Generated from GOOGLE_FONTS (src/lib/templates/theme.ts);
 * next/font needs literal arguments, so the weights are repeated here and a
 * test keeps them equal to the shared list.
 */
export const WEIGHTS = ["400", "700", "900"] as const;

export const font = Lato({
  weight: ["400", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
