/**
 * Run behind HTTPS on YOUR website's backend. No iframe or browser API secret.
 * npm install express cookie
 * AFRO_AUTH_BASE_URL=https://afroaigroup.com/cf-auth/v1/t/YOUR_PROJECT
 * AFRO_AUTH_SECRET_KEY=your existing server-only project key
 * AFRO_CALLBACK_URL=https://YOUR_WEBSITE/auth/confirm
 * AFRO_COOKIE_SECRET=a random server-only secret of at least 32 characters
 * Register AFRO_CALLBACK_URL in the project's Setup first.
 *
 * Mount at the root: app.use(createAfroAuthRouter(options)).
 * Or run this file directly. Reuse your app's existing signup UI:
 * POST /auth/signup {email,password} -> show "check your email".
 */
import express from "express";
import { parse as parseCookie } from "cookie";
import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

const escape = value => String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function createAfroAuthRouter(options = {}) {
  const base = String(options.baseUrl || process.env.AFRO_AUTH_BASE_URL || "").replace(/\/$/,"");
  const apiKey = options.secretKey || process.env.AFRO_AUTH_SECRET_KEY;
  const callback = new URL(options.callbackUrl || process.env.AFRO_CALLBACK_URL);
  const secret = options.cookieSecret || process.env.AFRO_COOKIE_SECRET;
  const local = url => url.protocol==="http:" && ["localhost","127.0.0.1"].includes(url.hostname);
  if(!apiKey?.startsWith("sk_live_") || typeof secret!=="string" || secret.length<32 ||
    (callback.protocol!=="https:" && !local(callback)) || callback.search || callback.hash ||
    callback.username || callback.password)throw Error("Configure the backend API key, callback and a strong cookie secret.");
  const service = new URL(base);
  if((service.protocol!=="https:" && !local(service)) || service.username || service.password ||
    service.search || service.hash || !/\/cf-auth\/(?:v1\/)?t\/[^/]+$/.test(service.pathname))throw Error("Invalid Afro Auth API base URL.");
  const encryptionKey=createHash("sha256").update(secret).digest();
  const settings={httpOnly:true,secure:callback.protocol==="https:",sameSite:"lax",path:"/"};
  const successPath=options.successPath||"/dashboard?verified=true";
  if(!successPath.startsWith("/") || successPath.startsWith("//") || /[\r\n\\]/.test(successPath))throw Error("Use a same-site relative success path.");
  const router=express.Router();
  const signupAttempts=new Map();
  router.post("/auth/signup",(req,res,next)=>{
    const ip=req.ip||req.socket.remoteAddress||"unknown",now=Date.now();
    let bucket=signupAttempts.get(ip);
    if(!bucket || bucket.until<now) {
      if(signupAttempts.size>=10000)signupAttempts.delete(signupAttempts.keys().next().value);
      bucket={count:0,until:now+60000};signupAttempts.set(ip,bucket);
    }
    if(++bucket.count>10){res.set("Retry-After",String(Math.ceil((bucket.until-now)/1000)));return res.status(429).json({message:"Too many signup attempts. Please wait."});}
    next();
  });
  router.use(express.json({limit:"16kb"}),express.urlencoded({extended:false,limit:"16kb"}));
  router.use((req,res,next)=>{
    if(!["/auth/signup","/auth/session","/auth/logout",callback.pathname].includes(req.path))return next();
    res.set("Cache-Control","no-store");
    res.set("Referrer-Policy","same-origin");
    if(!(req.method==="GET" && req.path===callback.pathname && options.renderCallback===false))
      res.set("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    next();
  });
  const seal=(value,seconds)=>{
    const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey,iv);
    const data=Buffer.concat([cipher.update(JSON.stringify({...value,expires:Date.now()+seconds*1000})),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),data]).toString("base64url");
  };
  const open=(req,name)=>{
    try{
      const raw=Buffer.from(parseCookie(req.headers.cookie||"")[name]||"","base64url");
      const decipher=createDecipheriv("aes-256-gcm",encryptionKey,raw.subarray(0,12));
      decipher.setAuthTag(raw.subarray(12,28));
      const result=JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString());
      return result.expires>Date.now()?result:null;
    }catch{return null;}
  };
  const clearPending=res=>res.clearCookie("afro_pending",settings);
  const trusted=req=>req.get("Sec-Fetch-Site")!=="cross-site" && (!req.get("Origin") || req.get("Origin")===callback.origin);
  const same=(a,b)=>{
    if(typeof a!=="string" || typeof b!=="string")return false;
    const first=Buffer.from(a),second=Buffer.from(b);
    return first.length===second.length && timingSafeEqual(first,second);
  };
  async function api(path,body,token=apiKey) {
    const response=await fetch(base+path,{method:body?"POST":"GET",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:"error",cache:"no-store"});
    return {status:response.status,body:await response.json()};
  }
  const failure=(res,status,message)=>res.status(status).type("html").send(
    "<!doctype html><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><h1>Unable to continue</h1><p>"+escape(message)+"</p><p><a href=\"/\">Return to your app</a></p>");
  router.post("/auth/signup",async(req,res)=>{
    if(!trusted(req))return failure(res,403,"Untrusted request origin.");
    const state=randomBytes(32).toString("base64url"),verifier=randomBytes(32).toString("base64url");
    const confirmation={state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"};
    try{
      const body={email:req.body.email,password:req.body.password,confirmation};
      let result=await api("/signup",body);
      // A password-protected restart rotates the pending transaction; it
      // never signs an unverified account in or resends for verified users.
      if(result.status===409)result=await api("/confirmation/restart",body);
      if(result.status!==200){clearPending(res);return res.status(result.status).json({message:result.body.message||"Unable to start verification.",code:result.body.code});}
      res.cookie("afro_pending",seal({state,verifier,pendingId:result.body.pendingId,previousToken:open(req,"afro_session")?.token},86400),{...settings,maxAge:86400000});
      return res.json({verificationRequired:true,message:"Check your email to confirm your account."});
    }catch{clearPending(res);return res.status(503).json({message:"Verification is temporarily unavailable. Wait one minute before retrying."});}
  });
  async function finish(req,res,pending,code,state) {
    if(!pending || !same(pending.state,state))return failure(res,400,"Open this link in the browser where you started signup, or return to the app and sign in.");
    try{
      const result=await api("/confirmation/exchange",{code,state,code_verifier:pending.verifier,redirect_uri:callback.toString(),
        ...(pending.previousToken?{previous_token:pending.previousToken}:{})});
      clearPending(res);
      if(result.status!==200 || !result.body.token)return failure(res,400,"The confirmation session expired or was already used. Return to the app and sign in.");
      // The pending cookie is expired, not promoted into an authenticated
      // session. A fresh, encrypted, host-only HttpOnly cookie replaces it.
      res.clearCookie("afro_session",settings);
      res.cookie("afro_session",seal({token:result.body.token},result.body.expiresIn),{...settings,maxAge:result.body.expiresIn*1000});
      return req.accepts(["html","json"])==="json" ? res.json({ok:true,redirect:successPath}) : res.redirect(303,successPath);
    }catch{clearPending(res);return failure(res,503,"Unable to finish signing in. Return to the app and sign in normally.");}
  }
  if(options.renderCallback!==false)router.get(callback.pathname,async(req,res)=>{
    const pending=open(req,"afro_pending");
    if(!pending || !same(pending.state,req.query.state))return failure(res,400,"Use the original signup browser, or return to the app and sign in. No account was signed in here.");
    if(typeof req.query.code==="string")return finish(req,res,pending,req.query.code,req.query.state);
    if(typeof req.query.verification_token!=="string" || !/^[a-f0-9]{64}$/.test(req.query.verification_token))
      return failure(res,400,"The confirmation link is incomplete.");
    // GET previews do not activate accounts. The human confirms on YOUR
    // website; all Afro Auth calls and the API secret stay on the backend.
    return res.type("html").send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm your email</title><h1>Confirm your email</h1><form method="post" action="'+escape(callback.pathname)+'"><input type="hidden" name="verification_token" value="'+escape(req.query.verification_token)+'"><input type="hidden" name="state" value="'+escape(pending.state)+'"><button>Confirm and sign in</button></form>');
  });
  router.post(callback.pathname,async(req,res)=>{
    if(!trusted(req))return failure(res,403,"Untrusted request origin.");
    const pending=open(req,"afro_pending");
    if(!pending || !same(pending.state,req.body.state))return failure(res,400,"The pending signup session is missing. Use the original browser or sign in normally.");
    if(typeof req.body.code==="string")return finish(req,res,pending,req.body.code,req.body.state);
    if(typeof req.body.verification_token!=="string" || !/^[a-f0-9]{64}$/.test(req.body.verification_token))
      return failure(res,400,"The confirmation token is incomplete.");
    try{
      const confirmed=await api("/verify-email",{token:req.body.verification_token});
      if(confirmed.status!==200 || !confirmed.body.redirect){clearPending(res);return failure(res,400,"This confirmation is unavailable or already completed. Return to the app and sign in.");}
      clearPending(res);
      const grant=new URL(confirmed.body.redirect);
      if(grant.origin!==callback.origin || grant.pathname!==callback.pathname)return failure(res,400,"The confirmation callback changed. Return to the app and sign in.");
      return finish(req,res,pending,grant.searchParams.get("code"),grant.searchParams.get("state"));
    }catch{return failure(res,503,"Unable to confirm right now. Try again shortly.");}
  });
  router.get("/auth/session",async(req,res)=>{
    const session=open(req,"afro_session");
    if(!session)return res.status(401).json({user:null});
    try{
      const result=await api("/me",undefined,session.token);
      if(!result.body.user){res.clearCookie("afro_session",settings);return res.status(401).json({user:null});}
      return res.json({user:result.body.user});
    }catch{return res.status(503).json({message:"Session check unavailable."});}
  });
  router.post("/auth/logout",async(req,res)=>{
    if(!trusted(req))return failure(res,403,"Untrusted request origin.");
    const session=open(req,"afro_session");
    if(session){
      try{const result=await api("/logout",{},session.token);if(result.status!==200 && result.status!==401)return failure(res,503,"Logout could not be confirmed. Please retry.");}
      catch{return failure(res,503,"Logout could not be confirmed. Please retry.");}
    }
    clearPending(res);res.clearCookie("afro_session",settings);return res.json({ok:true});
  });
  return router;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const app=express();
  // Set only to the CIDR/IP of an actual trusted reverse proxy. Never use
  // `trust proxy = true` on an internet-accessible server.
  if(process.env.TRUSTED_PROXY_CIDR)app.set("trust proxy",process.env.TRUSTED_PROXY_CIDR);
  app.use(createAfroAuthRouter());
  app.get("/",(_req,res)=>res.send("Backend integration running. Mount your customer app here and use /auth/session to check the signed-in user."));
  app.listen(Number(process.env.PORT||3000),"0.0.0.0",()=>console.log("Customer Auth backend ready."));
}
