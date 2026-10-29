import {createHash} from "node:crypto";
import sharp from "sharp";
import {parse,serialize,parseFragment} from "parse5";

export const ASSET_POLICY = `
PROJECT VISUAL ASSETS AND HONEST BUILD RESULTS:
- Uploaded images are optional. Use the customer's assets first; only use the supplied project asset manifest for photographic URLs.
- NEVER invent image URLs, Unsplash IDs, source.unsplash endpoints, picsum/random photographs or query/sig tricks.
- Do not invent a customer's actual products, staff or premises. Stock/generated pictures are illustrative, never evidence of their real business.
- If no suitable image is available, build a complete design using typography, icons or original inline SVG; explain the missing imagery separately. Never leave broken image boxes.
- Dashboards, backend utilities and text-heavy tools do not require photography.
- Do not generate paid images automatically. Explain the cost and use the existing media workflow only after explicit customer approval.
- Keep the customer's existing images during unrelated edits. Never import another project's private image, even if its owner is the same.
- Choose composition, colours and density for this customer's brief. Do not force glass panels, tilt effects or one vendor theme.
- Do not claim forms, payments or authentication work without the actual backend connection. State what is implemented, what was tested and what remains unverified.
`;
export function websiteVisualBrief(prompt:string) {
  const text=prompt.toLowerCase();
  const build=/\b(build|create|generate|design|make|website|landing|app|page)\b/.test(text);
  const planOnly=/\b(plan only|just (?:a )?plan|do not build|don't build|explain|how (?:do|to))\b/.test(text);
  const noPhoto=/\b(no (?:photos?|images?)|without (?:photos?|images?)|dashboard|calculator|utility|api|backend|text.only|todo|to-do)\b/.test(text);
  // A small vocabulary is only an optional privacy-preserving industry hint,
  // not a template dictionary. Unfamiliar sectors still get the complete build
  // and may supply an explicit public photo query through the asset picker.
  const subject=text.match(/\b(gym|fitness|restaurant|salon|barber|bakery|hotel|school|farm|dentist|hospital|travel|fashion|coffee|furniture|construction|mechanic|jewellery|jewelry|real estate|photography|flowers|yoga|spa|sports)\b/)?.[0];
  return {build:build&&!planOnly,needsPhotos:build&&!planOnly&&!noPhoto,publicSubject:subject||null};
}
export async function optimizeWebsiteImage(input:Buffer) {
  if(!input.length||input.length>8*1024*1024)throw new Error("Upload a raster image smaller than 8 MB.");
  const image=sharp(input,{limitInputPixels:16_777_216,animated:false});
  const metadata=await image.metadata();
  if(!["jpeg","png","webp"].includes(metadata.format||"")||(metadata.pages||1)>1)throw new Error("Use a still PNG, JPEG or WebP image.");
  let bytes=await image.rotate().resize({width:1440,height:1440,fit:"inside",withoutEnlargement:true}).webp({quality:78}).toBuffer();
  if(bytes.length>150000)bytes=await sharp(bytes).resize({width:960,height:960,fit:"inside"}).webp({quality:65}).toBuffer();
  if(bytes.length>150000)bytes=await sharp(bytes).resize({width:640,height:640,fit:"inside"}).webp({quality:48}).toBuffer();
  if(bytes.length>150000)throw new Error("This image is too large after optimization. Please upload a smaller image.");
  const output=await sharp(bytes).metadata();
  return {bytes,width:output.width!,height:output.height!,sha256:createHash("sha256").update(bytes).digest("hex")};
}
export const imagePath=(id:string)=>`assets/images/${id}.webp`;
export function compactProjectImageContext(text:string,images:Map<string,string>) {
  const paths=new Map<string,string>();
  for(const [path,data] of Array.from(images.entries()))if(!path.startsWith("api/")&&!paths.has(data))paths.set(data,path);
  return text.replace(/data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+/g,data=>paths.get(data)||data);
}
export const plainText=(text:unknown,max=300)=>typeof text==="string"?text.replace(/<[^>]*>/g,"").replace(/[<>]/g,"").slice(0,max):"";
const forbiddenImage=/^(?:https?:\/\/)?(?:picsum\.photos|source\.unsplash\.com|placehold\.co)(?:\/|$)|photo-(?:auto|random)|images\.unsplash\.com\/.*[?&](?:query|sig)=/i;

// Every provided path is owner-checked by the caller. Inline a separate,
// publication-safe copy: public visitors never need a private project cookie.
export function finalizeWebsiteHtml(html:string,images:Map<string,string>,options:{
  previousHtml?:string;assets?:{path:string;attribution:any}[];
}={}) {
  const tree:any=parse(html);
  const missing=new Set<string>();
  const used=new Set<string>();
  let inlineBudget=Math.max(0,850000-Buffer.byteLength(html,"utf8"));
  const priorImages=new Set<string>();
  // Existing owner-authored URLs are preserved on edits; new builds may only
  // introduce resolved project photos, not hallucinated external addresses.
  const old:any=parse(options.previousHtml||"");
  function collect(node:any) {
    for(const a of node.attrs||[])if(["src","poster","data-src"].includes(a.name))priorImages.add(a.value);
    for(const a of node.attrs||[])if(a.name==="style")for(const m of a.value.matchAll(/url\(\s*['"]?([^)'"]+)/gi))priorImages.add(m[1]);
    if(node.tagName==="style")for(const c of node.childNodes||[])for(const m of (c.value||"").matchAll(/url\(\s*['"]?([^)'"]+)/gi))priorImages.add(m[1]);
    for(const c of node.childNodes||[])collect(c);
  }
  collect(old);
  function resolve(url:string) {
    const normalized=url.replace(/^\.\//,"").replace(/^\//,"");
    const own=images.get(normalized);
    if(own) {
      if(own.length>inlineBudget){missing.add("Some photos exceeded the single-page image budget; complete the layout without these images.");return "";}
      inlineBudget-=own.length;used.add(normalized);return own;
    }
    if(/\.(?:woff2?|ttf|otf)(?:[?#].*)?$/i.test(url))return url;
    if(/(?:^|\/)api\/(?:website-assets|media\/jobs|conversations\/[^/]+\/website-assets)\//i.test(url)||
      /^assets\/images\/[a-f0-9-]+\.webp$/i.test(normalized)||forbiddenImage.test(url)||
      (/^(?:https?:|\/\/|\/?uploads\/)/i.test(url)&&!priorImages.has(url))) {
      missing.add("An unavailable or unapproved image was omitted.");return "";
    }
    return url;
  }
  function walk(node:any) {
    if(node.attrs) {
      const attrs=node.attrs as {name:string,value:string}[];
      for(const attr of attrs) {
        if(["src","poster","data-src"].includes(attr.name)&&node.tagName!=="script")attr.value=resolve(attr.value);
        if(attr.name==="srcset")attr.value=attr.value.startsWith("data:")?attr.value:attr.value.split(",").map(s=>{
          const [url,...size]=s.trim().split(/\s+/);const mapped=resolve(url);return mapped?[mapped,...size].join(" "):"";
        }).filter(Boolean).join(", ");
        if(attr.name==="style")attr.value=css(attr.value);
      }
      if(node.tagName==="img"&&!attrs.find(a=>a.name==="src")?.value) {
        node.tagName="span";node.nodeName="span";
        node.attrs=attrs.filter(a=>!["src","srcset","data-src"].includes(a.name));
        node.childNodes=[{nodeName:"#text",value:attrs.find(a=>a.name==="alt")?.value||"Illustration unavailable",parentNode:node}];
      }
    }
    if(node.tagName==="style")for(const child of node.childNodes||[])if(child.nodeName==="#text")child.value=css(child.value);
    for(const child of node.childNodes||[])walk(child);
    if(node.content)walk(node.content);
  }
  function css(text:string) {return text.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,(_m,_q,url)=>{
    const value=resolve(url.trim());return value?`url("${value}")`:"none";
  });}
  walk(tree);
  const credits=(options.assets||[]).filter(a=>used.has(a.path)&&a.attribution?.sourceUrl);
  if(credits.length) {
    const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
    const entries=credits.map(a=>{
      const c=a.attribution;
      const safeLink=(url:unknown)=>typeof url==="string"&&/^https:\/\/(?:commons\.wikimedia\.org\/wiki\/File:|creativecommons\.org\/)/.test(url)?escape(url):"";
      const license=escape(plainText(c.license)),licenseLink=safeLink(c.licenseUrl);
      return `<li>${escape(plainText(c.artist)||"Photographer")} — <a href="${safeLink(c.sourceUrl)}" rel="noopener noreferrer">${escape(plainText(c.title)||"Source photograph")}</a> · ${licenseLink?`<a href="${licenseLink}" rel="noopener noreferrer">${license}</a>`:license}. ${escape(plainText(c.changes))}</li>`;
    }).join("");
    const fragment:any=parseFragment(`<details data-project-image-credits><summary>Image credits</summary><ul>${entries}</ul></details>`);
    const body=tree.childNodes.find((n:any)=>n.tagName==="html")?.childNodes.find((n:any)=>n.tagName==="body");
    if(body)for(const n of fragment.childNodes){n.parentNode=body;body.childNodes.push(n);}
  }
  return {html:serialize(tree),warnings:Array.from(missing)};
}
