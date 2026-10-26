import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db";
import { isManagementOrigin } from "../project-infrastructure/routes";
import { access, csv, event, identity, numericId, programme, ProgrammeError, requireRole, transaction, type Identity, type Programme } from "./core";
import { beneficiary, details, founderList, myWorkspaces, resourceText } from "./data";
import { acceptInvitation, changeMember, inviteMember, manualPayout, reverseCommission, review, updateProfile } from "./actions";
import { resendProgrammeMail } from "./mail";

const privateResponse:RequestHandler=(_req,res,next)=>{res.setHeader("Cache-Control","private, no-store");next();};
const management:RequestHandler=(req,res,next)=>{
  if(!isManagementOrigin(req.get("Origin")))return res.status(403).json({message:"Use the Afro AI dashboard for this action."});
  next();
};
export function programmeError(res:any,error:any) {
  if(error instanceof z.ZodError)return res.status(400).json({message:"Check the submitted fields and required confirmation."});
  if(error?.code==="23505")return res.status(409).json({message:"This record already exists. Refresh before trying again."});
  if(error instanceof ProgrammeError || [400,403,404,409].includes(error?.status))
    return res.status(error.status).json({message:error.message});
  console.error("[programmes] Request failed.");
  return res.status(503).json({message:"Programme records are temporarily unavailable. Please retry."});
}
type Guards={isAuthenticated:RequestHandler;isFounder:RequestHandler};
export function registerProgrammeRoutes(app:Express,{isAuthenticated,isFounder}:Guards){
  const user=async(req:any)=>identity(req);
  const pId=(req:any)=>[programme(req.params.programme),numericId(req.params.id)] as const;
  const route=(fn:(req:any,res:any)=>Promise<unknown>):RequestHandler=>async(req,res)=>{
    try{await fn(req,res);}catch(e){programmeError(res,e);}
  };
  const mutation=rateLimit({windowMs:60000,max:40,standardHeaders:true,legacyHeaders:false});
  app.use("/api/programmes",privateResponse);
  app.use("/api/founder/programmes",privateResponse);
  app.use(["/api/affiliate/applications","/api/founder/partners"],(req,res,next)=>{
    res.setHeader("Cache-Control","private, no-store");
    if(!["GET","HEAD","OPTIONS"].includes(req.method))return management(req,res,next);
    next();
  });
  app.get("/api/programmes/me",isAuthenticated,route(async(req,res)=>res.json(await myWorkspaces(await user(req)))));
  app.get("/api/programmes/resources/:resource/download",isAuthenticated,route(async(req,res)=>{
    await user(req);const id=String(req.params.resource);
    if(!Object.hasOwn(resourceText,id))throw new ProgrammeError(404,"Resource not found.");
    res.type("text/plain").setHeader("Content-Disposition",`attachment; filename="afro-ai-${id}.txt"`);
    res.send(resourceText[id]);
  }));
  app.post("/api/programmes/invitations/accept",isAuthenticated,management,mutation,route(async(req,res)=>
    res.json(await acceptInvitation(await user(req),req.body))));
  app.get("/api/programmes/:programme/:id",isAuthenticated,route(async(req,res)=>{
    const [p,id]=pId(req);res.json(await details(p,id,await user(req)));
  }));
  app.patch("/api/programmes/:programme/:id/profile",isAuthenticated,management,mutation,route(async(req,res)=>{
    const [p,id]=pId(req);res.json(await updateProfile(p,id,await user(req),req.body));
  }));
  app.post("/api/programmes/business/:id/invitations",isAuthenticated,management,mutation,route(async(req,res)=>
    res.json(await inviteMember(numericId(req.params.id),await user(req),req.body))));
  app.delete("/api/programmes/business/:id/invitations/:inviteId",isAuthenticated,management,mutation,route(async(req,res)=>
    res.json(await changeMember(numericId(req.params.id),numericId(req.params.inviteId),await user(req),{},true))));
  app.patch("/api/programmes/business/:id/members/:memberId",isAuthenticated,management,mutation,route(async(req,res)=>
    res.json(await changeMember(numericId(req.params.id),numericId(req.params.memberId),await user(req),req.body))));
  app.post("/api/programmes/:programme/:id/leads",isAuthenticated,management,mutation,route(async(req,res)=>{
    const [p,id]=pId(req);res.json(await manageLead(p,id,await user(req),req.body));
  }));
  app.patch("/api/programmes/:programme/:id/leads/:leadId",isAuthenticated,management,mutation,route(async(req,res)=>{
    const [p,id]=pId(req);res.json(await manageLead(p,id,await user(req),req.body,numericId(req.params.leadId)));
  }));
  const exportRoute=(founder:boolean)=>route(async(req,res)=>{
    const [p,id]=pId(req);
    const who=founder?{id:req.user.claims.sub,email:""}:await user(req);
    const {role}=await access(pool,p,id,who,founder);requireRole(role,["owner","finance"]);
    const kind=z.enum(["commissions","payouts"]).parse(req.query.kind);
    const b=await beneficiary(pool,p,id);
    const rows=kind==="commissions"?(await pool.query(`SELECT c.id,c.amount_cents,c.base_amount_cents,c.currency,
      c.commission_percent,c.period_month,c.status,r.reason AS reversal_reason,c.created_at
      FROM ${p==="affiliate"?"affiliate_commissions":"partner_commissions"} c
      LEFT JOIN programme_commission_reversals r ON r.programme=$1 AND r.commission_id=c.id
      WHERE c.${p==="affiliate"?"affiliate_id":"partner_id"}=$2 ORDER BY c.id DESC LIMIT 10001`,[p,b])).rows:
      (await pool.query(`SELECT id::text,amount_cents,currency,method,reference,status,created_at
        FROM programme_manual_payouts WHERE programme=$1 AND application_id=$2
        ${p==="business"?`UNION ALL SELECT 'legacy-'||id,amount_cents,currency,method,reference,status,created_at
          FROM partner_payouts WHERE partner_id=$3`:""}
        ORDER BY created_at DESC LIMIT 10001`,p==="business"?[p,id,b]:[p,id])).rows;
    if(rows.length>10000)throw new ProgrammeError(409,"This export exceeds 10,000 records. Contact Afro AI for a scoped statement.");
    res.type("text/csv").setHeader("Content-Disposition",`attachment; filename="afro-ai-${p}-${kind}.csv"`);
    res.send(csv(rows));
  });
  app.get("/api/programmes/:programme/:id/export",isAuthenticated,exportRoute(false));
  app.get("/api/founder/programmes",isFounder,route(async(req,res)=>res.json(await founderList(programme(req.query.programme??"affiliate"),req.query))));
  app.get("/api/founder/programmes/:programme/:id",isFounder,route(async(req,res)=>{
    const [p,id]=pId(req);res.json(await details(p,id,{id:req.user.claims.sub,email:""},true));
  }));
  app.post("/api/founder/programmes/:programme/:id/review",isFounder,management,mutation,route(async(req,res)=>{
    const [p,id]=pId(req);res.json(await review(p,id,req.user.claims.sub,req.body));
  }));
  app.post("/api/founder/programmes/:programme/:id/payouts",isFounder,management,mutation,route(async(req,res)=>{
    const [p,id]=pId(req);res.json(await manualPayout(p,id,req.user.claims.sub,req.body));
  }));
  app.post("/api/founder/programmes/:programme/:id/commissions/:commissionId/adjust",isFounder,management,mutation,route(async(req,res)=>{
    const [p,id]=pId(req);res.json(await reverseCommission(p,id,numericId(req.params.commissionId),req.user.claims.sub,req.body));
  }));
  app.post("/api/founder/programmes/emails/:emailId/resend",isFounder,management,mutation,route(async(req,res)=>{
    z.object({confirmation:z.literal("RESEND")}).parse(req.body);
    await resendProgrammeMail(numericId(req.params.emailId),req.user.claims.sub);
    res.json({success:true,emailStatus:"queued"});
  }));
  app.get("/api/founder/programmes/:programme/:id/export",isFounder,exportRoute(true));
}

async function manageLead(p:Programme,id:number,who:Identity,body:unknown,leadId?:number){
  if(p!=="business")throw new ProgrammeError(400,"Lead management is available to approved businesses.");
  const input=(leadId?z.object({status:z.enum(["new","contacted","qualified","converted","lost"]),notes:z.string().trim().max(3000).optional(),
    assignedUserId:z.string().max(200).nullable().optional()}):z.object({
    name:z.string().trim().min(2).max(150),email:z.string().trim().email().max(254),phone:z.string().trim().max(40).optional(),
    company:z.string().trim().max(180).optional(),message:z.string().trim().max(3000).optional(),assignedUserId:z.string().max(200).nullable().optional(),
  })).parse(body) as any;
  return transaction(async db=>{
    const {app,role}=await access(db,p,id,who,false,true);requireRole(role,["owner","admin","sales"]);
    if(app.status!=="approved")throw new ProgrammeError(409,"Business approval is required.");
    const b=await beneficiary(db,p,id);if(!b)throw new ProgrammeError(409,"Business setup is incomplete.");
    let assigned=role==="sales"?who.id:input.assignedUserId??null;
    if(role==="sales"&&input.assignedUserId&&input.assignedUserId!==who.id)
      throw new ProgrammeError(403,"Sales members cannot assign leads to other staff.");
    if(assigned&&assigned!==who.id){
      const member=(await db.query("SELECT 1 FROM programme_members WHERE application_id=$1 AND user_id=$2 AND status='active' AND role IN('sales','admin')",[id,assigned])).rows[0];
      if(!member&&assigned!==app.explicit_owner_id)throw new ProgrammeError(400,"Assign leads only to an active member of this business.");
    }
    if(leadId){
      const existing=(await db.query("SELECT id,assigned_user_id FROM partner_leads WHERE id=$1 AND partner_id=$2 FOR UPDATE",[leadId,b])).rows[0];
      if(!existing||role==="sales"&&existing.assigned_user_id!==who.id)throw new ProgrammeError(404,"Lead not found.");
      if(input.assignedUserId===undefined)assigned=existing.assigned_user_id;
      await db.query("UPDATE partner_leads SET status=$3,notes=COALESCE($4,notes),assigned_user_id=$5 WHERE id=$1 AND partner_id=$2",
        [leadId,b,input.status,input.notes??null,assigned]);
    }else await db.query(`INSERT INTO partner_leads(partner_id,name,email,phone,company,message,source,assigned_user_id)
      VALUES($1,$2,$3,$4,$5,$6,'partner_workspace',$7)`,[b,input.name,input.email,input.phone??null,input.company??null,input.message??null,assigned]);
    await event(db,p,id,who.id,leadId?"lead_updated":"lead_added",{leadId:leadId??null});
    return {success:true};
  });
}
