/** Cookie-authenticated work belongs to the account that created it. */
export const ACCOUNT_HEADER = "x-botcortex-account";
export const ACCOUNT_MISMATCH_HEADER = "x-botcortex-account-mismatch";

export class AccountChangedError extends Error {
  constructor() {
    super("The signed-in account changed. Reconnect under the current account.");
    this.name = "AccountChangedError";
  }
}

export async function currentAccount(signal?: AbortSignal): Promise<string | null> {
  const deadline = AbortSignal.timeout(4000);
  const response = await fetch("/api/me", {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Could not verify the current account. Retry when the account service is available.");
  const data = await response.json();
  if (typeof data?.user?.id !== "string" || !data.user.id) throw new Error("The account service returned no account identity.");
  return data.user.id;
}

/** Recheck before each network write/model call, including retries after a
 * cross-tab login change. The lifetime signal cancels work on provider teardown.
 * The API remains responsible for authorization at the data boundary. */
export function accountFetcher(
  owner: string | null,
  lifetime: AbortSignal,
  onChanged: () => void,
) {
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    const signal = init.signal ? AbortSignal.any([lifetime, init.signal]) : lifetime;
    signal.throwIfAborted();
    if (await currentAccount(signal) !== owner) {
      onChanged();
      throw new AccountChangedError();
    }
    signal.throwIfAborted();
    const headers = new Headers(init.headers);
    if (owner) headers.set(ACCOUNT_HEADER, owner);
    const response = await fetch(url, { ...init, headers, signal });
    // The server checks this request's cookie against its intended owner too:
    // the browser cookie may change between the lookup above and this write.
    if (response.headers.get(ACCOUNT_MISMATCH_HEADER) === "1") {
      onChanged();
      throw new AccountChangedError();
    }
    return response;
  };
}
