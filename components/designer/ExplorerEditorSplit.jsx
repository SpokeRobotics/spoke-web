"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Card, Heading, Text } from "@radix-ui/themes";
import ObjectExplorerPanel from "@/components/designer/ObjectExplorerPanel.jsx";
import JsonEditor from "@/components/designer/JsonEditor.jsx";

export default function ExplorerEditorSplit() {
  const containerRef = useRef(null);
  const [leftWidth, setLeftWidth] = useState(320); // px
  const [dragging, setDragging] = useState(false);

  const minW = 220;
  const maxW = 520;

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  // Load/save persisted width (use spoko-web specific key)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("store:explorerWidth");
      if (saved) setLeftWidth(Math.max(minW, Math.min(maxW, parseInt(saved, 10) || 320)));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("store:explorerWidth", String(leftWidth)); } catch {}
  }, [leftWidth]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const x = clientX - rect.left; // position within container
      const clamped = Math.max(minW, Math.min(maxW, x));
      setLeftWidth(clamped);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  // Re-clamp on window resize so left does not exceed container
  useEffect(() => {
    const onResize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const maxAllowed = Math.min(maxW, Math.max(minW, Math.floor(rect.width * 0.6))); // keep reasonable share
      setLeftWidth((w) => Math.min(w, maxAllowed));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <section style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
        className="explorer-editor-container"
      >
        <style>{`
          .explorer-editor-container { flex-direction: row; align-items: stretch; }
          .explorer-pane { flex: 0 0 var(--left-width); width: var(--left-width); min-width: ${minW}px; max-width: ${maxW}px; overflow: hidden; }
          .editor-pane { flex: 1 1 auto; min-width: 0; }
          .drag-handle { width: 8px; cursor: col-resize; background: transparent; transition: background 0.2s; height: auto; align-self: stretch; position: relative; display: block; }
          .drag-handle:hover, .drag-handle.dragging { background: transparent; }
          .drag-handle .grip { position: absolute; left: 50%; top: 20%; bottom: 20%; width: 2px; transform: translateX(-50%); background: var(--gray-8); border-radius: 1px; opacity: 0.9; }
        `}</style>
        <Box
          className="explorer-pane"
          style={{
            "--left-width": `${leftWidth}px`,
            display: "flex",
          }}
        >
          <ObjectExplorerPanel />
        </Box>
        <Box
          aria-label="Resize explorer"
          role="separator"
          aria-orientation="vertical"
          className={`drag-handle ${dragging ? "dragging" : ""}`}
          onMouseDown={onMouseDown}
          onTouchStart={onMouseDown}
        >
          <span className="grip" />
        </Box>
        <Box className="editor-pane" style={{ display: "flex" }}>
          <Card className="section" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box className="editor" style={{ flex: 1, minHeight: 0 }}>
              <JsonEditor />
            </Box>
          </Card>
        </Box>
      </Box>
      <style>{`
        /* Show handle only on md+ */
        @media (min-width: 768px) { .drag-handle { display: block !important; } }
      `}</style>
    </section>
  );
}
