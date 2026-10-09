"use client";

import { createContext, useContext } from "react";
import type { TurnstileClientConfig } from "@/lib/turnstile-types";

/**
 * Values the interactive blocks need at runtime: whether they are on the
 * public page or in the editor preview, which page they belong to, and the
 * configuration for blocks that talk to the server (bot protection, list
 * state).
 *
 * Only client components read this. Server components cannot use context, so
 * static blocks receive `mode` as a prop instead. PublicPageView renders the
 * provider for every entry point — the public page, the dashboard preview and
 * the editor's phone frame — so no interactive block can end up without one.
 */
export type BlockRuntime = {
  mode: "public" | "preview";
  pageId: string;
  turnstile?: TurnstileClientConfig;
  /** Whether the page's email list accepts sign-ups (plan cap not reached). */
  listOpen?: boolean;
};

const BlockRuntimeContext = createContext<BlockRuntime | null>(null);

export function BlockRuntimeProvider({
  value,
  children,
}: {
  value: BlockRuntime;
  children: React.ReactNode;
}) {
  return (
    <BlockRuntimeContext.Provider value={value}>
      {children}
    </BlockRuntimeContext.Provider>
  );
}

export function useBlockRuntime(): BlockRuntime {
  const value = useContext(BlockRuntimeContext);
  if (!value) {
    throw new Error(
      "useBlockRuntime() needs a BlockRuntimeProvider; render blocks through PublicPageView.",
    );
  }
  return value;
}
