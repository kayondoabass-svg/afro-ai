// @vitest-environment node
import {describe,it,expect} from "vitest";
import sharp from "sharp";
import {websiteVisualBrief,finalizeWebsiteHtml,optimizeWebsiteImage,compactProjectImageContext} from "./policy";
import {safePhotoQuery,findStockPhoto} from "./stock";

describe("project image and generation policy",()=>{
  it("replaces known embedded image payloads with owned paths before model metering, without modifying saved output",()=>{
    const uri="data:image/webp;base64,AAAA",html=`<img src="${uri}">`;
    expect(compactProjectImageContext(html,new Map([["assets/images/own.webp",uri]]))).toBe('<img src="assets/images/own.webp">');
    expect(compactProjectImageContext(html,new Map())).toBe(html);
  });
  it("keeps no-upload builds usable and skips photography for utility apps or plan-only turns",()=>{
    expect(websiteVisualBrief("Build a gym website").needsPhotos).toBe(true);
    expect(websiteVisualBrief("Build a dashboard for a gym").needsPhotos).toBe(false);
    expect(websiteVisualBrief("Create a website without photos").needsPhotos).toBe(false);
    expect(websiteVisualBrief("Just a plan for my restaurant website").build).toBe(false);
    expect(websiteVisualBrief("Build a quantum computing conference website").needsPhotos).toBe(true);
  });
  it("rejects credentials, contact details and URLs in external photo queries",()=>{
    for(const query of ["hello@example.com gym","https://private.example.com","gym +256 772 123456"])expect(()=>safePhotoQuery(query)).toThrow();
    expect(safePhotoQuery("fitness training equipment")).toBe("fitness training equipment");
  });
  it("optimizes real raster images and rejects invalid bytes and SVG inputs",async()=>{
    const input=await sharp({create:{width:64,height:32,channels:3,background:"#123456"}}).png().toBuffer();
    const image=await optimizeWebsiteImage(input);
    expect(image.width).toBe(64);expect(image.height).toBe(32);expect(image.bytes.length).toBeLessThan(400000);
    await expect(optimizeWebsiteImage(Buffer.from("not an image"))).rejects.toThrow();
    await expect(optimizeWebsiteImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"></svg>'))).rejects.toThrow();
  });
  it("embeds only the current project's selected image and preserves CSS and scripts",()=>{
    const uri="data:image/webp;base64,V0VCUA==",path="assets/images/11111111-1111-4111-8111-111111111111.webp";
    const result=finalizeWebsiteHtml(`<html><head><style>.hero{background:url('${path}')}</style></head><body><img src="${path}"><script>window.ready=true</script></body></html>`,new Map([[path,uri]]));
    expect(result.html).toContain(uri);expect(result.html).toContain("window.ready=true");expect(result.warnings).toEqual([]);
  });
  it("omits fabricated, unapproved and foreign-project images rather than leaving broken image boxes",()=>{
    const result=finalizeWebsiteHtml(`<html><body><img src="https://images.unsplash.com/photo-auto-1?query=gym" alt="Gym"><img src="/api/conversations/999/website-assets/111/content"><img src="https://example.com/guessed.jpg"></body></html>`,new Map());
    expect(result.html).not.toContain("<img");expect(result.html).not.toContain("conversations/999");expect(result.warnings).toHaveLength(1);
  });
  it("preserves the customer's existing remote images on edits but never a foreign private image",()=>{
    const previous='<img src="https://customer.example/own.jpg"><img src="/api/conversations/999/website-assets/111/content">';
    const result=finalizeWebsiteHtml(`<html><body>${previous}</body></html>`,new Map(),{previousHtml:previous});
    expect(result.html).toContain("https://customer.example/own.jpg");expect(result.html).not.toContain("conversations/999");
  });
  it("retains visible stock attribution safely",()=>{
    const path="assets/images/a.webp",result=finalizeWebsiteHtml(`<html><body><img src="${path}"></body></html>`,new Map([[path,"data:image/webp;base64,abcd"]]),{assets:[{path,attribution:{
      title:"A gym",artist:"<script>alert(1)</script>Photographer",license:"CC BY 4.0",
      sourceUrl:"https://commons.wikimedia.org/wiki/File:A_gym.jpg",changes:"Converted to WebP.",
    }}]});
    expect(result.html).toContain("Image credits");expect(result.html).toContain("CC BY 4.0");expect(result.html).not.toContain("<script>alert(1)");
  });
});

describe("licensed photo lookup",()=>{
  it("does not invent a URL when search has no suitable licensed results",async()=>{
    const fetcher=async()=>new Response(JSON.stringify({query:{pages:{1:{imageinfo:[{mime:"image/jpeg",url:"https://internal.example/photo.jpg",extmetadata:{LicenseShortName:{value:"All rights reserved"}}}]}}}}));
    expect(await findStockPhoto("gym equipment",undefined,fetcher as typeof fetch)).toBeNull();
  });
  it("accepts fixed-host licensed photo metadata and a real raster response",async()=>{
    const image=await sharp({create:{width:8,height:8,channels:3,background:"red"}}).jpeg().toBuffer();
    const calls:string[]=[];
    const fetcher=async(input:any)=>{calls.push(String(input));return calls.length===1
      ?new Response(JSON.stringify({query:{pages:{1:{title:"File:Gym.jpg",imageinfo:[{mime:"image/jpeg",thumburl:"https://thumb.wikimedia.org/example/gym.jpg",
        descriptionurl:"https://commons.wikimedia.org/wiki/File:Gym.jpg",extmetadata:{LicenseShortName:{value:"CC BY 4.0"},LicenseUrl:{value:"https://creativecommons.org/licenses/by/4.0/"},Artist:{value:"Photographer"}}}]}}}}))
      :new Response(image,{headers:{"content-type":"image/jpeg"}});};
    const result=await findStockPhoto("gym equipment",undefined,fetcher as typeof fetch);
    expect(result?.bytes).toEqual(image);expect(result?.attribution.license).toBe("CC BY 4.0");expect(calls).toHaveLength(2);
  });
});
