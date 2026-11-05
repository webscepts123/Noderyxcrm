// Public-site behaviour for Noderyx Visual Builder widgets. Everything here is progressive:
// without this script, widgets render fully visible and static.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canObserve = 'IntersectionObserver' in window;

function onVisible(nodes, callback, threshold = 0.12) {
  if (!canObserve) { nodes.forEach(callback); return; }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    observer.unobserve(entry.target); callback(entry.target);
  }), { threshold, rootMargin: '0px 0px -40px 0px' });
  nodes.forEach(node => observer.observe(node));
}

// Entrance animations: hide until in view, then play once.
const animated = [...document.querySelectorAll('.nvb-anim')];
if (animated.length && canObserve && !reduceMotion) {
  document.documentElement.classList.add('nvb-js');
  onVisible(animated, node => node.classList.add('nvb-in'), 0.08);
}

// Counters count up from zero, keeping any prefix/suffix ("$1,200+", "98%").
onVisible([...document.querySelectorAll('.nvb-content[data-widget=counter] strong')], node => {
  const match = node.textContent.match(/^(\D*)(\d[\d,]*(?:\.\d+)?)(.*)$/s);
  if (!match || reduceMotion) return;
  const [, prefix, raw, suffix] = match, target = Number(raw.replace(/,/g, ''));
  const decimals = (raw.split('.')[1] || '').length, grouped = raw.includes(',');
  const format = value => { const fixed = value.toFixed(decimals); return grouped ? Number(fixed).toLocaleString('en', { minimumFractionDigits: decimals }) : fixed; };
  const start = performance.now(), duration = 1400;
  const step = now => {
    const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
    node.textContent = `${prefix}${format(target * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

// Progress bars fill from empty when they come into view.
const bars = [...document.querySelectorAll('.nvb-progress-fill')];
if (bars.length && canObserve && !reduceMotion) {
  bars.forEach(bar => bar.classList.add('nvb-progress-wait'));
  onVisible(bars, bar => requestAnimationFrame(() => bar.classList.remove('nvb-progress-wait')));
}

// Countdown timers tick every second in the visitor's time zone.
const countdowns = [...document.querySelectorAll('[data-countdown]')];
if (countdowns.length) {
  const pad = n => String(n).padStart(2, '0');
  const tick = () => countdowns.forEach(node => {
    const total = Math.max(0, Math.floor((Date.parse(node.dataset.countdown) - Date.now()) / 1000)) || 0;
    const values = { days: String(Math.floor(total / 86400)), hours: pad(Math.floor(total / 3600) % 24), minutes: pad(Math.floor(total / 60) % 60), seconds: pad(total % 60) };
    node.querySelectorAll('[data-unit]').forEach(unit => {
      const next = values[unit.dataset.unit];
      if (unit.textContent !== next) { unit.textContent = next; if (!reduceMotion) { unit.classList.remove('nvb-tick'); void unit.offsetWidth; unit.classList.add('nvb-tick'); } }
    });
    node.classList.toggle('is-finished', total === 0);
  });
  tick(); setInterval(tick, 1000);
}

// Video widgets: the page ships a plain link (the template renderer has no <video> tag);
// upgrade it to an inline player. The URL was already restricted to http(s) or a site path.
document.querySelectorAll('.nvb-video-embed[data-video]').forEach(embed => {
  const video = document.createElement('video');
  video.className = 'nvb-video'; video.src = embed.dataset.video;
  video.controls = true; video.preload = 'metadata'; video.playsInline = true;
  embed.replaceChildren(video);
});
