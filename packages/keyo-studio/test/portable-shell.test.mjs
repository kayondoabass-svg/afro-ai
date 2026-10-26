import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {keyoShellSource} from '../src/portable-shell.mjs';
test('offline static cache tolerates Origin variation without touching another app cache',async()=>{
  const scope='https://example.test/keyo/',prefix='keyo-shell:'+scope+':',events={},removed=[],hit={static:true};
  const caches={open:async()=>({match:async(_req,options)=>options.ignoreVary?hit:undefined}),
    keys:async()=>[prefix+'test',prefix+'old','keyo-shell:https://example.test/other/:old','customer-private'],
    delete:async name=>removed.push(name)};
  vm.runInNewContext(keyoShellSource('test',['./index.html','./assets/app.js']),{
    self:{registration:{scope},clients:{claim:async()=>{}},addEventListener:(name,fn)=>events[name]=fn},
    caches,fetch:()=>{throw new Error('Offline network request');}});
  let pending;
  events.fetch({request:{method:'GET',url:scope+'assets/app.js'},respondWith:p=>pending=p});
  assert.equal(await pending,hit);
  let intercepted=false;
  events.fetch({request:{method:'GET',url:'https://example.test/other/private'},respondWith:()=>intercepted=true});
  assert.equal(intercepted,false);
  events.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(removed,[prefix+'old']);
});
