/** JSON fetch helper: throws an Error with the server's `error` message on failure. */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
