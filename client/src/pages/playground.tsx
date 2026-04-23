import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sandpack } from "@codesandbox/sandpack-react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { Play, Loader2, Cloud, Globe, FileCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_PY = `# Welcome to the Python playground (runs entirely in your browser)
name = "Afro AI"
for i in range(3):
    print(f"Hello {name} #{i+1}")

# Try numpy
import numpy as np
arr = np.array([1, 2, 3, 4, 5])
print("mean:", arr.mean())
`;

const DEFAULT_NODE = `// Runs in a real Node.js sandbox in the cloud
const greet = (name) => \`Hello \${name}!\`;
console.log(greet("Afro AI"));
console.log("Node version:", process.version);
console.log("Platform:", process.platform);
`;

declare global {
  interface Window {
    loadPyodide?: (opts?: any) => Promise<any>;
  }
}

function PythonPlayground() {
  const [code, setCode] = useState(DEFAULT_PY);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading Python runtime…");
  const pyodideRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Pyodide"));
          document.head.appendChild(s);
        });
      }
      try {
        const py = await window.loadPyodide!({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
        });
        if (cancelled) return;
        pyodideRef.current = py;
        setLoading(false);
        setStatus("Python ready. Click Run.");
      } catch (e: any) {
        if (cancelled) return;
        setStatus("Couldn't load Python: " + e.message);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const run = async () => {
    if (!pyodideRef.current) return;
    setRunning(true);
    setOutput("");
    let buf = "";
    pyodideRef.current.setStdout({ batched: (s: string) => { buf += s + "\n"; setOutput(buf); } });
    pyodideRef.current.setStderr({ batched: (s: string) => { buf += s + "\n"; setOutput(buf); } });
    try {
      await pyodideRef.current.loadPackagesFromImports(code);
      const result = await pyodideRef.current.runPythonAsync(code);
      if (result !== undefined) buf += String(result) + "\n";
      setOutput(buf || "(no output)");
    } catch (e: any) {
      setOutput(buf + "\nError: " + e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground" data-testid="text-python-status">{status}</p>
        <Button onClick={run} disabled={loading || running} data-testid="button-run-python">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Run
        </Button>
      </div>
      <Card className="overflow-hidden">
        <CodeMirror
          value={code}
          height="320px"
          extensions={[python()]}
          onChange={(v) => setCode(v)}
          theme="dark"
          data-testid="editor-python"
        />
      </Card>
      <Card className="p-3 bg-zinc-950 text-zinc-100 font-mono text-xs whitespace-pre-wrap min-h-[120px] max-h-[280px] overflow-auto" data-testid="text-python-output">
        {output || (loading ? "Loading…" : "Output appears here.")}
      </Card>
    </div>
  );
}

function WebPlayground() {
  return (
    <div className="rounded-lg overflow-hidden border" data-testid="sandpack-web">
      <Sandpack
        template="react"
        theme="dark"
        options={{
          showNavigator: true,
          showTabs: true,
          showLineNumbers: true,
          editorHeight: 480,
        }}
      />
    </div>
  );
}

function CloudPlayground() {
  const { toast } = useToast();
  const [code, setCode] = useState(DEFAULT_NODE);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setOutput("Running in cloud sandbox…");
    try {
      const res = await fetch("https://afroaigroup.com/cf-auth/run-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "node", code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === "not_configured") {
          setOutput(
            "Cloud sandbox isn't configured yet.\n\n" +
            "Add an E2B_API_KEY secret to the Cloudflare worker to enable this.\n" +
            "(Sign up at https://e2b.dev — free tier available.)"
          );
        } else if (data?.code === "rate_limited") {
          setOutput("You've hit the cloud sandbox limit. Try again in a minute.");
        } else {
          setOutput("Error: " + (data?.message || res.statusText));
        }
        return;
      }
      const out = [data.stdout, data.stderr].filter(Boolean).join("\n");
      setOutput(out || "(no output)");
    } catch (e: any) {
      setOutput("Network error: " + e.message);
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Real Node.js + npm in a secure cloud sandbox.</p>
        <Button onClick={run} disabled={running} data-testid="button-run-cloud">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Cloud className="h-4 w-4 mr-2" />}
          Run in Cloud
        </Button>
      </div>
      <Card className="overflow-hidden">
        <CodeMirror
          value={code}
          height="320px"
          onChange={(v) => setCode(v)}
          theme="dark"
          data-testid="editor-cloud"
        />
      </Card>
      <Card className="p-3 bg-zinc-950 text-zinc-100 font-mono text-xs whitespace-pre-wrap min-h-[120px] max-h-[280px] overflow-auto" data-testid="text-cloud-output">
        {output || "Output appears here."}
      </Card>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-playground">Run Code</h1>
        <p className="text-muted-foreground">
          Run JavaScript, Python, or full apps right inside Afro AI — no downloads, no setup.
        </p>
      </div>
      <Tabs defaultValue="web" className="w-full">
        <TabsList>
          <TabsTrigger value="web" data-testid="tab-web"><Globe className="h-4 w-4 mr-1" /> Web App</TabsTrigger>
          <TabsTrigger value="python" data-testid="tab-python"><FileCode className="h-4 w-4 mr-1" /> Python</TabsTrigger>
          <TabsTrigger value="cloud" data-testid="tab-cloud"><Cloud className="h-4 w-4 mr-1" /> Cloud (Node)</TabsTrigger>
        </TabsList>
        <TabsContent value="web" className="mt-4"><WebPlayground /></TabsContent>
        <TabsContent value="python" className="mt-4"><PythonPlayground /></TabsContent>
        <TabsContent value="cloud" className="mt-4"><CloudPlayground /></TabsContent>
      </Tabs>
    </div>
  );
}
