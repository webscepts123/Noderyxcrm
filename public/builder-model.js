// Shared validation for the core builder, imported by the server and editor.
export const widgetTypes = [
  'hero', 'heading', 'text', 'image', 'button', 'columns', 'quote', 'divider', 'spacer', 'card', 'cta', 'list',
  'testimonial', 'icon-box', 'counter', 'progress', 'alert', 'team', 'social-icons', 'accordion', 'tabs', 'pricing', 'table'
];
export function safeUrl(value) {
  const url = String(value ?? '').trim().slice(0, 2048);
  if (/^https?:\/\//i.test(url) || /^\/(?![\/\\])/.test(url) || /^#[\w-]*$/.test(url)) return url.replace(/[\u0000-\u001f]/g, '');
  return '';
}
const color = value => /^#[a-f0-9]{6}$/i.test(String(value)) ? value : '';
const number = (value, fallback, max) => value === '' || value == null || !Number.isFinite(Number(value)) ? fallback : Math.max(0, Math.min(max, Number(value)));
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
export function sanitizeBlocks(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).filter(b => widgetTypes.includes(b?.type)).map((b, i) => {
    const s = b.style || {};
    const text = String(b.text ?? '').slice(0, 20000);
    return { id: String(b.id || `block-${i}`).slice(0, 100), type: b.type, text: b.type === 'social-icons' ? sanitizeSocialLinks(text) : text, alt: String(b.alt ?? '').slice(0, 20000), url: safeUrl(b.url), style: {
      color: color(s.color), background: color(s.background), align: ['left','center','right'].includes(s.align) ? s.align : 'left',
      fontSize: number(s.fontSize, 0, 120), padding: number(s.padding, 24, 160), margin: number(s.margin, 12, 160), radius: number(s.radius, 0, 100),
      hideMobile: s.hideMobile === true, hideDesktop: s.hideDesktop === true
    } };
  });
}
export function blockStyle(block) {
  const s = block.style;
  return `text-align:${s.align};padding:${s.padding}px;margin-bottom:${s.margin}px;border-radius:${s.radius}px;${s.color ? `color:${s.color};` : ''}${s.background ? `background-color:${s.background};` : ''}${s.fontSize ? `font-size:${s.fontSize}px;` : ''}`;
}
// Splits "keyA<sep>keyB" lines (blank lines dropped) into {keyA, keyB} pairs, used for any
// widget whose content is a small repeating list (accordion Q&A, tab titles, social links).
function pairs(text, sep, keyA, keyB) {
  return String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const at = line.indexOf(sep);
    return at === -1 ? { [keyA]: line, [keyB]: '' } : { [keyA]: line.slice(0, at).trim(), [keyB]: line.slice(at + sep.length).trim() };
  });
}
export function decorateBlocks(value) {
  return sanitizeBlocks(value).map((b, index) => {
    const base = { ...b, index, css: blockStyle(b), visibility: `${b.style.hideMobile ? 'hide-mobile' : ''} ${b.style.hideDesktop ? 'hide-desktop' : ''}`, lines: b.text.split('\n').filter(Boolean) };
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
    }
    return base;
  });
}
