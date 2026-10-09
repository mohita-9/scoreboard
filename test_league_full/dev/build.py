#!/usr/bin/env python3
# Assembles self-contained deliverables: inlines the shared rules, helpers and CSS into each file.
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'out')
os.makedirs(out, exist_ok=True)
rd = lambda p: open(os.path.join(here, p), encoding='utf-8').read()
rules, common, css = rd('rules.js'), rd('common.js'), rd('common.css')

def fill(t):
    for k, v in (('/*__RULES__*/', rules), ('/*__COMMON__*/', common), ('/*__CSS__*/', css)):
        t = t.replace(k, v)
    assert '/*__' not in t
    return t

for src, dst in (('Code.template.gs', 'Code.gs'), ('umpire.template.html', 'umpire.html'),
                 ('referee.template.html', 'referee.html'), ('player.template.html', 'player.html')):
    open(os.path.join(out, dst), 'w', encoding='utf-8').write(fill(rd(src)))
    print('built', dst)
