// Site manifest builder loading from public/store-seed at runtime via fetch.

import { withBase } from "@/lib/basePath";

function stableStringify(obj) {
  // Deterministic stringify: sort keys recursively
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const sorted = Object.keys(obj).sort().reduce((acc, k) => {
      acc[k] = stableStringify(obj[k]);
      return acc;
    }, {});
    return sorted;
  } else if (Array.isArray(obj)) {
    return obj.map((v) => stableStringify(v));
  }
  return obj;
}

function djb2Hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export async function buildManifest() {
  // Reads /store-seed/index.json which lists docs and blobs to include.
  // index.json shape:
  // { "docs": [ { "path": "root.json", "$id": "spoke://docs/root" } ], "blobs": [ { "hash": "sha256-...", "path": "blobs/file.bin", "mime": "...", "size": 123 } ] }
  try {
    const idxRes = await fetch(withBase("/store-seed/index.json"), { cache: "no-store" });
    if (!idxRes.ok) throw new Error(`store-seed index ${idxRes.status}`);
    const index = await idxRes.json();

    const docs = [];
    for (const entry of index.docs || []) {
      const p = String(entry.path || "");
      if (!p) continue;
      const res = await fetch(withBase(`/store-seed/${p}`), { cache: "no-store" });
      if (!res.ok) throw new Error(`store-seed doc ${p} ${res.status}`);
      const doc = await res.json();
      // Enforce $id if provided in index
      if (entry.$id) doc.$id = entry.$id;
      // Mark as site origin (non-authoritative runtime meta)
      doc.meta = { ...(doc.meta || {}), origin: "site" };
      const defSig = computeDefSig(doc);
      docs.push({ $id: doc.$id, doc, defSig, origin: "site" });
    }

    const blobs = (index.blobs || []).map((b) => ({
      hash: b.hash,
      url: b.path ? withBase(`/store-seed/${b.path}`) : undefined,
      mime: b.mime,
      size: b.size,
      filename: b.filename,
    }));

    const manifest = { manifestVersion: 1, docs, blobs };
    const canonical = JSON.stringify(stableStringify({
      manifestVersion: manifest.manifestVersion,
      docs: docs.map((d) => ({ $id: d.$id, defSig: d.defSig })),
      blobs: blobs.map((b) => ({ hash: b.hash, size: b.size, mime: b.mime })),
    }));
    const manifestHash = djb2Hash(canonical);
    return { ...manifest, manifestHash };
  } catch (e) {
    // Fallback to empty manifest if seed is missing
    const manifest = { manifestVersion: 1, docs: [], blobs: [] };
    const manifestHash = djb2Hash(JSON.stringify(stableStringify(manifest)));
    return { ...manifest, manifestHash, error: String(e) };
  }
}

export function computeDefSig(doc) {
  const copy = { ...doc };
  delete copy.meta; // exclude runtime meta
  const canonical = JSON.stringify(stableStringify(copy));
  return djb2Hash(canonical);
}
