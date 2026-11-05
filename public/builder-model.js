// Shared validation for the core builder, imported by the server and editor.
export const widgetTypes = [
  'hero', 'heading', 'text', 'image', 'button', 'columns', 'quote', 'divider', 'spacer', 'card', 'cta', 'list',
  'testimonial', 'icon-box', 'counter', 'progress', 'alert', 'team', 'social-icons', 'accordion', 'tabs', 'pricing', 'table',
  'video', 'gallery', 'icon-list', 'rating', 'countdown'
];
// Advanced options. Each value maps to a fixed class or CSS preset, so no block data is ever
// written into a selector or an arbitrary CSS value.
export const animations = ['none', 'fade', 'fade-up', 'fade-down', 'zoom', 'slide-left', 'slide-right', 'flip'];
export const hoverEffects = ['none', 'lift', 'grow', 'glow', 'tilt'];
export const shadows = ['none', 'soft', 'medium', 'strong'];
const SHADOW_CSS = { soft: '0 2px 10px rgba(18,39,29,.08)', medium: '0 10px 28px rgba(18,39,29,.14)', strong: '0 22px 50px rgba(18,39,29,.24)' };

export function safeUrl(value) {
  const url = String(value ?? '').trim().slice(0, 2048);
  if (/^https?:\/\//i.test(url) || /^\/(?![\/\\])/.test(url) || /^#[\w-]*$/.test(url)) return url.replace(/[\u0000-\u001f]/g, '');
  return '';
}
const color = value => /^#[a-f0-9]{6}$/i.test(String(value)) ? value : '';
const number = (value, fallback, max, min = 0) => value === '' || value == null || !Number.isFinite(Number(value)) ? fallback : Math.max(min, Math.min(max, Number(value)));
const choice = (value, list, fallback) => list.includes(value) ? value : fallback;
// An HTML id usable as a "#anchor" link target.
const anchor = value => { const id = String(value ?? '').trim(); return /^[A-Za-z][\w-]{0,63}$/.test(id) ? id : ''; };
// Up to six plain class names. The builder's own "nvb-" namespace is reserved so a custom
// class can never switch on an editor state or an animation preset.
const cssClasses = value => String(value ?? '').split(/\s+/).filter(c => /^[A-Za-z_][\w-]{0,40}$/.test(c) && !/^nvb-/i.test(c) && c !== 'chosen').slice(0, 6).join(' ');
// "2026-12-31" or "2026-12-31T18:30" (the value a datetime-local input produces).
const dateTime = value => { const v = String(value ?? '').trim(); return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : ''; };

// "Label|https://example.com" per line; drops any line missing a label or a safe URL, so an
// href built from this field can never carry a javascript:/data: scheme.
function sanitizeSocialLinks(text) {
  return String(text ?? '').split('\n').map(line => {
    const at = line.indexOf('|');
    if (at === -1) return '';
    const label = line.slice(0, at).trim().slice(0, 60);
    const url = safeUrl(line.slice(at + 1));
    return label && url ? `${label}|${url}` : '';
  }).filter(Boolean).join('\n');
}
// "https://example.com/a.jpg | Alt text" per line; lines without a safe URL are dropped.
function sanitizeGallery(text) {
  return String(text ?? '').split('\n').map(line => {
    const at = line.indexOf('|');
    const url = safeUrl(at === -1 ? line : line.slice(0, at));
    const alt = at === -1 ? '' : line.slice(at + 1).trim().slice(0, 200);
    return url ? (alt ? `${url} | ${alt}` : url) : '';
  }).filter(Boolean).slice(0, 24).join('\n');
}
function sanitizeText(type, text) {
  if (type === 'social-icons') return sanitizeSocialLinks(text);
  if (type === 'gallery') return sanitizeGallery(text);
  if (type === 'countdown') return dateTime(text);
  return text;
}
export function sanitizeBlocks(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).filter(b => widgetTypes.includes(b?.type)).map((b, i) => {
    const s = b.style || {};
    const text = String(b.text ?? '').slice(0, 20000);
    return { id: String(b.id || `block-${i}`).slice(0, 100), type: b.type, text: sanitizeText(b.type, text), alt: String(b.alt ?? '').slice(0, 20000), url: safeUrl(b.url), style: {
      color: color(s.color), background: color(s.background), align: ['left','center','right'].includes(s.align) ? s.align : 'left',
      fontSize: number(s.fontSize, 0, 120), padding: number(s.padding, 24, 160), margin: number(s.margin, 12, 160), radius: number(s.radius, 0, 100),
      borderWidth: number(s.borderWidth, 0, 20), borderColor: color(s.borderColor), shadow: choice(s.shadow, shadows, 'none'), maxWidth: number(s.maxWidth, 0, 1600),
      animation: choice(s.animation, animations, 'none'), animDuration: number(s.animDuration, 600, 3000, 100), animDelay: number(s.animDelay, 0, 5000),
      hover: choice(s.hover, hoverEffects, 'none'), anchor: anchor(s.anchor), cssClass: cssClasses(s.cssClass),
      hideMobile: s.hideMobile === true, hideDesktop: s.hideDesktop === true
    } };
  });
}
export function blockStyle(block) {
  const s = block.style;
  return `text-align:${s.align};padding:${s.padding}px;margin-bottom:${s.margin}px;border-radius:${s.radius}px;${s.color ? `color:${s.color};` : ''}${s.background ? `background-color:${s.background};` : ''}${s.fontSize ? `font-size:${s.fontSize}px;` : ''}`
    + `${s.borderWidth ? `border:${s.borderWidth}px solid ${s.borderColor || 'currentColor'};` : ''}${s.shadow && s.shadow !== 'none' ? `box-shadow:${SHADOW_CSS[s.shadow]};` : ''}`
    + `${s.maxWidth ? `max-width:${s.maxWidth}px;margin-left:auto;margin-right:auto;` : ''}${s.animation && s.animation !== 'none' ? `--nvb-dur:${s.animDuration}ms;--nvb-delay:${s.animDelay}ms;` : ''}`;
}
// Classes applied to the widget wrapper for its advanced options.
export function blockClasses(block) {
  const s = block.style;
  return [s.animation !== 'none' && `nvb-anim nvb-anim-${s.animation}`, s.hover !== 'none' && `nvb-hover-${s.hover}`, s.cssClass].filter(Boolean).join(' ');
}
// Splits "keyA<sep>keyB" lines (blank lines dropped) into {keyA, keyB} pairs, used for any
// widget whose content is a small repeating list (accordion Q&A, tab titles, social links).
function pairs(text, sep, keyA, keyB) {
  return String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const at = line.indexOf(sep);
    return at === -1 ? { [keyA]: line, [keyB]: '' } : { [keyA]: line.slice(0, at).trim(), [keyB]: line.slice(at + sep.length).trim() };
  });
}
// Days/hours/minutes/seconds remaining until `target`; the public runtime keeps it ticking.
export function countdownUnits(target, now = Date.now()) {
  const ms = Math.max(0, (Date.parse(target) || now) - now);
  const total = Math.floor(ms / 1000);
  const pad = n => String(n).padStart(2, '0');
  return [
    { key: 'days', label: 'Days', value: String(Math.floor(total / 86400)) },
    { key: 'hours', label: 'Hours', value: pad(Math.floor(total / 3600) % 24) },
    { key: 'minutes', label: 'Minutes', value: pad(Math.floor(total / 60) % 60) },
    { key: 'seconds', label: 'Seconds', value: pad(total % 60) }
  ];
}
export function decorateBlocks(value) {
  return sanitizeBlocks(value).map((b, index) => {
    const base = { ...b, index, css: blockStyle(b), classes: blockClasses(b), anchor: b.style.anchor, visibility: `${b.style.hideMobile ? 'hide-mobile' : ''} ${b.style.hideDesktop ? 'hide-desktop' : ''}`, lines: b.text.split('\n').filter(Boolean) };
    if (b.type === 'testimonial') {
      const at = b.alt.indexOf('|');
      base.name = (at === -1 ? b.alt : b.alt.slice(0, at)).trim();
      base.role = (at === -1 ? '' : b.alt.slice(at + 1)).trim();
    } else if (b.type === 'progress') {
      const at = b.text.indexOf('|');
      base.progressLabel = (at === -1 ? b.text : b.text.slice(0, at)).trim();
      base.progressPercent = Math.max(0, Math.min(100, Math.round(Number(at === -1 ? 0 : b.text.slice(at + 1)) || 0)));
    } else if (b.type === 'social-icons') {
      base.items = pairs(b.text, '|', 'label', 'url');
    } else if (b.type === 'accordion' || b.type === 'tabs') {
      base.items = pairs(b.text, '::', 'q', 'a');
    } else if (b.type === 'pricing') {
      const featureLines = b.alt.split('\n').map(l => l.trim()).filter(Boolean);
      base.price = featureLines[0] ?? '';
      base.features = featureLines.slice(1);
    } else if (b.type === 'table') {
      const rows = b.text.split('\n').map(l => l.trim()).filter(Boolean).map(line => line.split('|').map(c => c.trim()).slice(0, 8));
      base.columnCount = rows[0]?.length || 1;
      base.rows = rows.map((cells, i) => ({ cells, header: i === 0 }));
    } else if (b.type === 'gallery') {
      base.images = pairs(b.text, '|', 'url', 'alt');
    } else if (b.type === 'rating') {
      const rating = Math.round(Math.max(0, Math.min(5, Number(b.text) || 0)) * 2) / 2;
      base.ratingValue = String(rating);
      base.stars = [1, 2, 3, 4, 5].map(n => rating >= n ? 'full' : rating >= n - 0.5 ? 'half' : 'empty');
    } else if (b.type === 'countdown') {
      base.target = b.text;
      base.units = countdownUnits(b.text);
    }
    return base;
  });
}
