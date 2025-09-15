// Helper to build URLs that respect NEXT_PUBLIC_BASE_PATH for GitHub Pages
// Usage: withBase('/store-seed/index.json')
const RAW_BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const BASE = (() => {
  if (!RAW_BASE) return '';
  // Ensure leading slash and no trailing slash
  let b = RAW_BASE.startsWith('/') ? RAW_BASE : `/${RAW_BASE}`;
  if (b !== '/' && b.endsWith('/')) b = b.slice(0, -1);
  return b;
})();

export function withBase(path = '') {
  const p = String(path || '');
  if (!p) return BASE || '/';
  // Ensure the provided path starts with a single slash
  const normalized = p.startsWith('/') ? p : `/${p}`;
  return `${BASE}${normalized}` || normalized;
}
