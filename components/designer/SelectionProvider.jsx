"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

const SelCtx = createContext({
  activeDocId: null,
  setActiveDocId: () => {},
  selectedId: null,
  setSelectedId: () => {},
});

export function useSelection() {
  return useContext(SelCtx);
}

export default function SelectionProvider({ children }) {
  const [activeDocId, setActiveDocId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const value = useMemo(() => ({ activeDocId, setActiveDocId, selectedId, setSelectedId }), [activeDocId, selectedId]);
  return <SelCtx.Provider value={value}>{children}</SelCtx.Provider>;
}
