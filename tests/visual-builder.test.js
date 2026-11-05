import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileFile } from 'noderyx-framework';
import { CmsStore } from '../app/Services/CmsStore.js';
import { PluginManager } from '../app/Services/PluginManager.js';
import { sanitizeBlocks, decorateBlocks, safeUrl, blockStyle, countdownUnits } from '../public/builder-model.js';

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

test('advanced widget options are validated and mapped to fixed classes and styles', () => {
  const [block] = sanitizeBlocks([{type:'card',style:{animation:'fade-up',animDuration:50,animDelay:99999,hover:'lift',shadow:'medium',borderWidth:3,borderColor:'#ff0000',maxWidth:800,anchor:'pricing',cssClass:'featured nvb-in chosen bad"class x'}}]);
  assert.equal(block.style.animDuration,100); assert.equal(block.style.animDelay,5000);
  assert.equal(block.style.cssClass,'featured x');
  const [decorated] = decorateBlocks([block]);
  assert.equal(decorated.classes,'nvb-anim nvb-anim-fade-up nvb-hover-lift featured x');
  assert.equal(decorated.anchor,'pricing');
  assert.match(blockStyle(block),/border:3px solid #ff0000;/); assert.match(blockStyle(block),/max-width:800px;margin-left:auto/); assert.match(blockStyle(block),/--nvb-delay:5000ms/); assert.match(blockStyle(block),/box-shadow:/);
  const [unsafe] = sanitizeBlocks([{type:'text',style:{animation:'evil',hover:'x;color:red',shadow:'0 0 red',anchor:'1bad id',borderColor:'red'}}]);
  assert.equal(unsafe.style.animation,'none'); assert.equal(unsafe.style.hover,'none'); assert.equal(unsafe.style.shadow,'none'); assert.equal(unsafe.style.anchor,''); assert.equal(unsafe.style.borderColor,'');
  assert.equal(decorateBlocks([unsafe])[0].classes,''); assert.doesNotMatch(blockStyle(unsafe),/border:|box-shadow|--nvb/);
});

test('new widgets sanitize their content', () => {
  const [gallery, rating, countdown, badDate] = decorateBlocks([
    {type:'gallery',text:'/media/a.jpg | First\njavascript:alert(1) | Bad\nhttps://cdn.test/b.png'},
    {type:'rating',text:'3.7'},
    {type:'countdown',text:'2099-01-01T10:30'},
    {type:'countdown',text:'tomorrow<script>'}
  ]);
  assert.deepEqual(gallery.images,[{url:'/media/a.jpg',alt:'First'},{url:'https://cdn.test/b.png',alt:''}]);
  assert.equal(rating.ratingValue,'3.5'); assert.deepEqual(rating.stars,['full','full','full','half','empty']);
  assert.equal(countdown.target,'2099-01-01T10:30'); assert.equal(countdown.units.length,4);
  assert.equal(badDate.text,'');
  assert.deepEqual(countdownUnits('2026-01-02T00:00:00Z',Date.parse('2026-01-01T00:00:00Z')).map(u=>u.value),['1','00','00','00']);
});

test('public template renders new widgets and advanced attributes', async () => {
  const blocks = decorateBlocks([
    {type:'rating',text:'4.5',alt:'Great',style:{animation:'zoom',anchor:'reviews',cssClass:'promo'}},
    {type:'countdown',text:'2099-01-01',alt:'Launching in'},
    {type:'icon-list',text:'One\nTwo'},
    {type:'gallery',text:'/media/a.jpg | Alt A'},
    {type:'video',url:'/media/clip.mp4',text:'Demo'}
  ]);
  const post={type:'page',slug:'demo',title:'Demo',seoTitle:'Demo',blocks,layout:'canvas'};
  const html=await compileFile('resources/views/site/post.noderframe',{post,settings:{},theme:{},navigation:[],allowComments:false});
  assert.match(html,/class="nvb-content nvb-anim nvb-anim-zoom promo"/); assert.match(html,/id="reviews"/);
  assert.match(html,/nvb-star is-half/); assert.match(html,/data-countdown="2099-01-01"/); assert.match(html,/data-unit="days"/);
  assert.match(html,/<li>Two<\/li>/); assert.match(html,/src="\/media\/a.jpg" alt="Alt A"/); assert.match(html,/data-video="\/media\/clip.mp4"/);
  assert.match(html,/builder-runtime\.js/);
});
