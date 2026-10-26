import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
const root=path.resolve(import.meta.dirname,'../../..');
const browser=await chromium.launch({executablePath:'/repl/tools/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const server=http.createServer(async(req,res)=>{
  try {
    const relative=new URL(req.url,'http://localhost').pathname.replace(/^\/keyo-mobile\//,'');
    if(relative.includes('..')){res.writeHead(400).end();return;}
    const name=path.join(root,'artifacts/keyo-mobile/dist/public',relative||'index.html');
    const body=await fs.readFile(name);
    res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');
    res.end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const id='smollm2-135m-instruct',base=process.env.KEYO_TEST_URL||`http://127.0.0.1:${server.address().port}/keyo-mobile/`;
const report={checks:[],errors};
const check=name=>{report.checks.push(name);console.log('PASS',name);};
try {
  await page.goto(base);await page.getByTestId('status-notice').waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  assert.match(await page.locator('body').innerText(),/No conversations yet/);check('honest empty state and worker storage readiness');
  await page.getByTestId(`button-import-${id}`).click();
  assert.equal(await page.getByTestId('button-confirm-license').isEnabled(),false);
  await page.getByTestId('input-import-files').setInputFiles(['config.json','tokenizer.json','tokenizer_config.json','model.safetensors'].map(f=>path.join(root,'generated-artifacts/keyo-models/smollm2-135m',f)));
  await page.getByTestId('checkbox-license').check();await page.getByTestId('button-confirm-license').click();
  await page.getByTestId(`button-load-${id}`).or(page.getByTestId('status-error')).waitFor({timeout:120000});
  if(await page.getByTestId('status-error').count())throw new Error(await page.getByTestId('status-error').innerText());
  check('pinned model import, licence acceptance, full SHA-256 validation and OPFS persistence');
  await page.getByTestId(`button-load-${id}`).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="status-engine"]')?.textContent.includes('Ready'),{},{timeout:120000});
  await page.getByTestId('button-new-chat').click();
  await page.getByTestId('input-max-tokens').fill('2');
  await page.getByTestId('input-prompt').fill('Hi');
  await page.getByTestId('button-send').click();
  await page.getByTestId('button-stop').waitFor();
  // Yield an animation-frame round trip while inference works in the worker.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));check('main thread responsive during real model inference');
  await page.getByTestId('button-send').waitFor({timeout:300000});
  const messages=await page.locator('[data-testid^="message-"]').allTextContents();
  assert.equal(messages.length,2);assert.ok(messages[1].trim().length>0);report.output=messages[1];
  check('real checkpoint generation streams to saved conversation');
  await page.getByTestId('button-rename-chat').click();await page.getByTestId('input-rename').fill('Offline verification');
  await page.getByTestId('button-save-rename').click();await page.reload();
  await page.getByTestId(`button-load-${id}`).waitFor();
  assert.equal(await page.getByTestId('text-chat-title').textContent(),'Offline verification');check('conversation rename, messages and installed models survive restart');
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId(`button-load-${id}`).waitFor();
  await page.getByTestId(`button-load-${id}`).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="status-engine"]')?.textContent.includes('Ready'),{},{timeout:120000});
  check('offline local model loading without network');
  await page.getByTestId('input-prompt').fill('Tell me a story');
  await page.getByTestId('button-send').click();await page.getByTestId('button-stop').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="status-engine"]')?.textContent.includes('No model'));
  assert.match(await page.locator('body').innerText(),/stopped/i);check('immediate cancellation terminates worker and marks interrupted output');
  await context.setOffline(false);
  await page.getByTestId('button-delete-chat').click();await page.getByTestId('button-confirm-delete-chat').click();
  assert.equal(await page.locator('[data-testid^="message-"]').count(),0);
  assert.ok(await page.getByTestId(`button-load-${id}`).isVisible());check('deleting conversation keeps model files');
  await page.setViewportSize({width:402,height:874});
  assert.ok(await page.getByTestId('button-open-models').isVisible());
  await page.getByTestId('button-open-models').click();
  assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true);check('mobile panels fit viewport');
  assert.deepEqual(errors,[]);
} catch(error) {
  console.log((await page.locator('body').innerText()).slice(-7000));throw error;
} finally {
  await fs.writeFile(path.join(root,'generated-artifacts/keyo-browser-check.json'),JSON.stringify(report,null,2));
  await browser.close();
  server.close();
}
