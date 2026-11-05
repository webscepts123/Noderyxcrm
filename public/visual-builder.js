import { sanitizeBlocks, widgetTypes, blockStyle, decorateBlocks, animations, hoverEffects, shadows } from './builder-model.js';

const openButton = document.querySelector('#open-visual-builder');
if (openButton) {
  const form = openButton.closest('form');
  const data = document.querySelector('#visual-builder-data');
  const fallback = document.querySelector('#visual-builder-content');
  let blocks = sanitizeBlocks(data.value), selected = -1, settingsTab = 'content', navigatorOpen = false;
  let history = [JSON.stringify(blocks)], cursor = 0;
  let dirty = false, preview = false, canvasScroll = 0;
  // Drag state: a widget card dragged from the library, a navigator row, or a canvas handle.
  let libDragType = null, navDrag = null, canvasDrag = null, removing = false;
  // One-shot canvas effects consumed by the next paint.
  let justAdded = new Set(), settledId = null, previewObserver = null;
  let widgetClipboard = null, styleClipboard = null;
  let media = []; try { media = JSON.parse(document.querySelector('#visual-builder-media').value); } catch { /* Empty library. */ }
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const button = (label, action, className = '') => { const b = el('button', className, label); b.type = 'button'; b.addEventListener('click', action); return b; };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const titleCase = value => value === 'none' ? 'None' : value[0].toUpperCase() + value.slice(1).replace(/-/g, ' ');

  const ICON = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
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
    table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
    gallery: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    'icon-list': '<path d="M3.5 6.5l1.5 1.5 3-3M3.5 12.5l1.5 1.5 3-3M3.5 18.5l1.5 1.5 3-3M11 7h10M11 13h10M11 19h10"/>',
    rating: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    countdown: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'
  };
  const WIDGET_LABELS = { 'icon-box': 'Icon Box', 'social-icons': 'Social Icons', 'icon-list': 'Icon List', rating: 'Star Rating', cta: 'Call to action' };
  const widgetLabel = type => WIDGET_LABELS[type] || type;
  const svg = (name, size = 14, width = 1.8) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ''}</svg>`;
  const moveIconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>';
  function iconEl(name, size = 18) {
    const span = el('span', 'nvb-icon'); span.setAttribute('aria-hidden', 'true');
    span.innerHTML = svg(name, size, 1.6);
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

  // Custom drag image for library cards: a compact chip instead of a screenshot of the card.
  const dragChip = el('div', 'nvb-drag-chip'); dragChip.setAttribute('aria-hidden', 'true');

  // Elements library (built once; the same node is re-attached whenever no widget is selected).
  const PRO_WIDGETS = new Set(['testimonial', 'icon-box', 'counter', 'progress', 'alert', 'team', 'social-icons', 'accordion', 'tabs', 'pricing', 'table', 'video', 'gallery', 'icon-list', 'rating', 'countdown']);
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search widgets'; search.setAttribute('aria-label', 'Search widgets');
  const widgets = el('div', 'nvb-widgets');
  const proWidgets = el('div', 'nvb-widgets');
  for (const type of widgetTypes) {
    const card = el('button', 'nvb-widget-card'); card.type = 'button'; card.draggable = true;
    card.title = `Click or drag to add ${widgetLabel(type)}`;
    card.append(iconEl(type, 22), el('span', 'nvb-widget-label', widgetLabel(type)));
    if (PRO_WIDGETS.has(type)) card.append(el('span', 'nvb-pro-badge', 'PRO'));
    card.addEventListener('click', () => add(type));
    card.addEventListener('dragstart', e => {
      libDragType = type;
      e.dataTransfer.setData('text/plain', type); e.dataTransfer.effectAllowed = 'copy';
      dragChip.replaceChildren(iconEl(type, 16), el('span', '', widgetLabel(type)));
      e.dataTransfer.setDragImage(dragChip, 18, 18);
      requestAnimationFrame(() => card.classList.add('is-dragging'));
    });
    card.addEventListener('dragend', () => { libDragType = null; card.classList.remove('is-dragging'); hideDropLine(); stopAutoScroll(); });
    (PRO_WIDGETS.has(type) ? proWidgets : widgets).append(card);
  }
  search.addEventListener('input', () => [...widgets.children, ...proWidgets.children].forEach(c => {
    c.hidden = !c.querySelector('.nvb-widget-label').textContent.toLowerCase().includes(search.value.toLowerCase());
  }));
  const templates = {
    'Landing page': [{ type:'hero', text:'Your next chapter starts here', alt:'Introduce your business and the value you bring.', style:{ background:'#e5efe8', padding:60, align:'center', animation:'fade-up' } }, { type:'columns', text:'Designed around you\nExplain your first benefit.', alt:'Built to make a difference\nExplain your second benefit.', style:{ animation:'fade-up', animDelay:150 } }, { type:'cta', text:'Ready to get started?', alt:'Contact us', url:'/contact', style:{ background:'#e5efe8', align:'center', animation:'zoom' } }],
    'Article layout': [{ type:'heading', text:'A story worth sharing' }, { type:'text', text:'Start your article here.' }, { type:'quote', text:'Highlight a memorable thought.', alt:'Author' }, { type:'text', text:'Continue your story.' }],
    'Services': [{ type:'heading', text:'What we can do for you' }, { type:'card', text:'Our services', alt:'Describe your expertise and how it helps your customers.', style:{ hover:'lift', shadow:'soft' } }, { type:'icon-list', text:'First benefit\nSecond benefit\nThird benefit' }],
    'Product launch': [{ type:'hero', text:'Something new is coming', alt:'Be the first to know when we launch.', style:{ background:'#12271d', color:'#ffffff', padding:70, align:'center', animation:'fade' } }, { type:'countdown', text:countdownDefault(), alt:'Launching in', style:{ align:'center', animation:'fade-up', animDelay:200 } }, { type:'rating', text:'4.8', alt:'Loved by our early testers', style:{ align:'center' } }, { type:'button', text:'Notify me', url:'/contact', style:{ align:'center', hover:'grow' } }]
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
  const shortcuts = el('dl', 'nvb-shortcuts');
  for (const [keys, label] of [['Drag', 'Drop widgets anywhere on the canvas'], ['Del', 'Delete the selected widget'], ['Ctrl D', 'Duplicate'], ['Ctrl C / V', 'Copy and paste a widget'], ['Alt ↑ / ↓', 'Move up or down'], ['Ctrl Z / Y', 'Undo / redo'], ['Esc', 'Deselect or cancel a drag']]) shortcuts.append(el('dt', '', keys), el('dd', '', label));
  libraryBody.append(searchWrap, widgets, el('h3', 'nvb-section-title', 'Pro widgets'), proWidgets, el('h3', 'nvb-section-title', 'Templates'), templateList, el('h3', 'nvb-section-title', 'Saved layouts'), savedList, el('h3', 'nvb-section-title', 'Shortcuts'), shortcuts, upload);

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

  layout.append(panel, center); dialog.append(topbar, layout, dragChip); document.body.append(dialog);

  function sync() { data.value = JSON.stringify(blocks); document.querySelector('#builder-summary').textContent = `${blocks.length} visual widget${blocks.length === 1 ? '' : 's'}. Save this ${form.elements.type.value} to apply changes.`; }
  function commit() {
    blocks = sanitizeBlocks(blocks); const value = JSON.stringify(blocks);
    if (value !== history[cursor]) { history = history.slice(0, cursor + 1); history.push(value); if (history.length > 80) history.shift(); cursor = history.length - 1; dirty = true; }
    sync(); undoBtn.disabled = cursor === 0; redoBtn.disabled = cursor === history.length - 1;
  }
  function travel(step) { if (!history[cursor + step]) return; animateChange(() => { cursor += step; blocks = JSON.parse(history[cursor]); selected = Math.min(selected, blocks.length - 1); dirty = true; sync(); render(); }); }

  // ---- Animated layout changes (FLIP) -------------------------------------------------------
  // Record where every widget sits, apply the change, then slide each widget from its old
  // position to its new one. Used for canvas sections and navigator rows alike.
  const canvasDoc = () => iframe.contentDocument;
  function captureRects(root) { const map = new Map(); root?.querySelectorAll('[data-id]').forEach(n => map.set(n.dataset.id, n.getBoundingClientRect())); return map; }
  function flip(root, before) {
    if (!root || reduceMotion()) return;
    root.querySelectorAll('[data-id]').forEach(node => {
      const prev = before.get(node.dataset.id); if (!prev) return;
      const now = node.getBoundingClientRect(), dx = prev.left - now.left, dy = prev.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  function animateChange(mutate) {
    const canvasBefore = captureRects(canvasDoc()), navBefore = captureRects(layers);
    mutate();
    flip(canvasDoc(), canvasBefore); flip(layers, navBefore);
  }

  function append(content, focus = false, index = blocks.length) {
    if (blocks.length + content.length > 100) { message.textContent = 'A layout can contain up to 100 widgets.'; return; }
    const items = sanitizeBlocks(content).map(b => ({ ...b, id: crypto.randomUUID() }));
    if (!items.length) return;
    index = Math.max(0, Math.min(index, blocks.length));
    animateChange(() => {
      blocks.splice(index, 0, ...items);
      if (focus) { selected = index; settingsTab = 'content'; } else if (selected >= index) selected += items.length;
      justAdded = new Set(items.map(b => b.id));
      commit(); render();
    });
  }
  function countdownDefault() {
    const d = new Date(Date.now() + 30 * 864e5), pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00`;
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
    table: 'Plan|Price|Support\nBasic|$9|Email\nPro|$29|Priority',
    'icon-list': 'Set up in minutes\nFriendly, human support\nNo hidden fees',
    rating: '4.5',
    gallery: '',
    video: ''
  };
  const WIDGET_ALT_DEFAULTS = {
    cta: 'Learn more',
    testimonial: 'Jordan Rivera | Operations Lead',
    team: 'Founder & CEO',
    'icon-box': 'Get your team up and running in minutes, not weeks.',
    alert: 'Heads up',
    counter: 'Happy customers',
    pricing: '$29/mo\nUnlimited projects\nPriority support\n24/7 chat',
    rating: 'Rated by 1,200+ customers',
    countdown: 'Launching in'
  };
  const WIDGET_URL_DEFAULTS = { button: '/', cta: '/', pricing: '/contact' };
  function add(type, index = blocks.length) {
    const emptyText = ['image','divider','spacer'].includes(type);
    const text = type === 'countdown' ? countdownDefault() : WIDGET_TEXT_DEFAULTS[type] ?? (emptyText ? '' : `Your ${widgetLabel(type).toLowerCase()} here`);
    append([{ type, text, alt: WIDGET_ALT_DEFAULTS[type] ?? '', url: WIDGET_URL_DEFAULTS[type] ?? '' }], true, index);
  }
  // Moves the widget at `from` so it lands before the widget currently at `insert`
  // (insert === blocks.length means "at the end").
  function moveBlock(from, insert) {
    const to = insert > from ? insert - 1 : insert;
    if (from < 0 || from >= blocks.length || to < 0 || to >= blocks.length || to === from) return;
    animateChange(() => { const [block] = blocks.splice(from, 1); blocks.splice(to, 0, block); selected = to; settledId = block.id; commit(); render(); });
  }
  function selectWidget(index) { selected = index; settingsTab = 'content'; render(); }
  function duplicateAt(index) { const b = blocks[index]; if (b) append([b], true, index + 1); }
  function deleteAt(index) {
    if (index < 0 || index >= blocks.length || removing) return;
    const finish = () => {
      removing = false;
      animateChange(() => { blocks.splice(index, 1); selected = selected === index ? -1 : selected > index ? selected - 1 : selected; commit(); render(); });
    };
    const node = canvasDoc()?.querySelector(`section[data-index="${index}"]`);
    if (!node || reduceMotion()) return finish();
    removing = true; node.classList.add('nvb-removing'); setTimeout(finish, 200);
  }
  const deleteSelected = () => deleteAt(selected);
  function copyWidget() {
    if (!blocks[selected]) return;
    widgetClipboard = JSON.stringify([blocks[selected]]);
    try { localStorage.setItem('nodecms:builder-clipboard', widgetClipboard); } catch { /* In-memory clipboard still works. */ }
    message.textContent = `${widgetLabel(blocks[selected].type)} copied. Press Ctrl+V to paste it.`;
  }
  function pasteWidget() {
    let source = widgetClipboard;
    try { source = localStorage.getItem('nodecms:builder-clipboard') || source; } catch { /* Use the in-memory copy. */ }
    const items = sanitizeBlocks(source); if (!items.length) { message.textContent = 'Copy a widget first.'; return; }
    append(items, true, selected >= 0 ? selected + 1 : blocks.length);
  }

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
      case 'list': return `<ul>${b.lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`;
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
      case 'video': return `${b.url ? `<video class="nvb-video" src="${url}" controls preload="metadata" playsinline></video>` : '<p class="nvb-image-placeholder">Add a video URL in the widget settings.</p>'}${b.text ? `<p class="nvb-caption">${text}</p>` : ''}`;
      case 'gallery': return b.images.length ? `<div class="nvb-gallery">${b.images.map(img => `<img src="${esc(img.url)}" alt="${esc(img.alt)}" loading="lazy">`).join('')}</div>` : '<p class="nvb-image-placeholder">Add images from the media library in the widget settings.</p>';
      case 'icon-list': return `<ul class="nvb-icon-list">${b.lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`;
      case 'rating': return `<div class="nvb-rating" role="img" aria-label="Rated ${b.ratingValue} out of 5">${b.stars.map(s => `<span class="nvb-star is-${s}">★</span>`).join('')}<span class="nvb-rating-value">${b.ratingValue}/5</span></div>${b.alt ? `<p class="nvb-rating-caption">${alt}</p>` : ''}`;
      case 'countdown': return `${b.alt ? `<p class="nvb-cd-title">${alt}</p>` : ''}${b.target ? `<div class="nvb-countdown">${b.units.map(u => `<div class="nvb-cd-unit"><strong>${u.value}</strong><span>${u.label}</span></div>`).join('')}</div>` : '<p class="nvb-image-placeholder">Choose a target date in the widget settings.</p>'}`;
      default: return '';
    }
  }
  const tool = (action, icon, label) => `<button class="nvb-tool" type="button" data-action="${action}" title="${label}" aria-label="${label}">${svg(icon, 13)}</button>`;
  function paintCanvas() {
    const doc = canvasDoc();
    if (!doc?.querySelector('link[href="/public/builder-canvas.css"]')) return;
    canvasScroll = iframe.contentWindow.scrollY || 0;
    doc.body.className = preview ? 'is-preview' : 'is-editing';
    const decorated = decorateBlocks(blocks);
    doc.body.innerHTML = decorated.length ? decorated.map((b, i) => {
      const name = widgetLabel(b.type);
      const fx = `${justAdded.has(b.id) ? ' nvb-dropped' : ''}${b.id === settledId ? ' nvb-settle' : ''}`;
      const toolbar = preview ? '' : `<div class="nvb-toolbar"><button class="nvb-move" type="button" aria-label="Drag ${name} to reorder">${moveIconSvg}<span>${name}</span></button>${tool('duplicate', 'copy', `Duplicate ${name}`)}${tool('delete', 'trash', `Delete ${name}`)}</div>`;
      return `<section class="nvb-content ${b.classes} ${i === selected ? 'chosen' : ''}${fx}" data-index="${i}" data-id="${esc(b.id)}" data-widget="${b.type}" data-visibility="${b.visibility}" tabindex="0">${toolbar}${contentMarkup(b)}</section>`;
    }).join('') : '<div class="empty"><strong>Your canvas is ready.</strong><br>Drag a widget here or insert a template to begin.</div>';
    doc.querySelectorAll('[data-index]').forEach(node => { node.style.cssText = blockStyle(blocks[Number(node.dataset.index)]); });
    iframe.contentWindow.scrollTo(0, canvasScroll);
    const added = doc.querySelector('.nvb-dropped');
    if (added) added.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    justAdded = new Set(); settledId = null;
    // In preview, play entrance animations as each widget scrolls into view, as on the site.
    previewObserver?.disconnect(); previewObserver = null;
    if (preview && 'IntersectionObserver' in window && !reduceMotion()) {
      doc.body.classList.add('nvb-js');
      previewObserver = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('nvb-in'); previewObserver?.unobserve(entry.target); }
      }), { threshold: 0.1 });
      doc.querySelectorAll('.nvb-anim').forEach(node => previewObserver.observe(node));
    }
  }
  function replayAnimation(index) {
    const node = canvasDoc()?.querySelector(`section[data-index="${index}"]`);
    if (!node?.classList.contains('nvb-anim')) return;
    node.classList.remove('nvb-in'); void node.offsetWidth; node.classList.add('nvb-in');
  }

  // ---- Drop indicator & auto-scroll ----------------------------------------------------------
  const sectionsInCanvas = () => [...canvasDoc().querySelectorAll('section[data-index]')];
  function insertionIndex(clientY) {
    const list = sectionsInCanvas();
    for (let i = 0; i < list.length; i++) { const r = list[i].getBoundingClientRect(); if (clientY < r.top + r.height / 2) return i; }
    return list.length;
  }
  function showDropLine(index, label, sourceIndex = null) {
    const doc = canvasDoc(), list = sectionsInCanvas();
    doc.body.classList.add('is-dragover');
    let line = doc.querySelector('.nvb-drop-line');
    if (!list.length) { line?.classList.remove('is-visible'); return; }
    if (!line) { line = doc.createElement('div'); line.className = 'nvb-drop-line'; line.append(doc.createElement('span')); doc.body.append(line); }
    const prev = list[index - 1]?.getBoundingClientRect(), next = list[index]?.getBoundingClientRect();
    const y = prev && next ? (prev.bottom + next.top) / 2 : prev ? prev.bottom + 8 : next.top - 8;
    line.style.top = `${Math.round(y + (doc.scrollingElement?.scrollTop || 0) - 2)}px`;
    line.firstChild.textContent = label;
    line.classList.toggle('is-noop', sourceIndex != null && (index === sourceIndex || index === sourceIndex + 1));
    line.classList.add('is-visible');
  }
  function hideDropLine() {
    const doc = canvasDoc(); if (!doc?.body) return;
    doc.querySelector('.nvb-drop-line')?.classList.remove('is-visible');
    doc.body.classList.remove('is-dragover');
  }
  let scrollRaf = 0, scrollSpeed = 0;
  function autoScroll(clientY) {
    const height = iframe.contentWindow.innerHeight, edge = 70;
    scrollSpeed = clientY < edge ? -Math.ceil((edge - clientY) / 4) : clientY > height - edge ? Math.ceil((clientY - height + edge) / 4) : 0;
    if (scrollSpeed && !scrollRaf) scrollRaf = requestAnimationFrame(stepScroll);
  }
  function stepScroll() {
    scrollRaf = 0; if (!scrollSpeed) return;
    iframe.contentWindow.scrollBy(0, scrollSpeed);
    if (canvasDrag?.active) updateCanvasDrag(canvasDrag.lastX, canvasDrag.lastY, false);
    scrollRaf = requestAnimationFrame(stepScroll);
  }
  function stopAutoScroll() { scrollSpeed = 0; cancelAnimationFrame(scrollRaf); scrollRaf = 0; }

  // ---- Canvas reordering with the widget handle (pointer events, works with touch) ------------
  function startCanvasDrag() {
    const doc = canvasDoc(), drag = canvasDrag, type = blocks[drag.index].type;
    drag.active = true;
    drag.section.classList.add('nvb-drag-source'); doc.body.classList.add('is-dragging');
    const ghost = doc.createElement('div'); ghost.className = 'nvb-ghost';
    ghost.innerHTML = `${svg(type, 16)}<span>${esc(widgetLabel(type))}</span>`;
    doc.body.append(ghost); drag.ghost = ghost;
  }
  function updateCanvasDrag(x, y, scroll = true) {
    const drag = canvasDrag; drag.lastX = x; drag.lastY = y;
    drag.ghost.style.left = `${x}px`; drag.ghost.style.top = `${y}px`;
    drag.insert = insertionIndex(y);
    showDropLine(drag.insert, `Move ${widgetLabel(blocks[drag.index].type)}`, drag.index);
    if (scroll) autoScroll(y);
  }
  function endCanvasDrag() {
    const drag = canvasDrag; canvasDrag = null; stopAutoScroll(); hideDropLine();
    if (!drag) return null;
    drag.section.classList.remove('nvb-drag-source'); canvasDoc().body.classList.remove('is-dragging');
    if (drag.ghost) { drag.ghost.classList.add('is-leaving'); setTimeout(() => drag.ghost.remove(), 160); }
    return drag;
  }

  iframe.addEventListener('load', () => {
    const doc = canvasDoc(); if (!doc) return;
    paintCanvas();
    doc.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.nvb-move'); if (!handle || preview || e.button !== 0) return;
      const section = handle.closest('[data-index]');
      canvasDrag = { index: Number(section.dataset.index), section, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, active: false, insert: null };
      try { handle.setPointerCapture(e.pointerId); } catch { /* Pointer already released; document listeners still track it. */ }
      e.preventDefault();
    });
    doc.addEventListener('pointermove', e => {
      if (!canvasDrag || e.pointerId !== canvasDrag.pointerId) return;
      if (!canvasDrag.active) { if (Math.hypot(e.clientX - canvasDrag.startX, e.clientY - canvasDrag.startY) < 4) return; startCanvasDrag(); }
      updateCanvasDrag(e.clientX, e.clientY);
    });
    doc.addEventListener('pointerup', e => {
      if (!canvasDrag || e.pointerId !== canvasDrag.pointerId) return;
      const drag = endCanvasDrag();
      if (!drag.active) selectWidget(drag.index);
      else if (drag.insert != null) moveBlock(drag.index, drag.insert);
    });
    doc.addEventListener('pointercancel', () => endCanvasDrag());
    doc.addEventListener('click', e => {
      // Accordion/tab headers toggle a native checkbox/radio (no JS). A full re-render on the
      // same click would rebuild the DOM and immediately discard that toggle, so let it through
      // untouched instead of selecting the widget. A label click also fires a second, synthetic
      // click on its associated input to perform the actual toggle — exempt that target too.
      if (e.target.closest('.nvb-accordion-label, .nvb-tab-label, .nvb-accordion-input, .nvb-tab-input')) return;
      e.preventDefault();
      if (e.target.closest('.nvb-move')) return;
      const node = e.target.closest('[data-index]'); if (preview || !node) return;
      const index = Number(node.dataset.index), action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'duplicate') duplicateAt(index);
      else if (action === 'delete') deleteAt(index);
      else selectWidget(index);
    });
    doc.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset?.index) { selectWidget(Number(e.target.dataset.index)); return; }
      handleShortcut(e);
    });
    // Library cards and navigator rows are dragged with native drag and drop.
    doc.addEventListener('dragover', e => {
      if (preview) return;
      const label = libDragType ? `Add ${widgetLabel(libDragType)}` : navDrag != null ? `Move ${widgetLabel(blocks[navDrag]?.type)}` : null;
      if (!label) return;
      e.preventDefault(); e.dataTransfer.dropEffect = libDragType ? 'copy' : 'move';
      showDropLine(insertionIndex(e.clientY), label, navDrag); autoScroll(e.clientY);
    });
    doc.addEventListener('dragleave', e => { if (!e.relatedTarget) { hideDropLine(); stopAutoScroll(); } });
    doc.addEventListener('drop', e => {
      e.preventDefault(); const index = insertionIndex(e.clientY); hideDropLine(); stopAutoScroll();
      if (preview) return;
      if (libDragType) { const type = libDragType; libDragType = null; add(type, index); }
      else if (navDrag != null) { const from = navDrag; navDrag = null; moveBlock(from, index); }
    });
  });
  iframe.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/public/builder-content.css"><link rel="stylesheet" href="/public/builder-canvas.css"></head><body></body></html>';

  // ---- Settings controls ---------------------------------------------------------------------
  // Every control edits blocks[selected]; `live` repaints the canvas while dragging a slider or
  // colour picker, and `save` records one undo step once the value is settled.
  function editor(key, style, replay) {
    const b = blocks[selected], target = style ? b.style : b;
    const apply = value => { target[key] = value; blocks[selected] = sanitizeBlocks([b])[0]; };
    return {
      value: target[key],
      live: value => { apply(value); paintCanvas(); },
      save: value => { apply(value); commit(); refreshAfterEdit(); if (replay) replayAnimation(selected); }
    };
  }
  function field(labelText, key, options = {}, container) {
    const control = editor(key, options.style, options.replay), label = el('label', '', labelText);
    const input = el(options.choices ? 'select' : options.multiline ? 'textarea' : 'input');
    if (options.choices) for (const choice of options.choices) { const [value, text] = Array.isArray(choice) ? choice : [choice, choice]; const option = el('option', '', text); option.value = value; input.append(option); }
    else { if (options.multiline) input.rows = 4; else input.type = options.type || 'text'; }
    if (options.type === 'checkbox') input.checked = control.value; else input.value = control.value ?? '';
    if (options.placeholder) input.placeholder = options.placeholder;
    if (!options.style) input.maxLength = 20000;
    input.addEventListener('change', () => control.save(options.type === 'checkbox' ? input.checked : input.value));
    label.append(input); container.append(label);
    if (options.hint) container.append(el('p', 'nvb-hint', options.hint));
    return input;
  }
  function rangeField(labelText, key, { min = 0, max = 160, step = 1, unit = 'px', replay = false } = {}, container) {
    const control = editor(key, true, replay), wrap = el('div', 'nvb-field');
    const head = el('div', 'nvb-field-head'), name = el('span', '', labelText), unitEl = el('span', 'nvb-unit', unit);
    const range = el('input'); range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = control.value; range.setAttribute('aria-label', labelText);
    const num = el('input'); num.type = 'number'; num.min = min; num.max = max; num.step = step; num.value = control.value; num.setAttribute('aria-label', `${labelText} value`);
    const fill = () => range.style.setProperty('--fill', `${((range.value - min) / (max - min)) * 100}%`);
    range.addEventListener('input', () => { num.value = range.value; fill(); control.live(range.value); });
    range.addEventListener('change', () => control.save(range.value));
    num.addEventListener('change', () => control.save(num.value));
    const row = el('div', 'nvb-range'); row.append(range, num);
    head.append(name, unitEl); wrap.append(head, row); container.append(wrap); fill();
  }
  function colorField(labelText, key, container) {
    const control = editor(key, true), wrap = el('div', 'nvb-field'), row = el('div', 'nvb-color');
    const picker = el('input'); picker.type = 'color'; picker.value = control.value || '#000000'; picker.setAttribute('aria-label', `${labelText} picker`);
    const text = el('input'); text.type = 'text'; text.value = control.value; text.placeholder = 'Default'; text.maxLength = 7; text.setAttribute('aria-label', `${labelText} hex value`);
    if (!control.value) row.classList.add('is-empty');
    picker.addEventListener('input', () => { text.value = picker.value; row.classList.remove('is-empty'); control.live(picker.value); });
    picker.addEventListener('change', () => control.save(picker.value));
    text.addEventListener('change', () => control.save(text.value.trim()));
    row.append(picker, text, button('Clear', () => control.save(''), 'nvb-chip-btn'));
    wrap.append(el('span', 'nvb-field-head', labelText), row); container.append(wrap);
  }
  const group = (title, container) => { const section = el('div', 'nvb-group'); section.append(el('h3', 'nvb-section-title', title)); container.append(section); return section; };
  const TEXT_LABELS = {
    list: 'List items (one per line)',
    'icon-list': 'List items (one per line)',
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
    alert: 'Message',
    video: 'Caption (optional)',
    gallery: 'Images — "URL | alt text", one per line',
    rating: 'Rating (0–5, halves allowed)'
  };
  const ALT_TYPES = ['hero','image','columns','quote','card','cta','testimonial','team','pricing','icon-box','alert','counter','rating','countdown'];
  const ALT_LABELS = {
    image: 'Alternative text',
    cta: 'Button label',
    testimonial: 'Name | Role (e.g. "Amara Lee | CEO")',
    team: 'Role (optional)',
    pricing: 'Price, then one feature per line',
    'icon-box': 'Description',
    alert: 'Title (optional)',
    counter: 'Label (e.g. "Happy customers")',
    rating: 'Caption (optional)',
    countdown: 'Title (e.g. "Launching in")'
  };
  const URL_TYPES = ['hero','image','button','card','cta','team','pricing','icon-box','video'];
  const URL_LABELS = { button: 'Link URL', cta: 'Link URL', team: 'Photo URL', pricing: 'Button link URL', 'icon-box': 'Link URL (optional)', video: 'Video URL (.mp4 or .webm on this site)' };
  const MEDIA_TYPES = ['hero','image','card','team','gallery'];
  function buildSettingsBody() {
    const b = blocks[selected];
    const body = el('div', 'nvb-settings-body');
    const tabs = el('div', 'nvb-tabs'); tabs.setAttribute('role', 'tablist');
    for (const tab of ['content','style','advanced']) {
      const t = button(tab[0].toUpperCase() + tab.slice(1), () => { settingsTab = tab; render(); }, 'nvb-tab');
      t.setAttribute('aria-pressed', String(tab === settingsTab));
      tabs.append(t);
    }
    const tabBody = el('div', 'nvb-tab-body');
    body.append(tabs, tabBody);
    if (settingsTab === 'content') {
      if (b.type === 'countdown') field('Target date & time', 'text', { type: 'datetime-local', hint: 'Uses each visitor\'s local time zone. The timer stops at zero.' }, tabBody);
      else if (!['divider','spacer','image'].includes(b.type)) field(TEXT_LABELS[b.type] || 'Text / heading', 'text', {multiline:true}, tabBody);
      if (ALT_TYPES.includes(b.type)) field(ALT_LABELS[b.type] || 'Supporting text / second column', 'alt', {multiline:true}, tabBody);
      if (URL_TYPES.includes(b.type)) field(URL_LABELS[b.type] || 'Image URL', 'url', {}, tabBody);
      if (MEDIA_TYPES.includes(b.type) && media.length) {
        const label = el('label', '', b.type === 'gallery' ? 'Add from media library' : 'Media library'), select = el('select');
        select.append(el('option', '', 'Choose an image…'));
        media.forEach((m,i) => { const option = el('option', '', m.title || `Image ${i+1}`); option.value = String(i); select.append(option); });
        select.addEventListener('change', () => {
          const m = media[Number(select.value)]; if (!m) return;
          if (b.type === 'gallery') b.text = [b.text, m.alt ? `${m.url} | ${m.alt}` : m.url].filter(Boolean).join('\n');
          else { b.url = m.url; if (b.type === 'image') b.alt = m.alt || ''; }
          blocks[selected] = sanitizeBlocks([b])[0]; commit(); refreshAfterEdit();
        });
        label.append(select); tabBody.append(label);
      }
    } else if (settingsTab === 'style') {
      const type = group('Typography & colors', tabBody);
      colorField('Text color', 'color', type); colorField('Background', 'background', type);
      field('Alignment', 'align', { style: true, choices: [['left','Left'],['center','Center'],['right','Right']] }, type);
      rangeField('Base font size (0 = inherit)', 'fontSize', { max: 120 }, type);
      const spacing = group('Spacing & size', tabBody);
      rangeField('Padding', 'padding', {}, spacing); rangeField('Bottom spacing', 'margin', {}, spacing);
      rangeField('Max width (0 = full width)', 'maxWidth', { max: 1600, step: 10 }, spacing);
      const border = group('Border & shadow', tabBody);
      rangeField('Border width', 'borderWidth', { max: 20 }, border); colorField('Border color', 'borderColor', border);
      rangeField('Corner radius', 'radius', { max: 100 }, border);
      field('Box shadow', 'shadow', { style: true, choices: shadows.map(s => [s, titleCase(s)]) }, border);
    } else {
      const motion = group('Motion effects', tabBody);
      field('Entrance animation', 'animation', { style: true, replay: true, choices: animations.map(a => [a, titleCase(a)]) }, motion);
      if (b.style.animation !== 'none') {
        rangeField('Duration', 'animDuration', { min: 100, max: 3000, step: 50, unit: 'ms', replay: true }, motion);
        rangeField('Delay', 'animDelay', { max: 5000, step: 50, unit: 'ms', replay: true }, motion);
        const play = button('', () => replayAnimation(selected), 'nvb-secondary nvb-play'); play.append(iconEl('play', 13), el('span', '', 'Play animation'));
        motion.append(play, el('p', 'nvb-hint', 'On your site, the animation plays when the widget scrolls into view.'));
      }
      field('Hover effect', 'hover', { style: true, choices: hoverEffects.map(h => [h, titleCase(h)]) }, motion);
      const attributes = group('Attributes', tabBody);
      field('CSS ID', 'anchor', { style: true, placeholder: 'pricing', hint: 'Link to this widget with #ID. Start with a letter; use letters, numbers, - and _.' }, attributes);
      field('CSS classes', 'cssClass', { style: true, placeholder: 'highlight featured', hint: 'Space-separated, up to six. Names starting with nvb- are reserved.' }, attributes);
      const responsive = group('Responsive', tabBody);
      field('Hide on mobile','hideMobile',{style:true,type:'checkbox'}, responsive); field('Hide on desktop / tablet','hideDesktop',{style:true,type:'checkbox'}, responsive);
      responsive.append(el('p','nvb-hint','Use Preview to check visibility. Hidden widgets remain editable on the canvas.'));
      const tools = group('Tools', tabBody), styleActions = el('div', 'nvb-widget-actions');
      styleActions.append(
        button('Copy style', () => { styleClipboard = { ...blocks[selected].style }; message.textContent = 'Style copied. Select another widget and choose Paste style.'; }, 'nvb-secondary'),
        button('Paste style', () => { if (!styleClipboard) { message.textContent = 'Copy a widget style first.'; return; } blocks[selected].style = { ...styleClipboard }; commit(); refreshAfterEdit(); replayAnimation(selected); }, 'nvb-secondary')
      );
      const actions = el('div', 'nvb-widget-actions');
      actions.append(button('Duplicate', () => duplicateAt(selected), 'nvb-secondary'), button('Delete widget', deleteSelected, 'nvb-danger'));
      tools.append(styleActions, actions);
    }
    return body;
  }
  function refreshAfterEdit() { const top = panelBody.scrollTop; paintCanvas(); paintLayers(); panelBody.replaceChildren(buildSettingsBody()); panelBody.scrollTop = top; }

  // ---- Navigator (layers) with drag-to-reorder -----------------------------------------------
  function clearNavDrop() { layers.querySelectorAll('.drop-before, .drop-after, .is-dragging').forEach(n => n.classList.remove('drop-before', 'drop-after', 'is-dragging')); }
  function paintLayers() {
    layers.replaceChildren();
    blocks.forEach((b, i) => {
      const row = el('div', 'nvb-layer'); row.dataset.id = b.id; row.draggable = true;
      const grip = el('span', 'nvb-layer-grip'); grip.innerHTML = moveIconSvg; grip.setAttribute('aria-hidden', 'true');
      const pick = button(`${i+1}. ${widgetLabel(b.type)}`, () => selectWidget(i), 'nvb-layer-name');
      pick.setAttribute('aria-pressed', String(i === selected));
      row.append(grip, pick, button('↑', () => moveBlock(i, i - 1), 'nvb-layer-move'), button('↓', () => moveBlock(i, i + 2), 'nvb-layer-move'));
      row.addEventListener('dragstart', e => { navDrag = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'layer'); requestAnimationFrame(() => row.classList.add('is-dragging')); });
      row.addEventListener('dragend', () => { navDrag = null; clearNavDrop(); hideDropLine(); stopAutoScroll(); });
      row.addEventListener('dragover', e => {
        if (navDrag == null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        layers.querySelectorAll('.drop-before, .drop-after').forEach(n => n !== row && n.classList.remove('drop-before', 'drop-after'));
        row.classList.toggle('drop-after', after); row.classList.toggle('drop-before', !after);
      });
      row.addEventListener('drop', e => {
        if (navDrag == null) return; e.preventDefault();
        const after = row.classList.contains('drop-after'), from = navDrag; navDrag = null; clearNavDrop();
        moveBlock(from, i + (after ? 1 : 0));
      });
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
        iconButton('copy', 'Duplicate widget', () => duplicateAt(selected)),
        iconButton('trash', 'Delete widget', deleteSelected, { className: 'nvb-icon-btn-danger' })
      );
      const body = buildSettingsBody(); body.classList.add('nvb-enter');
      panelBody.replaceChildren(body);
    } else {
      panelHeader.append(el('strong', 'nvb-panel-title', 'Elements'));
      panelBody.replaceChildren(libraryBody);
    }
  }
  function render() {
    undoBtn.disabled = cursor === 0; redoBtn.disabled = cursor === history.length - 1;
    paintPanel(); paintLayers(); panelBody.scrollTop = 0; paintCanvas();
  }

  // ---- Keyboard shortcuts (builder panel and canvas) -----------------------------------------
  const isTyping = t => t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
  function handleShortcut(e) {
    if (e.key === 'Escape' && canvasDrag) { e.preventDefault(); endCanvasDrag(); return; }
    if (isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); travel(e.shiftKey ? 1 : -1); }
    else if (mod && key === 'y') { e.preventDefault(); travel(1); }
    else if (mod && key === 'v') { e.preventDefault(); pasteWidget(); }
    else if (selected < 0) return;
    else if (key === 'delete' || (key === 'backspace' && e.target?.ownerDocument === canvasDoc())) { e.preventDefault(); deleteSelected(); }
    else if (mod && key === 'd') { e.preventDefault(); duplicateAt(selected); }
    else if (mod && key === 'c' && !String(e.target?.ownerDocument?.getSelection?.() ?? '')) { e.preventDefault(); copyWidget(); }
    else if (e.altKey && key === 'arrowup') { e.preventDefault(); moveBlock(selected, selected - 1); }
    else if (e.altKey && key === 'arrowdown') { e.preventDefault(); moveBlock(selected, selected + 2); }
    else if (key === 'escape') { e.preventDefault(); selected = -1; render(); }
  }

  openButton.addEventListener('click',()=>{ if (!blocks.length && fallback.value.trim()) { append([{type:'text',text:fallback.value}]); } dialog.showModal(); render(); });
  dialog.addEventListener('close',()=>{ endCanvasDrag(); sync(); openButton.focus(); });
  dialog.addEventListener('keydown', handleShortcut);
  form.addEventListener('input',()=>{dirty=true;});
  form.addEventListener('submit',()=>{sync();dirty=false;});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  sync();
  if (new URLSearchParams(location.search).get('builder') === '1') openButton.click();
}
