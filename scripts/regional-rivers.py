#!/usr/bin/env python3
"""Add regional rivers to public/nature.json, and tidy odd river names.

The globe's rivers come from Natural Earth's 1:50m river set (ranks 1-6). Many well-known
regional rivers - the Cauvery, the Tungabhadra, ... - only exist in the 1:10m set, ranked 7-8.
This adds those (as a fourth tier the app shows only when zoomed in to a region), skipping any
river already on the map, joining each river's pieces and simplifying the lines to keep the
file small. It also fixes names that came through garbled ("Godävari" -> "Godavari").

Usage (re-runnable - previously added regional rivers are replaced):
  curl -sLo /tmp/rivers_10m.geojson \
    https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_10m_rivers_lake_centerlines.geojson
  python3 scripts/regional-rivers.py /tmp/rivers_10m.geojson
"""
import json
import math
import sys
import unicodedata
from pathlib import Path

NATURE = Path(__file__).resolve().parent.parent / 'public' / 'nature.json'
RANKS = (7, 8)  # Natural Earth scalerank of the regional rivers we add
SIMPLIFY = 0.03  # degrees (~1.3 km) - plenty for a line seen zoomed in to a region
JOIN = 0.03  # pieces whose ends are this close (degrees) are one continuous reach

# Names that come through garbled in Natural Earth, and what people actually call them.
RENAME = {
    'Godävari': 'Godavari',
    'Mahäna Nadï': 'Mahanadi',
    'Mahanadï': 'Mahanadi',
}


def clean_name(n: str) -> str:
    n = ' '.join(n.split())  # "São  Francisco" -> "São Francisco"
    return RENAME.get(n, n)


def key(n: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', n) if unicodedata.category(c) != 'Mn').lower()


def r2(p):
    return [round(p[0], 2), round(p[1], 2)]


def simplify(pts, tol):
    """Douglas-Peucker on a lng/lat polyline."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def deg_len(line):
    return sum(math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]) for i in range(1, len(line)))


def km_len(line):
    tot = 0.0
    for i in range(1, len(line)):
        (x1, y1), (x2, y2) = line[i - 1], line[i]
        p1, p2 = math.radians(y1), math.radians(y2)
        dp, dl = p2 - p1, math.radians(x2 - x1)
        h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        tot += 2 * 6371 * math.asin(min(1, math.sqrt(h)))
    return tot


def close(a, b):
    return abs(a[0] - b[0]) <= JOIN and abs(a[1] - b[1]) <= JOIN


def stitch(parts):
    """Join pieces end to end into the longest continuous reaches."""
    parts = [p[:] for p in parts if len(p) >= 2]
    merged = True
    while merged:
        merged = False
        for i in range(len(parts)):
            for j in range(len(parts)):
                if i == j:
                    continue
                a, b = parts[i], parts[j]
                if close(a[-1], b[0]):
                    parts[i] = a + b[1:]
                elif close(a[-1], b[-1]):
                    parts[i] = a + b[::-1][1:]
                elif close(a[0], b[-1]):
                    parts[i] = b + a[1:]
                elif close(a[0], b[0]):
                    parts[i] = b[::-1] + a[1:]
                else:
                    continue
                del parts[j]
                merged = True
                break
            if merged:
                break
    return parts


def point_along(line, d):
    """The point `d` degrees along a polyline (clamped to its ends)."""
    for i in range(1, len(line)):
        seg = math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
        if d <= seg and seg > 0:
            t = d / seg
            return [round(line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), 2), round(line[i - 1][1] + t * (line[i][1] - line[i - 1][1]), 2)]
        d -= seg
    return r2(line[-1])


def label_spots(line):
    """Candidate label anchors along the main reach: [anchor, a point a little further along]."""
    L = deg_len(line)
    step = min(0.6, L * 0.25)
    return [[point_along(line, L * f), point_along(line, L * f + step)] for f in (0.5, 0.3, 0.7)]


def bbox(parts):
    xs = [p[0] for part in parts for p in part]
    ys = [p[1] for part in parts for p in part]
    return [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)]


def overlaps(a, b, pad=0.5):
    return not (a[2] + pad < b[0] or b[2] + pad < a[0] or a[3] + pad < b[1] or b[3] + pad < a[1])


def main(src):
    nature = json.loads(NATURE.read_text())
    rivers = [r for r in nature['rivers'] if r.get('r', 0) < min(RANKS)]  # drop a previous run's additions
    # 1. Tidy names on the existing rivers.
    renamed = 0
    for r in rivers:
        n = clean_name(r['n'])
        if n != r['n']:
            r['n'] = n
            r['id'] = clean_name(r['id'].split('#')[0]) + ('#' + r['id'].split('#')[1] if '#' in r['id'] else '')
            renamed += 1

    # 2. Gather the regional rivers, by name, in geographic clusters (same name, different rivers).
    feats = json.loads(Path(src).read_text())['features']
    groups = []  # [name, [lines], bbox]
    for f in feats:
        p = f['properties']
        rank = int(p.get('scalerank') or 0)
        name = clean_name((p.get('name_en') or p.get('name') or '').strip())
        if rank not in RANKS or not name or f['geometry'] is None:
            continue
        g = f['geometry']
        lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        lines = [[r2(pt) for pt in ln] for ln in lines if len(ln) >= 2]
        if not lines:
            continue
        bb = bbox(lines)
        for grp in groups:
            if key(grp[0]) == key(name) and overlaps(grp[2], bb, 1.0):
                grp[1] += lines
                grp[2] = bbox(grp[1])
                break
        else:
            groups.append([name, lines, bb, rank])

    # 3. Skip rivers already on the map (same name, same area).
    have = [(key(r['n']), r['bb']) for r in rivers]
    taken = {r['id'] for r in rivers}
    added = []
    for name, lines, bb, rank in groups:
        if any(k == key(name) and overlaps(b, bb) for k, b in have):
            continue
        parts = stitch(lines)
        parts = [simplify(p, SIMPLIFY) for p in parts]
        parts = [[pt for i, pt in enumerate(p) if i == 0 or pt != p[i - 1]] for p in parts]
        parts = [p for p in parts if len(p) >= 2 and deg_len(p) >= 0.05]
        if not parts:
            continue
        main_reach = max(parts, key=deg_len)
        rid, k = name, 2
        while rid in taken:
            rid, k = f'{name}#{k}', k + 1
        taken.add(rid)
        added.append({
            'id': rid, 'n': name, 'r': rank,
            'len': round(deg_len(main_reach), 1),
            'km': round(sum(km_len(p) for p in parts)),
            'as': label_spots(main_reach),
            'c': parts,
            'bb': bbox(parts),
        })

    nature['rivers'] = rivers + sorted(added, key=lambda r: (r['r'], -r['km']))
    NATURE.write_text(json.dumps(nature, ensure_ascii=False, separators=(',', ':')))
    print(f'renamed {renamed}; added {len(added)} regional rivers; now {len(nature["rivers"])} rivers')
    for want in ('Cauvery', 'Tungabhadra', 'Godavari', 'Mahanadi'):
        hit = [r for r in nature['rivers'] if r['n'] == want]
        print(f'  {want}: ' + (', '.join(f"rank {r['r']}, {r['km']} km" for r in hit) if hit else 'not found'))


if __name__ == '__main__':
    main(sys.argv[1])
