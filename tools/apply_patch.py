"""검증 보고서에서 채택한 수정(patch_*.json)을 원본(brief_sites.json, tools/out/out_*.json)에 반영한다.
old 문자열이 없으면 멈춘다(이미 반영됐거나 원문이 다르면 확인 필요)."""
import json, sys
patch = json.load(open(sys.argv[1]))
brief = json.load(open('tools/brief_sites.json'))
outs = {k: json.load(open(f'tools/out/out_{k}.json')) for k in '0123'}
gen = json.load(open('tools/out/out_g.json'))
site_w = {s['id']: s for o in outs.values() for s in o['sites']}
site_b = {s['id']: s for s in brief['sites']}
log = []
for f in patch.get('facts', []):
    site_b[f['id']]['facts'][f['idx']] = f['text']; log.append(f"facts {f['id']}[{f['idx']}]")
for f in patch.get('general_facts', []):
    brief['general_facts'][f['idx']] = f['text']; log.append(f"general_facts[{f['idx']}]")
for r in patch.get('replace', []):
    s = site_w[r['id']]; cur = s[r['field']] or ''
    if r['old'] not in cur: sys.exit(f"NOT FOUND {r['id']}.{r['field']}: {r['old']}")
    s[r['field']] = cur.replace(r['old'], r['new']); log.append(f"{r['id']}.{r['field']}")
for q in patch.get('quiz', []):
    tgt = site_w[q['id']]['quizzes'][q['idx']]
    tgt.update(q['set']); log.append(f"quiz {q['id']}[{q['idx']}] {list(q['set'])}")
for q in patch.get('general', []):
    gen['general'][q['idx']].update(q['set']); log.append(f"general[{q['idx']}] {list(q['set'])}")
for i in patch.get('general_delete', []): pass
json.dump(brief, open('tools/brief_sites.json', 'w'), ensure_ascii=False, indent=2)
for k, o in outs.items(): json.dump(o, open(f'tools/out/out_{k}.json', 'w'), ensure_ascii=False, indent=1)
json.dump(gen, open('tools/out/out_g.json', 'w'), ensure_ascii=False, indent=1)
print(len(log), 'changes'); print('\n'.join(log))
