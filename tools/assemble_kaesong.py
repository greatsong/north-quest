"""개성 특별편 데이터: brief_kaesong.json + tools/out/out_k.json + content.json(개성 일대 8곳) → shared/kaesong/kaesong.json"""
import json, sys
sys.path.insert(0, 'tools')
from assemble_content import shuffle_q
b = json.load(open('tools/brief_kaesong.json'))
w = json.load(open('tools/out/out_k.json'))
c = json.load(open('shared/data/content.json'))
ww = {s['id']: s for s in w['sites']}
# 검토 반영(Claude, 2026-11-16): 단위가 다른 오답·범주가 다른 오답 교체
ww['songak']['quizzes'][0].update({'choices': ['약 188m', '488m', '약 888m', '약 1,638m'], 'answer': 1})
w['kaesong_general'][0].update({'choices': ['송악산', '천마산', '구월산', '묘향산'], 'answer': 0})
sites = []
for s in b['sites']:
    x = ww[s['id']]
    sites.append({**{k: s[k] for k in ('id', 'name', 'region', 'lat', 'lon', 'type', 'era', 'fame', 'facts')},
                  'country': 'PRK', 'cluster': '개성 일대', 'approx': bool(s.get('approx')), 'intro': bool(s.get('intro')),
                  'summary': x['summary'], 'story': x['story'], 'unify': x['unify'],
                  'quizzes': [shuffle_q(q) for q in x['quizzes']], 'new_in_kaesong': True})
for s in c['sites']:
    if s.get('cluster') == '개성 일대': sites.append({**s, 'intro': False, 'new_in_kaesong': False})
out = {'meta': {'title': '개성 특별편', 'note': '개성 일대 기존 8곳은 content.json과 같은 글. 새 6곳은 brief_kaesong.json 사실로 GPT-6.1 Sol 집필, Claude 대조.'},
       'sites': sites, 'general': [shuffle_q(q) for q in w['kaesong_general']]}
json.dump(out, open('shared/kaesong/kaesong.json', 'w'), ensure_ascii=False, indent=1)
print(len(sites), 'sites', sum(len(s['quizzes']) for s in sites), 'quizzes', len(out['general']), 'general')
