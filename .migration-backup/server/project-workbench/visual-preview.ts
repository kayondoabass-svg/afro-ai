import { posix } from "node:path";
import { parse, serialize } from "parse5";
import { ProjectFileError, validateProjectFiles, type ProjectFile } from "../project-file-policy";

// Never install/build/run customer packages on the Afro AI host. Render a
// bounded, self-contained static snapshot in the separately hosted browser.
const mime: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf",
};
const blocked = (reason: string): never => { throw new ProjectFileError(422, reason); };
export function staticVisualPreview(input: ProjectFile[], entry = "index.html"): string {
  const files = validateProjectFiles(input);
  const byPath = new Map(files.map(file => [file.path, file]));
  const root = byPath.get(entry);
  if (!root || root.encoding || !entry.endsWith(".html")) blocked("A saved HTML entry page is required for browser capture.");
  function resolveFile(ref: string, from: string) {
    if (!ref || /[?#\\]/.test(ref) || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref))
      blocked("External or dynamic assets require the customer-local validation runner.");
    let decoded: string;
    try { decoded = decodeURIComponent(ref); } catch { return blocked("Invalid asset path."); }
    if (decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").includes(".."))
      blocked("Asset path is outside this project snapshot.");
    const path = posix.normalize(decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(from), decoded));
    const file = byPath.get(path);
    if (!file) blocked("An asset referenced by the entry page is missing from the saved project.");
    return file!;
  }
  function dataAsset(ref: string, from: string) {
    if (/^data:(?:image\/(?:png|jpeg|gif|webp|x-icon)|font\/[\w-]+);base64,[a-z0-9+/]+=*$/i.test(ref)) return ref;
    const file = resolveFile(ref, from);
    const type = mime[file.path.split(".").pop()!];
    if (!file.encoding || !type) blocked("Only validated project images and fonts can be embedded in this preview.");
    return `data:${type};base64,${file.content}`;
  }
  function css(content: string, from: string) {
    if (/@import\b/i.test(content)) blocked("CSS imports must be bundled into saved stylesheets before browser capture.");
    return content.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (_all, a, b, c) => {
      const ref = (a ?? b ?? c).trim();
      if (ref.startsWith("#")) return `url("${ref.replace(/"/g, "")}")`;
      return `url("${dataAsset(ref, from)}")`;
    }).replace(/<\/style/gi, "<\\/style");
  }
  const document: any = parse(root!.content);
  const text = (parent: any, value: string) => ({ nodeName: "#text", value, parentNode: parent });
  function walk(node: any) {
    const attrs: any[] = node.attrs || [];
    const get = (name: string) => attrs.find(a => a.name === name)?.value;
    const remove = (...names: string[]) => { node.attrs = attrs.filter(a => !names.includes(a.name)); };
    if (["iframe", "object", "embed", "base"].includes(node.tagName))
      blocked("Embedded frames and external documents are not supported by offline capture.");
    if (node.tagName === "meta" && ["refresh", "content-security-policy"].includes((get("http-equiv") || "").toLowerCase()))
      blocked("Entry-page redirects or custom security policies are not supported by this capture mode.");
    if (get("srcset") || ["audio", "video"].includes(node.tagName))
      blocked("Responsive image sets and media require the customer-local validation runner.");
    if (node.tagName === "link") {
      if ((get("rel") || "").toLowerCase() !== "stylesheet") blocked("Bundle linked resources before browser capture.");
      const file = resolveFile(get("href"), entry);
      if (file.encoding || !file.path.endsWith(".css")) blocked("Invalid linked stylesheet.");
      node.nodeName = node.tagName = "style";
      remove("rel", "href", "integrity", "crossorigin");
      node.childNodes = [text(node, css(file.content, file.path))];
    } else if (node.tagName === "style") {
      node.childNodes = [text(node, css((node.childNodes || []).map((n: any) => n.value || "").join(""), entry))];
    } else if (node.tagName === "script") {
      if (get("type") === "module") blocked("Module-based applications must be built locally before this static capture.");
      if (get("src")) {
        const file = resolveFile(get("src"), entry);
        if (file.encoding || !file.path.endsWith(".js")) blocked("Invalid project script.");
        node.childNodes = [text(node, file.content.replace(/<\/script/gi, "<\\/script"))];
        remove("src", "integrity", "crossorigin");
      }
    } else if (node.tagName === "img" && get("src")) {
      attrs.find(a => a.name === "src").value = dataAsset(get("src"), entry);
    } else if (get("src") || get("poster") || get("background")) {
      blocked("Unbundled resources are not supported by offline capture.");
    }
    if (get("style")) attrs.find(a => a.name === "style").value = css(get("style"), entry);
    for (const child of node.childNodes || []) walk(child);
    if (node.content) walk(node.content);
  }
  walk(document);
  const head = document.childNodes.find((n: any) => n.tagName === "html")?.childNodes.find((n: any) => n.tagName === "head");
  if (!head) blocked("Invalid entry page.");
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";
  head.childNodes.unshift({ nodeName: "meta", tagName: "meta", namespaceURI: "http://www.w3.org/1999/xhtml",
    attrs: [{ name: "http-equiv", value: "Content-Security-Policy" }, { name: "content", value: policy }], childNodes: [], parentNode: head });
  const html = serialize(document);
  if (Buffer.byteLength(html) > 2_000_000) blocked("Embedded preview exceeds the 2 MB capture limit.");
  return html;
}
