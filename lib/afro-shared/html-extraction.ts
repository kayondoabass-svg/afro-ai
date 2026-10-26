/**
 * Extract a website from an assistant response or repair an older saved page.
 * Only remove text outside a recognizable HTML document/code fence; never
 * rewrite content inside the document (including scripts, styles and copy).
 */
export function extractWebsiteHtml(input: string): string | null {
  if (!input || typeof input !== "string") return null;

  // A complete document wins over any incidental HTML snippets in the plan.
  // Fences are examined first so a fenced fragment does not consume prose.
  const fences = Array.from(input.matchAll(/^[ \t]*```([a-z0-9_-]*)[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gim));
  const explicit = fences.filter(m => /^(html|htm)$/i.test(m[1]));
  for (const fence of [...explicit, ...fences.filter(m => !/^(html|htm)$/i.test(m[1]))]) {
    const html = extractDocument(fence[2]) ?? extractFragment(fence[2]);
    if (html) return html;
  }
  return extractDocument(input) ?? extractFragment(input);
}

function extractDocument(input: string): string | null {
  const open = /<!doctype\s+html\b[^>]*>|<html\b[^>]*>/i.exec(input);
  if (!open) return null;
  const close = /<\/html\s*>/gi;
  close.lastIndex = open.index + open[0].length;
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = close.exec(input))) last = match;
  if (!last) return null;
  const document = input.slice(open.index, last.index + last[0].length);
  if (!/<(?:head|body|main|div|section|article|style|script|title|meta|p|h[1-6])\b/i.test(document)) return null;
  // If the response has a preamble before <html>, include a DOCTYPE only
  // when it belongs to that document.
  return document.trim();
}

function extractFragment(input: string): string | null {
  // Fragments must be unmistakably markup, not a plan mentioning a tag.
  // Accept a fenced or standalone root element, with optional explanatory
  // preamble, only when its closing tag is present.
  const root = /<(body|main|div|section|article|header|nav|canvas|svg|h[1-6]|p)\b[^>]*>/i.exec(input);
  if (!root) return null;
  const before = input.slice(0, root.index).trim();
  const leadingStyle = /^\s*(?:<style\b[^>]*>[\s\S]*?<\/style>\s*)+$/i.test(before);
  if (before && !leadingStyle &&
      !/(?:^|\n)\s*(?:here(?:'s| is)|voici|ci-dessous|below|code|website|site|page)\b/i.test(before)) return null;
  const close = new RegExp(`</${root[1]}\\s*>`, "gi");
  close.lastIndex = root.index + root[0].length;
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = close.exec(input))) last = match;
  if (!last) return null;
  const end = last.index + last[0].length;
  const trailing = input.slice(end);
  // Scripts/styles after the root are valid fragment content. Keep them only
  // when there is no trailing explanation or markdown fence.
  const trailingMarkup = /^\s*(?:<([a-z][\w:-]*)\b[^>]*>[\s\S]*?<\/\1\s*>\s*)+$/i.test(trailing);
  return input.slice(leadingStyle ? 0 : root.index, trailingMarkup ? input.length : end).trim();
}