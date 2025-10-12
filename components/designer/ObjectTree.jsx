"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Box, Flex, Text, ScrollArea, Badge, Separator } from "@radix-ui/themes";
import { listDocs, safeGetDoc } from "@/lib/store/resolver";
import { useSelection } from "@/components/designer/SelectionProvider.jsx";

export default function ObjectTree({ query = "", onSelect, onOpen }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [slotsById, setSlotsById] = useState({}); // id -> [{ slot, items: [headers] }]
  const [loadingExpand, setLoadingExpand] = useState({}); // id -> bool
  const { activeDocId, selectedId, setSelectedId } = useSelection();
  const STORAGE_KEY = "store:treeExpanded";
  const [cursorRefId, setCursorRefId] = useState(null); // transient highlight from editor cursor
  const [parentsByChild, setParentsByChild] = useState({}); // { childId: Set(parentIds) } serialized as arrays
  const [inferredAncestorIds, setInferredAncestorIds] = useState(() => new Set());
  const ancestorsCacheRef = useRef(new Map()); // childId -> Set(ancestors)

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const map = new Map(); // child -> Set(parents)
        for (const h of items || []) {
          if (!h?.$id) continue;
          try {
            const doc = await safeGetDoc(h.$id);
            if (!doc || typeof doc !== "object") continue;
            for (const [k, v] of Object.entries(doc)) {
              if (k.startsWith("$")) continue;
              if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
                for (const childId of v) {
                  if (!map.has(childId)) map.set(childId, new Set());
                  map.get(childId).add(h.$id);
                }
              }
            }
          } catch {}
        }
        if (!cancelled) {
          const obj = {};
          for (const [child, parents] of map.entries()) obj[child] = Array.from(parents);
          setParentsByChild(obj);
          ancestorsCacheRef.current = new Map();
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [items]);

  const getAncestors = useCallback((childId) => {
    if (!childId) return new Set();
    const cache = ancestorsCacheRef.current;
    if (cache.has(childId)) return new Set(cache.get(childId));
    const parentsIdx = parentsByChild || {};
    const visited = new Set();
    const stack = [childId];
    while (stack.length) {
      const current = stack.pop();
      const parents = parentsIdx[current];
      if (!parents) continue;
      for (const p of parents) {
        if (!visited.has(p)) { visited.add(p); stack.push(p); }
      }
    }
    cache.set(childId, new Set(visited));
    return visited;
  }, [parentsByChild]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await listDocs("");
      setItems(docs);
    } finally {
      setLoading(false);
    }
  }, []);

  const debounceRef = useRef(null);
  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refresh();
      debounceRef.current = null;
    }, 250);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await refresh(); })();
    const onSaved = (e) => {
      if (cancelled) return;
      try {
        const detail = e?.detail || {};
        setSlotsById({});
        try {
          const ids = Array.from(expandedIds || []);
          ids.forEach((id) => {
            setTimeout(() => { try { loadSlotsFor(id); } catch {} }, 0);
          });
        } catch {}
        if (detail?.deleted && detail?.$id) {
          setExpandedIds((prev) => { const next = new Set(prev); next.delete(detail.$id); return next; });
        }
      } catch {}
      scheduleRefresh();
    };
    const onReconciled = () => { if (!cancelled) scheduleRefresh(); };
    if (typeof window !== "undefined") {
      window.addEventListener("store:docSaved", onSaved);
      window.addEventListener("store:reconciled", onReconciled);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("store:docSaved", onSaved);
        window.removeEventListener("store:reconciled", onReconciled);
      }
    };
  }, [refresh, scheduleRefresh]);

  useEffect(() => {
    try { const arr = Array.from(expandedIds); localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
  }, [expandedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      (it.name || "").toLowerCase().includes(q) ||
      (it.$id || "").toLowerCase().includes(q) ||
      (it.$type || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const hasQuery = query.trim().length > 0;

  const byId = useMemo(() => Object.fromEntries(items.map((d) => [d.$id, d])), [items]);

  const loadSlotsFor = useCallback(async (id) => {
    setLoadingExpand((s) => ({ ...s, [id]: true }));
    try {
      const doc = await safeGetDoc(id);
      const slots = [];
      if (doc) {
        // Load slots defined by the object's type (if it has one)
        const typeRef = doc.type || doc.$type;
        let effectiveSlots = {};
        
        if (typeRef && typeRef.startsWith('spoke://types/')) {
          // Load type-defined slots using type-system utilities
          try {
            const { getEffectiveSlots } = await import('@/lib/store/type-system');
            effectiveSlots = await getEffectiveSlots(typeRef);
          } catch (err) {
            console.warn('[ObjectTree] Failed to load type slots:', err);
          }
        }
        
        // Check both type-defined slots and duck-typed properties
        const slotNames = new Set([
          ...Object.keys(effectiveSlots),
          ...Object.keys(doc).filter(k => !k.startsWith("$") && !k.startsWith("_"))
        ]);
        
        for (const key of slotNames) {
          if (key === 'id' || key === 'type' || key === 'name' || key === 'parent' || key === 'parentSlot' || key === 'location' || key === 'model' || key === 'meta') continue;
          
          const val = doc[key];
          if (!val) continue;
          
          // Handle both single references and arrays
          const refs = Array.isArray(val) ? val : [val];
          const childRefs = refs.filter(ref => typeof ref === 'string' && ref.startsWith('spoke://'));
          
          if (childRefs.length > 0) {
            const mapped = childRefs.map((ref) => byId[ref]).filter(Boolean);
            if (mapped.length) slots.push({ slot: key, items: mapped });
          }
        }
      }
      setSlotsById((m) => ({ ...m, [id]: slots }));
    } finally {
      setLoadingExpand((s) => ({ ...s, [id]: false }));
    }
  }, [byId]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const wasExpanded = next.has(id);
      if (wasExpanded) {
        next.delete(id);
      } else {
        next.add(id);
        // Load slots when expanding
        loadSlotsFor(id);
      }
      return next;
    });
  }, [loadSlotsFor]);

  useEffect(() => {
    if (!expandedIds || expandedIds.size === 0) return;
    expandedIds.forEach((id) => {
      setSlotsById((m) => { if (!m || !m[id]) return m; const next = { ...m }; delete next[id]; return next; });
      setTimeout(() => { try { loadSlotsFor(id); } catch {} }, 0);
    });
  }, [items, expandedIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e) => {
      try {
        const { parentId, refId } = e.detail || {};
        if (!parentId || !refId) return;
        if (!byId[parentId]) return;
        setCursorRefId(refId);
        try { setSelectedId((prev) => (prev == null ? prev : null)); } catch {}
        const ancestors = getAncestors(refId);
        if (parentId && !ancestors.has(parentId)) ancestors.add(parentId);
        setInferredAncestorIds(ancestors);
        setExpandedIds((prev) => { if (prev && prev.has(parentId)) return prev; const next = new Set(prev || []); next.add(parentId); return next; });
        if (!slotsById[parentId]) loadSlotsFor(parentId);
        setTimeout(() => {
          try {
            const el = document.querySelector(`[data-node-id="${parentId}-${refId}"]`);
            if (el && typeof el.scrollIntoView === "function") { el.scrollIntoView({ block: "nearest", inline: "nearest" }); }
          } catch {}
        }, 50);
      } catch {}
    };
    window.addEventListener("store:cursorRefId", handler);
    return () => window.removeEventListener("store:cursorRefId", handler);
  }, [byId, loadSlotsFor, slotsById]);

  const didHydrateRef = useRef(false);
  useEffect(() => {
    if (didHydrateRef.current) return;
    if (!items || items.length === 0) return;
    didHydrateRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const valid = new Set(arr.filter((id) => items.some((d) => d.$id === id)));
          if (valid.size > 0) {
            setExpandedIds(valid);
            valid.forEach((id) => { if (!slotsById[id]) { loadSlotsFor(id); } });
          }
        }
      }
    } catch {}
  }, [items, loadSlotsFor, slotsById]);

  return (
    <Box style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <ScrollArea type="auto" scrollbars="vertical" style={{ height: "100%" }}>
        {loading && <Text size="2" color="gray">Refreshing…</Text>}
        {!hasQuery ? (
          <Flex direction="column" gap="2">
            {items.map((it) => {
              const isExpanded = expandedIds.has(it.$id);
              const slots = slotsById[it.$id];
              const selected = selectedId === it.$id;
              return (
                <React.Fragment key={it.$id}>
                  <Flex
                    align="center"
                    justify="between"
                    onClick={() => { setCursorRefId(null); setInferredAncestorIds(new Set()); onSelect?.(it); }}
                    onDoubleClick={() => { setCursorRefId(null); setInferredAncestorIds(new Set()); onOpen?.(it); }}
                    title="Double-click to open; single-click to select"
                    aria-selected={selected}
                    style={{
                      cursor: "pointer",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: selected
                        ? "var(--indigo-4)"
                        : (inferredAncestorIds && inferredAncestorIds.has(it.$id))
                          ? "var(--indigo-3)"
                          : cursorRefId === it.$id
                            ? "var(--indigo-2)"
                            : "var(--color-panel-solid)",
                    }}
                  >
                    <Flex align="center" gap="2">
                      <Text
                        size="2"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(it.$id); }}
                        style={{ userSelect: "none", width: 14, display: "inline-block", textAlign: "center" }}
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                        role="button"
                      >
                        {isExpanded ? "▾" : "▸"}
                      </Text>
                      <Text size="2">{it.name || it.$id}</Text>
                    </Flex>
                    {it.$type && <Badge variant="soft" color="indigo">{(it.$type || "").split("/").pop()}</Badge>}
                  </Flex>
                  {isExpanded && (
                    <>
                      {loadingExpand[it.$id] && <Text size="1" color="gray" style={{ paddingLeft: 22 }}>Loading…</Text>}
                      {Array.isArray(slots) && slots.map(({ slot, items: slotItems }) => (
                        <React.Fragment key={`${it.$id}-${slot}`}>
                          <Text
                            size="1"
                            color="gray"
                            style={{ padding: "2px 6px", marginTop: 4, marginLeft: 12, cursor: "pointer" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              try {
                                if (typeof window !== "undefined") {
                                  window.dispatchEvent(new CustomEvent("store:seekSlot", { detail: { parentId: it.$id, slot } }));
                                }
                              } catch {}
                            }}
                            title="Click to locate this slot in the JSON editor"
                          >
                            {slot.charAt(0).toUpperCase() + slot.slice(1)}
                          </Text>
                          <Flex direction="column" gap="2" style={{ marginLeft: 24 }}>
                            {slotItems.map((child, index) => (
                              <React.Fragment key={`${it.$id}-${slot}-${index}`}>
                                <Flex
                                  align="center"
                                  justify="between"
                                  onClick={() => { setCursorRefId(null); setInferredAncestorIds(getAncestors(child.$id)); onSelect?.(child); }}
                                  onDoubleClick={() => { setCursorRefId(null); setInferredAncestorIds(getAncestors(child.$id)); onOpen?.(child); }}
                                  title="Double-click to open; single-click to select"
                                  aria-selected={selectedId === child.$id}
                                  data-node-id={`${it.$id}-${child.$id}`}
                                  style={{
                                    cursor: "pointer",
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    background:
                                      selectedId === child.$id ? "var(--indigo-4)"
                                      : cursorRefId === child.$id ? "var(--indigo-2)" : "var(--color-panel-solid)",
                                  }}
                                >
                                  <Flex align="center" gap="2">
                                    <Text size="2">{child.name || child.$id}</Text>
                                  </Flex>
                                  {child.$type && <Badge variant="soft" color="indigo">{(child.$type || "").split("/").pop()}</Badge>}
                                </Flex>
                                <Separator size="1" style={{ opacity: 0.5 }} />
                              </React.Fragment>
                            ))}
                          </Flex>
                        </React.Fragment>
                      ))}
                    </>
                  )}
                  <Separator size="1" style={{ opacity: 0.5 }} />
                </React.Fragment>
              );
            })}
          </Flex>
        ) : (
          <Flex direction="column" gap="2">
            {filtered.map((it) => (
              <React.Fragment key={it.$id}>
                <Flex
                  align="center"
                  justify="between"
                  onClick={() => { setCursorRefId(null); setInferredAncestorIds(new Set()); onSelect?.(it); }}
                  onDoubleClick={() => { setCursorRefId(null); setInferredAncestorIds(new Set()); onOpen?.(it); }}
                  title="Double-click to open; single-click to select"
                  style={{
                    cursor: "pointer",
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: selectedId === it.$id ? "var(--indigo-4)"
                      : (inferredAncestorIds && inferredAncestorIds.has(it.$id)) ? "var(--indigo-3)"
                      : cursorRefId === it.$id ? "var(--indigo-2)" : "var(--color-panel-solid)",
                  }}
                >
                  <Flex align="center" gap="2">
                    <Text size="2">{it.name || it.$id}</Text>
                  </Flex>
                  {it.$type && <Badge variant="soft" color="indigo">{it.$type.split("/").pop()}</Badge>}
                </Flex>
                <Separator size="1" style={{ opacity: 0.5 }} />
              </React.Fragment>
            ))}
          </Flex>
        )}
      </ScrollArea>
    </Box>
  );
}
