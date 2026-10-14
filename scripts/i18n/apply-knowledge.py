"""Merge scripts/i18n/<file>.json ({key: {en, fr, es}}) into the Knowledge Layer catalogs src/knowledge/i18n/{en,fr,es}.ts (idempotent)."""
import json, re, sys
d = json.load(open(sys.argv[1]))
for lang in ["en", "fr", "es"]:
    p = f"src/knowledge/i18n/{lang}.ts"
    s = open(p).read()
    add = []
    for k, v in d.items():
        val = json.dumps(v[lang], ensure_ascii=False)
        pat = re.compile(r'^(\s*)"%s": .*,$' % re.escape(k), re.M)
        if pat.search(s):
            s = pat.sub(lambda m: f'{m.group(1)}"{k}": {val},', s, count=1)
        else:
            add.append(f'  "{k}": {val},\n')
    end = s.rfind("};")
    s = s[:end] + "".join(add) + s[end:]
    open(p, "w").write(s)
    print(lang, "added", len(add))
