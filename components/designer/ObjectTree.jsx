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
  const [hasInternalById, setHasInternalById] = useState({}); // id -> boolean
  const [hasChildrenById, setHasChildrenById] = useState({}); // id -> boolean (includes type-defined slots)

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const map = new Map(); // child -> Set(parents)
        const hasInternalMap = new Map(); // parentId -> boolean for direct `.children`
        const hasAnyChildrenMap = new Map(); // parentId -> boolean for any children (direct or type-defined)
        // Lazy load helpers once
        let typeSystem = null;
        let slotPath = null;
        try {
          typeSystem = await import('@/lib/store/type-system');
          slotPath = await import('@/lib/store/slot-path.js');
        } catch {}
        for (const h of items || []) {
          if (!h?.$id) continue;
          try {
            const doc = await safeGetDoc(h.$id);
            if (!doc || typeof doc !== 'object') continue;
            for (const [k, v] of Object.entries(doc)) {
              if (k.startsWith('$')) continue;
              if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
                for (const childId of v) {
                  if (!map.has(childId)) map.set(childId, new Set());
                  map.get(childId).add(h.$id);
                }
                if (k === 'children' && v.length > 0) { hasInternalMap.set(h.$id, true); hasAnyChildrenMap.set(h.$id, true); }
              } else if (k === 'children' && v && typeof v === 'object') {
                const vals = Object.values(v);
                let foundAny = false;
                for (const val of vals) {
                  if (typeof val === 'string') {
                    foundAny = true;
                    if (!map.has(val)) map.set(val, new Set());
                    map.get(val).add(h.$id);
                  } else if (Array.isArray(val)) {
                    const ids = val.filter((x) => typeof x === 'string');
                    if (ids.length) foundAny = true;
                    for (const childId of ids) {
                      if (!map.has(childId)) map.set(childId, new Set());
                      map.get(childId).add(h.$id);
                    }
                  }
                }
                if (foundAny) { hasInternalMap.set(h.$id, true); hasAnyChildrenMap.set(h.$id, true); }
              }
            }
            // Type-defined slot references
            try {
              const typeRef = doc.type || doc.$type;
              if (typeSystem && slotPath && typeRef && String(typeRef).startsWith('spoke://types/')) {
                const { getEffectiveSlots } = typeSystem;
                const { byPath } = await getEffectiveSlots(typeRef);
                const { getNested } = slotPath;
                const keys = Object.keys(byPath || {});
                for (const slotKey of keys) {
                  const val = getNested(doc, slotKey);
                  if (!val) continue;
                  const refs = Array.isArray(val) ? val : [val];
                  const childRefs = refs.filter((x) => typeof x === 'string' && x.startsWith('spoke://'));
                  if (childRefs.length > 0) { hasAnyChildrenMap.set(h.$id, true); break; }
                }
              }
            } catch {}
          } catch {}
        }
        if (!cancelled) {
          const obj = {};
          for (const [child, parents] of map.entries()) obj[child] = Array.from(parents);
          setParentsByChild(obj);
          ancestorsCacheRef.current = new Map();
          const internalObj = {};
          for (const [pid, has] of hasInternalMap.entries()) internalObj[pid] = !!has;
          setHasInternalById(internalObj);
          const anyObj = {};
          for (const [pid, has] of hasAnyChildrenMap.entries()) anyObj[pid] = !!has;
          setHasChildrenById(anyObj);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [items]);

  // hasInternalById is set in the scan above

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

  // --- Hierarchical explorer construction ---
  const parseTypePath = useCallback((ref) => {
    if (!ref || typeof ref !== "string") return [];
    if (!ref.startsWith("spoke://")) return [];
    const parts = ref.split("/");
    // Expect spoke://types/<a>/<b>/.../<leaf>
    const idx = parts.indexOf("types");
    if (idx < 0) return [];
    const segs = parts.slice(idx + 1).filter(Boolean);
    return segs; // e.g., ['robot', 'segment', 'panel']
  }, []);

  const toTitle = (s) => (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
  const topOrder = (a, b) => {
    const pref = ["robot", "segment"]; // custom ordering for first-level groups
    const ia = pref.indexOf(a.toLowerCase());
    const ib = pref.indexOf(b.toLowerCase());
    if (ia >= 0 || ib >= 0) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      if (ia !== ib) return ia - ib;
    }
    return a.localeCompare(b);
  };

  const treeRoots = useMemo(() => {
    // Build two roots: Instances and Types
    const rootInstances = { id: "ROOT:instances", kind: "group", label: "Instances", children: new Map() };
    const rootTypes = { id: "ROOT:types", kind: "group", label: "Types", children: new Map() };

    const ensurePath = (root, segs) => {
      let node = root;
      segs.forEach((seg, depth) => {
        const key = `group:${node.id}/${seg}`;
        if (!node.children.has(seg)) {
          node.children.set(seg, { id: key, kind: "group", label: toTitle(seg), children: new Map() });
        }
        node = node.children.get(seg);
      });
      return node;
    };

    for (const it of items) {
      const id = it?.$id || "";
      if (!id) continue;
      const isTypeDoc = id.startsWith("spoke://types/");
      if (isTypeDoc) {
        const segs = parseTypePath(id);
        const pathSegs = segs.slice(0, Math.max(0, segs.length - 1));
        const leafLabel = toTitle(segs[segs.length - 1] || id.split("/").pop() || "Type");
        const parent = ensurePath(rootTypes, pathSegs);
        const leafKey = `doc:${id}`;
        parent.children.set(leafKey, { id: id, kind: "doc", label: leafLabel, doc: it });
      } else {
        // Instance: bucket by its type categories
        const typeRef = it.$type || it.type;
        const segs = parseTypePath(typeRef);
        const pathSegs = segs.length ? segs : ["unknown"];
        const parent = ensurePath(rootInstances, pathSegs);
        const leafKey = `doc:${id}`;
        const leafLabel = toTitle((segs[segs.length - 1] || "instance"));
        parent.children.set(leafKey, { id: id, kind: "doc", label: leafLabel, doc: it });
      }
    }

    const sortChildren = (node, depth = 0) => {
      if (!node.children || node.children.size === 0) return;
      const groups = [];
      const docs = [];
      for (const [key, child] of node.children.entries()) {
        if (child.kind === "group") groups.push(child); else docs.push(child);
      }
      const sortGroups = depth === 0
        ? (a, b) => topOrder(a.label, b.label)
        : (a, b) => a.label.localeCompare(b.label);
      groups.sort(sortGroups);
      docs.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
      // Rebuild map preserving order
      node.children = new Map([...groups.map(g => [g.label.toLowerCase(), g]), ...docs.map(d => [d.id, d])]);
      for (const child of groups) sortChildren(child, depth + 1);
    };
    sortChildren(rootInstances, 0);
    sortChildren(rootTypes, 0);
    return [rootInstances, rootTypes];
  }, [items, parseTypePath]);

  const loadSlotsFor = useCallback(async (id) => {
    setLoadingExpand((s) => ({ ...s, [id]: true }));
    try {
      const doc = await safeGetDoc(id);
      const slots = [];
      if (doc) {
        // Load slots defined by the object's type (if it has one)
        const typeRef = doc.type || doc.$type;
        let effectiveSlotsByPath = {};
        
        if (typeRef && typeRef.startsWith('spoke://types/')) {
          // Load type-defined slots using type-system utilities
          try {
            const { getEffectiveSlots } = await import('@/lib/store/type-system');
            const { byPath } = await getEffectiveSlots(typeRef);
            effectiveSlotsByPath = byPath || {};
          } catch (err) {
            console.warn('[ObjectTree] Failed to load type slots:', err);
          }
        }
        
        // Only consider type-defined slots (by dotted path), and read values via helper
        const { getNested } = await import('@/lib/store/slot-path.js');
        for (const slotPath of Object.keys(effectiveSlotsByPath)) {
          const val = getNested(doc, slotPath);
          if (!val) continue;
          const refs = Array.isArray(val) ? val : [val];
          const childRefs = refs.filter(ref => typeof ref === 'string' && ref.startsWith('spoke://'));
          if (childRefs.length > 0) {
            const mapped = childRefs.map((ref) => byId[ref]).filter(Boolean);
            if (mapped.length) slots.push({ slot: slotPath, items: mapped });
          }
        }

        // Also include conventional `.children` if present
        if (Array.isArray(doc.children)) {
          const childRefs = doc.children.filter(ref => typeof ref === 'string' && byId[ref]);
          const mapped = childRefs.map((ref) => byId[ref]).filter(Boolean);
          if (mapped.length) slots.push({ slot: 'Children', items: mapped });
        } else if (doc.children && typeof doc.children === 'object') {
          for (const [key, val] of Object.entries(doc.children)) {
            const list = Array.isArray(val) ? val : [val];
            const childRefs = list.filter(ref => typeof ref === 'string' && byId[ref]);
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
          <Flex direction="column" gap="1">
            {treeRoots.map((root) => {
              const isExpanded = expandedIds.has(root.id);
              return (
                <React.Fragment key={root.id}>
                  <Flex
                    align="center"
                    onClick={() => setExpandedIds((prev) => { const next = new Set(prev); if (next.has(root.id)) next.delete(root.id); else next.add(root.id); return next; })}
                    style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 6, background: 'var(--color-panel-solid)' }}
                  >
                    <Text size="2" style={{ width: 14, textAlign: 'center', userSelect: 'none' }}>{isExpanded ? '▾' : '▸'}</Text>
                    <Text size="2" weight="medium">{root.label}</Text>
                  </Flex>
                  {isExpanded && (
                    <Flex direction="column" gap="1" style={{ marginLeft: 14 }}>
                      {Array.from(root.children.values()).map((child) => (
                        <TreeNode
                          key={child.id}
                          node={child}
                          isTypesBranch={root.id === 'ROOT:types'}
                          expandedIds={expandedIds}
                          setExpandedIds={setExpandedIds}
                          slotsById={slotsById}
                          loadingExpand={loadingExpand}
                          loadSlotsFor={loadSlotsFor}
                          selectedId={selectedId}
                          cursorRefId={cursorRefId}
                          getAncestors={getAncestors}
                        hasChildrenById={hasChildrenById}
                          onSelect={onSelect}
                          onOpen={onOpen}
                        />
                      ))}
                    </Flex>
                  )}
                </React.Fragment>
              );
            })}
          </Flex>
        ) : (
          <Flex direction="column" gap="1">
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
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: selectedId === it.$id ? "var(--indigo-4)"
                      : (inferredAncestorIds && inferredAncestorIds.has(it.$id)) ? "var(--indigo-3)"
                      : cursorRefId === it.$id ? "var(--indigo-2)" : "var(--color-panel-solid)",
                  }}
                >
                  <Flex align="center" gap="2">
                    <Text size="2">{it.name || it.$id}</Text>
                  </Flex>
                  {it.$type && <Badge variant="soft" color="indigo">{it.$type.split("/")?.pop()}</Badge>}
                </Flex>
              </React.Fragment>
            ))}
          </Flex>
        )}
      </ScrollArea>
    </Box>
  );
}

function TreeNode({ node, isTypesBranch = false, expandedIds, setExpandedIds, slotsById, loadingExpand, loadSlotsFor, selectedId, cursorRefId, getAncestors, hasChildrenById = {}, onSelect, onOpen }) {
  if (node.kind === 'group') {
    const isExpanded = expandedIds.has(node.id);
    // order children: groups then docs, preserving pre-sorted map order
    const children = Array.from(node.children.values());
    const hasChildren = children.length > 0;
    return (
      <React.Fragment>
        <Flex
          align="center"
          onClick={() => setExpandedIds((prev) => { const next = new Set(prev); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}
          style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 6, background: 'var(--color-panel-solid)' }}
        >
          <span style={{ width: 14, display: 'inline-block', textAlign: 'center' }}>
            {hasChildren ? (<Text size="2" style={{ userSelect: 'none' }}>{isExpanded ? '▾' : '▸'}</Text>) : null}
          </span>
          <Badge variant="soft" color="blue" radius="small" size="1">{node.label}</Badge>
        </Flex>
        {hasChildren && isExpanded && (
          <Flex direction="column" gap="1" style={{ marginLeft: 14 }}>
            {children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                isTypesBranch={isTypesBranch}
                expandedIds={expandedIds}
                setExpandedIds={setExpandedIds}
                slotsById={slotsById}
                loadingExpand={loadingExpand}
                loadSlotsFor={loadSlotsFor}
                selectedId={selectedId}
                cursorRefId={cursorRefId}
                getAncestors={getAncestors}
                hasChildrenById={hasChildrenById}
                onSelect={onSelect}
                onOpen={onOpen}
              />
            ))}
          </Flex>
        )}
      </React.Fragment>
    );
  }
  // doc leaf
  const it = node.doc;
  const isExpanded = expandedIds.has(it.$id);
  const slots = slotsById[it.$id];
  const selected = selectedId === it.$id;
  const hasChildren = !!hasChildrenById[it.$id];
  return (
    <React.Fragment>
      <Flex
        align="center"
        justify="between"
        onClick={() => { onSelect?.(it); }}
        onDoubleClick={() => { onOpen?.(it); }}
        aria-selected={selected}
        style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 6, background: selected ? 'var(--indigo-4)' : 'var(--color-panel-solid)' }}
      >
        <Flex align="center" gap="2">
          <span style={{ width: 14, display: 'inline-block', textAlign: 'center' }}>
            {hasChildren ? (
              <Text
                size="2"
                onClick={(e) => { e.stopPropagation(); setExpandedIds((prev) => { const next = new Set(prev); if (next.has(it.$id)) next.delete(it.$id); else { next.add(it.$id); loadSlotsFor(it.$id); } return next; }); }}
                style={{ userSelect: 'none', display: 'inline-block' }}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                role="button"
              >
                {isExpanded ? '▾' : '▸'}
              </Text>
            ) : null}
          </span>
          {isTypesBranch ? (
            <Badge variant="soft" color="blue" radius="small" size="1">{node.label}</Badge>
          ) : (
            <Text size="2">{node.label}</Text>
          )}
        </Flex>
        {!isTypesBranch && it.$type && <Badge variant="soft" color="indigo">{(it.$type || '').split('/').pop()}</Badge>}
      </Flex>
      {isExpanded && (
        <>
          {loadingExpand[it.$id] && <Text size="1" color="gray" style={{ paddingLeft: 22 }}>Loading…</Text>}
          {Array.isArray(slots) && slots.map(({ slot, items: slotItems }) => (
            <React.Fragment key={`${it.$id}-${slot}`}>
              <Text
                size="1"
                color="gray"
                style={{ padding: '2px 6px', marginTop: 4, marginLeft: 12, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('store:seekSlot', { detail: { parentId: it.$id, slot } })); } catch {}
                }}
                title="Click to locate this slot in the JSON editor"
              >
                {slot.charAt(0).toUpperCase() + slot.slice(1)}
              </Text>
              <Flex direction="column" gap="1" style={{ marginLeft: 24 }}>
                {slotItems.map((child, index) => (
                  <React.Fragment key={`${it.$id}-${slot}-${index}`}>
                    <Flex
                      align="center"
                      justify="between"
                      onClick={() => { onSelect?.(child); }}
                      onDoubleClick={() => { onOpen?.(child); }}
                      aria-selected={selectedId === child.$id}
                      data-node-id={`${it.$id}-${child.$id}`}
                      style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 6, background: selectedId === child.$id ? 'var(--indigo-4)' : 'var(--color-panel-solid)' }}
                    >
                      <Flex align="center" gap="2">
                        <Text size="2">{child.name || child.$id}</Text>
                      </Flex>
                      {child.$type && <Badge variant="soft" color="indigo">{(child.$type || '').split('/').pop()}</Badge>}
                    </Flex>
                  </React.Fragment>
                ))}
              </Flex>
            </React.Fragment>
          ))}
        </>
      )}
    </React.Fragment>
  );
}
