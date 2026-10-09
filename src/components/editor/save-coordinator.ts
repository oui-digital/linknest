/**
 * Serialises the editor's writes.
 *
 * One coordinator per editor session; one queue per entity (a block, or the
 * page record). Edits arrive as patches and are merged into a single pending
 * patch per entity, sent after a short pause in typing, with exactly one
 * request in flight per entity: a patch that arrives while a request is out
 * waits for it and goes next. The editor updates its own state optimistically
 * before enqueueing and always sends `content` whole, so a later value simply
 * replaces an earlier one and nothing typed in between is lost.
 *
 * Failure keeps everything. The refused patch is put back underneath whatever
 * has been typed since, the entity is marked `failed` with the server's
 * message, and the next edit or an explicit retry sends it all again. Nothing
 * is rolled back — a visible, flagged error beats silently losing a sentence.
 *
 * `flushAll()` is what publishing awaits: it sends every pending patch, retries
 * every failed one, and reports which entities still could not be saved, so a
 * publish never goes out over unsaved or rejected edits.
 *
 * Before this, `updateBlock` ran on every keystroke (burning the 30/min
 * mutation budget and rejecting half-typed URLs, which rolled the field back)
 * and the settings panel's per-field timers were cleared on unmount, so
 * switching tabs dropped unsaved text.
 */

export type SaveEntity = { kind: "block"; id: string } | { kind: "page" };
export type SavePatch = Record<string, unknown>;
export type SaveStatus = "idle" | "pending" | "saving" | "failed";
export type SaveOutcome = { ok: true } | { ok: false; error: string };
export type FlushResult =
  | { ok: true }
  | { ok: false; failed: { entity: SaveEntity; error: string }[] };
export type SaveFn = (entity: SaveEntity, patch: SavePatch) => Promise<SaveOutcome>;

export const SAVE_DEBOUNCE_MS = 500;
export const SAVE_FAILED_MESSAGE = "Couldn't save your changes. Please try again.";
export const STILL_SAVING_MESSAGE = "Still saving your latest changes. Try again in a moment.";
const MAX_FLUSH_PASSES = 20;

export function saveEntityKey(entity: SaveEntity): string {
  return entity.kind === "block" ? `block:${entity.id}` : "page";
}

/** Later values win. `content` is always sent whole, so it is replaced, not merged. */
export function mergeSavePatch(base: SavePatch, next: SavePatch): SavePatch {
  return { ...base, ...next };
}

type Entry = {
  entity: SaveEntity;
  pending: SavePatch | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<SaveOutcome> | null;
  status: SaveStatus;
  error: string | null;
  suspended: boolean;
};

export class SaveCoordinator {
  private readonly entries = new Map<string, Entry>();
  private readonly holds = new Set<Promise<void>>();
  private save: SaveFn;
  private readonly onChange: (() => void) | undefined;
  private readonly debounceMs: number;
  private disposed = false;

  constructor({
    save,
    onChange,
    debounceMs = SAVE_DEBOUNCE_MS,
  }: {
    save: SaveFn;
    onChange?: () => void;
    debounceMs?: number;
  }) {
    this.save = save;
    this.onChange = onChange;
    this.debounceMs = debounceMs;
  }

  /** The editor's save callback changes identity across renders; keep the latest. */
  setSaver(save: SaveFn): void {
    this.save = save;
  }

  enqueue(
    entity: SaveEntity,
    patch: SavePatch,
    { immediate = false }: { immediate?: boolean } = {},
  ): void {
    const entry = this.entry(entity);
    entry.pending = mergeSavePatch(entry.pending ?? {}, patch);
    if (entry.suspended) {
      this.setStatus(entry, "pending", null);
      return;
    }
    if (entry.inFlight) {
      // Goes out as soon as the current request settles (see send()).
      this.setStatus(entry, "saving", null);
      return;
    }
    this.setStatus(entry, "pending", null);
    this.schedule(entry, immediate ? 0 : this.debounceMs);
  }

  /** Send whatever this entity has pending now and wait for it. */
  flush(entity: SaveEntity): Promise<SaveOutcome> {
    const entry = this.entries.get(saveEntityKey(entity));
    return entry ? this.drain(entry) : Promise.resolve({ ok: true });
  }

  /**
   * Send everything pending, retry everything failed, report what still failed.
   *
   * Resolves `ok` only once nothing at all is unsaved. Edits made while the
   * flush runs (to any entity, including ones already drained or never
   * touched before) are picked up by the next pass, so a publish that awaits
   * this never goes out over an edit made before it resolved.
   */
  async flushAll(): Promise<FlushResult> {
    for (let pass = 0; pass < MAX_FLUSH_PASSES; pass++) {
      // A delete in flight decides whether its block's edits still matter:
      // wait for it, so a refused delete puts them back before we check.
      while (this.holds.size > 0) await Promise.allSettled([...this.holds]);
      const outcomes = await Promise.all(
        [...this.entries.values()]
          .filter((entry) => !entry.suspended)
          .map(async (entry) => ({ entity: entry.entity, outcome: await this.drain(entry) })),
      );
      const failed = outcomes.flatMap(({ entity, outcome }) =>
        outcome.ok ? [] : [{ entity, error: outcome.error }],
      );
      if (failed.length > 0) return { ok: false, failed };
      // A suspended entity's block is being deleted; its work is moot.
      const active = [...this.entries.values()].filter((e) => !e.suspended);
      if (!active.some((e) => e.pending || e.inFlight || e.status === "failed")) return { ok: true };
    }
    // Still changing after many passes (the owner kept typing): not settled.
    return {
      ok: false,
      failed: [...this.entries.values()]
        .filter((entry) => !entry.suspended && (entry.pending || entry.inFlight))
        .map((entry) => ({ entity: entry.entity, error: STILL_SAVING_MESSAGE })),
    };
  }

  /**
   * Hold an entity's pending work without sending or dropping it, while an
   * operation that may remove it (a delete) is in flight. resume() puts it
   * back in the queue; forget() drops it once the removal is confirmed.
   */
  /**
   * Suspend an entity for the duration of an operation that may remove it,
   * then forget its work if the operation reports removal, or resume it if
   * not. flushAll() waits for every such operation, so a publish started
   * during a delete cannot pass while the delete may still be refused.
   */
  holdWhile(entity: SaveEntity, removed: Promise<boolean>): Promise<void> {
    this.suspend(entity);
    const settled = removed
      .catch(() => false)
      .then((gone) => {
        if (gone) this.forget(entity);
        else this.resume(entity);
      })
      .finally(() => {
        this.holds.delete(settled);
        this.onChange?.();
      });
    this.holds.add(settled);
    this.onChange?.();
    return settled;
  }

  /** Whether an operation that may remove an entity (a delete) is in flight. */
  isHolding(): boolean {
    return this.holds.size > 0;
  }

  suspend(entity: SaveEntity): void {
    const entry = this.entries.get(saveEntityKey(entity));
    if (!entry) return;
    entry.suspended = true;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  }

  resume(entity: SaveEntity): void {
    const entry = this.entries.get(saveEntityKey(entity));
    if (!entry || !entry.suspended) return;
    entry.suspended = false;
    if (entry.pending && !entry.inFlight && entry.status !== "failed") {
      this.schedule(entry, this.debounceMs);
    }
  }

  /** A failed entity keeps its patch; retrying simply sends it again. */
  retry(entity: SaveEntity): Promise<SaveOutcome> {
    return this.flush(entity);
  }

  /** Drop an entity's unsaved work (the block was deleted). */
  forget(entity: SaveEntity): void {
    const key = saveEntityKey(entity);
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.entries.delete(key);
    this.onChange?.();
  }

  status(entity: SaveEntity): SaveStatus {
    return this.entries.get(saveEntityKey(entity))?.status ?? "idle";
  }

  error(entity: SaveEntity): string | null {
    return this.entries.get(saveEntityKey(entity))?.error ?? null;
  }

  hasUnsaved(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.pending || entry.inFlight || entry.status === "failed") return true;
    }
    return false;
  }

  hasFailed(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.status === "failed") return true;
    }
    return false;
  }

  /**
   * Stop scheduling. Pending work is sent at once rather than dropped: the
   * editor unmounts on client-side navigation, which never fires beforeunload.
   */
  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      if (entry.pending && !entry.inFlight) void this.send(entry);
    }
  }

  private entry(entity: SaveEntity): Entry {
    const key = saveEntityKey(entity);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        entity,
        pending: null,
        timer: null,
        inFlight: null,
        status: "idle",
        error: null,
        suspended: false,
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private setStatus(entry: Entry, status: SaveStatus, error: string | null): void {
    if (entry.status === status && entry.error === error) return;
    entry.status = status;
    entry.error = error;
    this.onChange?.();
  }

  private schedule(entry: Entry, delay: number): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.send(entry);
    }, delay);
  }

  /** Wait for the in-flight request, send what is pending, stop at the first failure. */
  private async drain(entry: Entry): Promise<SaveOutcome> {
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    for (;;) {
      if (entry.inFlight) {
        const outcome = await entry.inFlight;
        if (!outcome.ok) return outcome;
        continue;
      }
      if (!entry.pending) {
        return entry.status === "failed" && entry.error
          ? { ok: false, error: entry.error }
          : { ok: true };
      }
      const outcome = await this.send(entry);
      if (!outcome.ok) return outcome;
    }
  }

  private send(entry: Entry): Promise<SaveOutcome> {
    if (entry.inFlight) return entry.inFlight;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    const patch = entry.pending;
    if (!patch) {
      return Promise.resolve(
        entry.status === "failed" && entry.error
          ? { ok: false, error: entry.error }
          : { ok: true },
      );
    }

    entry.pending = null;
    this.setStatus(entry, "saving", null);

    const request = Promise.resolve()
      .then(() => this.save(entry.entity, patch))
      .catch((): SaveOutcome => ({ ok: false, error: SAVE_FAILED_MESSAGE }))
      .then((outcome) => {
        entry.inFlight = null;
        if (outcome.ok) {
          if (entry.pending) {
            this.setStatus(entry, "pending", null);
            if (entry.suspended) {
              // held until resume() or forget()
            } else if (this.disposed) void this.send(entry);
            else this.schedule(entry, this.debounceMs);
          } else {
            this.setStatus(entry, "idle", null);
          }
        } else {
          // Keep every unsaved value: what was just refused, underneath
          // anything typed since.
          entry.pending = mergeSavePatch(patch, entry.pending ?? {});
          this.setStatus(entry, "failed", outcome.error);
        }
        return outcome;
      });

    entry.inFlight = request;
    return request;
  }
}
