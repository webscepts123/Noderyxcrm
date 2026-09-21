import { sanitizeBlocks, widgetTypes, blockStyle, decorateBlocks } from './builder-model.js';

const openButton = document.querySelector('#open-visual-builder');
if (openButton) {
  const form = openButton.closest('form');
  const data = document.querySelector('#visual-builder-data');
  const fallback = document.querySelector('#visual-builder-content');
  let blocks = sanitizeBlocks(data.value), selected = -1, settingsTab = 'content', navigatorOpen = false;
  let history = [JSON.stringify(blocks)], cursor = 0;
  let dirty = false, preview = false, dragIndex = null, canvasScroll = 0, pointerDrag = null;
  let media = []; try { media = JSON.parse(document.querySelector('#visual-builder-media').value); } catch { /* Empty library. */ }
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const button = (label, action, className = '') => { const b = el('button', className, label); b.type = 'button'; b.addEventListener('click', action); return b; };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  const ICON = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    tablet: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 19h4"/>',
    mobile: '<rect x="8" y="2" width="8" height="20" rx="2"/><path d="M11 18h2"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    hero: '<rect x="3" y="4" width="18" height="10" rx="1.5"/><path d="M8 18h8M12 14v4"/>',
    heading: '<path d="M5 5v14M19 5v14M5 12h14"/>',
    text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5.5-5.5L4 19"/>',
    button: '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 12h8"/>',
    columns: '<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>',
    quote: '<path d="M7 7c-2 0-3.5 1.6-3.5 4S5 15 7 15V7z"/><path d="M17 7c-2 0-3.5 1.6-3.5 4s1.5 4 3.5 4V7z"/>',
    divider: '<path d="M3 12h18"/>',
    spacer: '<path d="M12 3v18" stroke-dasharray="3 3"/><path d="M8 7l4-4 4 4M8 17l4 4 4-4"/>',
    card: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/>',
    cta: '<path d="M4 10l14-6v16l-14-6z"/><path d="M4 10v8"/>',
    list: '<circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/>',
    testimonial: '<circle cx="12" cy="8" r="3"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>',
    'icon-box': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 9l1.1 2.3 2.5.4-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.4z"/>',
    counter: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    progress: '<rect x="3" y="10" width="18" height="4" rx="2"/><rect x="3" y="10" width="11" height="4" rx="2" fill="currentColor" stroke="none"/>',
    alert: '<path d="M12 3l9 17H3z"/><path d="M12 9v5M12 17h.01"/>',
    team: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.5 3.5-7 8-7s8 2.5 8 7"/>',
    'social-icons': '<circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M8.1 10.7l7.7-4.5M8.1 13.3l7.7 4.5"/>',
    accordion: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M16.5 6.5l1.2 1.2-1.2 1.2M16.5 16.5l1.2 1.2-1.2 1.2"/>',
    tabs: '<path d="M3 8h6l2-3h10v13H3z"/>',
    pricing: '<path d="M20 12l-8 8-9-9V4h7z"/><circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" stroke="none"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16"/>'
  };
  const WIDGET_LABELS = { 'icon-box': 'Icon Box', 'social-icons': 'Social Icons' };
  const widgetLabel = type => WIDGET_LABELS[type] || type;
  const moveIconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>';
  function iconEl(name, size = 18) {
    const span = el('span', 'nvb-icon'); span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ''}</svg>`;
    return span;
  }
  function iconButton(name, label, action, opts = {}) {
    const b = el('button', `nvb-icon-btn ${opts.className || ''}`.trim());
    b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
    if (opts.pressed != null) b.setAttribute('aria-pressed', String(opts.pressed));
    b.append(iconEl(name)); b.addEventListener('click', action);
    return b;
  }

  const dialog = el('dialog', 'nvb-dialog'); dialog.setAttribute('aria-label', 'Noderyx Visual Builder');
  const message = el('span', 'nvb-message', 'Changes are saved with your post or page.'); message.setAttribute('role', 'status');
  const topbar = el('div', 'nvb-topbar');
  topbar.append(el('strong', 'nvb-brand', 'N Visual Builder'), message, iconButton('close', 'Close builder', () => dialog.close(), { className: 'nvb-topbar-close' }));

  const layout = el('div', 'nvb-layout');
  const panel = el('aside', 'nvb-panel');
  const panelHeader = el('div', 'nvb-panel-header');
  const panelBody = el('div', 'nvb-panel-body');
  const panelFooter = el('div', 'nvb-panel-footer');
  panel.append(panelHeader, panelBody, panelFooter);

  const center = el('div', 'nvb-center');
  const canvasWrap = el('div', 'nvb-canvas-wrap');
  const iframe = el('iframe', 'nvb-frame'); iframe.title = 'Visual content canvas'; iframe.setAttribute('sandbox', 'allow-same-origin');
  canvasWrap.append(iframe);

  const navPanel = el('div', 'nvb-navigator'); navPanel.hidden = true;
  const navHead = el('div', 'nvb-navigator-head');
  const layers = el('div', 'nvb-layers');
  const navToggle = iconButton('layers', 'Navigator', () => {
    navigatorOpen = !navigatorOpen; navPanel.hidden = !navigatorOpen; navToggle.setAttribute('aria-pressed', String(navigatorOpen));
  }, { pressed: false });
  navHead.append(el('strong', '', 'Navigator'), iconButton('close', 'Close navigator', () => {
    navigatorOpen = false; navPanel.hidden = true; navToggle.setAttribute('aria-pressed', 'false');
  }));
  navPanel.append(navHead, layers);
  center.append(canvasWrap, navPanel);

  // Elements library (built once; the same node is re-attached whenever no widget is selected).
  const PRO_WIDGETS = new Set(['testimonial', 'icon-box', 'counter', 'progress', 'alert', 'team', 'social-icons', 'accordion', 'tabs', 'pricing', 'table']);
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search widgets'; search.setAttribute('aria-label', 'Search widgets');
  const widgets = el('div', 'nvb-widgets');
  const proWidgets = el('div', 'nvb-widgets');
  for (const type of widgetTypes) {
    const card = el('button', 'nvb-widget-card'); card.type = 'button'; card.draggable = true;
    card.append(iconEl(type, 22), el('span', 'nvb-widget-label', widgetLabel(type)));
    if (PRO_WIDGETS.has(type)) card.append(el('span', 'nvb-pro-badge', 'PRO'));
    card.addEventListener('click', () => add(type));
    card.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', type));
    (PRO_WIDGETS.has(type) ? proWidgets : widgets).append(card);
  }
  search.addEventListener('input', () => [...widgets.children, ...proWidgets.children].forEach(c => {
    c.hidden = !c.querySelector('.nvb-widget-label').textContent.toLowerCase().includes(search.value.toLowerCase());
  }));
  const templates = {
    'Landing page': [{ type:'hero', text:'Your next chapter starts here', alt:'Introduce your business and the value you bring.', style:{ background:'#e5efe8', padding:60, align:'center' } }, { type:'columns', text:'Designed around you\nExplain your first benefit.', alt:'Built to make a difference\nExplain your second benefit.' }, { type:'cta', text:'Ready to get started?', alt:'Contact us', url:'/contact', style:{ background:'#e5efe8', align:'center' } }],
    'Article layout': [{ type:'heading', text:'A story worth sharing' }, { type:'text', text:'Start your article here.' }, { type:'quote', text:'Highlight a memorable thought.', alt:'Author' }, { type:'text', text:'Continue your story.' }],
    'Services': [{ type:'heading', text:'What we can do for you' }, { type:'card', text:'Our services', alt:'Describe your expertise and how it helps your customers.' }, { type:'list', text:'First benefit\nSecond benefit\nThird benefit' }]
  };
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
  const libraryBody = el('div', 'nvb-library-body');
  const searchWrap = el('div', 'nvb-search'); searchWrap.append(iconEl('search', 15), search);
  const templateList = el('div', 'nvb-stack');
  for (const [name, content] of Object.entries(templates)) templateList.append(button(name, () => append(content), 'nvb-list-btn'));
  const savedList = el('div', 'nvb-stack');
  savedList.append(
    button('Save layout as template', () => {
      if (!blocks.length) return;
      try { localStorage.setItem('nodecms:builder-template', JSON.stringify(blocks)); message.textContent = 'Layout saved in this browser. Use "Insert saved layout" to reuse it.'; } catch { message.textContent = 'Browser storage is unavailable. Export the layout instead.'; }
    }, 'nvb-list-btn'),
    button('Insert saved layout', () => {
      try { const saved = sanitizeBlocks(localStorage.getItem('nodecms:builder-template')); if (!saved.length) { message.textContent = 'No layout has been saved in this browser.'; return; } append(saved); } catch { message.textContent = 'Could not load this template.'; }
    }, 'nvb-list-btn'),
    button('Export layout', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(blocks, null, 2)], {type:'application/json'}));
      const a = el('a'); a.href = url; a.download = 'noderyx-layout.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'nvb-list-btn'),
    button('Import layout', () => upload.click(), 'nvb-list-btn')
  );
  libraryBody.append(searchWrap, widgets, el('h3', 'nvb-section-title', 'Pro widgets'), proWidgets, el('h3', 'nvb-section-title', 'Templates'), templateList, el('h3', 'nvb-section-title', 'Saved layouts'), savedList, upload);

  const undoBtn = iconButton('undo', 'Undo', () => travel(-1));
  const redoBtn = iconButton('redo', 'Redo', () => travel(1));
  function setDevice(btn, width) { iframe.style.width = width; [deviceDesktop, deviceTablet, deviceMobile].forEach(b => b.setAttribute('aria-pressed', String(b === btn))); }
  const deviceDesktop = iconButton('desktop', 'Desktop', () => setDevice(deviceDesktop, '100%'), { pressed: true });
  const deviceTablet = iconButton('tablet', 'Tablet', () => setDevice(deviceTablet, '768px'), { pressed: false });
  const deviceMobile = iconButton('mobile', 'Mobile', () => setDevice(deviceMobile, '390px'), { pressed: false });
  const previewBtn = iconButton('eye', 'Preview', () => { preview = !preview; previewBtn.setAttribute('aria-pressed', String(preview)); paintCanvas(); }, { pressed: false });
  const saveBtn = button('Save content', () => {
    sync(); dialog.close();
    if (form.reportValidity()) form.requestSubmit();
    else message.textContent = 'Complete the required content fields before saving.';
  }, 'nvb-footer-save');
  panelFooter.append(navToggle, undoBtn, redoBtn, deviceDesktop, deviceTablet, deviceMobile, previewBtn, saveBtn);

  layout.append(panel, center); dialog.append(topbar, layout); document.body.append(dialog);

  function sync() { data.value = JSON.stringify(blocks); document.querySelector('#builder-summary').textContent = `${blocks.length} visual widget${blocks.length === 1 ? '' : 's'}. Save this ${form.elements.type.value} to apply changes.`; }
  function commit() {
    blocks = sanitizeBlocks(blocks); const value = JSON.stringify(blocks);
    if (value !== history[cursor]) { history = history.slice(0, cursor + 1); history.push(value); if (history.length > 80) history.shift(); cursor = history.length - 1; dirty = true; }
    sync(); undoBtn.disabled = cursor === 0; redoBtn.disabled = cursor === history.length - 1;
  }
  function travel(step) { if (!history[cursor + step]) return; cursor += step; blocks = JSON.parse(history[cursor]); selected = Math.min(selected, blocks.length - 1); dirty = true; sync(); render(); }
  function append(content, focus = false) {
    if (blocks.length + content.length > 100) { message.textContent = 'A layout can contain up to 100 widgets.'; return; }
    const start = blocks.length;
    blocks.push(...sanitizeBlocks(content).map(b => ({ ...b, id: crypto.randomUUID() })));
    if (focus) { selected = start; settingsTab = 'content'; } else { selected = Math.min(selected, blocks.length - 1); }
    commit(); render();
  }
  const WIDGET_TEXT_DEFAULTS = {
    testimonial: 'This product completely changed how our team works.',
    'icon-box': 'Fast onboarding',
    counter: '500+',
    progress: 'Client satisfaction | 92',
    alert: 'This is an important message for your visitors.',
    team: 'Alex Morgan',
    'social-icons': 'Twitter|https://twitter.com\nLinkedIn|https://linkedin.com',
    accordion: 'What is included?::Everything you need to get started, with no hidden fees.\nCan I cancel anytime?::Yes, cancel anytime with one click.',
    tabs: 'Overview::A short summary goes here.\nDetails::Add the finer details in this tab.',
    pricing: 'Pro plan',
    table: 'Plan|Price|Support\nBasic|$9|Email\nPro|$29|Priority'
  };
  const WIDGET_ALT_DEFAULTS = {
    cta: 'Learn more',
    testimonial: 'Jordan Rivera | Operations Lead',
    team: 'Founder & CEO',
    'icon-box': 'Get your team up and running in minutes, not weeks.',
    alert: 'Heads up',
    counter: 'Happy customers',
    pricing: '$29/mo\nUnlimited projects\nPriority support\n24/7 chat'
  };
  const WIDGET_URL_DEFAULTS = { button: '/', cta: '/', pricing: '/contact' };
  function add(type) {
    const emptyText = ['image','divider','spacer'].includes(type);
    const text = WIDGET_TEXT_DEFAULTS[type] ?? (emptyText ? '' : `Your ${type === 'cta' ? 'call to action' : widgetLabel(type).toLowerCase()} here`);
    append([{ type, text, alt: WIDGET_ALT_DEFAULTS[type] ?? '', url: WIDGET_URL_DEFAULTS[type] ?? '' }], true);
  }
  function move(index, delta) { const target = index + delta; if (target < 0 || target >= blocks.length) return; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; selected = target; commit(); render(); }
  function selectWidget(index) { selected = index; settingsTab = 'content'; render(); }
  function duplicateSelected() { const b = blocks[selected]; if (!b) return; append([b], true); }
  function deleteSelected() { if (selected < 0) return; blocks.splice(selected, 1); selected = Math.min(selected, blocks.length - 1); commit(); render(); }

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
      case 'testimonial': return `<p class="nvb-quote">${text}</p><span class="nvb-person">${esc(b.name)}${b.role ? `<span>${esc(b.role)}</span>` : ''}</span>`;
      case 'icon-box': return `<div class="nvb-ib-mark"></div><h3>${text}</h3><p>${alt}</p>`;
      case 'counter': return `<strong>${text}</strong><span>${alt}</span>`;
      case 'progress': return `<div class="nvb-progress-label"><span>${esc(b.progressLabel)}</span><span>${b.progressPercent}%</span></div><div class="nvb-progress-track"><div class="nvb-progress-fill nvb-p${b.progressPercent}"></div></div>`;
      case 'alert': return `${b.alt ? `<strong>${alt}</strong>` : ''}<p>${text}</p>`;
      case 'team': return `${b.url ? `<img class="nvb-image" src="${url}" alt="${text}">` : ''}<h3>${text}</h3>${b.alt ? `<span class="nvb-person-role">${alt}</span>` : ''}`;
      case 'social-icons': return `<div class="nvb-social">${b.items.map(it => `<a href="${esc(it.url)}">${esc(it.label)}</a>`).join('')}</div>`;
      case 'accordion': return b.items.map((it,i) => `<input type="checkbox" id="acc-${b.index}-${i}" class="nvb-accordion-input"><label class="nvb-accordion-label" for="acc-${b.index}-${i}">${esc(it.q)}</label><div class="nvb-accordion-panel">${esc(it.a)}</div>`).join('');
      case 'tabs': return b.items.map((it,i) => `<input type="radio" name="tabs-${b.index}" id="tabs-${b.index}-${i}" class="nvb-tab-input"${i === 0 ? ' checked' : ''}><label class="nvb-tab-label" for="tabs-${b.index}-${i}">${esc(it.q)}</label><div class="nvb-tab-panel">${esc(it.a)}</div>`).join('');
      case 'pricing': return `<div class="nvb-pricing"><h3>${text}</h3><span class="nvb-price">${esc(b.price)}</span><ul>${b.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>${b.url ? `<a class="nvb-button" href="${url}">Choose plan</a>` : ''}</div>`;
      case 'table': return `<div class="nvb-table nvb-cols-${b.columnCount}">${b.rows.map(row => row.cells.map(c => `<span class="nvb-cell${row.header ? ' nvb-cell-head' : ''}">${esc(c)}</span>`).join('')).join('')}</div>`;
      default: return '';
    }
  }
  function paintCanvas() {
    const doc = iframe.contentDocument;
    if (!doc?.querySelector('link[href="/public/builder-canvas.css"]')) return;
    canvasScroll = iframe.contentWindow.scrollY || 0;
    doc.body.className = preview ? 'is-preview' : 'is-editing';
    const decorated = decorateBlocks(blocks);
    doc.body.innerHTML = decorated.length ? decorated.map((b,i) => `<section class="nvb-content ${i === selected ? 'chosen' : ''}" data-index="${i}" data-widget="${b.type}" data-visibility="${b.visibility}" tabindex="0">${preview ? '' : `<button class="nvb-move" type="button" aria-label="Drag ${widgetLabel(b.type)} to reorder">${moveIconSvg}<span>${widgetLabel(b.type)}</span></button>`}${contentMarkup(b)}</section>`).join('') : '<div class="empty">Your canvas is ready.<br>Drag a widget here or insert a template to begin.</div>';
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
      if (source !== index) { const [block] = blocks.splice(source, 1); blocks.splice(index, 0, block); commit(); selectWidget(index); }
    });
    doc.addEventListener('pointercancel', () => { pointerDrag = null; });
    doc.addEventListener('click', e => {
      // Accordion/tab headers toggle a native checkbox/radio (no JS). A full re-render on the
      // same click would rebuild the DOM and immediately discard that toggle, so let it through
      // untouched instead of selecting the widget. A label click also fires a second, synthetic
      // click on its associated input to perform the actual toggle — exempt that target too.
      if (e.target.closest('.nvb-accordion-label, .nvb-tab-label, .nvb-accordion-input, .nvb-tab-input')) return;
      e.preventDefault();
      if (e.target.closest('.nvb-move')) return;
      const node = e.target.closest('[data-index]');
      if (!preview && node) selectWidget(Number(node.dataset.index));
    });
    doc.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.index) selectWidget(Number(e.target.dataset.index)); });
    doc.addEventListener('dragstart', e => { const node = e.target.closest('[data-index]'); if (node) { dragIndex = Number(node.dataset.index); e.dataTransfer.setData('text/plain', 'move'); } });
    doc.addEventListener('dragenter', () => { if (!preview) doc.body.classList.add('is-dragover'); });
    doc.addEventListener('dragleave', e => { if (e.target === doc.body) doc.body.classList.remove('is-dragover'); });
    doc.addEventListener('dragover', e => e.preventDefault());
    doc.addEventListener('drop', e => {
      e.preventDefault(); doc.body.classList.remove('is-dragover'); if (preview) return;
      const type = e.dataTransfer.getData('text/plain');
      const target = e.target.closest('[data-index]'); const index = target ? Number(target.dataset.index) : blocks.length - 1;
      if (type === 'move' && dragIndex != null) { const [block] = blocks.splice(dragIndex,1); blocks.splice(index,0,block); dragIndex = null; commit(); selectWidget(index); }
      else if (widgetTypes.includes(type)) add(type);
    });
  });
  iframe.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/public/builder-content.css"><link rel="stylesheet" href="/public/builder-canvas.css"></head><body></body></html>';

  function field(labelText, key, options = {}, container) {
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
      blocks[selected] = sanitizeBlocks([b])[0]; commit(); refreshAfterEdit();
    });
    label.append(input); container.append(label);
  }
  const TEXT_LABELS = {
    list: 'List items (one per line)',
    accordion: 'Items — "Question::Answer", one per line',
    tabs: 'Tabs — "Title::Content", one per line',
    'social-icons': 'Icons — "Label|URL", one per line',
    progress: 'Label | Percent (0–100)',
    table: 'Rows — cells separated by |, one row per line',
    pricing: 'Plan name',
    testimonial: 'Quote',
    team: 'Name',
    counter: 'Number (e.g. 500+)',
    'icon-box': 'Heading',
    alert: 'Message'
  };
  const ALT_TYPES = ['hero','image','columns','quote','card','cta','testimonial','team','pricing','icon-box','alert','counter'];
  const ALT_LABELS = {
    image: 'Alternative text',
    cta: 'Button label',
    testimonial: 'Name | Role (e.g. "Amara Lee | CEO")',
    team: 'Role (optional)',
    pricing: 'Price, then one feature per line',
    'icon-box': 'Description',
    alert: 'Title (optional)',
    counter: 'Label (e.g. "Happy customers")'
  };
  const URL_TYPES = ['hero','image','button','card','cta','team','pricing','icon-box'];
  const URL_LABELS = { button: 'Link URL', cta: 'Link URL', team: 'Photo URL', pricing: 'Button link URL', 'icon-box': 'Link URL (optional)' };
  const MEDIA_TYPES = ['hero','image','card','team'];
  function buildSettingsBody() {
    const b = blocks[selected];
    const body = el('div', 'nvb-settings-body');
    const tabs = el('div', 'nvb-tabs');
    for (const tab of ['content','style','advanced']) {
      const t = button(tab[0].toUpperCase() + tab.slice(1), () => { settingsTab = tab; render(); }, 'nvb-tab');
      t.setAttribute('aria-pressed', String(tab === settingsTab));
      tabs.append(t);
    }
    const tabBody = el('div', 'nvb-tab-body');
    body.append(tabs, tabBody);
    if (settingsTab === 'content') {
      if (!['divider','spacer','image'].includes(b.type)) field(TEXT_LABELS[b.type] || 'Text / heading', 'text', {multiline:true}, tabBody);
      if (ALT_TYPES.includes(b.type)) field(ALT_LABELS[b.type] || 'Supporting text / second column', 'alt', {multiline:true}, tabBody);
      if (URL_TYPES.includes(b.type)) field(URL_LABELS[b.type] || 'Image URL', 'url', {}, tabBody);
      if (MEDIA_TYPES.includes(b.type) && media.length) {
        const label = el('label','','Media library'), select = el('select'); select.setAttribute('aria-label', 'Media library'); select.append(el('option','','Choose an image…'));
        media.forEach((m,i)=>{ const option = el('option','',m.title || `Image ${i+1}`); option.value=String(i); select.append(option); });
        select.addEventListener('change',()=>{ const m = media[Number(select.value)]; if (!m) return; b.url=m.url; if (b.type==='image') b.alt=m.alt || ''; commit(); render(); }); label.append(select); tabBody.append(label);
      }
    } else if (settingsTab === 'style') {
      field('Text color (hex)', 'color', {style:true}, tabBody); field('Background (hex)', 'background', {style:true}, tabBody);
      field('Alignment','align',{style:true,choices:['left','center','right']}, tabBody);
      field('Base font size (0 = inherit)','fontSize',{style:true,type:'number',max:120}, tabBody);
      for (const [key,label] of [['padding','Padding (px)'],['margin','Bottom spacing (px)'],['radius','Corner radius (px)']]) field(label,key,{style:true,type:'number',max:key==='radius'?100:160}, tabBody);
    } else {
      field('Hide on mobile','hideMobile',{style:true,type:'checkbox'}, tabBody); field('Hide on desktop / tablet','hideDesktop',{style:true,type:'checkbox'}, tabBody);
      tabBody.append(el('p','nvb-hint','Use Preview to check visibility. Hidden widgets remain editable on the canvas.'));
      const actions = el('div', 'nvb-widget-actions');
      actions.append(button('Duplicate', duplicateSelected, 'nvb-secondary'), button('Delete widget', deleteSelected, 'nvb-danger'));
      tabBody.append(actions);
    }
    return body;
  }
  function refreshAfterEdit() { paintCanvas(); paintLayers(); panelBody.replaceChildren(buildSettingsBody()); }
  function paintLayers() {
    layers.replaceChildren();
    blocks.forEach((b,i) => {
      const row = el('div','nvb-layer');
      const pick = button(`${i+1}. ${widgetLabel(b.type)}`, () => selectWidget(i), 'nvb-layer-name');
      pick.setAttribute('aria-pressed',String(i === selected));
      row.append(pick, button('↑',()=>move(i,-1),'nvb-layer-move'), button('↓',()=>move(i,1),'nvb-layer-move'));
      layers.append(row);
    });
    if (!blocks.length) layers.append(el('p','nvb-hint','No widgets yet.'));
  }
  function paintPanel() {
    const b = blocks[selected];
    panelHeader.replaceChildren();
    if (b) {
      panelHeader.append(
        iconButton('back', 'Back to elements', () => { selected = -1; render(); }),
        el('strong', 'nvb-panel-title', widgetLabel(b.type)),
        iconButton('trash', 'Delete widget', deleteSelected, { className: 'nvb-icon-btn-danger' })
      );
      panelBody.replaceChildren(buildSettingsBody());
    } else {
      panelHeader.append(el('strong', 'nvb-panel-title', 'Elements'));
      panelBody.replaceChildren(libraryBody);
    }
  }
  function render() {
    undoBtn.disabled = cursor === 0; redoBtn.disabled = cursor === history.length - 1;
    paintPanel(); paintLayers(); panelBody.scrollTop = 0; paintCanvas();
  }
  openButton.addEventListener('click',()=>{ if (!blocks.length && fallback.value.trim()) { append([{type:'text',text:fallback.value}]); } dialog.showModal(); render(); });
  dialog.addEventListener('close',()=>{sync();openButton.focus();});
  dialog.addEventListener('keydown',e=>{if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();travel(e.shiftKey?1:-1);}});
  form.addEventListener('input',()=>{dirty=true;});
  form.addEventListener('submit',()=>{sync();dirty=false;});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  sync();
  if (new URLSearchParams(location.search).get('builder') === '1') openButton.click();
}
