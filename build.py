"""Build main.js and styles.css for Obsidian into dist/. No dependencies: python3 build.py"""
import json, pathlib
R = pathlib.Path(__file__).resolve().parent; src = R / 'src'; out = R / 'dist'
out.mkdir(exist_ok=True)
read = lambda f: (src / f).read_text(encoding='utf-8')
worklet = read('noise.js') + read('worklet-tail.js')
main = ("'use strict';\nconst { Plugin, ItemView, Notice, PluginSettingTab, Setting } = require('obsidian');\n\n"
        + 'const SFM_WORKLET_SRC = ' + json.dumps(worklet) + ';\n\n'
        + '\n'.join(read(f) for f in ['noise.js', 'engine.js', 'aurora.js', 'ui.js', 'glue.js']))
(out / 'main.js').write_text(main, encoding='utf-8')
(out / 'styles.css').write_text(read('ui.css') + '\n' + read('extra.css'), encoding='utf-8')
(out / 'manifest.json').write_text((R / 'manifest.json').read_text(encoding='utf-8'), encoding='utf-8')
print('dist/ ready: main.js, manifest.json, styles.css')
