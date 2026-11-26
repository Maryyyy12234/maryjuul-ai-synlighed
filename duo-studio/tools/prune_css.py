"""Fjerner CSS-regler i index.html, hvis selektorer peger på klasser/id'er, som ingen HTML/JS bruger.
Brug: python3 tools/prune_css.py index.html [--write]"""
import re, sys
path = sys.argv[1]; src = open(path).read()
a = src.index('<style>') + 7; b = src.index('</style>')
css, rest = src[a:b], src[:a] + src[b:]
tokens = set(re.findall(r'[A-Za-z_][\w-]*', rest))
DYN = ('tp-', 'tab-', 'h-', 'd-', 'look-', 'del-')
def used_sel(sel):
    for name in re.findall(r'[.#](-?[A-Za-z_][\w-]*)', re.sub(r'\[[^\]]*\]|url\([^)]*\)', '', sel)):
        if name in tokens or name.startswith(DYN): continue
        return False
    return True
removed = []
def walk(block):
    out, i, n = [], 0, len(block)
    while i < n:
        j = block.find('{', i)
        if j < 0: out.append(block[i:]); break
        # comments/whitespace before selector stay
        head = block[i:j]; depth, k = 1, j + 1
        while depth and k < n:
            if block[k] == '{': depth += 1
            elif block[k] == '}': depth -= 1
            k += 1
        body = block[j + 1:k - 1]
        pre = head[:len(head) - len(head.lstrip())] if not head.strip().startswith('/*') else ''
        # split leading comments from selector
        m = re.match(r'(\s*(?:/\*.*?\*/\s*)*)(.*)$', head, re.S); lead, sel = m.group(1), m.group(2)
        if sel.strip().startswith('@'):
            if sel.strip().startswith(('@media', '@supports')):
                inner = walk(body)
                if inner.strip(): out.append(lead + sel + '{' + inner + '}')
                else: removed.append(sel.strip()[:60])
            else: out.append(head + '{' + body + '}')
        else:
            sels = [s for s in sel.split(',')]
            keep = [s for s in sels if used_sel(s)]
            if keep: out.append(lead + ','.join(keep).rstrip() + ('' if keep[-1].endswith(('\n', ' ')) else '') + '{' + body + '}')
            else: out.append(lead); removed.append(sel.strip()[:70])
        i = k
    return ''.join(out)
new = walk(css)
print('regler fjernet:', len(removed), '| CSS-tegn før/efter:', len(css), len(new))
for r in removed[:400]: print('  -', r.replace('\n', ' '))
if '--write' in sys.argv: open(path, 'w').write(src[:a] + new + src[b:])
