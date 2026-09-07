import { sanitizeBlocks, widgetTypes, blockStyle } from './builder-model.js';

const openButton = document.querySelector('#open-visual-builder');
if (openButton) {
  const form = openButton.closest('form');
  const data = document.querySelector('#visual-builder-data');
  const fallback = document.querySelector('#visual-builder-content');
  let blocks = sanitizeBlocks(data.value), selected = 0, history = [JSON.stringify(blocks)], cursor = 0;
  let dirty = false, preview = false, dragIndex = null, canvasScroll = 0, pointerDrag = null;
  let media = []; try { media = JSON.parse(document.querySelector('#visual-builder-media').value); } catch { /* Empty library. */ }
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const button = (label, action, className = '') => { const b = el('button', className, label); b.type = 'button'; b.addEventListener('click', action); return b; };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const dialog = el('dialog', 'nvb-dialog'); dialog.setAttribute('aria-label', 'Noderyx Visual Builder');
  const bar = el('header', 'nvb-bar');
  bar.append(el('strong', '', 'N / Visual Builder'));
  const message = el('span', 'nvb-message', 'Changes are saved with your post or page.'); message.setAttribute('role', 'status');
  const devices = el('div', 'nvb-devices');
  const iframe = el('iframe', 'nvb-frame'); iframe.title = 'Visual content canvas'; iframe.setAttribute('sandbox', 'allow-same-origin');
  for (const [name, width] of [['Desktop','100%'],['Tablet','768px'],['Mobile','390px']]) {
    const b = button(name, () => { iframe.style.width = width; devices.querySelectorAll('button').forEach(n => n.setAttribute('aria-pressed', String(n === b))); });
    b.setAttribute('aria-pressed', String(name === 'Desktop')); devices.append(b);
  }
  const undo = button('Undo', () => travel(-1)), redo = button('Redo', () => travel(1));
  bar.append(devices, undo, redo, button('Preview', () => { preview = !preview; paintCanvas(); }), button('Save content', () => {
    sync(); dialog.close();
    if (form.reportValidity()) form.requestSubmit();
    else message.textContent = 'Complete the required content fields before saving.';
  }, 'nvb-save'), button('Back to editor', () => dialog.close()));
  const layout = el('div', 'nvb-layout'), library = el('aside', 'nvb-library'), center = el('div', 'nvb-center'), inspector = el('aside', 'nvb-inspector');
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search widgets'; search.setAttribute('aria-label', 'Search widgets');
  const widgets = el('div', 'nvb-widgets');
  for (const type of widgetTypes) {
    const b = button(type, () => add(type)); b.draggable = true;
    b.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', type)); widgets.append(b);
  }
  search.addEventListener('input', () => widgets.querySelectorAll('button').forEach(b => { b.hidden = !b.textContent.includes(search.value.toLowerCase()); }));
  const layers = el('div', 'nvb-layers');
  library.append(el('h2', '', 'Widgets'), search, widgets, el('h2', '', 'Templates'));
  const templates = {
    'Landing page': [{ type:'hero', text:'Your next chapter starts here', alt:'Introduce your business and the value you bring.', style:{ background:'#e5efe8', padding:60, align:'center' } }, { type:'columns', text:'Designed around you\nExplain your first benefit.', alt:'Built to make a difference\nExplain your second benefit.' }, { type:'cta', text:'Ready to get started?', alt:'Contact us', url:'/contact', style:{ background:'#e5efe8', align:'center' } }],
    'Article layout': [{ type:'heading', text:'A story worth sharing' }, { type:'text', text:'Start your article here.' }, { type:'quote', text:'Highlight a memorable thought.', alt:'Author' }, { type:'text', text:'Continue your story.' }],
    'Services': [{ type:'heading', text:'What we can do for you' }, { type:'card', text:'Our services', alt:'Describe your expertise and how it helps your customers.' }, { type:'list', text:'First benefit\nSecond benefit\nThird benefit' }]
  };
  for (const [name, content] of Object.entries(templates)) library.append(button(name + ' +', () => append(content)));
  library.append(button('Save layout as template', () => {
    if (!blocks.length) return;
    try { localStorage.setItem('nodecms:builder-template', JSON.stringify(blocks)); message.textContent = 'Layout saved in this browser. Use “Insert saved layout” to reuse it.'; } catch { message.textContent = 'Browser storage is unavailable. Export the layout instead.'; }
  }), button('Insert saved layout', () => {
    try { const saved = sanitizeBlocks(localStorage.getItem('nodecms:builder-template')); if (!saved.length) { message.textContent = 'No layout has been saved in this browser.'; return; } append(saved); } catch { message.textContent = 'Could not load this template.'; }
  }), button('Export layout', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(blocks, null, 2)], {type:'application/json'}));
    const a = el('a'); a.href = url; a.download = 'noderyx-layout.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
  const upload = el('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.hidden = true;
  upload.addEventListener('change', async () => {
    try {
      const file = upload.files[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) throw new Error('Layout files must be smaller than 2 MB.');
      const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed) || !sanitizeBlocks(parsed).length) throw new Error('Choose a valid Noderyx layout JSON file.');
      append(parsed);
    } catch (error) { message.textContent = error.message; }
    upload.value = '';
  });
  library.append(button('Import layout', () => upload.click()), upload, el('h2', '', 'Navigator'), layers);
  center.append(iframe); layout.append(library, center, inspector); dialog.append(bar, layout, message); document.body.append(dialog);
  function sync() { data.value = JSON.stringify(blocks); document.querySelector('#builder-summary').textContent = `${blocks.length} visual widget${blocks.length === 1 ? '' : 's'}. Save this ${form.elements.type.value} to apply changes.`; }
  function commit() {
    blocks = sanitizeBlocks(blocks); const value = JSON.stringify(blocks);
    if (value !== history[cursor]) { history = history.slice(0, cursor + 1); history.push(value); if (history.length > 80) history.shift(); cursor = history.length - 1; dirty = true; }
    sync(); undo.disabled = cursor === 0; redo.disabled = cursor === history.length - 1;
  }
  function travel(step) { if (!history[cursor + step]) return; cursor += step; blocks = JSON.parse(history[cursor]); selected = Math.min(selected, blocks.length - 1); dirty = true; sync(); render(); }
  function append(content) {
    if (blocks.length + content.length > 100) { message.textContent = 'A layout can contain up to 100 widgets.'; return; }
    const start = blocks.length;
    blocks.push(...sanitizeBlocks(content).map(b => ({ ...b, id: crypto.randomUUID() })));
    selected = start; commit(); render();
  }
  function add(type) { append([{ type, text: ['image','divider','spacer'].includes(type) ? '' : `Your ${type === 'cta' ? 'call to action' : type} here`, alt: type === 'cta' ? 'Learn more' : '', url: type === 'button' || type === 'cta' ? '/' : '' }]); }
  function move(index, delta) { const target = index + delta; if (target < 0 || target >= blocks.length) return; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; selected = target; commit(); render(); }
  function contentMarkup(b) {
    const text = esc(b.text), alt = esc(b.alt), url = esc(b.url), image = b.url ? `<img class="nvb-image" src="${url}" alt="${alt}">` : '<p class="nvb-image-placeholder">Choose an image in the widget settings.</p>';
    switch (b.type) {
      case 'hero': return `${b.url ? image : ''}<h2>${text}</h2><p>${alt}</p>`;
      case 'heading': return `<h2>${text}</h2>`;
      case 'text': return `<p>${text}</p>`;
      case 'image': return image;
      case 'button': return `<a class="nvb-button" href="${url}">${text}</a>`;
      case 'columns': return `<div class="nvb-columns"><p>${text}</p><p>${alt}</p></div>`;
      case 'quote': return `<p class="nvb-quote">${text}</p><span>${alt}</span>`;
      case 'divider': return '<div class="nvb-divider"></div>';
      case 'spacer': return '<div class="nvb-spacer"></div>';
      case 'card': return `${b.url ? image : ''}<h3>${text}</h3><p>${alt}</p>`;
      case 'cta': return `<h2>${text}</h2><a class="nvb-button" href="${url}">${alt}</a>`;
      case 'list': return `<ul>${b.text.split('\n').filter(Boolean).map(line => `<li>${esc(line)}</li>`).join('')}</ul>`;
      default: return '';
    }
  }
  function paintCanvas() {
    const doc = iframe.contentDocument;
    if (!doc?.querySelector('link[href="/public/builder-canvas.css"]')) return;
    canvasScroll = iframe.contentWindow.scrollY || 0;
    doc.body.className = preview ? 'is-preview' : 'is-editing';
    doc.body.innerHTML = blocks.length ? blocks.map((b,i) => `<section class="nvb-content ${i === selected ? 'chosen' : ''}" data-index="${i}" data-widget="${b.type}" data-visibility="${b.style.hideMobile ? 'hide-mobile' : ''} ${b.style.hideDesktop ? 'hide-desktop' : ''}" tabindex="0">${preview ? '' : `<button class="nvb-move" type="button" aria-label="Drag ${b.type} to reorder">⋮⋮ Move</button>`}${contentMarkup(b)}</section>`).join('') : '<div class="empty">Your canvas is ready.<br>Add a widget or insert a template to begin.</div>';
    doc.querySelectorAll('[data-index]').forEach(node => { node.style.cssText = blockStyle(blocks[Number(node.dataset.index)]); });
    iframe.contentWindow.scrollTo(0, canvasScroll);
  }
  iframe.addEventListener('load', () => {
    const doc = iframe.contentDocument; if (!doc) return;
    paintCanvas();
    doc.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.nvb-move'); if (!handle || preview) return;
      pointerDrag = Number(handle.closest('[data-index]').dataset.index); handle.setPointerCapture(e.pointerId); e.preventDefault();
    });
    doc.addEventListener('pointerup', e => {
      if (pointerDrag == null) return;
      const source = pointerDrag; pointerDrag = null;
      const target = doc.elementFromPoint(e.clientX, e.clientY)?.closest('[data-index]');
      if (!target) return; const index = Number(target.dataset.index);
      if (source !== index) { const [block] = blocks.splice(source, 1); blocks.splice(index, 0, block); selected = index; commit(); render(); }
    });
    doc.addEventListener('pointercancel', () => { pointerDrag = null; });
    doc.addEventListener('click', e => { e.preventDefault(); if(e.target.closest('.nvb-move')) return; const node = e.target.closest('[data-index]'); if (!preview && node) { selected = Number(node.dataset.index); render(); } });
    doc.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.index) { selected = Number(e.target.dataset.index); render(); } });
    doc.addEventListener('dragstart', e => { const node = e.target.closest('[data-index]'); if (node) { dragIndex = Number(node.dataset.index); e.dataTransfer.setData('text/plain', 'move'); } });
    doc.addEventListener('dragover', e => e.preventDefault());
    doc.addEventListener('drop', e => {
      e.preventDefault(); if (preview) return;
      const type = e.dataTransfer.getData('text/plain');
      const target = e.target.closest('[data-index]'); const index = target ? Number(target.dataset.index) : blocks.length - 1;
      if (type === 'move' && dragIndex != null) { const [block] = blocks.splice(dragIndex,1); blocks.splice(index,0,block); selected = index; dragIndex = null; commit(); render(); }
      else if (widgetTypes.includes(type)) add(type);
    });
  });
  iframe.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/public/builder-content.css"><link rel="stylesheet" href="/public/builder-canvas.css"></head><body></body></html>';
  function field(labelText, key, options = {}) {
    const b = blocks[selected], label = el('label', '', labelText);
    const input = el(options.choices ? 'select' : options.multiline ? 'textarea' : 'input');
    if (options.choices) for (const choice of options.choices) { const option = el('option','',choice); option.value = choice; input.append(option); }
    else { if (options.multiline) input.rows = 4; else input.type = options.type || 'text'; }
    const target = options.style ? b.style : b;
    if (options.type === 'checkbox') input.checked = target[key]; else input.value = target[key] ?? '';
    if (options.type === 'number') { input.min = 0; input.max = options.max || 160; }
    if (!options.style) input.maxLength = 20000;
    input.addEventListener('change', () => {
      target[key] = options.type === 'checkbox' ? input.checked : input.value;
      blocks[selected] = sanitizeBlocks([b])[0]; commit(); paintCanvas(); paintLayers();
      // Sanitization replaces model objects; rebuild the inspector for subsequent edits.
      paintInspector();
    });
    label.append(input); inspector.append(label);
  }
  function paintLayers() {
    layers.replaceChildren(); blocks.forEach((b,i) => { const row = el('div','nvb-layer'); const pick = button(`${i+1}. ${b.type}`, () => { selected = i; render(); }); pick.setAttribute('aria-pressed',String(i === selected)); row.append(pick, button('↑',()=>move(i,-1)),button('↓',()=>move(i,1))); layers.append(row); });
  }
  function paintInspector() {
    inspector.replaceChildren(el('h2','','Widget settings'));
    const b = blocks[selected]; if (!b) { inspector.append(el('p','','Select a widget to edit its content and styling.')); return; }
    inspector.append(el('h3','',b.type));
    if (!['divider','spacer','image'].includes(b.type)) field(b.type === 'list' ? 'List items (one per line)' : 'Text / heading', 'text', {multiline:true});
    if (['hero','image','columns','quote','card','cta'].includes(b.type)) field(b.type === 'image' ? 'Alternative text' : b.type === 'cta' ? 'Button label' : 'Supporting text / second column', 'alt', {multiline:true});
    if (['hero','image','button','card','cta'].includes(b.type)) field(['button','cta'].includes(b.type) ? 'Link URL' : 'Image URL', 'url');
    if (['hero','image','card'].includes(b.type) && media.length) {
      const label = el('label','','Media library'), select = el('select'); select.setAttribute('aria-label', 'Media library'); select.append(el('option','','Choose an image…'));
      media.forEach((m,i)=>{ const option = el('option','',m.title || `Image ${i+1}`); option.value=String(i); select.append(option); });
      select.addEventListener('change',()=>{ const m = media[Number(select.value)]; if (!m) return; b.url=m.url; if (b.type==='image') b.alt=m.alt || ''; commit(); render(); }); label.append(select); inspector.append(label);
    }
    inspector.append(el('h3','','Style'));
    field('Text color (hex)', 'color', {style:true}); field('Background (hex)', 'background', {style:true});
    field('Alignment','align',{style:true,choices:['left','center','right']});
    field('Base font size (0 = inherit)','fontSize',{style:true,type:'number',max:120});
    for (const [key,label] of [['padding','Padding (px)'],['margin','Bottom spacing (px)'],['radius','Corner radius (px)']]) field(label,key,{style:true,type:'number',max:key==='radius'?100:160});
    inspector.append(el('h3','','Responsive visibility'));
    field('Hide on mobile','hideMobile',{style:true,type:'checkbox'}); field('Hide on desktop / tablet','hideDesktop',{style:true,type:'checkbox'});
    inspector.append(el('p','nvb-hint','Use Preview to check visibility. Hidden widgets remain editable on the canvas.'),button('Duplicate widget',()=>append([b])),button('Delete widget',()=>{blocks.splice(selected,1);selected=Math.min(selected,blocks.length-1);commit();render();}));
  }
  function render() { undo.disabled=cursor===0;redo.disabled=cursor===history.length-1;paintLayers();paintInspector();inspector.scrollTop=0;paintCanvas(); }
  openButton.addEventListener('click',()=>{ if (!blocks.length && fallback.value.trim()) { append([{type:'text',text:fallback.value}]); } dialog.showModal(); render(); });
  dialog.addEventListener('close',()=>{sync();openButton.focus();});
  dialog.addEventListener('keydown',e=>{if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();travel(e.shiftKey?1:-1);}});
  form.addEventListener('input',()=>{dirty=true;});
  form.addEventListener('submit',()=>{sync();dirty=false;});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  sync();
  if (new URLSearchParams(location.search).get('builder') === '1') openButton.click();
}
