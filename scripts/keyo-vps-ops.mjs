import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
// No secret is printed. Host/path come from the established deploy runbook.
const mode=process.argv[2];
if(!['inspect','deploy','status'].includes(mode))throw new Error('Choose inspect, deploy or status.');
if(!process.env.DROPLET_SSH_KEY)throw new Error('Saved SSH credential unavailable.');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-vps-'));
const key=path.join(directory,'identity');
try{
  let value=process.env.DROPLET_SSH_KEY.replace(/\\n/g,'\n').trim()+'\n';
  await fs.writeFile(key,value,{mode:0o600});
  try{execFileSync('ssh-keygen',['-y','-f',key],{stdio:'ignore'});}
  catch{
    const m=value.match(/-----BEGIN ([A-Z ]+)-----([\s\S]+)-----END \1-----/);
    if(!m)throw new Error('Saved SSH key formatting is not usable.');
    value=`-----BEGIN ${m[1]}-----\n${m[2].replace(/\s/g,'').match(/.{1,70}/g).join('\n')}\n-----END ${m[1]}-----\n`;
    await fs.writeFile(key,value,{mode:0o600});
    execFileSync('ssh-keygen',['-y','-f',key],{stdio:'ignore'});
  }
  // Read the new deploy runner without advancing the checkout first: it must
  // retain the previous revision to detect dependency changes and roll back.
  const revision=mode==='deploy'?execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim():null;
  if(revision&&!/^[a-f0-9]{40}$/.test(revision))throw new Error('Invalid release revision.');
  const command=mode==='deploy'?`cd /opt/afro-ai && git fetch origin main && test "$(git rev-parse origin/main)" = "${revision}" && runner=$(mktemp /tmp/afro-deploy.XXXXXX) && trap 'rm -f "$runner"' EXIT && git show "${revision}:scripts/deploy.sh" > "$runner" && bash "$runner"`:
    mode==='inspect'?'cd /opt/afro-ai && printf "NODE "; node --version; printf "REVISION "; git rev-parse HEAD; printf "SERVICE "; systemctl is-active afro-ai; printf "DISK "; df -h /opt/afro-ai | tail -1; du -sh /opt/afro-ai/node_modules /opt/afro-ai/dist /root/.npm /root/.local/share/pnpm/store 2>/dev/null; printf "HEALTH "; curl --max-time 15 -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:3000/api/health':
    'cd /opt/afro-ai && printf "REVISION "; git rev-parse HEAD; printf "SERVICE "; systemctl is-active afro-ai; printf "HEALTH "; curl --max-time 15 -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:3000/api/health; printf "KEYO "; curl --max-time 15 -fsS http://127.0.0.1:3000/api/keyo-studio/release | node -e \'let s="";process.stdin.on("data",b=>s+=b).on("end",()=>console.log(JSON.parse(s).version))\'';
  const code=await new Promise((resolve,reject)=>{
    const child=spawn('ssh',['-i',key,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=accept-new','-o','ConnectTimeout=15','root@165.232.64.81',command],{stdio:'inherit'});
    child.on('error',reject);child.on('close',resolve);
  });
  if(code!==0)throw new Error(`VPS ${mode} failed with exit ${code}.`);
} finally{await fs.rm(directory,{recursive:true,force:true});}
