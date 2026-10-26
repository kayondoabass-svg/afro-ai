import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { founderSections, projection, recordFilters, publicationLinkSql } from "./founder-records";
import { authRecords, authRecordSections } from "./founder-auth-records";
import { activeEmailProvider } from "./email-provider";
import { registerFounderAlerts, auditFounderAction } from "./founder-alerts";

const query=(text:string,values:unknown[]=[])=>{
  // node-postgres supports this runtime option; its older type package does not declare it.
  const config={text,values,query_timeout:8000};
  return pool.query(config);
};
const checkedAt=()=>new Date().toISOString();
export async function founderRecords(id:string,input:Record<string,unknown>) {
  if(Object.hasOwn(authRecordSections,id)) {
    if(typeof input.owner==="string" && input.owner.includes("@")) {
      const owner=(await query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1",[input.owner.trim().slice(0,160)])).rows[0]?.id;
      return authRecords(id,{...input,owner:owner || "__no_matching_platform_owner__"});
    }
    return authRecords(id,input);
  }
  const config=Object.hasOwn(founderSections,id)?founderSections[id]:undefined;
  if(!config) return null;
  const {params,where}=recordFilters(config,input);
  const page=Math.min(100000,Math.max(1,Number.parseInt(String(input.page),10)||1));
  const from=`FROM (${config.source}) records`;
  const count=await query(`SELECT count(*)::int total ${from} ${where}`,params);
  const rows=await query(`SELECT ${projection(config)} ${from} ${where}
    ORDER BY ${config.fields.created_at || config.fields.sent_at || config.fields.id} DESC NULLS LAST,${config.fields.id} DESC
    LIMIT 25 OFFSET $${params.length+1}`,[...params,(page-1)*25]);
  const statuses=config.status?(await query(`SELECT DISTINCT ${config.fields[config.status]} status ${from}
    WHERE ${config.fields[config.status]} IS NOT NULL ORDER BY status LIMIT 50`)).rows.map(r=>r.status):[];
  return {section:id,label:config.label,columns:Object.keys(config.fields).map(key=>({key,label:key.replaceAll("_"," ")})),
    rows:rows.rows.map(row=>Object.fromEntries(Object.keys(config.fields).map(key=>[key,row[key] ?? null]))),
    page,pageSize:25,total:count.rows[0].total,statuses,checkedAt:checkedAt()};
}

declare const __AFRO_BUILD_SHA__: string|null;
function buildRevision():string|null {
  // Embedded in the server bundle, not read from a mutable checkout/deploy marker.
  const value=typeof __AFRO_BUILD_SHA__==="undefined"?null:__AFRO_BUILD_SHA__;
  return value && /^[a-f0-9]{7,40}$/i.test(value)?value:null;
}
export async function founderOverview() {
  const sections=await Promise.all([...Object.entries(founderSections),...Object.entries(authRecordSections)].map(async([id,c])=>{
    try {
      const count=Object.hasOwn(authRecordSections,id)?(await authRecords(id,{},true)).total:
        (await query(`SELECT count(*)::int total FROM (${founderSections[id].source}) records`)).rows[0].total;
      return {id,label:c.label,count,status:"ok" as const};
    } catch {return {id,label:c.label,count:null,status:"unavailable" as const,error:"Reporting is temporarily unavailable. No records were changed."};}
  }));
  let database="unavailable",schema="unavailable";
  try {
    const {rows}=await query(`SELECT bool_and(to_regclass(t) IS NOT NULL) ready FROM unnest($1::text[]) t`,
      [["email_projects","email_key_state","email_project_domains","chatbot_site_settings","chatbot_verified_domains","chatbot_api_credentials","chatbot_api_policy"]]);
    database="ok";schema=rows[0]?.ready?"ok":"unavailable";
  } catch {}
  const alerts:{id:string;severity:"warning"|"error";title:string;section:string}[]=sections.filter(s=>s.status==="unavailable")
    .map(s=>({id:`report-${s.id}`,severity:"error",title:`${s.label} reporting unavailable`,section:s.id}));
  const conditions=[
    {id:"email-delivery",section:"email-logs",title:"Failed or bounced emails in the last 24 hours",sql:"SELECT count(*)::int n FROM email_api_logs WHERE status IN ('failed','bounced','complained') AND sent_at>now()-interval '24 hours'"},
    {id:"app-cleanup",section:"apps",title:"App deletion or unpublishing requires attention",sql:"SELECT count(*)::int n FROM published_apps WHERE suspend_reason IN ('deletion-pending','unpublish-pending')"},
    {id:"unlinked-apps",section:"apps",title:"Published apps without a saved project association",sql:`SELECT count(*)::int n FROM published_apps a WHERE NOT EXISTS (${publicationLinkSql})`},
    {id:"uncertain-reservations",section:"reservations",title:"AI reservations with uncertain outcomes",sql:`SELECT count(*)::int n FROM (${founderSections.reservations.source}) r WHERE j->>'status'='uncertain'`},
  ];
  await Promise.all(conditions.map(async c=>{
    try {const n=Number((await query(c.sql)).rows[0]?.n);if(n>0) alerts.push({id:c.id,severity:"warning",title:`${c.title}: ${n}`,section:c.section});}
    catch {alerts.push({id:`check-${c.id}`,severity:"warning",title:`${c.title} — check unavailable`,section:c.section});}
  }));
  let collectedCents:number|null=null,paygBalanceCents:number|null=null,paygSpentCents:number|null=null;
  let collectedByCurrency:{currency:string;amount:string}[]|null=null;
  try {
    collectedByCurrency=(await query("SELECT currency,sum(amount)::text amount FROM payments WHERE status='completed' GROUP BY currency ORDER BY currency")).rows;
    // Never add local currencies and label the result USD.
    collectedCents=Math.round(Number(collectedByCurrency?.find(r=>r.currency==="USD")?.amount || 0)*100);
  } catch {}
  try {const r=(await query("SELECT coalesce(sum(payg_balance),0)::bigint balance,coalesce(sum(payg_spent),0)::bigint spent FROM users")).rows[0];
    paygBalanceCents=Number(r.balance);paygSpentCents=Number(r.spent);} catch {}
  return {checkedAt:checkedAt(),sections,health:{database,schema,release:buildRevision(),emailProvider:activeEmailProvider(),
    providerConnectivity:"Not actively tested. No paid request was sent."},alerts,
    finance:{collectedCents,collectedByCurrency,paygBalanceCents,paygSpentCents,providerCostCents:null},
    links:[{label:"Team permissions",href:"/team"},{label:"Command Center",href:"/admin-command"},
      {label:"KEYO Studio oversight",href:"/admin-command/keyo-studio"}]};
}

export function registerFounderOversight(app:Express,isFounder:RequestHandler) {
  app.use(["/api/admin","/api/founder"],auditFounderAction);
  registerFounderAlerts(app,isFounder,founderOverview);
  const privateResponse:RequestHandler=(_req,res,next)=>{res.set("Cache-Control","private, no-store");next();};
  app.get("/api/founder/overview",isFounder,privateResponse,async(_req,res)=>{
    try {res.json(await founderOverview());}
    catch {res.status(503).json({error:"Founder overview unavailable. Please retry."});}
  });
  app.get("/api/founder/records/:section",isFounder,privateResponse,async(req,res)=>{
    const section=String(req.params.section);
    if(!Object.hasOwn(founderSections,section) && !Object.hasOwn(authRecordSections,section))
      return res.status(404).json({error:"Unknown management section."});
    try {res.json(await founderRecords(section,req.query));}
    catch {res.status(503).json({error:"This report is unavailable. No records were changed. Please retry."});}
  });
}
