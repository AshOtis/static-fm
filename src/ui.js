/* Static FM 2 — "Aurora": simple Material-style controls on glass over slowly
 * wandering colour glows.
 * mountStaticFM(root, api, opts)
 *   api.cmd(name, args) -> Promise<snapshot | viz>
 *   opts.openUrl(url), opts.footExtras [{label, title, onClick}] */

function mountStaticFM(root, api, opts = {}) {
  const openUrl = opts.openUrl || (u => window.open(u));
  const COLORS = [['Blue', [59, 130, 246]], ['Green', [16, 185, 129]], ['Grey', [156, 163, 175]], ['White', [229, 229, 229]],
                  ['Pink', [236, 72, 153]], ['Orange', [249, 115, 22]], ['Brown', [180, 83, 9]]];
  const PRESETS = [['delta', 'Delta', 'Deep sleep'], ['theta', 'Theta', 'Meditation'], ['alpha', 'Alpha', 'Calm focus'], ['beta', 'Beta', 'Alert'], ['gamma', 'Gamma', 'Peak focus']];
  const ICON = {
    play: 'M8 5v14l11-7z', stop: 'M7 7h10v10H7z',
    pulse: 'M2 12h4l3-7 6 14 3-7h4',
    speaker: 'M4 9v6h4l5 4V5L8 9H4z', waves: 'M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11', cross: 'M16 9.5l5 5M21 9.5l-5 5'
  };

  let S = null, stopped = false, level = 0;
  const busy = new Set();

  const h = (tag, cls, text, parent) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  };
  // icon(d, size, stroke) — d may be an array of [path, stroke?] pairs
  const icon = (d, size = 22, stroke = false) => {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
    for (const [pd, st] of Array.isArray(d) ? d : [[d, stroke]]) {
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', pd);
      if (st) { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); }
      else p.setAttribute('fill', 'currentColor');
      s.appendChild(p);
    }
    return s;
  };
  const cmd = async (name, args) => { const r = await api.cmd(name, args); if (r && 'playing' in r) { S = r; paint(); } return r; };
  const set = (key, value) => cmd('set', { key, value });

  root.classList.add('sfa');
  root.textContent = '';
  const sky = h('div', 'sfa-sky', null, root);
  const aurora = new SFMAurora(sky);
  const scroll = h('div', 'sfa-scroll', null, root);

  // Header: title left, short status right
  const head = h('header', 'sfa-head', null, scroll);
  h('div', 'sfa-title', 'Static FM', head);
  const sub = h('div', 'sfa-sub', '', head);

  // Transport: play/stop, frequency, pulse and mute on one line
  const bar = h('div', 'sfa-bar', null, scroll);
  const fab = h('button', 'sfa-fab', null, bar);
  fab.setAttribute('aria-label', 'Play');
  fab.addEventListener('click', () => cmd('toggle'));
  const now = h('div', 'sfa-now', null, bar);
  const freqLine = h('div', 'sfa-freq', null, now);
  const freq = h('span', null, '50.0', freqLine);
  h('small', null, 'MHz', freqLine);
  const colourName = h('div', 'sfa-colour', '', now);
  const bPulse = h('button', 'sfa-icon', null, bar);
  bPulse.append(icon(ICON.pulse, 18, true));
  bPulse.addEventListener('click', () => cmd('pulse'));
  const bMute = h('button', 'sfa-icon', null, bar);
  bMute.addEventListener('click', () => set('muted', !S.muted));

  // Controls
  const card = (title) => {
    const c = h('section', 'sfa-card', null, scroll);
    const hd = title ? h('div', 'sfa-card-head', null, c) : null;
    if (hd) h('h2', null, title, hd);
    return { c, hd };
  };
  function slider(parent, label, min, max, step, key, fmt, cls) {
    const row = h('label', 'sfa-slider', null, parent);
    const top = h('span', 'sfa-slider-top', null, row);
    h('span', null, label, top);
    const val = h('span', 'sfa-val', '', top);
    const inp = h('input', 'sfa-range' + (cls ? ' ' + cls : ''), null, row);
    Object.assign(inp, { type: 'range', min, max, step });
    inp.addEventListener('pointerdown', () => busy.add(inp));
    inp.addEventListener('pointerup', () => busy.delete(inp));
    inp.addEventListener('change', () => busy.delete(inp));
    inp.addEventListener('input', () => { val.textContent = fmt(Number(inp.value)); fill(inp); set(key, Number(inp.value)); });
    return { inp, val, fmt, row };
  }
  const fill = inp => inp.style.setProperty('--pct', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%');
  function toggle(parent, onClick) {
    const t = h('button', 'sfa-switch', null, parent);
    t.setAttribute('role', 'switch');
    h('i', null, null, t);
    t.addEventListener('click', onClick);
    return t;
  }

  const sound = card(null).c;
  const swatches = h('div', 'sfa-swatches', null, sound);
  const swBtns = COLORS.map(([name, c], i) => {
    const b = h('button', 'sfa-swatch', null, swatches);
    b.title = name + ' noise';
    h('i', 'sfa-c' + i, null, b);
    h('span', null, ({Blue:'Blu',Green:'Grn',Grey:'Gry',White:'Wht',Pink:'Pnk',Orange:'Org',Brown:'Brn'})[name] || name.slice(0, 3), b);
    b.addEventListener('click', () => set('color', i));
    return b;
  });
  const sSpec = slider(sound, 'Colour', 0, 100, 0.1, 'spectrum', v => `${(1200 - v * 10).toFixed(0)} Hz`, 'sfa-rainbow');
  const sVol = slider(sound, 'Volume', 0, 1, 0.01, 'volume', v => Math.round(v * 100) + '%');
  const sBass = slider(sound, 'Bass', -3, 12, 0.5, 'bass', v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB');

  const pc = card('Pulse');
  const pulseSw = toggle(pc.hd, () => cmd('pulse'));
  const sSpeed = slider(pc.c, 'Breath', 4, 60, 1, 'pulsePeriod', v => v.toFixed(0) + ' s');
  const sDepth = slider(pc.c, 'Depth', 0.5, 10, 0.5, 'pulseDepth', v => '±' + v.toFixed(1));

  const bc = card('Binaural');
  const binVal = h('span', 'sfa-head-val', '', bc.hd);
  const binSw = toggle(bc.hd, () => set('binaural', !S.binaural.on));
  const chips = h('div', 'sfa-chips', null, bc.c);
  const presetBtns = {};
  for (const [id, name, about] of PRESETS) {
    const c = h('button', 'sfa-chip', name, chips);
    c.title = about;
    c.addEventListener('click', () => set('preset', id));
    presetBtns[id] = c;
  }
  presetBtns.custom = h('button', 'sfa-chip', 'Custom', chips);
  presetBtns.custom.addEventListener('click', () => { if (!S.binaural.on) set('binaural', true); set('beat', S.binaural.beat); });
  const binHelp = h('p', 'sfa-help', '', bc.c);
  const customBox = h('div', null, null, bc.c);
  const sBeat = slider(customBox, 'Beat', 0.5, 40, 0.5, 'beat', v => v.toFixed(1) + ' Hz');
  const sTone = slider(customBox, 'Tone', 60, 500, 1, 'carrier', v => v.toFixed(0) + ' Hz');
  const sMix = slider(bc.c, 'Mix', 0, 1, 0.01, 'mix', v => Math.round(v * 100) + '%');

  const tc = h('section', 'sfa-card sfa-sleep', null, scroll);
  h('h2', null, 'Sleep', tc);
  const seg = h('div', 'sfa-seg', null, tc);
  const timerBtns = {};
  for (const m of [0, 15, 30, 60, 90]) {
    const b = h('button', null, m ? m + 'm' : 'Off', seg);
    b.title = m ? `Fade out and stop after ${m} minutes` : 'No sleep timer';
    b.addEventListener('click', () => set('timer', m));
    timerBtns[m] = b;
  }

  const foot = h('footer', 'sfa-foot', null, scroll);
  const bMotion = h('button', 'sfa-link', '', foot);
  bMotion.addEventListener('click', () => set('motion', !S.motion));
  const coffee = h('button', 'sfa-link', 'Buy me a coffee', foot);
  coffee.addEventListener('click', () => openUrl('https://buymeacoffee.com/ashotis'));
  for (const x of opts.footExtras || []) { const b = h('button', 'sfa-link', x.label, foot); b.title = x.title || ''; b.addEventListener('click', x.onClick); }

  /* ---------- paint ---------- */

  function weights(pos) {
    const mix = pos / 100, w = [];
    for (let c = 0; c < 7; c++) { const d = Math.abs(mix - c / 6) / 0.25; w.push(d < 1 ? Math.cos(d * Math.PI / 2) : 0); }
    return w;
  }
  function setSlider(s, v) {
    if (!busy.has(s.inp) && document.activeElement !== s.inp) s.inp.value = v;
    s.val.textContent = s.fmt(Number(v));
    fill(s.inp);
  }
  const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const darken = (c, f) => c.map(v => Math.round(v * f));

  function paint() {
    if (!S) return;
    const b = S.binaural;
    root.classList.toggle('is-on', S.playing);
    freq.textContent = S.live.toFixed(1);
    const w = weights(S.live);
    const order = w.map((v, i) => [v, i]).sort((a, z) => z[0] - a[0]);
    const first = COLORS[order[0][1]], second = COLORS[order[1][1]];
    colourName.textContent = order[1][0] > 0.35 ? `${first[0]} · ${second[0]}` : first[0] + ' noise';
    swBtns.forEach((s, i) => s.classList.toggle('on', w[i] > 0.5));

    const pName = (PRESETS.find(x => x[0] === b.preset) || [, 'Custom'])[1];
    const beat = b.beat % 1 ? b.beat.toFixed(1) : b.beat;
    const bits = [];
    if (!S.playing) bits.push('Stopped'); else if (S.muted) bits.push('Muted'); else if (S.pulsing && !b.on) bits.push('Breathing');
    if (b.on) bits.push(`${pName} ${beat} Hz`);
    if (S.timerLeft) bits.push(mmss(S.timerLeft));
    sub.textContent = bits.join(' · ') || 'Playing';

    fab.textContent = ''; fab.append(icon(S.playing ? ICON.stop : ICON.play, 22));
    fab.classList.toggle('on', S.playing);
    fab.setAttribute('aria-label', S.playing ? 'Stop' : 'Play'); fab.title = S.playing ? 'Stop' : 'Play';
    bPulse.classList.toggle('on', S.pulsing); bPulse.disabled = !S.playing;
    bPulse.setAttribute('aria-pressed', S.pulsing); bPulse.title = S.pulsing ? 'Stop pulsing' : 'Pulse — breathe the colour slowly';
    bPulse.setAttribute('aria-label', 'Pulse');
    bMute.textContent = ''; bMute.append(icon(S.muted ? [[ICON.speaker], [ICON.cross, true]] : [[ICON.speaker], [ICON.waves, true]], 18));
    bMute.classList.toggle('on', S.muted); bMute.setAttribute('aria-pressed', S.muted);
    bMute.setAttribute('aria-label', 'Mute'); bMute.title = S.muted ? 'Unmute' : 'Mute';

    setSlider(sSpec, S.spectrum); setSlider(sVol, S.volume); setSlider(sBass, S.bass);
    pulseSw.classList.toggle('on', S.pulsing); pulseSw.setAttribute('aria-checked', S.pulsing); pulseSw.disabled = !S.playing;
    setSlider(sSpeed, S.pulsePeriod); setSlider(sDepth, S.pulseDepth);

    binSw.classList.toggle('on', b.on); binSw.setAttribute('aria-checked', b.on);
    for (const id in presetBtns) presetBtns[id].classList.toggle('on', b.on && b.preset === id);
    binVal.textContent = b.on ? `${pName} · ${beat} Hz` : '';
    binHelp.textContent = b.on ? `${b.beat.toFixed(1)} Hz beat on a ${b.carrier.toFixed(0)} Hz tone. Use headphones.` : 'Two slightly different tones, one per ear. Use headphones.';
    customBox.hidden = !(b.on && b.preset === 'custom');
    sMix.row.hidden = !b.on;
    setSlider(sBeat, b.beat); setSlider(sTone, b.carrier); setSlider(sMix, b.mix);

    for (const m in timerBtns) timerBtns[m].classList.toggle('on', S.timer === Number(m));
    bMotion.textContent = 'Background motion: ' + (S.motion ? 'on' : 'off');

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    aurora.setStill(!S.motion || reduce);
    aurora.update({ cols: [first[1], second[1], darken(order[2] ? COLORS[order[2][1]][1] : first[1], 0.7)], playing: S.playing && !S.muted, pulsing: S.pulsing, pulsePeriod: S.pulsePeriod, level });
  }

  // Sound level → glow brightness
  let raf = 0, last = 0, lvBusy = false;
  async function levelLoop(ts) {
    if (stopped) return;
    raf = requestAnimationFrame(levelLoop);
    if (lvBusy || !S || ts - last < 100 || document.hidden) return;
    last = ts; lvBusy = true;
    try {
      const v = S.playing && !S.muted ? await api.cmd('viz') : null;
      level += ((v ? v.rms : 0) - level) * 0.3;
    } finally { lvBusy = false; }
  }

  (async () => { S = await api.cmd('state'); paint(); aurora.start(); raf = requestAnimationFrame(levelLoop); })();
  const poll = setInterval(async () => {
    if (stopped) return;
    const r = await api.cmd('state');
    if (r) { S = r; paint(); }
  }, 250);

  return { destroy: () => { stopped = true; clearInterval(poll); cancelAnimationFrame(raf); aurora.stop(); } };
}
