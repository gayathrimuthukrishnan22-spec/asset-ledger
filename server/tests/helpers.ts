export const BASE_URL = (process.env.TEST_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const API_KEY = process.env.TEST_SERVICE_API_KEY ?? '';

// Unique per test run so re-running never hits the "one Addition per asset" rule
// or an externalRef that was already used.
export const RUN = Date.now().toString(36).toUpperCase();
export const assetNo = (n: number | string) => `VT-${RUN}-${n}`;
export const refNo = (n: number | string) => `VT-REF-${RUN}-${n}`;

export async function call(
  method: 'GET' | 'POST',
  path: string,
  opts: { body?: unknown; key?: string | null; headers?: Record<string, string> } = {}
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const key = opts.key === undefined ? API_KEY : opts.key;
  if (key) headers['x-api-key'] = key;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

// Same Addition body the Postman collection uses.
export const additionFields = () => ({
  book: 'Federal Tax',
  company: '5B',
  assetClass: '00.12',
  cost: 120000,
  placedInService: '2026-03-15',
  quarter: 'Q1 (Jan–Mar)'
});

export async function serverIsUp(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE_URL}/api/health`);
    return r.status === 200;
  } catch {
    return false;
  }
}
