"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Box, Card, Flex, Button, Text, Separator, Code } from "@radix-ui/themes";
import { reconcileStore } from "@/lib/store/reconcile";
import { listDocs } from "@/lib/store/resolver";
import { store } from "@/lib/store/adapter";
import { withBase } from "@/lib/basePath";

export default function StoreStatus() {
  const [loading, setLoading] = useState(true);
  const [busyReset, setBusyReset] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await reconcileStore();
      const headers = await listDocs("");
      setDocs(headers);
      const meta = await store.getMeta("siteManifest");
      setManifest(meta || null);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleReset = useCallback(async () => {
    if (busyReset) return;
    setBusyReset(true);
    try {
      // Delete all docs
      const headers = await listDocs("");
      for (const h of headers) {
        try { await store.deleteDoc(h.$id); } catch {}
      }
      // Load seed index
      const res = await fetch(withBase("/store-seed/index.json"), { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch store-seed index: ${res.status}`);
      const index = await res.json();
      const seedDocs = Array.isArray(index?.docs) ? index.docs : [];
      // Put each seed doc
      for (const entry of seedDocs) {
        if (!entry?.path) continue;
        const r = await fetch(withBase(`/store-seed/${entry.path}`), { cache: "no-store" });
        if (!r.ok) throw new Error(`Failed to fetch seed doc ${entry.path}: ${r.status}`);
        const doc = await r.json();
        if (!doc?.$id) doc.$id = entry.$id || undefined;
        if (!doc?.$id) throw new Error(`Seed doc missing $id for path ${entry.path}`);
        await store.putDoc(doc);
      }
      try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { reset: true } })); } catch {}
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyReset(false);
    }
  }, [busyReset, refresh]);

  return (
    <Card className="section">
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between" wrap="wrap" gap="3">
          <Text weight="bold">Store Status</Text>
          <Flex gap="2" align="center">
            <Button size="1" variant="soft" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
            <Button size="1" color="crimson" onClick={handleReset} disabled={busyReset}>{busyReset ? "Resetting…" : "RESET"}</Button>
          </Flex>
        </Flex>
        <Separator />
        {error && <Text color="red" size="2">{error}</Text>}
        <Box>
          <Text size="2" color="gray">Docs in store: {docs?.length ?? 0}</Text>
        </Box>
        <Box>
          {docs?.slice(0, 10).map((d) => (
            <Flex key={d.$id} align="center" justify="between" style={{ padding: "4px 0" }}>
              <Text size="2">{d.title || d.$id}</Text>
              {d.$type && <Code>{(d.$type || "").split("/").pop()}</Code>}
            </Flex>
          ))}
          {Array.isArray(docs) && docs.length > 10 && (
            <Text size="1" color="gray">…and {docs.length - 10} more</Text>
          )}
        </Box>
        <Separator />
        <Box>
          <Text size="2" color="gray">Manifest</Text>
          <Box style={{ marginTop: 4 }}>
            <Text size="2">manifestHash: <Code>{manifest?.manifestHash || "(none)"}</Code></Text>
            {manifest?.at && (
              <Text as="div" size="2" color="gray">updated at: {manifest.at}</Text>
            )}
          </Box>
        </Box>
      </Flex>
    </Card>
  );
}
