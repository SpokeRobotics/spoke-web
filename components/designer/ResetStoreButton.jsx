"use client";

import { useState, useCallback } from "react";
import { Button, AlertDialog, Flex } from "@radix-ui/themes";
import { listDocs } from "@/lib/store/resolver";
import { store } from "@/lib/store/adapter";
import { withBase } from "@/lib/basePath";

export default function ResetStoreButton({ size = "2", variant = "soft", color = "crimson" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleReset = useCallback(async () => {
    if (busy) return;
    
    setBusy(true);
    setError(null);
    try {
      // Delete all docs
      const headers = await listDocs("");
      for (const h of headers) {
        const docId = h.id || h.$id;
        if (docId) {
          try { await store.deleteDoc(docId); } catch {}
        }
      }
      
      // Load seed index
      const res = await fetch(withBase("/store-seed/index.json"), { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch store-seed index: ${res.status}`);
      const index = await res.json();
      const seedDocs = Array.isArray(index?.docs) ? index.docs : [];
      
      // Put each seed doc (handling arrays)
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
            console.warn(`[ResetStore] Doc in ${entry.path} has no id field`);
            continue;
          }
          
          // Ensure both id and $id are set for backward compatibility
          doc.id = docId;
          doc.$id = docId;
          
          await store.putDoc(doc);
        }
      }
      
      // Trigger refresh event
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { reset: true } }));
      }
      
      // Reload page to show updated data
      window.location.reload();
    } catch (e) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  }, [busy]);

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        <Button 
          size={size} 
          variant={variant} 
          color={color}
          disabled={busy}
        >
          {busy ? "Resetting…" : "Reset Store"}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="450px">
        <AlertDialog.Title>Reset Store from Seeds?</AlertDialog.Title>
        <AlertDialog.Description size="2">
          This will delete all current documents in the store and reload fresh copies from the seed files.
          {error && (
            <Flex mt="3" p="2" style={{ background: "var(--red-3)", borderRadius: "4px" }}>
              <span style={{ color: "var(--red-11)", fontSize: "13px" }}>Error: {error}</span>
            </Flex>
          )}
        </AlertDialog.Description>

        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button variant="solid" color="crimson" onClick={handleReset} disabled={busy}>
              {busy ? "Resetting…" : "Reset"}
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
