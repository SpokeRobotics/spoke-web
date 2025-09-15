"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelection } from "@/components/designer/SelectionProvider.jsx";
import { safeGetDoc } from "@/lib/store/resolver";
import { store } from "@/lib/store/adapter";

export default function JsonEditor() {
  // Dynamically loaded Ace editor (if available)
  const [Ace, setAce] = useState(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import("react-ace");
        // Load minimal bundles for JSON
        await Promise.all([
          import("ace-builds/src-noconflict/mode-json"),
          import("ace-builds/src-noconflict/theme-github"),
          import("ace-builds/src-noconflict/theme-twilight"),
        ]);
        if (mounted) setAce(() => (mod.default || mod));
      } catch (e) {
        // Silently keep fallback textarea
        if (mounted) setAce(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const [value, setValue] = useState("{}");
  const [baseline, setBaseline] = useState("{}");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const textareaRef = useRef(null);
  const aceEditorRef = useRef(null);
  const suppressRefEventsRef = useRef(false);
  const lastEmittedRefRef = useRef({ parentId: null, refId: null });

  const { activeDocId, setActiveDocId } = useSelection();

  useEffect(() => {
    if (activeDocId) return;
    setValue("{}");
    setBaseline("{}");
    setError("");
  }, [activeDocId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeDocId) return;
      const doc = await safeGetDoc(activeDocId);
      if (!doc || cancelled) return;
      try {
        const text = JSON.stringify(doc, null, 2);
        setValue(text);
        setBaseline(text);
        setError("");
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [activeDocId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e) => {
      try {
        const { parentId, slot } = e.detail || {};
        if (!slot) return;
        const jumpTextarea = () => {
          const textarea = textareaRef.current;
          if (!textarea) return;
          const query = `"${slot}"`;
          const idx = value.indexOf(query);
          if (idx >= 0) { textarea.focus(); textarea.setSelectionRange(idx, idx + query.length); }
        };
        const jumpAce = () => {
          const ed = aceEditorRef.current;
          if (!ed) return;
          const query = `"${slot}"`;
          try { ed.find(query, { backwards: false, wrap: true, caseSensitive: true, wholeWord: false, regExp: false }); } catch {}
        };
        suppressRefEventsRef.current = true;
        const finish = () => setTimeout(() => { suppressRefEventsRef.current = false; }, 150);
        if (parentId && parentId !== activeDocId) {
          setActiveDocId(parentId);
          setTimeout(() => { (Ace ? jumpAce() : jumpTextarea()); finish(); }, 200);
        } else {
          (Ace ? jumpAce() : jumpTextarea());
          finish();
        }
      } catch {}
    };
    window.addEventListener("store:seekSlot", handler);
    return () => window.removeEventListener("store:seekSlot", handler);
  }, [Ace, activeDocId, setActiveDocId, value]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const onSaved = async (e) => {
      try {
        const detail = e?.detail || {};
        const targetId = detail.$id;
        const isReset = !!detail.reset;
        const isManual = targetId === "__manual__";
        const isDeletedActive = !!detail.deleted && targetId === activeDocId;
        const shouldReload = isReset || isManual || targetId === activeDocId || isDeletedActive;
        if (!shouldReload) return;
        if (!activeDocId) return;
        const isDirty = value !== baseline;
        if (isDirty && !isReset) return;
        if (isDeletedActive) {
          setValue("{}");
          setBaseline("{}");
          setError("");
          return;
        }
        const doc = await safeGetDoc(activeDocId);
        if (cancelled) return;
        const text = doc ? JSON.stringify(doc, null, 2) : "{}";
        setValue(text);
        setBaseline(text);
        setError("");
      } catch {}
    };
    window.addEventListener("store:docSaved", onSaved);
    return () => {
      cancelled = true;
      window.removeEventListener("store:docSaved", onSaved);
    };
  }, [activeDocId, value, baseline]);

  const tryParse = (text) => {
    try {
      const parsed = JSON.parse(text);
      setError("");
      return parsed;
    } catch (e) {
      setError(e.message || "Invalid JSON");
      return null;
    }
  };

  const validateDoc = (obj) => {
    const errs = [];
    if (!obj || typeof obj !== "object") errs.push("Document must be an object");
    if (!obj.$id && activeDocId == null) errs.push("Missing $id (or select a document in the explorer)");
    try { const len = JSON.stringify(obj).length; if (len > 2_000_000) errs.push("Document too large (>2MB)"); } catch {}
    return { ok: errs.length === 0, errors: errs };
  };

  const persistToStore = async (parsed) => {
    try {
      const targetId = parsed.$id || activeDocId;
      if (!targetId) return false;
      parsed.$id = targetId;
      const existing = await safeGetDoc(targetId);
      const prevVersion = existing?.meta?.version ?? 0;
      const meta = {
        ...(parsed.meta || existing?.meta || {}),
        version: prevVersion + 1,
        updatedAt: new Date().toISOString(),
        origin: existing?.meta?.origin || parsed?.meta?.origin || "user",
      };
      await store.putDoc({ ...parsed, meta });
      try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("store:docSaved", { detail: { $id: targetId } })); } catch {}
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(""), 1500);
      try { setActiveDocId(targetId); } catch {}
      try { setBaseline(JSON.stringify(parsed, null, 2)); } catch {}
      return true;
    } catch (e) {
      console.warn("[JsonEditor] persistToStore failed", e);
      return false;
    }
  };

  const onUpdate = async () => {
    const parsed = tryParse(value);
    if (!parsed) return;
    const v = validateDoc(parsed);
    if (!v.ok) return;
    if (activeDocId) {
      const ok = await persistToStore(parsed);
      if (ok) { try { setBaseline(JSON.stringify(parsed, null, 2)); } catch {} }
    }
  };

  const onReset = () => {
    if (activeDocId) { setValue(baseline); setError(""); }
  };

  const isValid = useMemo(() => { try { JSON.parse(value); return true; } catch { return false; } }, [value]);
  const dirty = useMemo(() => value !== baseline, [value, baseline]);

  // Emit cursor ref id for textarea (naive: on selection change)
  const onTextareaCursor = () => {
    try {
      const textarea = textareaRef.current;
      if (!textarea || !activeDocId) return;
      const text = value;
      const selStart = textarea.selectionStart ?? 0;
      // naive: get the quoted token under cursor
      const left = text.lastIndexOf('"', selStart);
      const right = text.indexOf('"', selStart + 1);
      if (left >= 0 && right > left) {
        const token = text.slice(left + 1, right);
        if (token && !suppressRefEventsRef.current) {
          const last = lastEmittedRefRef.current || {};
          if (!(last.parentId === activeDocId && last.refId === token)) {
            lastEmittedRefRef.current = { parentId: activeDocId, refId: token };
            window.dispatchEvent(new CustomEvent("store:cursorRefId", { detail: { parentId: activeDocId, refId: token } }));
          }
        }
      }
    } catch {}
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {Ace ? (
          <Ace
            mode="json"
            theme={"github"}
            width="100%"
            height="100%"
            value={value}
            onChange={(v) => { setValue(v); tryParse(v); }}
            name="designer-json-editor"
            fontSize={14}
            setOptions={{ useWorker: false, showPrintMargin: false, tabSize: 2 }}
            editorProps={{ $blockScrolling: true }}
            onLoad={(editor) => {
              try {
                aceEditorRef.current = editor;
                const session = editor.getSession();
                const handleCursor = () => {
                  try {
                    if (!activeDocId || suppressRefEventsRef.current) return;
                    const pos = editor.getCursorPosition();
                    const token = session.getTokenAt(pos.row, pos.column);
                    if (!token || !token.type || token.type.indexOf("string") === -1) return;
                    const raw = token.value || "";
                    if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') return;
                    const refId = raw.slice(1, -1);
                    if (!refId) return;
                    const last = lastEmittedRefRef.current || {};
                    if (last.parentId === activeDocId && last.refId === refId) return;
                    lastEmittedRefRef.current = { parentId: activeDocId, refId };
                    window.dispatchEvent(new CustomEvent("store:cursorRefId", { detail: { parentId: activeDocId, refId } }));
                  } catch {}
                };
                editor.selection.on("changeCursor", handleCursor);
                editor.on("destroy", () => {
                  try { editor.selection.off("changeCursor", handleCursor); } catch {}
                });
              } catch {}
            }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); tryParse(e.target.value); }}
            onKeyUp={onTextareaCursor}
            onClick={onTextareaCursor}
            spellCheck={false}
            style={{ width: "100%", height: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 14, lineHeight: 1.4, background: "var(--color-panel-solid)", color: "var(--gray-12)", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 6, padding: 10 }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ color: 'var(--gray-9)', fontSize: 12 }}>
            {error ? `Parse error: ${error}` : ''}
          </span>
          <span style={{ color: 'var(--green-11)', fontSize: 12, opacity: saveStatus ? 1 : 0 }}>
            {saveStatus}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 4px", borderTop: "1px solid rgba(148,163,184,0.3)" }}>
        <button
          onClick={onUpdate}
          disabled={!isValid || !dirty}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid transparent", background: isValid && dirty ? "#16a34a" : "#94a3b8", color: "white", fontWeight: 600, cursor: isValid && dirty ? "pointer" : "not-allowed" }}
          title={isValid ? (dirty ? "Save changes" : "No changes to save") : "Fix JSON to enable"}
        >
          Save
        </button>
        <button
          onClick={onReset}
          disabled={!dirty}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #64748b", background: dirty ? "transparent" : "#e5e7eb33", color: "var(--gray-12)", fontWeight: 600, cursor: dirty ? "pointer" : "not-allowed" }}
          title="Reset to original (clears saved state)"
        >
          Reset to Original
        </button>
      </div>
    </div>
  );
}
