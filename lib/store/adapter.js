// Minimal IndexedDB adapter (no external deps). JS-only.
// Stores:
// - docs: key = $id (string), value = full JSON doc
// - blobs: key = sha256-<hex>, value = { data: Blob, meta: { mime, size, createdAt, filename? } }
// - meta: key = string, value = any

const DB_NAME = "spoke_store_v1";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs");
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const store = {
  async putDoc(doc) {
    if (!doc || typeof doc.$id !== "string") throw new Error("putDoc: doc.$id required");
    await tx("docs", "readwrite", (s) => s.put(doc, doc.$id));
  },
  async deleteDoc(id) {
    if (!id || typeof id !== "string") throw new Error("deleteDoc: id required");
    await tx("docs", "readwrite", (s) => s.delete(id));
  },
  async getDoc(id) {
    return await tx("docs", "readonly", (s) => new Promise((res, rej) => {
      const r = s.get(id);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => rej(r.error);
    }));
  },
  async listDocHeaders(prefix = "") {
    // Simple full scan; can be optimized later.
    return await tx("docs", "readonly", (s) => new Promise((res, rej) => {
      const results = [];
      const cursorReq = s.openCursor();
      cursorReq.onsuccess = () => {
        const cur = cursorReq.result;
        if (cur) {
          const doc = cur.value;
          if (!prefix || String(cur.key).startsWith(prefix)) {
            results.push({ $id: doc.$id, $type: doc.$type, meta: doc.meta, name: doc.name || doc.$id });
          }
          cur.continue();
        } else {
          res(results);
        }
      };
      cursorReq.onerror = () => rej(cursorReq.error);
    }));
  },
  async putBlob(hash, blob, meta = {}) {
    if (typeof hash !== "string" || !hash.startsWith("sha256-")) throw new Error("putBlob: key must be sha256-<hex>");
    const record = { data: blob, meta: { ...meta, size: blob?.size ?? meta.size ?? 0, createdAt: meta.createdAt || new Date().toISOString() } };
    await tx("blobs", "readwrite", (s) => s.put(record, hash));
  },
  async getBlob(hash) {
    return await tx("blobs", "readonly", (s) => new Promise((res, rej) => {
      const r = s.get(hash);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => rej(r.error);
    }));
  },
  async hasBlob(hash) {
    return await tx("blobs", "readonly", (s) => new Promise((res, rej) => {
      const r = s.getKey(hash);
      r.onsuccess = () => res(!!r.result);
      r.onerror = () => rej(r.error);
    }));
  },
  async getMeta(key) {
    return await tx("meta", "readonly", (s) => new Promise((res, rej) => {
      const r = s.get(key);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => rej(r.error);
    }));
  },
  async setMeta(key, value) {
    await tx("meta", "readwrite", (s) => s.put(value, key));
  },
  async hashBlob(blob) {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `sha256-${hex}`;
  },
};
