
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
      onChange: () => this.updateStatus()
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
  }

  onunload() {
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
    new Setting(containerEl).setName('Show in status bar')
      .setDesc('Frequency, binaural beat and timer while playing. Click it to stop.')
      .addToggle(t => t.setValue(e.d.statusBar !== false).onChange(v => { e.d.statusBar = v; e.save(); this.plugin.updateStatus(); }));
  }
}

module.exports = StaticFMPlugin;
