"use client";

import { useEffect, useReducer, useState } from "react";
import { SaveCoordinator, type SaveFn } from "./save-coordinator";

/**
 * One SaveCoordinator for the lifetime of the editor.
 *
 * Status changes re-render the caller so components can read
 * `coordinator.status(entity)` during render. Unsaved work is flushed when the
 * tab is hidden and when the editor unmounts (client-side navigation never
 * fires beforeunload), and the browser warns before a full unload while
 * anything is still unsaved.
 */
export function useSaveCoordinator(save: SaveFn): SaveCoordinator {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [coordinator] = useState(
    () => new SaveCoordinator({ save, onChange: rerender }),
  );

  useEffect(() => {
    coordinator.setSaver(save);
  }, [coordinator, save]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (coordinator.hasUnsaved()) event.preventDefault();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void coordinator.flushAll();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      coordinator.dispose();
    };
  }, [coordinator]);

  return coordinator;
}
