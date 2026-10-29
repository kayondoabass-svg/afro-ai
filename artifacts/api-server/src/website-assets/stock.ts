import {plainText} from "./policy";
import {containsPrivateCredential} from "../chat-credential-safety";
import {publicQuery} from "../replit_integrations/chat/search";

const API="https://commons.wikimedia.org/w/api.php";
const agent={"User-Agent":"AfroAIWebsiteBuilder/1.0 (https://afroaigroup.com)"};
export function safePhotoQuery(query:unknown): string {
  if(typeof query!=="string"||!query.trim()||query.length>120||containsPrivateCredential(query)||
    publicQuery(query)!==query.trim().replace(/\s+/g," ")||/[{}<>]/.test(query)||/\+?\d[\d ()-]{5,}\d/.test(query))
    throw new Error("Use a short public photo subject without names, private details, URLs or code.");
  return query.trim();
}
async function bounded(response:Response,max:number) {
  if(!response.ok||Number(response.headers.get("content-length")||0)>max)throw new Error("Photo source unavailable.");
  const reader=response.body?.getReader();if(!reader)throw new Error("Photo source unavailable.");
  const chunks:Uint8Array[]=[];let length=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max)throw new Error("Photo source exceeds the download limit.");chunks.push(value);}
    return Buffer.concat(chunks);
  } finally {await reader.cancel().catch(()=>{});}
}
export async function findStockPhoto(raw:unknown,signal?:AbortSignal,fetcher:typeof fetch=fetch) {
  const query=safePhotoQuery(raw);
  const abort=signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  const url=new URL(API);
  for(const [key,value] of Object.entries({action:"query",format:"json",generator:"search",gsrnamespace:"6",
    gsrsearch:`${query} filetype:bitmap`,gsrlimit:"5",prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"960"}))url.searchParams.set(key,value);
  const metadata=JSON.parse((await bounded(await fetcher(url,{headers:agent,signal:abort,redirect:"error"}),256000)).toString("utf8"));
  if(metadata.error)throw new Error("Photo search metadata is unavailable.");
  for(const page of Object.values(metadata.query?.pages||{}) as any[]) {
    const info=page.imageinfo?.[0],extra=info?.extmetadata||{};
    const license=plainText(extra.LicenseShortName?.value,80);
    if(!info||!["image/jpeg","image/png","image/webp"].includes(info.mime)||!/^(?:CC BY(?:-SA)? [1-4]\.0|CC0|Public domain)$/i.test(license))continue;
    const image=new URL(info.thumburl||info.url);
    if(image.protocol!=="https:"||!["upload.wikimedia.org","thumb.wikimedia.org"].includes(image.hostname)||image.port||image.username||image.password)continue;
    const source=new URL(info.descriptionurl||"https://commons.wikimedia.org");
    if(source.origin!=="https://commons.wikimedia.org"||!source.pathname.startsWith("/wiki/File:"))continue;
    const licenseUrl=extra.LicenseUrl?.value;
    if(license!=="Public domain"&&(!licenseUrl||!/^https:\/\/creativecommons\.org\/(?:licenses|publicdomain)\//.test(licenseUrl)))continue;
    const response=await fetcher(image,{headers:agent,signal:abort,redirect:"error"});
    if(!/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(response.headers.get("content-type")||""))continue;
    return {bytes:await bounded(response,8*1024*1024),alt:`Illustrative photograph: ${query}`,
      attribution:{title:plainText(page.title,300),artist:plainText(extra.Artist?.value,300),license,
        licenseUrl:licenseUrl||null,sourceUrl:source.href,changes:"Resized and converted to WebP.",relevance:"Search metadata match; not visually certified."}};
  }
  return null;
}
