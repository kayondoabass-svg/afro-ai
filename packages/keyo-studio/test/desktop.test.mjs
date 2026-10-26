import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ChatStore } from '../desktop/store.mjs';
import { DesktopController } from '../desktop/controller.mjs';
import { writeFixture } from './fixture.mjs';

function terminalEvent(controller) {
  return new Promise((resolve,reject) => {
    const timeout=setTimeout(() => {controller.off('event',handler); reject(new Error('Generation did not finish.'));},5000);
    const handler=event => {
      if (!['done','error'].includes(event.type) || !event.jobId) return;
      clearTimeout(timeout); controller.off('event',handler); resolve(event);
    };
    controller.on('event',handler);
  });
}
test('local history CRUD, atomic persistence, permissions, traversal and restart recovery',async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-history-'));
  try {
    const store=await new ChatStore(directory).init();
    const chat=await store.create();
    await store.rename(chat.id,'My local conversation');
    assert.equal((await store.get(chat.id)).title,'My local conversation');
    assert.equal((await store.list()).length,1);
    await assert.rejects(store.get('../private'),/Invalid conversation ID/);
    assert.throws(() => store.rename(chat.id,''),/title/);
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(directory)).mode & 0o777,0o700);
      assert.equal((await fs.stat(store.filename(chat.id))).mode & 0o777,0o600);
    }
    const {randomUUID}=await import('node:crypto');
    await store.update(chat.id,c => c.messages.push({id:randomUUID(),role:'assistant',content:'partial',status:'generating'}));
    await new ChatStore(directory).init();
    assert.equal((await store.get(chat.id)).messages[0].status,'error');
    await store.remove(chat.id);
    assert.deepEqual(await store.list(),[]);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});
test('desktop uses real worker generation, stores output, cancels and rejects unsupported/busy operations',async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-desktop-'));
  const modelDirectory=path.join(directory,'model');
  await writeFixture(modelDirectory,'gpt_neo');
  const store=await new ChatStore(path.join(directory,'history')).init();
  const controller=new DesktopController(store);
  try {
    await controller.load(modelDirectory);
    assert.equal(controller.state().loading,false);
    assert.equal(controller.state().model.architecture,'gpt_neo');
    assert.equal(controller.state().model.chatTemplate,null);
    const chat=await store.create();
    const request={chatId:chat.id,prompt:'hi',mode:'completion',maxTokens:3,temperature:0};
    await assert.rejects(controller.generate({...request,mode:'chat'}),/chat template/);
    const done=terminalEvent(controller);
    const starting=controller.generate(request);
    await assert.rejects(controller.generate(request),/busy/);
    await assert.rejects(controller.unload(),/Finish or cancel/);
    await starting;
    assert.equal((await done).type,'done');
    const saved=await store.get(chat.id);
    assert.equal(saved.messages[1].content,'aaa');
    assert.equal(saved.messages[1].status,'complete');
    assert.deepEqual(saved.messages[1].usage,{prompt_tokens:2,completion_tokens:3,total_tokens:5});
    const cancelled=terminalEvent(controller);
    await controller.generate({...request,maxTokens:60});
    controller.cancel();
    const event=await cancelled;
    assert.equal(event.cancelled,true);
    assert.equal((await store.get(chat.id)).messages.at(-1).status,'cancelled');
    const failed=terminalEvent(controller);
    await controller.generate({...request,prompt:'a'.repeat(70)});
    assert.equal((await failed).type,'error');
    assert.equal(controller.state().busy,false);
    assert.equal((await store.get(chat.id)).messages.at(-1).status,'error');
    await assert.rejects(controller.load(path.join(directory,'missing')));
    assert.equal(controller.state().loading,false);
    assert.equal(controller.state().model.architecture,'gpt_neo');
    await controller.unload(); assert.equal(controller.state().model,null);
  } finally { await controller.close(); await fs.rm(directory,{recursive:true,force:true}); }
});
