import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileFile } from 'noderyx-framework';
import { CmsStore } from '../app/Services/CmsStore.js';
import { PluginManager } from '../app/Services/PluginManager.js';
import { sanitizeBlocks, decorateBlocks, safeUrl } from '../public/builder-model.js';

test('builder rejects unsafe URLs and styles while keeping supported widget data', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', '/\\evil.test']) assert.equal(safeUrl(url), '');
  const [block] = sanitizeBlocks([{type:'hero',text:'Title',url:'javascript:alert(1)',style:{background:'red;position:fixed',padding:99999,fontSize:-1,align:'bad',hideMobile:true}}]);
  assert.equal(block.url,''); assert.equal(block.style.background,''); assert.equal(block.style.padding,160); assert.equal(block.style.fontSize,0); assert.equal(block.style.align,'left');
  assert.equal(sanitizeBlocks([{type:'script'}]).length,0);
  assert.equal(sanitizeBlocks(Array(105).fill({type:'text'})).length,100);
  assert.match(decorateBlocks([block])[0].visibility,/hide-mobile/);
});

test('core builder saves posts and pages, renders safe public output, and restores styles from revisions', async () => {
  const directory=await mkdtemp(join(tmpdir(),'noderyx-builder-'));
  try {
    const store=await new CmsStore(join(directory,'cms.json')).initialize();
    for (const type of ['post','page']) {
      const block={type:'hero',text:'<script>alert(1)</script>',alt:'Supporting copy',url:'/public/example.jpg',style:{background:'#12271d',color:'#ffffff',padding:40,hideMobile:true}};
      const post=await store.savePost({type,title:`Visual ${type}`,layout:'canvas',status:'published',blocks:JSON.stringify([block])},1);
      assert.equal(post.blocks[0].style.background,'#12271d'); assert.equal(post.layout,'canvas');
      const published=await store.findPublished(post.slug,type);
      assert.match(published.blocks[0].css,/background-color:#12271d/);
      const html=await compileFile('resources/views/site/post.noderframe',{post:published,settings:{},theme:{},navigation:[],allowComments:false});
      assert.match(html,/&lt;script&gt;/); assert.doesNotMatch(html,/<script>alert/); assert.match(html,/hide-mobile/); assert.match(html,/builder-style\//);
      await store.savePost({...post,layout:'wide',blocks:JSON.stringify([{type:'text',text:'Replacement'}])},1);
      const revision=(await store.read()).revisions.find(r=>r.postId===post.id);
      await store.restoreRevision(revision.id);
      assert.equal((await store.read()).posts.find(p=>p.id===post.id).blocks[0].style.padding,40);
      assert.equal((await store.read()).posts.find(p=>p.id===post.id).layout,'canvas');
      await store.savePost({...post,blocks:undefined},1);
      assert.equal((await store.read()).posts.find(p=>p.id===post.id).blocks.length,1);
      await store.savePost({...post,blocks:'[]',content:'Plain content'},1);
      assert.equal((await store.findPublished(post.slug,type)).blocks,null);
    }
    const plugin=(await new PluginManager().all()).find(p=>p.id==='visual-builder');
    assert.equal(plugin.source,'Core');assert.equal(plugin.status,'Active');
  } finally { await rm(directory,{recursive:true,force:true}); }
});
