import type { SaveEntity, SaveOutcome, SavePatch } from "./save-coordinator";

type ActionResult = { error?: string } | undefined | null;

export type EditorActions = {
  updateBlock: (input: { id: string } & SavePatch) => Promise<ActionResult>;
  updatePage: (input: { pageId: string } & SavePatch) => Promise<ActionResult>;
  updateBanner: (input: { pageId: string; banner: unknown }) => Promise<ActionResult>;
};

/**
 * Send one merged patch to the right server action. Block patches go to
 * updateBlock. Page patches are split: the banner has its own action (its
 * link is Safe-Browsing scanned), every other field goes to updatePage.
 */
export async function persistPatch(
  pageId: string,
  entity: SaveEntity,
  patch: SavePatch,
  actions: EditorActions,
): Promise<SaveOutcome> {
  if (entity.kind === "block") {
    const result = await actions.updateBlock({ id: entity.id, ...patch });
    return result?.error ? { ok: false, error: result.error } : { ok: true };
  }

  const { banner, ...fields } = patch;
  if (banner !== undefined) {
    const result = await actions.updateBanner({ pageId, banner });
    if (result?.error) return { ok: false, error: result.error };
  }
  if (Object.keys(fields).length > 0) {
    const result = await actions.updatePage({ pageId, ...fields });
    if (result?.error) return { ok: false, error: result.error };
  }
  return { ok: true };
}
