// This program is downloaded, not executed by the Afro AI server.
export const LOCAL_RUNNER = String.raw`import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const auditDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(auditDir, '..');
const config = JSON.parse(fs.readFileSync(path.join(auditDir, 'config.json'), 'utf8'));
const output = path.join(auditDir, 'results');
fs.mkdirSync(output, { recursive: true });
const checks = [];
const add = (name, status, detail) => checks.push({name, status, detail: String(detail).slice(0, 3500)});
const clean = (value) => String(value).replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-(?:proj-)?[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+|(?:password|secret|token|api_key)\s*[=:]\s*\S+)/gi, '[REDACTED]');
const reportFile = path.join(output, 'report.json');
let stopped = false, child, browser, server;
process.on('SIGINT', () => { stopped = true; if (child) stopChild(child); });
process.on('SIGTERM', () => { stopped = true; if (child) stopChild(child); });
function stopChild(p) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], {stdio:'ignore'}).on('error',()=>{});
    return;
  }
  try { if (process.platform !== 'win32') process.kill(-p.pid, 'SIGTERM'); else p.kill('SIGTERM'); } catch {}
  const timer = setTimeout(() => { try { if (process.platform !== 'win32') process.kill(-p.pid, 'SIGKILL'); else p.kill('SIGKILL'); } catch {} }, 1000);
  timer.unref();
}
async function command(name, args) {
  if (stopped) return add(name, 'blocked', 'Cancelled');
  if (!process.argv.includes('--allow-commands')) return add(name, 'blocked', 'Inspect package scripts; rerun with --allow-commands to execute them on this computer.');
  await new Promise(resolve => {
    let log = '', timedOut = false, settled = false;
    // Platform credentials are not inherited. Add customer-required env values
    // only by explicitly editing this runner after reviewing the project.
    const env = Object.fromEntries(['PATH','Path','SystemRoot','COMSPEC','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const p = spawn(npm, args, {cwd: root, env, shell: process.platform === 'win32', detached: process.platform !== 'win32', stdio:['ignore','pipe','pipe']});
    child = p;
    const timer = setTimeout(() => { timedOut = true; stopChild(p); }, 120000);
    const capture = data => { if (log.length < 16000) log += clean(data.toString()).slice(0, 16000-log.length); };
    p.stdout.on('data', capture); p.stderr.on('data', capture);
    const finish = (code, error) => {
      if (settled) return; settled = true; clearTimeout(timer); child = undefined;
      const status = stopped || timedOut ? 'blocked' : code === 0 && !error ? 'passed' : 'failed';
      add(name, status, clean((error || '') + (timedOut ? 'Timed out. ' : '') + log));
      resolve();
    };
    p.on('error', e => finish(-1,e.message)); p.on('close', code => finish(code));
  });
}
try {
  const actualFiles = config.manifest.map(f => {
    const target = path.resolve(root, f.path);
    if (!target.startsWith(root + path.sep)) throw new Error('Invalid manifest path');
    const real = fs.realpathSync(target);
    if (!real.startsWith(root + path.sep)) throw new Error('Symlink outside project rejected');
    const bytes = fs.readFileSync(real);
    return [f.path, f.language, f.encoding || 'utf8', bytes.toString(f.encoding === 'base64' ? 'base64' : 'utf8')];
  });
  const hash = createHash('sha256').update(JSON.stringify(actualFiles)).digest('hex');
  if (hash !== config.fingerprint) throw new Error('Source differs from the downloaded workspace; download a new bundle after approved edits.');
  add('Workspace fingerprint', 'passed', 'Source matches the downloaded snapshot.');
  const pkgPath = path.join(root, 'package.json');
  let pkg;
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); add('package.json syntax','passed','Valid JSON'); }
    catch (e) { add('package.json syntax','failed', e.message); }
    if (pkg) {
      if (process.argv.includes('--allow-install')) await command('Dependencies', [fs.existsSync(path.join(root,'package-lock.json')) ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund']);
      for (const name of ['build','test']) {
        if (typeof pkg.scripts?.[name] === 'string') await command(name, ['run', name]);
        else add(name, 'blocked', 'No explicit '+name+' script configured.');
      }
    }
  }
  const entryRoot = path.resolve(root, config.previewDirectory || '.');
  if (!entryRoot.startsWith(root + path.sep) && entryRoot !== root) throw new Error('Invalid preview directory');
  const realPreview = fs.realpathSync(entryRoot);
  if (!realPreview.startsWith(root + path.sep) && realPreview !== root) throw new Error('Preview symlink outside project rejected');
  if (!fs.existsSync(path.join(entryRoot, 'index.html'))) add('Browser preview','blocked','No index.html in previewDirectory. Build first and edit config.json previewDirectory (for example dist). Backend startup is customer-managed.');
  else if (!stopped) {
    server = http.createServer((req,res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(entryRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(entryRoot + path.sep)) { res.writeHead(403); res.end(); return; }
        const real = fs.realpathSync(file);
        if (!real.startsWith(realPreview + path.sep) || !fs.statSync(real).isFile()) { res.writeHead(403); res.end(); return; }
        const types = {'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        const stream = fs.createReadStream(real); stream.on('error', () => res.destroy()); stream.pipe(res);
      } catch { res.writeHead(404); res.end('Not found'); }
    });
    await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({headless:true});
      const origin = 'http://127.0.0.1:' + server.address().port;
      for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
        if (stopped) break;
        const page = await browser.newPage({viewport});
        page.setDefaultTimeout(5000);
        const errors = [];
        await page.route('**/*', route => {
          const url = route.request().url();
          if (url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
          errors.push('External network blocked'); return route.abort();
        });
        page.on('pageerror', e => errors.push(clean(e.message)));
        page.on('console', m => { if (m.type() === 'error') errors.push(clean(m.text())); });
        page.on('requestfailed', r => errors.push('Request failed: ' + new URL(r.url()).pathname));
        page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ': ' + new URL(r.url()).pathname); });
        try {
          const response = await page.goto(origin, {waitUntil:'domcontentloaded',timeout:15000});
          if (!response || response.status() >= 400) throw new Error('Entry page failed');
          const visible = await page.locator('body').innerText();
          const visualElement = await page.locator('canvas, img, video, svg').count();
          if (!visible.trim() && !visualElement) throw new Error('No visible page content');
          const actions = config.browserActions || [];
          if (!Array.isArray(actions) || actions.length > 30) throw new Error('Invalid browser actions');
          for (const action of actions) {
            if (typeof action.selector !== 'string' || action.selector.length > 300) throw new Error('Invalid selector');
            const target = page.locator(action.selector);
            if (action.kind === 'click') await target.click();
            else if (action.kind === 'fill' && typeof action.value === 'string') await target.fill(action.value);
            else if (action.kind === 'visible') await target.waitFor({state:'visible'});
            else if (action.kind === 'text' && typeof action.value === 'string') {
              if (!(await target.innerText()).includes(action.value)) throw new Error('Expected text missing');
            } else throw new Error('Unsupported browser action');
          }
          await page.screenshot({path:path.join(output,'preview-'+viewport.width+'.png'),fullPage:true,timeout:5000});
          add('Browser '+viewport.width, errors.length ? 'failed':'passed', errors.length ? errors.slice(0,8).join('\n') : 'Initial page and configured actions passed. Screenshot saved; visual appearance needs review.');
        } catch (e) { add('Browser '+viewport.width, 'failed', clean(e.message)); }
        finally { await page.close(); }
      }
    } catch (e) { add('Browser engine','blocked',clean(e.message)+' Install Playwright locally as described in README.txt.'); }
  }
  for (const acceptance of config.acceptanceChecks || []) add('Acceptance: '+acceptance,'blocked','Manually verify this requirement; browser smoke checks alone do not prove it.');
  if (stopped) add('Cancellation','blocked','Stopped by user; no automatic retry.');
} catch (e) { add('Validation setup','failed',clean(e.message)); }
finally {
  if (browser) await browser.close().catch(()=>{});
  if (server) await new Promise(resolve => server.close(resolve));
  const status = checks.some(c=>c.status==='failed') ? 'failed' : checks.some(c=>c.status==='blocked'||c.status==='skipped') ? 'blocked' : 'passed';
  fs.writeFileSync(reportFile, JSON.stringify({fingerprint:config.fingerprint,source:'customer-local',status,checks}, null, 2));
  console.log('Validation '+status+'. Report: '+reportFile);
  process.exitCode = status === 'passed' ? 0 : 1;
}
`;
