/** A realistic desktop UA — some shops 403 the default Node fetch agent. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchText(url: string): Promise<string> {
  // Browser-like HTML Accept — NOT application/json: some faceted-search shops
  // (PrestaShop) serve a stripped AJAX variant when the Accept header prefers
  // JSON, which drops the JSON-LD / product markup we parse.
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
