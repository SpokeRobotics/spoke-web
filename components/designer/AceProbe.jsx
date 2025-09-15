"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, Flex, Text, Code, Button, Callout } from "@radix-ui/themes";

export default function AceProbe() {
  const [status, setStatus] = useState("idle"); // idle|loading|ok|error
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState("");
  const [AceComponent, setAceComponent] = useState(null);

  const sample = useMemo(() => JSON.stringify({ $id: "spoke://docs/sample", title: "Sample", meta: { origin: "user" } }, null, 2), []);

  const tryLoad = async () => {
    setStatus("loading");
    setMessage("Loading react-ace and ace-builds...");
    setDetails("");
    setAceComponent(null);
    try {
      // Load react-ace first
      const mod = await import("react-ace");
      const Ace = mod.default || mod;
      // Load common Ace bundles
      await Promise.all([
        import("ace-builds/src-noconflict/mode-json"),
        import("ace-builds/src-noconflict/theme-github"),
        import("ace-builds/src-noconflict/theme-twilight"),
        import("ace-builds/src-noconflict/ext-searchbox"),
      ]);
      setAceComponent(() => Ace);
      setStatus("ok");
      setMessage("react-ace loaded successfully.");
    } catch (e) {
      setStatus("error");
      setMessage("Failed to initialize react-ace under React 19 / Next 15.");
      setDetails(String(e?.stack || e?.message || e));
    }
  };

  useEffect(() => {
    // Auto run on mount
    tryLoad();
  }, []);

  const ReactVersion = useMemo(() => {
    try { return React?.version || "unknown"; } catch { return "unknown"; }
  }, []);

  return (
    <Card className="section">
      <Flex direction="column" gap="3">
        <Text weight="bold">Ace Compatibility Probe</Text>
        <Text size="2" color="gray">Environment</Text>
        <Flex direction="column" gap="1">
          <Text size="2">React version: <Code>{ReactVersion}</Code></Text>
          <Text size="2">Next.js: <Code>{process?.env?.NEXT_RUNTIME ? "app" : "pages"}</Code></Text>
        </Flex>
        <Flex align="center" gap="2">
          <Button size="1" onClick={tryLoad} disabled={status === "loading"}>{status === "loading" ? "Probing…" : "Re-run Probe"}</Button>
          <Text size="2">Status: <Code>{status}</Code></Text>
        </Flex>
        {message && <Text size="2" color={status === "error" ? "red" : "green"}>{message}</Text>}
        {status === "error" && details && (
          <Callout.Root color="red">
            <Callout.Text>
              {details}
            </Callout.Text>
          </Callout.Root>
        )}
        {status === "ok" && AceComponent && (
          <div style={{ height: 280 }}>
            <AceComponent
              mode="json"
              theme={"github"}
              width="100%"
              height="100%"
              value={sample}
              setOptions={{ useWorker: false, tabSize: 2, showPrintMargin: false }}
              editorProps={{ $blockScrolling: true }}
              name="ace-probe-editor"
              readOnly={false}
            />
          </div>
        )}
      </Flex>
    </Card>
  );
}
