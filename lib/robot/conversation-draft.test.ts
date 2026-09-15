import { expect, mock, test } from "bun:test";
import { ConversationDraft } from "./conversation-draft";

test("a failed creation holds all messages until the same binding is retried", async () => {
  const create = mock(async (): Promise<string> => { throw new Error("503"); });
  const draft = new ConversationDraft(create, () => {}, null);
  const filed: string[] = [];
  const first = draft.thread.then((id) => filed.push(`${id}:prompt`));
  const second = draft.thread.then((id) => filed.push(`${id}:reply`));
  await draft.retry();
  expect(draft.failure).toContain("messages are held");
  expect(filed).toEqual([]);
  create.mockImplementation(async () => "original-task");
  await draft.retry();
  await Promise.all([first, second]);
  expect(filed).toEqual(["original-task:prompt", "original-task:reply"]);
  expect(draft.failure).toBeNull();
  await draft.retry();
  expect(create).toHaveBeenCalledTimes(2);
});

test("concurrent retries create one task", async () => {
  let resolve!: (id: string) => void;
  const create = mock(() => new Promise<string>((r) => { resolve = r; }));
  const draft = new ConversationDraft(create, () => {});
  const retry = draft.retry();
  await draft.retry();
  resolve("one");
  await retry;
  expect(await draft.thread).toBe("one");
  expect(create).toHaveBeenCalledTimes(1);
});

test("disposing a draft cancels creation and settles waiting writers", async () => {
  let signal!: AbortSignal;
  const draft = new ConversationDraft(async (s) => {
    signal = s;
    return new Promise((_, reject) => s.addEventListener("abort", () => reject(s.reason), { once: true }));
  }, () => {});
  const retry = draft.retry();
  draft.dispose();
  await expect(draft.thread).rejects.toThrow("disconnected");
  await retry;
  expect(signal.aborted).toBe(true);
});

test("a failed creation retries on its own until the api answers", async () => {
  let calls = 0;
  const create = mock(async (): Promise<string> => { if (++calls < 3) throw new Error("503"); return "late-task"; });
  const draft = new ConversationDraft(create, () => {}, () => 1);
  await draft.retry();
  expect(draft.failure).toContain("held in this tab");
  expect(await draft.thread).toBe("late-task");
  expect(create).toHaveBeenCalledTimes(3);
  expect(draft.failure).toBeNull();
});

test("disposing a draft cancels its scheduled retry", async () => {
  const create = mock(async (): Promise<string> => { throw new Error("503"); });
  const draft = new ConversationDraft(create, () => {}, () => 1);
  await draft.retry();
  draft.dispose();
  await Bun.sleep(5);
  expect(create).toHaveBeenCalledTimes(1);
});
