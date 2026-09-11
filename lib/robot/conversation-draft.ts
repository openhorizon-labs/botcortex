/** Messages wait on this binding even if the first conversation POST fails.
 * A retry resolves the SAME promise, never the currently selected task. */
export class ConversationDraft {
  readonly thread: Promise<string>;
  pending = false;
  failure: string | null = null;
  private settled = false;
  private closed = false;
  private readonly abort = new AbortController();
  private resolve!: (id: string) => void;
  private reject!: (error: Error) => void;

  constructor(
    private readonly create: (signal: AbortSignal) => Promise<string>,
    private readonly onChange: () => void,
  ) {
    this.thread = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    // A draft can be disposed before its first message starts awaiting it.
    void this.thread.catch(() => {});
  }

  async retry(): Promise<void> {
    if (this.closed || this.pending || this.settled) return;
    this.pending = true;
    this.failure = null;
    this.onChange();
    try {
      const id = await this.create(AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]));
      if (this.closed) return;
      if (!id) throw new Error("No task id returned");
      this.settled = true;
      this.resolve(id);
    } catch {
      if (!this.closed) this.failure = "Could not create the task — its messages are held in this tab. Retry to save.";
    } finally {
      this.pending = false;
      if (!this.closed) this.onChange();
    }
  }

  dispose() {
    this.closed = true;
    this.abort.abort();
    if (!this.settled) this.reject(new Error("Task storage was disconnected"));
  }
}
