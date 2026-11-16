"""brief_sites.json(사실·좌표) + tools/out/out_*.json(GPT 솔 집필) → shared/data/content.json"""
import json, random, hashlib

def shuffle_q(q):
    """선지 순서를 문제 문장 기반 고정 씨앗으로 섞는다(정답 위치 규칙성 제거, 다시 실행해도 같은 결과)."""
    rng = random.Random(int(hashlib.md5(q['q'].encode()).hexdigest()[:8], 16))
    order = list(range(4)); rng.shuffle(order)
    q = dict(q); ans = q['choices'][q['answer']]
    q['choices'] = [q['choices'][i] for i in order]; q['answer'] = q['choices'].index(ans)
    return q
brief = json.load(open('tools/brief_sites.json'))
written = {}
for k in '0123':
    for s in json.load(open(f'tools/out/out_{k}.json'))['sites']: written[s['id']] = s
general = json.load(open('tools/out/out_g.json'))['general']
CLUSTER = {
    '개성 일대': ['manwoldae', 'seonjuk', 'seonggyun', 'wanggeon', 'gongmin', 'bakyeon', 'kaesong_ic', 'panmunjom'],
    '평양 일대': ['pyongyang', 'anhak'],
    '신의주 일대': ['yalu', 'wihwado', 'uiju'],
    '금강산 일대': ['kumgang', 'singye'],
    '함흥 일대': ['hamhung', 'hungnam'],
}
cl = {i: c for c, ids in CLUSTER.items() for i in ids}
sites = []
for b in brief['sites']:
    w = written[b['id']]
    sites.append({
        'id': b['id'], 'name': b['name'], 'region': b['region'], 'lat': b['lat'], 'lon': b['lon'],
        'country': b.get('country', 'PRK'), 'type': b['type'], 'era': b['era'], 'fame': b['fame'],
        'cluster': cl.get(b['id']), 'approx': bool(b.get('approx')), 'facts': b['facts'],
        'summary': w['summary'], 'story': w['story'], 'unify': w['unify'], 'quizzes': [shuffle_q(q) for q in w['quizzes']],
    })
ids = {s['id'] for s in sites}
general = [shuffle_q(g) for g in general]
for g in general: g['related'] = [r for r in g.get('related', []) if r in ids]
content = {
    'meta': {
        'title': '북녘 탐험대', 'title_en': 'North Quest',
        'eras': ['고조선', '고구려', '발해', '신라', '고려', '조선', '근대', '현대', '자연'],
        'levels': {'1': '기초', '2': '보통', '3': '도전'},
        'credits': '사실 설계·검증: Claude / 설명글·문제 집필: GPT-6.1 Sol / 교사 검토 전 초안',
        'general_facts': brief['general_facts'],
    },
    'sites': sites, 'general': general,
}
json.dump(content, open('shared/data/content.json', 'w'), ensure_ascii=False, indent=1)
print(len(sites), 'sites', sum(len(s['quizzes']) for s in sites), 'site quizzes', len(general), 'general')
