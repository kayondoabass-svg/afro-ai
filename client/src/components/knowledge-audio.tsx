import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inspectQuota } from "@/lib/queryClient";

export function fileBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

export function KnowledgeAudio({ afroAvailable }: { afroAvailable: boolean }) {
  const [provider, setProvider] = useState("default");
  const [file, setFile] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ transcript: string; reply: string; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestKey = useRef<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => { if (!afroAvailable) { setProvider("default"); requestKey.current = null; } }, [afroAvailable]);

  function stop() {
    clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  }
  async function record() {
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const rec = new MediaRecorder(media);
      recorder.current = rec;
      const chunks: Blob[] = [];
      let bytes = 0;
      rec.ondataavailable = (event) => { chunks.push(event.data); bytes += event.data.size; if (bytes > 5 * 1024 * 1024) stop(); };
      rec.onstop = () => { if (mounted.current) { requestKey.current = null; setFile(new Blob(chunks, { type: rec.mimeType })); } };
      rec.start(1000);
      setRecording(true);
      timer.current = setTimeout(stop, 120_000);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      setError("Microphone unavailable. Allow microphone access or upload an audio file.");
    }
  }
  async function submit() {
    if (!file || busy) return;
    if (file.size > 5 * 1024 * 1024 || !file.size) { setError("Choose a non-empty audio file up to 5 MB."); return; }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(""); setResult(null);
    try {
      const audio = await fileBase64(file);
      abort.signal.throwIfAborted();
      requestKey.current ??= crypto.randomUUID();
      const response = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/audio/respond`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio, provider: afroAvailable ? provider : "default", idempotencyKey: requestKey.current }), signal: abort.signal,
      });
      const text = await response.text();
      inspectQuota(response, text);
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error("Audio service returned an invalid response."); }
      if (!response.ok) throw new Error(data.message || data.error || "Audio request failed.");
      const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      if (!abort.signal.aborted) setResult({ transcript: data.transcript, reply: data.reply, url: URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })) });
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Audio request failed.");
    } finally {
      if (controller.current === abort) { controller.current = null; setBusy(false); }
    }
  }
  return <Card>
    <CardHeader><CardTitle>Voice lab</CardTitle><CardDescription>Record or upload speech to get a transcript and spoken reply. This standalone demo does not search your documents. Up to 5 MB; only the first two minutes are processed.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <label className="block text-sm">Voice reply provider
        <select aria-label="Voice reply provider" className="block mt-2 rounded border bg-background p-2" value={provider} disabled={busy || recording} onChange={(e) => { setProvider(e.target.value); requestKey.current = null; }}>
          <option value="default">Default voice</option>
          {afroAvailable && <option value="afro-test">Afro test (speech → Afro → voice)</option>}
        </select>
      </label>
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="outline" disabled={busy} onClick={recording ? stop : () => void record()}>{recording ? "Stop recording" : "Record audio"}</Button>
        <input aria-label="Upload audio" type="file" accept="audio/*,.webm,.m4a,.mp4" disabled={busy || recording} onChange={(e) => { requestKey.current = null; setFile(e.target.files?.[0] || null); setError(""); }} />
        <Button disabled={!file || busy || recording} onClick={() => void submit()}>{busy ? "Processing…" : "Send audio"}</Button>
        {busy && <Button variant="outline" onClick={() => { controller.current?.abort(); controller.current = null; setBusy(false); }}>Cancel</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Quota and PAYG credits are reserved before generation. Cancellation or provider failure may still be billed. Retrying the same selection cannot charge twice; select another file or record again for a new request.</p>
      {file && <p className="text-sm text-muted-foreground">Audio selected ({Math.ceil(file.size / 1024)} KB)</p>}
      {recording && <p role="status">Recording… automatically stops after two minutes.</p>}
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {result && <div className="space-y-3">
        <div><h3 className="font-medium">Transcript</h3><p className="whitespace-pre-wrap text-sm">{result.transcript}</p></div>
        <div><h3 className="font-medium">Reply</h3><p className="whitespace-pre-wrap text-sm">{result.reply}</p></div>
        <audio controls src={result.url} aria-label="Spoken reply" />
        <a className="text-primary underline" href={result.url} download="voice-reply.mp3">Download reply</a>
      </div>}
    </CardContent>
  </Card>;
}