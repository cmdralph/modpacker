export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'rate-limit' | 'parse' | 'aborted' | 'config';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'aborted';
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  /** Hard timeout for the request; defaults to 20 s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Wraps the caller's signal with a timeout so slow APIs fail predictably,
 * and tells user aborts apart from timeouts.
 */
function linkSignals(outer: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

async function request(url: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', headers = {}, body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const linked = linkSignals(signal, timeoutMs);
  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: linked.signal,
    });
  } catch (error) {
    if (linked.didTimeout()) {
      throw new ApiError('timeout', `The request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    if (signal?.aborted) throw new ApiError('aborted', 'Request cancelled.');
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError('network', `Network error – the API could not be reached (${detail}).`);
  } finally {
    linked.dispose();
  }

  if (response.status === 429) {
    throw new ApiError('rate-limit', 'Rate limited by the API. Wait a moment and try again.', 429);
  }
  if (!response.ok) {
    throw new ApiError('http', `The API responded with ${response.status} ${response.statusText}.`, response.status);
  }
  return response;
}

export async function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(url, options);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('parse', 'The API returned malformed JSON.', response.status);
  }
}

export async function fetchBytes(url: string, options: RequestOptions = {}): Promise<Uint8Array> {
  const response = await request(url, { timeoutMs: 120_000, ...options, headers: { Accept: '*/*', ...options.headers } });
  return new Uint8Array(await response.arrayBuffer());
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
