
/* =====================================================================
 * Obsidian glue
 * ===================================================================== */

const SFM_VIEW = 'static-fm-view';
let SFM_WORKLET_URL = null;

class SFMView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.ui = null; }
  getViewType() { return SFM_VIEW; }
  getDisplayText() { return 'Static FM'; }
  getIcon() { return 'waves'; }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('sfm-host');
    const root = this.contentEl.createDiv();
    const engine = this.plugin.engine;
    this.ui = mountStaticFM(root, { cmd: (n, a) => engine.command(n, a || {}) }, { openUrl: u => window.open(u) });
  }
  async onClose() { if (this.ui) this.ui.destroy(); }
}

class StaticFMPlugin extends Plugin {
  async onload() {
    this.saveTimer = null;
    this.engine = new SFMEngine({
      load: () => this.loadData(),
      save: d => { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveData(d), 400); },
      workletUrl: async () => {
        if (!SFM_WORKLET_URL) SFM_WORKLET_URL = URL.createObjectURL(new Blob([SFM_WORKLET_SRC], { type: 'application/javascript' }));
        return SFM_WORKLET_URL;
      },
      onChange: () => { this.updateStatus(); this.announcePlay(); }
    });
    await this.engine.init();

    this.registerView(SFM_VIEW, leaf => new SFMView(leaf, this));
    this.addRibbonIcon('waves', 'Static FM', () => this.activateView());

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('sfm-status');
    this.registerDomEvent(this.statusEl, 'click', () => this.engine.toggle());
    this.registerInterval(window.setInterval(() => this.updateStatus(), 1000));
    this.updateStatus();

    const e = this.engine;
    const cmds = [
      ['open', 'Open player', () => this.activateView()],
      ['toggle', 'Start / stop', () => e.toggle()],
      ['pulse', 'Pulse on / off', () => e.togglePulse()],
      ['mute', 'Mute / unmute', () => e.set('muted', !e.d.muted)],
      ['binaural', 'Binaural tones on / off', () => e.set('binaural', !e.d.binaural.on)]
    ];
    for (const id of Object.keys(SFM_PRESETS)) cmds.push([`preset-${id}`, `Binaural: ${SFM_PRESETS[id].name} (${SFM_PRESETS[id].beat} Hz, ${SFM_PRESETS[id].about})`, () => e.set('preset', id)]);
    for (const m of SFM_TIMERS) cmds.push([`timer-${m}`, m ? `Sleep timer: ${m} minutes` : 'Sleep timer: off', () => { e.set('timer', m); new Notice(m ? `Static FM: sleep in ${m} min` : 'Static FM: timer off'); }]);
    for (const [id, name, cb] of cmds) this.addCommand({ id, name, callback: cb });

    this.addSettingTab(new SFMSettingTab(this.app, this));

    // One player at a time: when another AshOtis player starts, stop (unless allowed to play together)
    this.registerEvent(this.app.workspace.on('ashotis:playing', src => {
      if (src !== 'static-fm' && this.engine.playing && this.engine.d.playTogether !== true) this.engine.stop();
    }));

    // Share the noise colours with the Static Aurora theme (or any theme that reads these variables)
    this.registerInterval(window.setInterval(() => this.syncTheme(), 1000));
  }

  // Writes the theme colours only when they change (colour slider, pulse drifting into a new shade).
  // Every write makes Obsidian restyle the whole window, so writes are rounded and kept rare.
  syncTheme() {
    const body = document.body, e = this.engine, vars = ['--sa-c1', '--sa-c2', '--sa-c3'];
    const on = e.d.themeSync !== false && e.playing && !e.d.muted;
    if (!on) {
      // paused or stopped: keep the last colours on the theme; only clear when syncing is switched off
      if (e.d.themeSync === false && this.synced) { delete body.dataset.saOwner; for (const v of vars) body.style.removeProperty(v); this.synced = false; this.syncKey = ''; }
      return;
    }
    if (!this.mayColourTheme('static-fm')) return;
    const C = [[59, 130, 246], [16, 185, 129], [156, 163, 175], [229, 229, 229], [236, 72, 153], [249, 115, 22], [180, 83, 9]];
    const mix = Math.round(e.live / 4) * 4 / 100;   // round to steps of 4 so tiny pulse movements don't trigger a write
    const w = C.map((_, c) => { const d = Math.abs(mix - c / 6) / 0.25; return d < 1 ? Math.cos(d * Math.PI / 2) : 0; });
    const order = w.map((v, i) => [v, i]).sort((a, z) => z[0] - a[0]);
    const rgb = (c, f = 1) => `rgb(${Math.round(c[0] * f)}, ${Math.round(c[1] * f)}, ${Math.round(c[2] * f)})`;
    const first = C[order[0][1]], second = order[1][0] > 0 ? C[order[1][1]] : first, third = order[2][0] > 0 ? C[order[2][1]] : second;
    const vals = [rgb(first), rgb(second), rgb(third, 0.7)], key = vals.join('|');
    if (key === this.syncKey && this.synced) return;
    vals.forEach((v, i) => body.style.setProperty(vars[i], v));
    this.syncKey = key; this.synced = true;
  }

  announcePlay() {
    const now = this.engine.playing;
    if (now && !this.wasPlaying) this.app.workspace.trigger('ashotis:playing', 'static-fm');
    this.wasPlaying = now;
  }

  // Only one plugin colours the theme at a time: whoever started first keeps it until they stop
  mayColourTheme(me) {
    const o = (document.body.dataset.saOwner || '').split(':');
    if (o[0] && o[0] !== me && Date.now() - Number(o[1]) < 3000) { this.synced = false; return false; }
    if (o[0] !== me) this.synced = false;   // taking over from another player: repaint
    document.body.dataset.saOwner = me + ':' + Date.now();
    return true;
  }

  onunload() {
    if ((document.body.dataset.saOwner || '').startsWith(this.manifest.id + ':')) delete document.body.dataset.saOwner;
    for (const v of ['--sa-c1', '--sa-c2', '--sa-c3']) document.body.style.removeProperty(v);
    clearTimeout(this.saveTimer);
    this.saveData(this.engine.d);
    this.engine.destroy();
    if (SFM_WORKLET_URL) { URL.revokeObjectURL(SFM_WORKLET_URL); SFM_WORKLET_URL = null; }
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(SFM_VIEW)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: SFM_VIEW, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  updateStatus() {
    if (!this.statusEl) return;
    const s = this.engine.snapshot();
    const show = this.engine.d.statusBar !== false && s.playing;
    this.statusEl.toggleClass('sfm-hidden', !show);
    if (!show) return;
    const bin = s.binaural.on ? ` · ${s.binaural.beat} Hz` : '';
    const t = s.timerLeft ? ` · ${Math.floor(s.timerLeft / 60)}:${String(s.timerLeft % 60).padStart(2, '0')}` : '';
    this.statusEl.setText(`≋ ${s.live.toFixed(1)}${bin}${t}${s.muted ? ' · muted' : ''}`);
    this.statusEl.setAttribute('aria-label', 'Static FM: click to stop');
  }
}

class SFMSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    const e = this.plugin.engine;
    containerEl.empty();
    new Setting(containerEl).setName('Background motion')
      .setDesc('Slowly drifting colour glows. Turn off for a still background.')
      .addToggle(t => t.setValue(e.d.motion).onChange(v => e.set('motion', v)));
    new Setting(containerEl).setName('Colour the Static Aurora theme')
      .setDesc('While Static FM plays, the Static Aurora theme glows in the colours of your noise. Has no effect with other themes.')
      .addToggle(t => t.setValue(e.d.themeSync !== false).onChange(v => { e.d.themeSync = v; e.save(); this.plugin.syncTheme(); }));
    new Setting(containerEl).setName('Play alongside other players')
      .setDesc('Off: starting Aurora MP3, Hi-Fi Tuner or MFP Player stops Static FM, and the other way round. On: keep the noise playing under your music.')
      .addToggle(t => t.setValue(e.d.playTogether === true).onChange(v => { e.d.playTogether = v; e.save(); }));
    new Setting(containerEl).setName('Show in status bar')
      .setDesc('Frequency, binaural beat and timer while playing. Click it to stop.')
      .addToggle(t => t.setValue(e.d.statusBar !== false).onChange(v => { e.d.statusBar = v; e.save(); this.plugin.updateStatus(); }));
  }
}

module.exports = StaticFMPlugin;
