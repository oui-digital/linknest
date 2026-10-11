"use client";

import { useReducer, useState } from "react";
import { PendingOps } from "./pending-ops";

/** One PendingOps for the editor's lifetime; changes re-render the caller. */
export function usePendingOps(): PendingOps {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [ops] = useState(() => new PendingOps(rerender));
  return ops;
}
