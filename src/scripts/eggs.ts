// Easter eggs. Nothing here is visible until a trigger fires, and every
// animation is skipped for visitors who prefer reduced motion.

const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;

const css = `
.egg-toast {
  position: fixed; left: 50%; bottom: 24px; translate: -50% 0; z-index: 1000;
  max-width: min(90vw, 420px); padding: 10px 16px;
  background: var(--color-bg-secondary); color: var(--color-text-primary);
  border: 1px solid var(--color-accent); border-radius: var(--radius-md);
  box-shadow: var(--shadow-lift); font-size: 0.9rem; text-align: center;
  opacity: 0; transition: opacity 0.25s, translate 0.25s;
  pointer-events: none;
}
.egg-toast.is-on { opacity: 1; translate: -50% -6px; }
.egg-layer { position: fixed; inset: 0; z-index: 999; overflow: hidden; pointer-events: none; }
.egg-noodle {
  position: absolute; top: -60px; width: 3px; border-radius: 3px;
  background: var(--color-accent); transform-origin: top;
  animation: egg-fall linear forwards;
}
@keyframes egg-fall {
  to { translate: var(--drift) 110vh; rotate: var(--spin); }
}
.egg-boat {
  position: absolute; bottom: 12px; left: -60px; font-size: 2rem;
  animation: egg-sail 7s linear forwards;
}
@keyframes egg-sail {
  0%   { translate: 0 0; rotate: -4deg; }
  25%  { rotate: 5deg; }
  50%  { rotate: -4deg; }
  75%  { rotate: 5deg; }
  100% { translate: calc(100vw + 120px) 0; rotate: -4deg; }
}`;
document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

let toastEl: HTMLElement | undefined;
let toastTimer = 0;
function toast(text: string) {
  if (!toastEl) {
    toastEl = Object.assign(document.createElement('div'), { className: 'egg-toast' });
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.textContent = text;
  // Next frame, so the first appearance also transitions.
  requestAnimationFrame(() => toastEl!.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl!.classList.remove('is-on'), 4000);
}

function layer(ms: number) {
  const el = Object.assign(document.createElement('div'), { className: 'egg-layer' });
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

// 1. Konami code: the print turns into spaghetti.
function spaghetti() {
  toast('🍝 Спагеті-детектор спрацював. Друк скасовано, філамент не повертається.');
  if (calm.matches) return;
  const el = layer(4500);
  for (let i = 0; i < 36; i++) {
    const n = document.createElement('span');
    n.className = 'egg-noodle';
    n.style.left = `${Math.random() * 100}%`;
    n.style.height = `${30 + Math.random() * 70}px`;
    n.style.animationDuration = `${1.8 + Math.random() * 2}s`;
    n.style.animationDelay = `${Math.random() * 0.8}s`;
    n.style.setProperty('--drift', `${Math.random() * 120 - 60}px`);
    n.style.setProperty('--spin', `${Math.random() * 240 - 120}deg`);
    el.append(n);
  }
}

// 2. Typing "benchy": the calibration boat sails by.
function benchy() {
  toast('⛵ Benchy пройшов: мости рівні, нависання без соплів.');
  if (calm.matches) return;
  const boat = Object.assign(document.createElement('span'), { className: 'egg-boat', textContent: '⛵' });
  layer(7200).append(boat);
}

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiAt = 0;
let typed = '';
window.addEventListener('keydown', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  konamiAt = key === KONAMI[konamiAt] ? konamiAt + 1 : key === KONAMI[0] ? 1 : 0;
  if (konamiAt === KONAMI.length) {
    konamiAt = 0;
    spaghetti();
  }
  // Words typed into a field are just text.
  if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
  if (key.length !== 1) return;
  typed = (typed + key).slice(-6);
  if (typed === 'benchy' || typed === 'бенчі') {
    typed = '';
    benchy();
  }
});

// 3. Seven quick clicks on the theme toggle: thermochromic filament.
let clicks: number[] = [];
let hueTimer = 0;
document.getElementById('themeToggle')?.addEventListener('click', () => {
  const now = Date.now();
  clicks = [...clicks.filter((t) => now - t < 3000), now];
  if (clicks.length < 7) return;
  clicks = [];
  if (hueTimer) {
    clearInterval(hueTimer);
    hueTimer = 0;
    root.style.removeProperty('--color-accent');
    toast('Філамент охолов. Колір знову звичайний.');
    return;
  }
  toast('🌈 Термохромний філамент: від ваших кліків він нагрівся і міняє колір.');
  let hue = 30;
  const paint = () => root.style.setProperty('--color-accent', `hsl(${hue} 85% 55%)`);
  paint();
  // One fixed colour is enough of a joke when motion is unwelcome.
  hueTimer = window.setInterval(() => {
    if (calm.matches) return;
    hue = (hue + 3) % 360;
    paint();
  }, 80);
});

// 4. A note for people who open the console.
console.log(
  '%c; 3D Філамент UA\n%cM104 S210 ; гріємо сопло\nM140 S60  ; гріємо стіл\nG28       ; додому\nM117 Спробуйте Konami-код або наберіть benchy',
  'font-weight:bold;color:#f08019',
  'font-family:monospace',
);
