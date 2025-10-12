"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Card, Flex, Heading, Button, Separator, Text } from "@radix-ui/themes";
import ObjectTree from "@/components/designer/ObjectTree.jsx";
import ObjectSearchBox from "@/components/designer/ObjectSearchBox.jsx";
import { useSelection } from "@/components/designer/SelectionProvider.jsx";
import { store } from "@/lib/store/adapter";
import { listDocs, safeGetDoc } from "@/lib/store/resolver";
import { withBase } from "@/lib/basePath";

export default function ObjectExplorerPanel() {
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newId, setNewId] = useState("");
  const [newType, setNewType] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [attachParent, setAttachParent] = useState("");
  const [attachSlot, setAttachSlot] = useState("");
  const { activeDocId, setActiveDocId, selectedId, setSelectedId } = useSelection();

  const [idIdx, setIdIdx] = useState(0);
  const [typeIdx, setTypeIdx] = useState(0);
  const [parentIdx, setParentIdx] = useState(0);
  const [slotIdx, setSlotIdx] = useState(0);
  const [showDelConfirm, setShowDelConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [busyReset, setBusyReset] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    const id = selectedId;
    try {
      // Remove inbound references from other docs
      const headers = await listDocs("");
      for (const h of headers) {
        if (!h?.$id || h.$id === id) continue;
        const d = await safeGetDoc(h.$id);
        if (!d || typeof d !== "object") continue;
        let changed = false;
        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith("$")) continue;
          if (Array.isArray(v) && v.some((x) => x === id)) {
            d[k] = v.filter((x) => x !== id);
            changed = true;
          }
        }
        if (changed) {
          const prevVersion = d?.meta?.version ?? 0;
          d.meta = { ...(d.meta || {}), version: prevVersion + 1, updatedAt: new Date().toISOString() };
          await store.putDoc(d);
          try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { $id: d.$id } })); } catch {}
        }
      }
      await store.deleteDoc(id);
      const still = await store.getDoc(id);
      if (still) { alert("Delete failed: object still present in store"); return; }
      try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { $id: id, deleted: true } })); } catch {}
      setSelectedId((prev) => (prev === id ? null : prev));
      setActiveDocId((prev) => (prev === id ? null : prev));
      setShowDelConfirm(false);
    } catch (e) {
      alert(e?.message || "Delete failed");
    }
  }, [selectedId, setActiveDocId, setSelectedId]);

  const handleConfirmReset = useCallback(async () => {
    if (busyReset) return;
    setBusyReset(true);
    try {
      const headers = await listDocs("");
      for (const h of headers) {
        const docId = h.id || h.$id;
        if (docId) {
          try { await store.deleteDoc(docId); } catch {}
        }
      }
      const res = await fetch(withBase("/store-seed/index.json"), { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch store-seed index: ${res.status}`);
      const index = await res.json();
      const seedDocs = Array.isArray(index?.docs) ? index.docs : [];
      let loadedDocIds = [];
      
      for (const entry of seedDocs) {
        if (!entry?.path) continue;
        const r = await fetch(withBase(`/store-seed/${entry.path}`), { cache: "no-store" });
        if (!r.ok) throw new Error(`Failed to fetch seed doc ${entry.path}: ${r.status}`);
        const data = await r.json();
        
        // Handle array of docs (for batch loading)
        const docArray = entry.array && Array.isArray(data) ? data : [data];
        
        for (const doc of docArray) {
          // Normalize: use "id" field, fallback to "$id", or use entry.$id
          const docId = doc.id || doc.$id || entry.$id;
          if (!docId) {
            console.warn(`[ObjectExplorer] Doc in ${entry.path} has no id field`);
            continue;
          }
          
          // Ensure both id and $id are set for backward compatibility
          doc.id = docId;
          doc.$id = docId;
          
          await store.putDoc(doc);
          loadedDocIds.push(docId);
          try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { $id: docId } })); } catch {}
        }
      }
      const rootId = loadedDocIds.find((id) => id === "spoke://docs/root") || loadedDocIds[0] || null;
      setActiveDocId(rootId || null);
      setSelectedId(rootId || null);
      try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { reset: true } })); } catch {}
      setShowResetConfirm(false);
    } catch (e) {
      alert(e?.message || "Reset failed");
    } finally {
      setBusyReset(false);
    }
  }, [busyReset, setActiveDocId, setSelectedId]);

  const [docs, setDocs] = useState([]);
  const refreshDocs = useCallback(async () => {
    try { setDocs(await listDocs("")); } catch {}
  }, []);
  useEffect(() => {
    refreshDocs();
    if (typeof window !== "undefined") {
      const h = () => refreshDocs();
      window.addEventListener("store:docSaved", h);
      return () => window.removeEventListener("store:docSaved", h);
    }
  }, [refreshDocs]);

  const typeOptions = useMemo(() => {
    const set = new Set();
    for (const h of docs) if (h.$type) set.add(h.$type);
    return [...set];
  }, [docs]);

  const parentIdOptions = useMemo(() => docs.map((d) => d.$id), [docs]);

  const inferredIdSuggestions = useMemo(() => {
    const short = (newType || "").split("/").pop() || "item";
    const base = `spoke://docs/${short.toLowerCase()}`;
    const existing = new Set(parentIdOptions);
    let n = 1; while (existing.has(`${base}-${n}`)) n++;
    const out = []; for (let i = 0; i < 5; i++) out.push(`${base}-${n + i}`);
    if (newId.trim()) {
      const pref = newId.trim();
      const completes = out.filter((s) => s.startsWith(pref));
      return completes.length ? completes : out;
    }
    return out;
  }, [newType, newId, parentIdOptions]);

  const typeSuggestions = useMemo(() => {
    const q = newType.trim().toLowerCase();
    const list = q ? typeOptions.filter((t) => t.toLowerCase().includes(q)) : typeOptions;
    return list.slice(0, 6);
  }, [newType, typeOptions]);

  const parentSuggestions = useMemo(() => {
    const q = attachParent.trim().toLowerCase();
    const list = q ? parentIdOptions.filter((id) => id.toLowerCase().includes(q)) : parentIdOptions;
    return list.slice(0, 8);
  }, [attachParent, parentIdOptions]);

  const [parentDoc, setParentDoc] = useState(null);
  useEffect(() => { (async () => { if (attachParent.trim()) setParentDoc(await safeGetDoc(attachParent.trim())); else setParentDoc(null); })(); }, [attachParent]);

  const slotSuggestions = useMemo(() => {
    const q = attachSlot.trim().toLowerCase();
    const keys = [];
    if (parentDoc && typeof parentDoc === "object") {
      for (const [k, v] of Object.entries(parentDoc)) {
        if (k.startsWith("$")) continue;
        if (Array.isArray(v)) keys.push(k);
      }
    }
    const defaults = ["parts", "slots", "items"];
    const set = new Set([...keys, ...defaults]);
    const list = [...set];
    const filtered = q ? list.filter((s) => s.toLowerCase().includes(q)) : list;
    return filtered.slice(0, 8);
  }, [attachSlot, parentDoc]);

  const handleSelect = useCallback((item) => { if (item?.$id) setSelectedId(item.$id); }, [setSelectedId]);
  const handleOpen = useCallback((item) => { if (item?.$id) { setActiveDocId(item.$id); setSelectedId(item.$id); } }, [setActiveDocId, setSelectedId]);

  return (
    <Card className="section" style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", flexDirection: "column" }}>
      <Flex direction="column" gap="3" style={{ flex: 1, minHeight: 0 }}>
        <Heading size="4">Object Explorer</Heading>
        <Box>
          <Text size="1" color="gray">Selected: {selectedId || "(none)"}</Text>
        </Box>
        <Box id="actionArea" style={{ width: "100%", flexShrink: 0 }}>
          <Flex align="center" gap="1" wrap="wrap" style={{ width: "100%", rowGap: 4, alignContent: "flex-start" }}>
            <Button size="1" onClick={() => {
              setShowNew((s) => {
                const next = !s;
                if (next) {
                  if (selectedId && !attachParent) setAttachParent(selectedId);
                  setIdIdx(0); setTypeIdx(0); setParentIdx(0); setSlotIdx(0);
                }
                return next;
              });
            }}>{showNew ? "Cancel" : "New"}</Button>
            <Button size="1" variant="soft" onClick={() => {
              try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { $id: "__manual__" } })); } catch {}
            }}>Refresh</Button>
            <Button size="1" variant="soft" onClick={async () => {
              try {
                const headers = await listDocs("");
                console.log("[Explorer][Debug] listDocs headers:", headers);
                if (activeDocId) {
                  const doc = await store.getDoc(activeDocId);
                  console.log("[Explorer][Debug] activeDoc", activeDocId, doc);
                }
              } catch (e) { console.warn("[Explorer][Debug] dump failed", e); }
            }}>Debug Dump</Button>
            <Button size="1" color="red" disabled={!selectedId} onClick={() => { if (!selectedId) return; setShowDelConfirm(true); }}>Delete</Button>
            <Separator orientation="vertical" size="4" />
            <Button size="1" color="crimson" variant="surface" onClick={() => setShowResetConfirm(true)} disabled={busyReset}>Reset</Button>
          </Flex>
          {(showDelConfirm || showResetConfirm) && (
            <Box style={{ width: "100%", marginTop: 6 }}>
              <Flex direction="column" gap="1">
                {showDelConfirm && (
                  <Flex gap="1" align="center">
                    <Button size="1" color="red" onClick={handleConfirmDelete}>Confirm Delete</Button>
                    <Button size="1" variant="soft" onClick={() => setShowDelConfirm(false)}>Cancel</Button>
                  </Flex>
                )}
                {showResetConfirm && (
                  <Flex gap="1" align="center">
                    <Button size="1" color="crimson" onClick={handleConfirmReset} disabled={busyReset}>{busyReset ? "Resetting…" : "Confirm Reset"}</Button>
                    <Button size="1" variant="soft" onClick={() => setShowResetConfirm(false)} disabled={busyReset}>Cancel</Button>
                  </Flex>
                )}
              </Flex>
            </Box>
          )}
        </Box>
        {showNew && (
          <Card variant="surface" style={{ padding: 8 }}>
            <Flex direction="column" gap="2">
              <label onKeyDown={(e) => {
                if (!inferredIdSuggestions.length) return;
                if (e.key === "Tab") { e.preventDefault(); setNewId(inferredIdSuggestions[idIdx] || inferredIdSuggestions[0]); return; }
                if (e.key === "Enter") { e.preventDefault(); setNewId(inferredIdSuggestions[idIdx] || inferredIdSuggestions[0]); return; }
                if (e.key === "ArrowDown") { e.preventDefault(); setIdIdx((i) => (i + 1) % inferredIdSuggestions.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setIdIdx((i) => (i - 1 + inferredIdSuggestions.length) % inferredIdSuggestions.length); return; }
              }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Object ID ($id)</div>
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="spoke://docs/robot-c"
                  style={{ width: "100%", padding: 6 }}
                />
                {!!inferredIdSuggestions.length && (
                  <div style={{ marginTop: 4 }}>
                    {inferredIdSuggestions.slice(0, 5).map((s, i) => (
                      <div key={s}
                        style={{ fontSize: 12, cursor: "pointer", padding: "2px 4px", background: i === idIdx ? "var(--gray-4, #eee)" : "transparent" }}
                        onMouseEnter={() => setIdIdx(i)}
                        onMouseDown={(e) => { e.preventDefault(); setNewId(s); }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </label>
              <label onKeyDown={(e) => {
                if (!typeSuggestions.length) return;
                if (e.key === "Tab") { e.preventDefault(); setNewType(typeSuggestions[typeIdx] || typeSuggestions[0]); return; }
                if (e.key === "Enter") { e.preventDefault(); setNewType(typeSuggestions[typeIdx] || typeSuggestions[0]); return; }
                if (e.key === "ArrowDown") { e.preventDefault(); setTypeIdx((i) => (i + 1) % typeSuggestions.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setTypeIdx((i) => (i - 1 + typeSuggestions.length) % typeSuggestions.length); return; }
              }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>$type (optional)</div>
                <input
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  placeholder="spoke://types/robot"
                  style={{ width: "100%", padding: 6 }}
                />
                {!!typeSuggestions.length && (
                  <div style={{ marginTop: 4 }}>
                    {typeSuggestions.map((s, i) => (
                      <div key={s}
                        style={{ fontSize: 12, cursor: "pointer", padding: "2px 4px", background: i === typeIdx ? "var(--gray-4, #eee)" : "transparent" }}
                        onMouseEnter={() => setTypeIdx(i)}
                        onMouseDown={(e) => { e.preventDefault(); setNewType(s); }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </label>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Title (optional)</div>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Human-friendly title"
                  style={{ width: "100%", padding: 6 }}
                />
              </label>
              <Separator />
              <div style={{ fontSize: 12, opacity: 0.8 }}>Attach to parent (optional)</div>
              <Flex gap="2" wrap="wrap">
                <input
                  value={attachParent}
                  onChange={(e) => setAttachParent(e.target.value)}
                  onKeyDown={(e) => {
                    if (!parentSuggestions.length) return;
                    if (e.key === "Tab") { e.preventDefault(); setAttachParent(parentSuggestions[parentIdx] || parentSuggestions[0]); return; }
                    if (e.key === "Enter") { e.preventDefault(); setAttachParent(parentSuggestions[parentIdx] || parentSuggestions[0]); return; }
                    if (e.key === "ArrowDown") { e.preventDefault(); setParentIdx((i) => (i + 1) % parentSuggestions.length); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setParentIdx((i) => (i - 1 + parentSuggestions.length) % parentSuggestions.length); return; }
                  }}
                  placeholder="Parent $id (e.g., spoke://docs/root)"
                  style={{ flex: 1, minWidth: 220, padding: 6 }}
                />
                {!!parentSuggestions.length && (
                  <div style={{ width: "100%", marginTop: 4 }}>
                    {parentSuggestions.map((s, i) => (
                      <div key={s}
                        style={{ fontSize: 12, cursor: "pointer", padding: "2px 4px", background: i === parentIdx ? "var(--gray-4, #eee)" : "transparent" }}
                        onMouseEnter={() => setParentIdx(i)}
                        onMouseDown={(e) => { e.preventDefault(); setAttachParent(s); }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
                <input
                  value={attachSlot}
                  onChange={(e) => setAttachSlot(e.target.value)}
                  onKeyDown={(e) => {
                    if (!slotSuggestions.length) return;
                    if (e.key === "Tab") { e.preventDefault(); setAttachSlot(slotSuggestions[slotIdx] || slotSuggestions[0]); return; }
                    if (e.key === "Enter") { e.preventDefault(); setAttachSlot(slotSuggestions[slotIdx] || slotSuggestions[0]); return; }
                    if (e.key === "ArrowDown") { e.preventDefault(); setSlotIdx((i) => (i + 1) % slotSuggestions.length); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setSlotIdx((i) => (i - 1 + slotSuggestions.length) % slotSuggestions.length); return; }
                  }}
                  placeholder="Slot name (e.g., parts)"
                  style={{ width: 180, padding: 6 }}
                />
                {!!slotSuggestions.length && (
                  <div style={{ width: "100%", marginTop: 4 }}>
                    {slotSuggestions.map((s, i) => (
                      <div key={s}
                        style={{ fontSize: 12, cursor: "pointer", padding: "2px 4px", background: i === slotIdx ? "var(--gray-4, #eee)" : "transparent" }}
                        onMouseEnter={() => setSlotIdx(i)}
                        onMouseDown={(e) => { e.preventDefault(); setAttachSlot(s); }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
                <Button size="1" onClick={async () => {
                  try {
                    const $id = newId.trim();
                    if (!$id) return alert("$id is required");
                    const now = new Date().toISOString();
                    const doc = { $id, meta: { version: 1, createdAt: now, updatedAt: now, origin: "user" } };
                    if (newType.trim()) doc.$type = newType.trim();
                    if (newTitle.trim()) doc.name = newTitle.trim();
                    await store.putDoc(doc);
                    if (attachParent.trim() && attachSlot.trim()) {
                      const parent = await safeGetDoc(attachParent.trim());
                      if (parent) {
                        const arr = Array.isArray(parent[attachSlot]) ? parent[attachSlot] : [];
                        if (!arr.includes($id)) {
                          parent[attachSlot] = [...arr, $id];
                          const prevVersion = parent?.meta?.version ?? 0;
                          parent.meta = { ...(parent.meta || {}), version: prevVersion + 1, updatedAt: now };
                          await store.putDoc(parent);
                          try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { $id: parent.$id } })); } catch {}
                        }
                      }
                    }
                    try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { $id } })); } catch {}
                    setActiveDocId($id);
                    setShowNew(false);
                    setNewId(""); setNewType(""); setNewTitle(""); setAttachParent(""); setAttachSlot("");
                  } catch (e) {
                    alert(e?.message || "Failed to create object");
                  }
                }}>Create</Button>
              </Flex>
            </Flex>
          </Card>
        )}
        <Box>
          <ObjectSearchBox value={query} onChange={setQuery} />
        </Box>
        <Box style={{ flex: 1, minHeight: 0 }}>
          <ObjectTree query={query} onSelect={handleSelect} onOpen={handleOpen} />
        </Box>
      </Flex>
    </Card>
  );
}
