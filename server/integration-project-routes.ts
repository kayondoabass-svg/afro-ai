import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { storage } from "./storage";
import { activeEmailProvider } from "./email-provider";
import { camelRow, integrationError, integrationId, ownedEmailProject, emailProjectDetail, createProjectEmailKey, revokeProjectEmailKey } from "./email-projects";
import { listChatbotApiCredentials, createChatbotApiCredential, revokeChatbotApiCredential, enforcePrivateChatbotApi } from "./chatbot-api-credentials";

const userId = (req:any) => req.user?.claims?.sub || req.user?.claims?.id;
export const integrationHandler = (fn:(req:any,res:any)=>Promise<unknown>):RequestHandler => (req,res) => {
  Promise.resolve(fn(req,res)).catch((error:any)=>{
    const status=Number.isInteger(error?.status) && error.status>=400 && error.status<500 ? error.status : 503;
    if(status===503) console.error("[integrations] Operation unavailable",error?.name || "Error");
    res.status(status).json({error:status===503 ? "This operation is temporarily unavailable. No automatic retry was made." : error.message});
  });
};
export function registerIntegrationProjectRoutes(app:Express, auth:RequestHandler, sendTest:(req:any,res:any,key:any)=>Promise<unknown>) {
  const route=(method:"get"|"post"|"patch"|"delete",path:string,fn:(req:any,res:any)=>Promise<unknown>)=>app[method](path,auth,integrationHandler(fn));
  route("get","/api/email-api/projects",async(req,res)=>{
    const {rows}=await pool.query(`SELECT p.*,
      (SELECT count(*)::int FROM email_project_domains d WHERE d.project_id=p.id) AS domain_count,
      (SELECT count(*)::int FROM email_key_state s WHERE s.project_id=p.id AND s.revoked_at IS NULL) AS key_count
      FROM email_projects p WHERE user_id=$1 ORDER BY p.created_at DESC`,[userId(req)]);
    res.json(rows.map(camelRow));
  });
  route("post","/api/email-api/projects",async(req,res)=>{
    const name=req.body?.name;
    if(typeof name!=="string" || !name.trim() || name.trim().length>120) integrationError(400,"Enter a project name (up to 120 characters)");
    const {rows:[row]}=await pool.query("INSERT INTO email_projects(user_id,name) VALUES($1,$2) RETURNING *",[userId(req),name.trim()]);
    res.status(201).json(camelRow(row));
  });
  route("get","/api/email-api/projects/:id",async(req,res)=>{
    await ownedEmailProject(userId(req),req.params.id);
    const owner=await storage.getUser(userId(req));
    const detail=await emailProjectDetail(userId(req),req.params.id,owner?.email);
    res.json({...detail,stats:{...detail.stats,emailProvider:activeEmailProvider()}});
  });
  route("patch","/api/email-api/projects/:id",async(req,res)=>{
    await ownedEmailProject(userId(req),req.params.id);
    const name=req.body?.name;
    if(typeof name!=="string" || !name.trim() || name.trim().length>120) integrationError(400,"Enter a project name (up to 120 characters)");
    const {rows:[row]}=await pool.query("UPDATE email_projects SET name=$1 WHERE id=$2 AND user_id=$3 RETURNING *",[name.trim(),req.params.id,userId(req)]);
    res.json(camelRow(row));
  });
  route("delete","/api/email-api/projects/:id/domains/:domainId",async(req,res)=>{
    await ownedEmailProject(userId(req),req.params.id);
    await pool.query("DELETE FROM email_project_domains WHERE project_id=$1 AND domain_id=$2",[req.params.id,integrationId(req.params.domainId)]);
    res.json({success:true,providerIdentityDeleted:false});
  });
  route("post","/api/email-api/keys/:id/rotate",async(req,res)=>{
    const {rows:[row]}=await pool.query(`SELECT k.name,s.project_id FROM email_api_keys k JOIN email_key_state s ON s.key_id=k.id
      WHERE k.id=$1 AND k.user_id=$2`,[integrationId(req.params.id),userId(req)]);
    if(!row) integrationError(404,"API key not found");
    const owner=await storage.getUser(userId(req));
    res.setHeader("Cache-Control","no-store");
    res.json(await createProjectEmailKey(userId(req),owner?.email,row.project_id,`${row.name}` ,integrationId(req.params.id)));
  });
  route("post","/api/email-api/keys/:id/revoke",async(req,res)=>{
    if(req.body?.confirm!==true) integrationError(400,"Confirm permanent revocation");
    res.json(await revokeProjectEmailKey(userId(req),req.params.id));
  });
  route("post","/api/email-api/projects/:id/test",async(req,res)=>{
    await ownedEmailProject(userId(req),req.params.id);
    if(req.body?.consent!==true) integrationError(400,"Confirm this test uses your normal sending allowance");
    const {rows:[key]}=await pool.query(`SELECT k.* FROM email_api_keys k JOIN email_key_state s ON s.key_id=k.id
      WHERE k.id=$1 AND k.user_id=$2 AND s.project_id=$3 AND s.revoked_at IS NULL AND k.is_active`,
      [integrationId(req.body.keyId),userId(req),req.params.id]);
    if(!key) integrationError(404,"Active project key not found");
    if(typeof req.body.to!=="string" || req.body.to.includes(",") || req.body.to.includes(";")) integrationError(400,"Enter one test recipient");
    await sendTest(req,res,camelRow(key));
  });
  const base="/api/chatbots/:id/api-credentials";
  route("get",base,async(req,res)=>res.json(await listChatbotApiCredentials(userId(req),req.params.id)));
  route("post",base,async(req,res)=>{
    res.setHeader("Cache-Control","no-store");
    res.status(201).json(await createChatbotApiCredential(userId(req),req.params.id,req.body?.name));
  });
  route("post",`${base}/:keyId/rotate`,async(req,res)=>{
    const state=await listChatbotApiCredentials(userId(req),req.params.id);
    const key=state.keys.find(k=>k.id===req.params.keyId);
    if(!key) integrationError(404,"Credential not found");
    res.setHeader("Cache-Control","no-store");
    res.json(await createChatbotApiCredential(userId(req),req.params.id,key.name,req.params.keyId));
  });
  route("post",`${base}/:keyId/revoke`,async(req,res)=>{
    if(req.body?.confirm!==true) integrationError(400,"Confirm permanent revocation");
    res.json(await revokeChatbotApiCredential(userId(req),req.params.id,req.params.keyId));
  });
  route("post",`${base}/enforce`,async(req,res)=>{
    if(req.body?.confirm!==true) integrationError(400,"Confirm old server integrations have deployed a private key");
    res.json(await enforcePrivateChatbotApi(userId(req),req.params.id));
  });
}
