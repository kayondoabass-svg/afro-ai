import type {Express,Request,Response,NextFunction} from "express";
import {z} from "zod";
import {isAuthenticated} from "../replit_integrations/auth/replitAuth";
import {ProjectFileError} from "../project-files";
import {listWebsiteImages,readWebsiteImage,saveWebsiteImage,preserveGeneratedImage,searchProjectImage,deleteWebsiteImage} from "./service";

const input=z.object({
  base64:z.string().max(12*1024*1024).optional(),
  mediaJobId:z.string().uuid().optional(),
  query:z.string().min(2).max(120).optional(),
  alt:z.string().max(300).optional(),
  section:z.enum(["hero","about","services","gallery","custom"]).default("custom"),
}).strict().refine(body=>[body.base64,body.mediaJobId,body.query].filter(Boolean).length===1,"Choose one image source.");
function endpoint(handler:(req:Request,res:Response,owner:string,project:string)=>Promise<unknown>) {
  return (req:Request,res:Response,_next:NextFunction)=>{
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("Vary","Cookie, Authorization");
    const owner=(req as any).user?.claims?.sub;
    if(!owner){res.status(401).json({error:"Please sign in."});return;}
    void handler(req,res,owner,String(req.params.conversationId)).catch(error=>{
      if(res.headersSent)return;
      if(error instanceof ProjectFileError)res.status(error.status).json({error:error.message});
      else if(error instanceof z.ZodError)res.status(400).json({error:"Provide one valid image source, section and description."});
      else res.status(503).json({error:"The image could not be saved. Check permanent storage readiness and try again. No new paid generation was started."});
    });
  };
}
export function registerWebsiteAssetRoutes(app:Express) {
  const base="/api/conversations/:conversationId/website-assets";
  app.get(base,isAuthenticated,endpoint(async(_req,res,owner,project)=>res.json({assets:await listWebsiteImages(owner,project)})));
  app.post(base,isAuthenticated,endpoint(async(req,res,owner,project)=>{
    const body=input.parse(req.body);
    if(body.query) {
      res.json(await searchProjectImage(owner,project,body.query,body.section));return;
    }
    if(body.mediaJobId) {
      res.status(201).json({asset:await preserveGeneratedImage(owner,project,body.mediaJobId,body.alt,body.section)});return;
    }
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64!))
      throw new ProjectFileError(400,"Invalid image encoding.");
    res.status(201).json({asset:await saveWebsiteImage(owner,project,Buffer.from(body.base64!,"base64"),
      {alt:body.alt,section:body.section,source:"uploaded"})});
  }));
  app.get(`${base}/:assetId/content`,isAuthenticated,endpoint(async(req,res,owner,project)=>{
    const bytes=await readWebsiteImage(owner,project,String(req.params.assetId));
    res.setHeader("X-Content-Type-Options","nosniff");
    res.type("image/webp").send(bytes);
  }));
  app.delete(`${base}/:assetId`,isAuthenticated,endpoint(async(req,res,owner,project)=>{
    await deleteWebsiteImage(owner,project,String(req.params.assetId));res.status(204).end();
  }));
}
