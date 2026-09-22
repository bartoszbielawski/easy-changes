// Data files are fetched with top-level await rather than imported with
// `with { type: 'json' }`: import attributes only reached every browser in 2025
// (Firefox 138), while fetch + top-level await work in browsers from 2021 on.
// Pages preload these files (<link rel="preload" as="fetch">) so they download in
// parallel instead of one module at a time.

/** Parse a file from data/; throws if it can't be loaded, so the page can say so. */
export async function loadJson(name) {
  const res = await fetch(new URL(`../data/${name}`, import.meta.url));
  if (!res.ok) throw new Error(`Couldn't load data/${name} (${res.status})`);
  return res.json();
}
