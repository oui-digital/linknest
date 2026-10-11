/**
 * Counts the editor's writes that bypass the SaveCoordinator.
 *
 * The coordinator only sees block and page-field patches. Theme changes,
 * template switches, resets, block creation, reordering and deletion call
 * their server actions directly, so a status read from the coordinator alone
 * said "Saved" while a template switch was still in flight or after a reorder
 * had been refused. Every such call is wrapped in `track()`; the publish bar
 * reads `pending` and `failed` next to the coordinator's own state.
 *
 * Server actions report refusal as a resolved `{ error }` rather than a
 * rejection; both count as a failure. A later success clears it, since the
 * refused operation was rolled back by its caller and reported in the error
 * banner — nothing is left unsaved.
 */
export class PendingOps {
  pending = 0;
  failed = false;
  private readonly onChange: (() => void) | undefined;

  constructor(onChange?: () => void) {
    this.onChange = onChange;
  }

  track<T>(operation: Promise<T>): Promise<T> {
    this.pending += 1;
    this.onChange?.();
    return operation
      .then(
        (value) => {
          this.failed = isRefusal(value);
          return value;
        },
        (error: unknown) => {
          this.failed = true;
          throw error;
        },
      )
      .finally(() => {
        this.pending -= 1;
        this.onChange?.();
      });
  }

  clearFailed(): void {
    if (!this.failed) return;
    this.failed = false;
    this.onChange?.();
  }
}

function isRefusal(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    Boolean((value as { error?: unknown }).error)
  );
}
