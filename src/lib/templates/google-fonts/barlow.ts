import { Barlow } from "next/font/google";

/**
 * Self-hosted Barlow. Generated from GOOGLE_FONTS (src/lib/templates/theme.ts);
 * next/font needs literal arguments, so the weights are repeated here and a
 * test keeps them equal to the shared list.
 */
export const WEIGHTS = ["400", "500", "700"] as const;

export const font = Barlow({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
