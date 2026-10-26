import { pool } from "../db";
import { ensureMetadata, tables, transaction, type Programme } from "./core";

/** A completed payment has at most one programme beneficiary, even on replay. */
export async function creditProgrammePayment(paymentId:number){
  return transaction(async db=>{
    const payment=(await db.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE",[paymentId])).rows[0];
    if(!payment||payment.status!=="completed")return;
    if((await db.query("SELECT 1 FROM programme_commission_payments WHERE payment_id=$1",[paymentId])).rows.length)return;
    // Only automatic subscription charges are eligible, matching the existing affiliate policy.
    const plan=String(payment.plan??"");
    if(!plan||plan.startsWith("domain")){
      await db.query("INSERT INTO programme_commission_payments(payment_id,programme,beneficiary_id) VALUES($1,'none',0)",[paymentId]);
      return;
    }
    const affiliate=(await db.query(`SELECT r.id AS referral_id,r.affiliate_id AS beneficiary,r.created_at AS attributed_at,
      a.id AS application_id,10 AS rate,'affiliate' AS programme FROM affiliate_referrals r
      JOIN affiliate_applications a ON a.id=r.affiliate_id AND a.status='approved' WHERE r.referred_user_id=$1`,[payment.user_id])).rows[0];
    const business=(await db.query(`SELECT c.id AS referral_id,c.partner_id AS beneficiary,c.attributed_at,p.application_id,
      p.commission_percent AS rate,'business' AS programme FROM partner_customers c
      JOIN partners p ON p.id=c.partner_id AND p.status='active'
      JOIN partner_applications a ON a.id=p.application_id AND a.status='approved'
      WHERE c.user_id=$1`,[payment.user_id])).rows[0];
    const chosen=[affiliate,business].filter(Boolean).sort((a,b)=>new Date(a.attributed_at).getTime()-new Date(b.attributed_at).getTime())[0];
    if(!chosen){
      await db.query("INSERT INTO programme_commission_payments(payment_id,programme,beneficiary_id) VALUES($1,'none',0)",[paymentId]);
      return;
    }
    const p=chosen.programme as Programme, base=Math.round(Number(payment.amount)*100);
    const rate=Number(chosen.rate), amount=Math.round(base*rate/100), currency=String(payment.currency||"USD");
    if(!Number.isSafeInteger(base)||base<=0||!Number.isInteger(rate)||rate<=0||rate>100||!Number.isSafeInteger(amount)||amount<=0||!/^[A-Z]{3}$/.test(currency))
      throw new Error("Programme commission requires review.");
    const {rows}=await db.query(p==="affiliate"
      ? `INSERT INTO affiliate_commissions(affiliate_id,referral_id,user_id,base_amount_cents,amount_cents,commission_percent,currency,period_month,status,payment_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING id`
      : `INSERT INTO partner_commissions(partner_id,partner_customer_id,user_id,base_amount_cents,amount_cents,commission_percent,currency,period_month,status,payment_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING id`,
      [chosen.beneficiary,chosen.referral_id,payment.user_id,base,amount,rate,currency,new Date().toISOString().slice(0,7),paymentId]);
    if(p==="affiliate"){
      const converted=await db.query("UPDATE affiliate_referrals SET status='converted',first_paid_at=COALESCE(first_paid_at,now()) WHERE id=$1 AND first_paid_at IS NULL RETURNING id",[chosen.referral_id]);
      await db.query("UPDATE affiliate_applications SET total_earned_cents=total_earned_cents+$2,converted_count=converted_count+$3 WHERE id=$1",
        [chosen.beneficiary,amount,converted.rows.length?1:0]);
    }else{
      await db.query("UPDATE partner_customers SET first_paid_at=COALESCE(first_paid_at,now()),lifetime_value_cents=lifetime_value_cents+$2 WHERE id=$1",[chosen.referral_id,base]);
      await db.query("UPDATE partners SET total_earned_cents=total_earned_cents+$2 WHERE id=$1",[chosen.beneficiary,amount]);
    }
    await db.query("INSERT INTO programme_commission_payments(payment_id,programme,beneficiary_id,commission_id) VALUES($1,$2,$3,$4)",
      [paymentId,p,chosen.beneficiary,rows[0].id]);
  });
}
export async function trackProgrammeClick(code:string){
  const affiliate=await pool.query("UPDATE affiliate_applications SET clicks=clicks+1 WHERE referral_code=$1 AND status='approved' RETURNING id",[code.slice(0,100)]);
  if(affiliate.rows.length)return;
  const partner=(await pool.query("SELECT application_id FROM partners WHERE slug=$1 AND status='active'",[code.slice(0,100)])).rows[0];
  if(partner?.application_id){
    await ensureMetadata(pool,"business",partner.application_id);
    await pool.query("UPDATE programme_applications SET clicks=clicks+1 WHERE programme='business' AND application_id=$1",[partner.application_id]);
  }
}
let reconciling=false;
export function startProgrammeReconciliation(){
  const tick=async()=>{
    if(reconciling)return;reconciling=true;
    try{
      const {rows}=await pool.query(`SELECT p.id FROM payments p WHERE p.status='completed'
        AND NOT EXISTS(SELECT 1 FROM programme_commission_payments c WHERE c.payment_id=p.id) ORDER BY p.id LIMIT 25`);
      for(const row of rows){
        try{await creditProgrammePayment(row.id);}catch{console.error("[programmes] A completed payment needs commission reconciliation.");}
      }
    }catch{console.error("[programmes] Commission reconciliation unavailable.");}
    finally{reconciling=false;}
  };
  const timer=setInterval(()=>void tick(),60000);timer.unref();void tick();
}
