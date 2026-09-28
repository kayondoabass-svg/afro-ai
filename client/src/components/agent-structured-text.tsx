import type { ReactNode } from "react";

type Segment = { type: "text" | "plan" | "requirements"; content: string };
const marker = /\[(BUILD PLAN|REQUIREMENTS CHECK)\]([\s\S]*?)(?:\[\/\1\]|$)/gi;

/** Only parse markers in prose. HTML/CSS and code fences are never rewritten. */
export function splitAgentText(text: string): Segment[] {
  const result: Segment[] = [];
  const fences = text.split(/(```[\s\S]*?```|```[\s\S]*$|<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>|`[^`\n]*`)/gi);
  for (const chunk of fences) {
    if (!chunk) continue;
    if (chunk.startsWith("`") || /^<(?:style|script)\b/i.test(chunk)) {
      result.push({ type: "text", content: chunk });
      continue;
    }
    let last = 0;
    marker.lastIndex = 0;
    for (const match of Array.from(chunk.matchAll(marker))) {
      const at = match.index ?? 0;
      if (at > last) result.push({ type: "text", content: chunk.slice(last, at) });
      result.push({
        type: match[1].toUpperCase() === "BUILD PLAN" ? "plan" : "requirements",
        content: match[2].trim(),
      });
      last = at + match[0].length;
    }
    if (last < chunk.length) result.push({ type: "text", content: chunk.slice(last) });
  }
  return result;
}

export function AgentStructuredText({ text, renderText }: { text: string; renderText: (text: string, index: number) => ReactNode }) {
  return <div className="min-w-0 space-y-3">
    {splitAgentText(text).map((part, i) => part.type === "text"
      ? <div key={i} className="min-w-0">{renderText(part.content, i)}</div>
      : <details key={i} className="rounded-lg border border-violet-500/25 bg-violet-500/5 text-sm">
          <summary className="cursor-pointer px-3 py-2 font-medium text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
            {part.type === "plan" ? "Build plan" : "Requirements check"}
            <span className="ml-2 text-xs font-normal text-zinc-400">Tap to read</span>
          </summary>
          <div className="border-t border-violet-500/20 px-3 py-3 whitespace-pre-wrap break-words text-zinc-300">{part.content || "Preparing details…"}</div>
        </details>)}
  </div>;
}