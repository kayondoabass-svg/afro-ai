import { randomBytes } from "node:crypto";
import { z } from "zod";
import { affiliateApplicationInput } from "../affiliate-application";
import { pool } from "../db";
import { access, application, ensureMetadata, event, hash, method, ProgrammeError, requireRole,
  tables, tierRates, transaction, type Identity, type Programme } from "./core";
import { beneficiary } from "./data";
import { queueMail } from "./mail";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const businessInput = z.object({
  companyName:z.string().trim().min(2).max(180),contactName:z.string().trim().min(2).max(120),
  email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),
  country:z.string().trim().min(2).max(100),countryName:optionalText(100),
  phone:optionalText(40),city:optionalText(120),website:optionalText(300),
  currentCustomers:z.coerce.number().int().min(0).max(10000000).default(0),
  teamSize:z.coerce.number().int().min(1).max(100000).default(1),
  yearsInBusiness:z.coerce.number().int().min(0).max(300).default(0),
  servicesOffered:optionalText(3000),whyPartner:optionalText(3000),
  desiredTier:z.enum(["authorized","premium","premier"]).default("authorized"),
});
const preferences = z.object({
  payoutMethod:method.optional().nullable(),
  registrationNumber:optionalText(150),registrationCountry:optionalText(100),
});

export async function submitApplication(p: Programme, body: unknown, founderEmail: string) {
  const meta = preferences.parse(body);
  const input = p === "affiliate" ? affiliateApplicationInput.parse(body) : businessInput.parse(body);
  return transaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`programme:${p}:${input.email}`]);
    const duplicate = await db.query(`SELECT id FROM ${tables[p].app} WHERE lower(email)=$1
      ${p==="business" ? "AND status IN('pending','information_required','approved','suspended')" : ""} LIMIT 1`,[input.email]);
    if(duplicate.rows.length) throw new ProgrammeError(409,"An application for this email already exists. Sign in to see its status.");
    let id:number;
    if(p==="affiliate"){
      const a = input as z.infer<typeof affiliateApplicationInput>;
      id=(await db.query(`INSERT INTO affiliate_applications(full_name,email,phone,country,promotion_method,social_media,
        referral_code,status,portal_token) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING id`,
        [a.fullName,a.email,a.phone,a.country,a.promotionMethod,a.socialMedia,
          `AFF${randomBytes(6).toString("hex").toUpperCase()}`,randomBytes(32).toString("hex")])).rows[0].id;
    }else{
      const a=input as z.infer<typeof businessInput>;
      id=(await db.query(`INSERT INTO partner_applications(company_name,contact_name,email,country,country_name,phone,city,website,
        current_customers,team_size,years_in_business,services_offered,why_partner,desired_tier,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending') RETURNING id`,
        [a.companyName,a.contactName,a.email,a.country,a.countryName||a.country,a.phone,a.city,a.website,
          a.currentCustomers,a.teamSize,a.yearsInBusiness,a.servicesOffered,a.whyPartner,a.desiredTier])).rows[0].id;
    }
    await db.query(`INSERT INTO programme_applications(programme,application_id,payout_method,registration_number,registration_country,owner_user_id)
      VALUES($1,$2,$3,$4,$5,(SELECT id FROM users WHERE lower(email)=$6 AND email_verified IS NOT NULL LIMIT 1))`,
      [p,id,meta.payoutMethod??null,meta.registrationNumber??null,meta.registrationCountry??null,input.email]);
    const name=p==="affiliate"?(input as any).fullName:(input as any).companyName;
    const earning=p==="affiliate" ? "Once approved, you can earn 10% commission on qualifying paid referrals."
      : "Approved business partners earn the rate assigned to their approved tier. Current tiers are Authorized (20%), Premium (30%) and Premier (40%); applying does not grant a tier.";
    await queueMail(db,p,id,"application-received",input.email,"Application received — Your Afro AI opportunity",
      `Hello ${name},\n\nThank you for applying to the Afro AI ${p==="affiliate"?"Affiliate":"Business Partner"} Programme. Your application ${id} is under review.\n\n${earning}\nEarnings are not guaranteed. No referral benefits are activated by applying alone. Your dashboard will show the decision and any information we need.\n\nYour preferred payout method: ${meta.payoutMethod==="mobile_money"?"Mobile money":meta.payoutMethod==="bank"?"Bank":"Not selected yet"}. Afro AI makes payments manually after review. Never send us passwords, PINs or one-time codes.\n\nSign in using this email and verify your account to view your application.`);
    await queueMail(db,p,id,"application-founder",founderEmail,"New Afro AI programme application",
      `A new ${p==="affiliate"?"individual affiliate":"business partner"} application has been submitted.\nApplicant: ${name}\nEmail: ${input.email}\nReference: ${p}-${id}\nPreferred payment method: ${meta.payoutMethod??"Not selected"}.\n\nOpen Partner Programmes in your founder dashboard to review it. No approval or money transfer has occurred.`,
      `/founder?programme=${p}&application=${id}`);
    await event(db,p,id,null,"application_submitted");
    return {success:true,status:"pending",emailStatus:"queued"};
  });
}

export async function updateProfile(p: Programme,id:number,who:Identity,body:unknown){
  const input=preferences.extend({response:optionalText(3000)}).parse(body);
  return transaction(async db=>{
    const {app,role}=await access(db,p,id,who,false,true); requireRole(role,["owner"]);
    if(p==="business"&&app.status==="approved"&&app.metadata?.registration_verified&&
      ((input.registrationNumber!==undefined&&input.registrationNumber!==app.metadata.registration_number)||
       (input.registrationCountry!==undefined&&input.registrationCountry!==app.metadata.registration_country)))
      throw new ProgrammeError(409,"Contact Afro AI before changing the registered identity of an approved business.");
    await ensureMetadata(db,p,id);
    await db.query(`UPDATE programme_applications SET owner_user_id=$3,
      payout_method=COALESCE($4,payout_method),registration_number=COALESCE($5,registration_number),
      registration_country=COALESCE($6,registration_country),
      registration_verified=CASE WHEN ($5 IS NOT NULL AND $5 IS DISTINCT FROM registration_number)
        OR ($6 IS NOT NULL AND $6 IS DISTINCT FROM registration_country) THEN false ELSE registration_verified END,
      updated_at=now() WHERE programme=$1 AND application_id=$2`,
      [p,id,who.id,input.payoutMethod??null,p==="business"?input.registrationNumber??null:null,p==="business"?input.registrationCountry??null:null]);
    if(input.response){
      await event(db,p,id,who.id,"applicant_response",{response:input.response});
      if(app.status==="information_required") await db.query(`UPDATE ${tables[p].app} SET status='pending' WHERE id=$1`,[id]);
    }
    await event(db,p,id,who.id,"profile_updated",{payoutMethod:input.payoutMethod??null});
    return {success:true};
  });
}
export const reviewInput=z.object({
  decision:z.enum(["approved","rejected","information_required","suspended","active"]),
  notes:z.string().trim().max(3000).default(""),
  tier:z.enum(["authorized","premium","premier"]).optional(),
  registrationVerified:z.boolean().optional(),
});
export async function review(p:Programme,id:number,actor:string,body:unknown){
  const input=reviewInput.parse(body);
  return transaction(async db=>{
    const app=await application(db,p,id,true); await ensureMetadata(db,p,id);
    const status=input.decision==="active"?"approved":input.decision;
    if(["rejected","information_required","suspended"].includes(status)&&!input.notes)
      throw new ProgrammeError(400,"Include a reason or the information the applicant must provide.");
    if(app.status==="approved"&&["rejected","information_required"].includes(status))
      throw new ProgrammeError(409,"Suspend an approved programme instead of changing it back to an application.");
    let partner:any=null;
    if(p==="business"){
      partner=(await db.query("SELECT * FROM partners WHERE application_id=$1 ORDER BY id LIMIT 1",[id])).rows[0];
      if(status==="approved"){
        const meta=(await db.query("SELECT * FROM programme_applications WHERE programme=$1 AND application_id=$2",[p,id])).rows[0];
        if(!(meta.registration_number&&meta.registration_country&&(input.registrationVerified===true||meta.registration_verified)))
          throw new ProgrammeError(400,"Review the business registration details and explicitly confirm verification before approval.");
        if(!partner&&!input.tier)throw new ProgrammeError(400,"Confirm the approved business tier.");
        const tier=input.tier??z.enum(["authorized","premium","premier"]).parse(partner?.tier);
        const exclusive=(await db.query("SELECT id FROM partners WHERE country=$1 AND exclusive_country=true AND status='active' AND application_id<>$2",[app.country,id])).rows[0];
        if(exclusive)throw new ProgrammeError(409,"This country has an exclusive partner. Review the existing agreement first.");
        if(!partner){
          partner=(await db.query(`INSERT INTO partners(application_id,user_id,slug,company_name,country,country_name,city,
            contact_name,contact_email,contact_phone,website,description,services,tier,commission_percent,status,public_listed,exclusive_country)
            VALUES($1,(SELECT id FROM users WHERE lower(email)=$2 AND email_verified IS NOT NULL LIMIT 1),
              $3,$4,$5,$6,$7,$8,$2,$9,$10,$11,'{}',$12,$13,'active',false,false) RETURNING *`,
            [id,app.email,`${app.company_name.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,24)}-${randomBytes(5).toString("hex")}`,
              app.company_name,app.country,app.country_name,app.city,app.contact_name,app.phone,app.website,app.services_offered,
              tier,tierRates[tier]])).rows[0];
        }else{
          const rate=input.tier&&input.tier!==partner.tier?tierRates[tier]:partner.commission_percent;
          partner=(await db.query("UPDATE partners SET tier=$2,commission_percent=$3,status='active' WHERE id=$1 RETURNING *",[partner.id,tier,rate])).rows[0];
        }
        await db.query("UPDATE programme_applications SET registration_verified=true WHERE programme=$1 AND application_id=$2",[p,id]);
      }else if(partner)await db.query("UPDATE partners SET status=$2 WHERE id=$1",[partner.id,status==="suspended"?"suspended":partner.status]);
    }
    const noChange=app.status===status&&input.notes===(app.metadata?.review_notes??"")
      &&(!input.tier||input.tier===partner?.tier);
    await db.query(`UPDATE ${tables[p].app} SET status=$2 WHERE id=$1`,[id,status]);
    await db.query(`UPDATE programme_applications SET review_notes=$3,updated_at=now() WHERE programme=$1 AND application_id=$2`,[p,id,input.notes]);
    if(!noChange){
      const eid=await event(db,p,id,actor,`review_${status}`,{notes:input.notes,tier:partner?.tier??null});
      const rate=p==="affiliate"?10:partner?.commission_percent;
      await queueMail(db,p,id,`review:${eid}`,app.email,`Afro AI programme application — ${status.replace(/_/g," ")}`,
        `Hello ${app[tables[p].name]},\n\nYour programme status is now: ${status.replace(/_/g," ")}.\n${input.notes}\n\n${
          status==="approved"?`Your approved commission rate is ${rate}%. Commission applies only to qualifying paid referrals under your programme terms. Open your dashboard for your assigned link${p==="business"?" and to invite your team":""}.`:"Open your dashboard for the next steps."}\n\nAll payouts are reviewed and sent manually by Afro AI; dashboard actions do not transfer money.`);
    }
    return {success:true,partner:partner?{id:partner.id,tier:partner.tier}:null};
  });
}

const inviteInput=z.object({email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),role:z.enum(["admin","sales","finance"])});
export async function inviteMember(id:number,who:Identity,body:unknown){
  const input=inviteInput.parse(body);
  return transaction(async db=>{
    const {app,role}=await access(db,"business",id,who,false,true); requireRole(role,["owner","admin"]);
    if(app.status!=="approved")throw new ProgrammeError(409,"Your business must be approved before inviting staff.");
    if(role!=="owner"&&input.role!=="sales")throw new ProgrammeError(403,"Only the business owner can appoint administrators or finance members.");
    if(input.email===app.email.toLowerCase()||input.email===who.email)throw new ProgrammeError(400,"This person already owns or manages this workspace.");
    await ensureMetadata(db,"business",id);
    const active=(await db.query(`SELECT 1 FROM programme_members m JOIN users u ON u.id=m.user_id
      WHERE m.application_id=$1 AND lower(u.email)=$2 AND m.status='active'`,[id,input.email])).rows[0];
    if(active)throw new ProgrammeError(409,"This person already has workspace access.");
    await db.query("UPDATE programme_invitations SET status='expired' WHERE application_id=$1 AND status='pending' AND expires_at<now()",[id]);
    const token=randomBytes(32).toString("hex");
    const invitation=(await db.query(`INSERT INTO programme_invitations(application_id,email,role,token_hash,invited_by)
      VALUES($1,$2,$3,$4,$5) RETURNING id`,[id,input.email,input.role,hash(token),who.id])).rows[0];
    await queueMail(db,"business",id,`invite:${invitation.id}`,input.email,"Invitation to an Afro AI business workspace",
      `${app.company_name} invited you as ${input.role}. Sign in with ${input.email}, verify your account email, and accept within 7 days. This is access to this business only, not Afro AI's internal team.`,
      `/programme-portal?invite=${encodeURIComponent(token)}`);
    await event(db,"business",id,who.id,"team_invited",{email:input.email,role:input.role});
    return {success:true};
  });
}
export async function acceptInvitation(who:Identity,body:unknown){
  const {token}=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).parse(body);
  return transaction(async db=>{
    // Lock the application first, like member revocation and payout operations.
    const peek=(await db.query("SELECT application_id FROM programme_invitations WHERE token_hash=$1",[hash(token)])).rows[0];
    if(!peek)throw new ProgrammeError(404,"Invitation not found.");
    const app=await application(db,"business",peek.application_id,true);
    const invite=(await db.query("SELECT * FROM programme_invitations WHERE token_hash=$1 FOR UPDATE",[hash(token)])).rows[0];
    if(invite.email!==who.email)throw new ProgrammeError(403,"Sign in with the email address this invitation was sent to.");
    if(invite.status!=="pending"||new Date(invite.expires_at).getTime()<=Date.now()||app.status!=="approved")
      throw new ProgrammeError(409,"This invitation is expired, revoked, already accepted, or the business is inactive.");
    await db.query(`INSERT INTO programme_members(application_id,user_id,role) VALUES($1,$2,$3)
      ON CONFLICT(application_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='active'`,[app.id,who.id,invite.role]);
    await db.query("UPDATE programme_invitations SET status='accepted' WHERE id=$1",[invite.id]);
    await event(db,"business",app.id,who.id,"invitation_accepted",{role:invite.role});
    return {success:true};
  });
}
export async function changeMember(id:number,memberId:number,who:Identity,body:unknown,invitation=false){
  const input=z.object({role:z.enum(["admin","sales","finance"]).optional(),status:z.enum(["active","removed"]).optional()}).parse(body);
  return transaction(async db=>{
    const {role}=await access(db,"business",id,who,false,true);requireRole(role,["owner","admin"]);
    const table=invitation?"programme_invitations":"programme_members";
    const target=(await db.query(`SELECT * FROM ${table} WHERE id=$1 AND application_id=$2 FOR UPDATE`,[memberId,id])).rows[0];
    if(!target)throw new ProgrammeError(404,"Team record not found.");
    if(role!=="owner"&&(target.role!=="sales"||(input.role&&input.role!=="sales")))
      throw new ProgrammeError(403,"Only the owner manages administrator or finance access.");
    if(invitation)await db.query("UPDATE programme_invitations SET status='revoked' WHERE id=$1 AND status='pending'",[memberId]);
    else await db.query("UPDATE programme_members SET role=COALESCE($2,role),status=COALESCE($3,status) WHERE id=$1",[memberId,input.role??null,input.status??null]);
    await event(db,"business",id,who.id,invitation?"invitation_revoked":"member_changed",{memberId,role:input.role,status:input.status});
    return {success:true};
  });
}

export async function manualPayout(p:Programme,id:number,actor:string,body:unknown){
  const input=z.object({currency:z.string().regex(/^[A-Z]{3}$/),commissionIds:z.array(z.number().int().positive()).min(1).max(500),
    method,reference:z.string().trim().min(3).max(150),confirmation:z.literal("PAID MANUALLY")}).parse(body);
  return transaction(async db=>{
    const app=await application(db,p,id,true);
    if(app.status!=="approved")throw new ProgrammeError(409,"Only active approved programmes can receive recorded payouts.");
    const b=await beneficiary(db,p,id), ids=Array.from(new Set(input.commissionIds));
    const selected=(await db.query(`SELECT c.id,c.amount_cents,c.currency,c.status FROM ${tables[p].commissions} c
      WHERE c.${tables[p].beneficiary}=$1 AND c.id=ANY($2::int[]) FOR UPDATE`,[b,ids])).rows;
    const reversals=(await db.query("SELECT commission_id FROM programme_commission_reversals WHERE programme=$1 AND commission_id=ANY($2::int[])",[p,ids])).rows;
    const alreadyPaid=(await db.query("SELECT commission_id FROM programme_payout_commissions WHERE programme=$1 AND commission_id=ANY($2::int[])",[p,ids])).rows;
    if(selected.length!==ids.length||reversals.length||alreadyPaid.length||selected.some(c=>c.currency!==input.currency||!["pending","approved"].includes(c.status)))
      throw new ProgrammeError(409,"Choose unpaid, unreversed commissions from this programme in one currency only.");
    const amount=selected.reduce((sum,c)=>sum+Number(c.amount_cents),0);
    if(!Number.isSafeInteger(amount)||amount<=0)throw new ProgrammeError(400,"Invalid payout amount.");
    const payout=(await db.query(`INSERT INTO programme_manual_payouts(programme,application_id,amount_cents,currency,method,reference,recorded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[p,id,amount,input.currency,input.method,input.reference,actor])).rows[0];
    for(const cid of ids)await db.query("INSERT INTO programme_payout_commissions(programme,commission_id,payout_id) VALUES($1,$2,$3)",[p,cid,payout.id]);
    await db.query(`UPDATE ${tables[p].commissions} SET status='paid' WHERE id=ANY($1::int[])`,[ids]);
    await db.query(`UPDATE ${p==="affiliate"?"affiliate_applications":"partners"} SET total_paid_cents=total_paid_cents+$2 WHERE id=$1`,[b,amount]);
    const eid=await event(db,p,id,actor,"manual_payment_recorded",{payoutId:payout.id,amountCents:amount,currency:input.currency});
    await queueMail(db,p,id,`payout:${eid}`,app.email,"Afro AI — manual payout recorded",
      `Afro AI has recorded a manual ${input.method==="bank"?"bank":"mobile-money"} payment of ${(amount/100).toFixed(2)} ${input.currency}.\nReference: ${input.reference}\nPlease check your own account and contact us if there is a discrepancy. This email and the dashboard do not initiate any transfer.`);
    return {success:true,payoutId:payout.id};
  });
}
export async function reverseCommission(p:Programme,id:number,cid:number,actor:string,body:unknown){
  const {reason}=z.object({reason:z.string().trim().min(5).max(1000)}).parse(body);
  return transaction(async db=>{
    await application(db,p,id,true);const b=await beneficiary(db,p,id);
    const row=(await db.query(`SELECT id FROM ${tables[p].commissions} WHERE id=$1 AND ${tables[p].beneficiary}=$2 FOR UPDATE`,[cid,b])).rows[0];
    if(!row)throw new ProgrammeError(404,"Commission not found.");
    await db.query(`INSERT INTO programme_commission_reversals(programme,commission_id,application_id,reason,recorded_by)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[p,cid,id,reason,actor]);
    await event(db,p,id,actor,"commission_reversed",{commissionId:cid,reason});
    return {success:true,message:"Accounting adjustment recorded. No money was transferred or refunded."};
  });
}
