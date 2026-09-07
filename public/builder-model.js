// Shared validation for the core builder, imported by the server and editor.
export const widgetTypes = ['hero', 'heading', 'text', 'image', 'button', 'columns', 'quote', 'divider', 'spacer', 'card', 'cta', 'list'];
export function safeUrl(value) {
  const url = String(value ?? '').trim().slice(0, 2048);
  if (/^https?:\/\//i.test(url) || /^\/(?![\/\\])/.test(url) || /^#[\w-]*$/.test(url)) return url.replace(/[\u0000-\u001f]/g, '');
  return '';
}
const color = value => /^#[a-f0-9]{6}$/i.test(String(value)) ? value : '';
const number = (value, fallback, max) => value === '' || value == null || !Number.isFinite(Number(value)) ? fallback : Math.max(0, Math.min(max, Number(value)));
export function sanitizeBlocks(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).filter(b => widgetTypes.includes(b?.type)).map((b, i) => {
    const s = b.style || {};
    return { id: String(b.id || `block-${i}`).slice(0, 100), type: b.type, text: String(b.text ?? '').slice(0, 20000), alt: String(b.alt ?? '').slice(0, 20000), url: safeUrl(b.url), style: {
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
export function decorateBlocks(value) {
  return sanitizeBlocks(value).map((b, index) => ({ ...b, index, css: blockStyle(b), visibility: `${b.style.hideMobile ? 'hide-mobile' : ''} ${b.style.hideDesktop ? 'hide-desktop' : ''}`, lines: b.text.split('\n').filter(Boolean) }));
}
