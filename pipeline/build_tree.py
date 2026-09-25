#!/usr/bin/env python3
"""Build the BioGuessing tree from open data.

Stages (every HTTP response is cached in pipeline/cache, so reruns are cheap):
  1. Species pool   iNaturalist: the most-observed species in each animal group that have
                    research-grade observations with CC0 / CC-BY / CC-BY-NC photos.
  2. Matching       Open Tree of Life TNRS: scientific name -> OTT id (+ NCBI id).
  3. Topology       Open Tree induced_subtree for those OTT ids; single-child nodes collapsed.
  4. Clade names    Wikidata: English common names for named clades, via OTT id (P9157).
  5. Dates          TimeTree pairwise API: divergence time between one species on each side
                    of every split; undated nodes spaced evenly between dated ones (BLADJ-style).
  6. Photos         iNaturalist: up to 3 openly licensed photos per species, with attribution.
  7. Output         data/tree.json and data/tree.js (window.BG_TREE = ...), loadable from file://.

Usage:  python3 pipeline/build_tree.py [--scale 1.0] [--photos 3] [--skip-photos]
Standard library only.
"""
import argparse
import csv
from http.client import HTTPException
import hashlib
import io
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache" / "http"
OUT_DIR = HERE.parent / "data"
USER_AGENT = "BioGuessing-pipeline/0.1 (educational tree-of-life game prototype)"
LICENSES = "cc0,cc-by,cc-by-nc"

# (iNaturalist group name or alternatives, number of species). Roughly 1,000 in total.
GROUPS = [
    (["Aves"], 150), (["Mammalia"], 110), (["Reptilia"], 60), (["Amphibia"], 50),
    (["Actinopterygii"], 80), (["Elasmobranchii"], 25), (["Holocephali"], 2),
    (["Petromyzontiformes", "Petromyzonti"], 2), (["Myxini"], 1),
    (["Dipnoi", "Ceratodontiformes"], 2), (["Latimeria", "Coelacanthiformes"], 1),
    (["Leptocardii", "Cephalochordata"], 1), (["Tunicata"], 5),
    (["Coleoptera"], 50), (["Lepidoptera"], 70), (["Hymenoptera"], 40), (["Diptera"], 30),
    (["Hemiptera"], 30), (["Odonata"], 25), (["Orthoptera"], 20), (["Mantodea"], 6),
    (["Blattodea"], 8), (["Neuroptera"], 6), (["Ephemeroptera"], 4), (["Trichoptera"], 4),
    (["Phasmida"], 4), (["Dermaptera"], 3), (["Plecoptera"], 2), (["Collembola"], 3),
    (["Arachnida"], 45), (["Xiphosura", "Merostomata"], 2), (["Myriapoda"], 12),
    (["Malacostraca"], 35), (["Thecostraca", "Cirripedia"], 5), (["Branchiopoda"], 3),
    (["Onychophora"], 2),
    (["Gastropoda"], 40), (["Bivalvia"], 15), (["Cephalopoda"], 12), (["Polyplacophora"], 3),
    (["Echinodermata"], 22), (["Cnidaria"], 25), (["Ctenophora"], 3), (["Porifera"], 6),
    (["Annelida"], 10), (["Platyhelminthes"], 6), (["Nemertea"], 2), (["Bryozoa"], 2),
    (["Brachiopoda"], 1),
]
# Only count observations annotated "Evidence of Presence: Organism", so species known
# mostly from galls, leaf mines or tracks don't make it into a photo game.
EVIDENCE_ORGANISM = {"term_id": 22, "term_value_id": 24}
MAX_PER_GENUS = 2

# Species on the early branches of big groups. The most-observed species rarely include them,
# and without them a clade's age is only that of the lineages that happened to be sampled
# (e.g. ray-finned fish would be dated as teleosts, ~250 My instead of ~380 My).
# Alternatives are tried in order; anchors iNaturalist cannot find are skipped.
ANCHORS = [
    # ray-finned fishes: bichirs, sturgeons, paddlefish, gars, bowfin, bonytongues, tarpons
    ["Polypterus senegalus", "Polypterus bichir"], ["Acipenser oxyrinchus", "Acipenser sturio", "Acipenser transmontanus"],
    ["Polyodon spathula"], ["Lepisosteus osseus"], ["Amia calva", "Amia ocellicauda"],
    ["Osteoglossum bicirrhosum"], ["Elops saurus", "Megalops atlanticus"],
    # other fishes
    ["Callorhinchus milii", "Hydrolagus colliei"], ["Latimeria chalumnae"], ["Neoceratodus forsteri", "Protopterus annectens"],
    # amphibians: caecilians, tailed frogs, giant salamanders, sirens
    ["Dermophis mexicanus", "Typhlonectes natans"], ["Ascaphus truei"], ["Cryptobranchus alleganiensis"], ["Siren lacertina"],
    # reptiles and birds: side-necked turtles, tuatara, gharial, ratites
    ["Chelodina longicollis", "Chelus fimbriata"], ["Sphenodon punctatus"], ["Gavialis gangeticus"],
    ["Struthio camelus"], ["Dromaius novaehollandiae"], ["Apteryx mantelli"],
    # mammals: monotremes, xenarthrans, afrotheres, strepsirrhines, tarsiers
    ["Ornithorhynchus anatinus"], ["Tachyglossus aculeatus"], ["Dasypus novemcinctus"],
    ["Loxodonta africana"], ["Orycteropus afer"], ["Lemur catta"], ["Carlito syrichta", "Tarsius tarsier"],
    # insects: silverfish, bristletails, sawflies, primitive moths, aphids
    ["Lepisma saccharinum", "Ctenolepisma longicaudatum"], ["Petrobius brevistylis", "Petrobius maritimus"],
    ["Cimbex americana", "Tenthredo scrophulariae"], ["Micropterix calthella", "Micropterix aureatella"], ["Aphis nerii"],
    # arachnids and other arthropods
    ["Liphistius malayanus", "Liphistius"], ["Aphonopelma hentzi"], ["Limulus polyphemus"],
    ["Odontodactylus scyllarus"], ["Scutigera coleoptrata"],
    # molluscs, echinoderms, sponges
    ["Nautilus pompilius"], ["Patella vulgata", "Lottia gigantea"], ["Antalis entalis", "Antalis vulgaris"],
    ["Florometra serratissima", "Antedon bifida"], ["Euplectella aspergillum"], ["Clathrina clathrus", "Leucosolenia"],
]

MIN_INTERVAL = {  # seconds between requests, per host
    "api.inaturalist.org": 1.05,
    "api.opentreeoflife.org": 0.2,
    "timetree.org": 0.35,
    "query.wikidata.org": 61.0,  # currently limited to 1 request per minute
}
_last_call = {}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- HTTP with cache

def cache_path(url, params=None, body=None):
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    data = json.dumps(body) if body is not None else ""
    key = hashlib.sha1((url + "\n" + data).encode()).hexdigest()
    return CACHE / key[:2] / (key + ".json")


def is_cached(url, params=None, body=None):
    return cache_path(url, params, body).exists()


def http(url, *, params=None, body=None, accept="application/json", raw=False, allow_status=()):
    """GET (or POST JSON when body is given). Successful responses are cached on disk."""
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    key = hashlib.sha1((url + "\n" + (data.decode() if data else "")).encode()).hexdigest()
    path = CACHE / key[:2] / (key + ".json")
    if path.exists():
        cached = json.loads(path.read_text())
        return (cached["status"], cached["text"]) if raw else (cached["status"], json.loads(cached["text"]) if cached["text"] else None)

    host = urllib.parse.urlparse(url).hostname
    wait = MIN_INTERVAL.get(host, 0.3) - (time.time() - _last_call.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    for attempt in range(5):
        _last_call[host] = time.time()
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                status, text = r.status, r.read().decode("utf-8")
            break
        except urllib.error.HTTPError as e:
            status, text = e.code, e.read().decode("utf-8", "replace")
            if status in allow_status:
                break
            if status in (429, 500, 502, 503, 504) and attempt < 4:
                retry_after = e.headers.get("Retry-After", "")
                time.sleep(min(90, int(retry_after)) if retry_after.isdigit() else 5 * (attempt + 1))
                continue
            raise RuntimeError(f"HTTP {status} for {url}: {text[:300]}")
        except (urllib.error.URLError, HTTPException, OSError) as e:
            if attempt < 4:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"Network error for {url}: {e}")
    if status == 200 or status in allow_status:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"status": status, "text": text}))
    if raw:
        return status, text
    try:
        return status, json.loads(text) if text else None
    except json.JSONDecodeError:
        return status, None


# ---------------------------------------------------------------- 1. species pool

def inat_group_id(names):
    for name in names:
        _, d = http("https://api.inaturalist.org/v1/taxa", params={"q": name, "is_active": "true", "per_page": 30})
        exact = [t for t in d["results"] if t["name"].lower() == name.lower() and t.get("rank") != "species"]
        if exact:
            best = max(exact, key=lambda t: t.get("observations_count", 0))
            return best["id"], best["name"]
    return None, None


def species_pool(scale):
    """Per group: take the most-observed candidates, then pick round-robin across orders
    (families where a group has no orders) so no single lineage crowds out the rest."""
    candidates = []
    for names, quota in GROUPS:
        n = max(1, round(quota * scale))
        gid, gname = inat_group_id(names)
        if not gid:
            log(f"  ! no iNaturalist taxon for {names}")
            continue
        cands, per_genus, page, want = [], {}, 1, min(800, 5 * n)
        while len(cands) < want and page <= 4:
            _, d = http("https://api.inaturalist.org/v1/observations/species_counts", params={
                "taxon_id": gid, "quality_grade": "research", "photo_license": LICENSES,
                "per_page": 200, "page": page, **EVIDENCE_ORGANISM})
            results = d.get("results", [])
            for r in results:
                t = r["taxon"]
                if t.get("rank") != "species" or t.get("extinct"):
                    continue
                g = t.get("parent_id")
                if per_genus.get(g, 0) >= MAX_PER_GENUS:
                    continue
                per_genus[g] = per_genus.get(g, 0) + 1
                ph = t.get("default_photo") or {}
                cands.append({
                    "inat": t["id"], "name": t["name"],
                    "common": t.get("preferred_common_name"),
                    "obs": r["count"], "group": gname, "anc": t.get("ancestor_ids", []),
                    "wiki": t.get("wikipedia_url"),
                    "default_photo": {
                        "u": ph.get("medium_url") or (ph.get("url") or "").replace("/square.", "/medium."),
                        "a": ph.get("attribution", ""), "l": ph.get("license_code"),
                        "o": f"https://www.inaturalist.org/photos/{ph.get('id')}",
                    } if ph.get("license_code") in LICENSES.split(",") else None,
                })
            if len(results) < 200:
                break
            page += 1
        candidates.append((gname, n, cands))

    taxa = inat_taxa({a for _, _, cands in candidates for c in cands for a in c["anc"]})

    def ancestor_at(c, level):
        return next((a for a in c["anc"] if taxa.get(a, {}).get("rank_level") == level), None)

    def lineage_key(c):
        return ancestor_at(c, 40) or ancestor_at(c, 30)  # order, else family

    def interleave_families(bucket):
        """Reorder one order's candidates so its families take turns (whales vs deer in Artiodactyla)."""
        fams = {}
        for c in bucket:
            fams.setdefault(ancestor_at(c, 30), []).append(c)
        queues = sorted(fams.values(), key=lambda q: -q[0]["obs"])
        out = []
        while any(queues):
            for q in queues:
                if q:
                    out.append(q.pop(0))
        return out

    pool, seen = [], set()
    for gname, n, cands in candidates:
        buckets = {}
        for c in cands:  # already sorted by observation count
            if c["inat"] not in seen:
                buckets.setdefault(lineage_key(c), []).append(c)
        order = [interleave_families(b) for b in sorted(buckets.values(), key=lambda b: -b[0]["obs"])]
        picked = []
        while len(picked) < n and any(order):
            for b in order:
                if b and len(picked) < n:
                    c = b.pop(0)
                    picked.append(c)
                    seen.add(c["inat"])
        log(f"  {gname:<18} {len(picked):>4} species from {len(order)} orders/families")
        pool.extend(picked)
    return pool


def anchor_species(pool):
    have = {sp["name"] for sp in pool}
    added = []
    for alts in ANCHORS:
        if any(a in have for a in alts):
            continue
        for name in alts:
            _, d = http("https://api.inaturalist.org/v1/taxa", params={"q": name, "rank": "species", "per_page": 30})
            t = next((t for t in d.get("results", []) if t["name"] == name), None)
            if not t:
                continue
            _, c = http("https://api.inaturalist.org/v1/observations/species_counts", params={
                "taxon_id": t["id"], "quality_grade": "research", "photo_license": LICENSES, "per_page": 1})
            if not c.get("results"):
                continue
            r = c["results"][0]
            added.append({
                "inat": t["id"], "name": t["name"], "common": t.get("preferred_common_name"),
                "obs": r["count"], "group": "anchor", "anc": r["taxon"].get("ancestor_ids", []),
                "wiki": t.get("wikipedia_url"), "default_photo": None,
            })
            have.add(name)
            break
        else:
            log(f"  ! no usable anchor among {alts}")
    log(f"  added {len(added)} anchor species on early branches")
    return added


# ---------------------------------------------------------------- 2. Open Tree matching

def match_ott(pool):
    by_name = {sp["name"]: sp for sp in pool}
    names = list(by_name)
    for i in range(0, len(names), 250):
        chunk = names[i:i + 250]
        _, d = http("https://api.opentreeoflife.org/v3/tnrs/match_names",
                    body={"names": chunk, "context_name": "Animals", "do_approximate_matching": False})
        for res in d.get("results", []):
            good = [m for m in res["matches"] if not m["taxon"].get("is_suppressed")]
            if not good:
                continue
            m = good[0]["taxon"]
            sp = by_name.get(res["name"])
            if not sp:
                continue
            sp["ott"] = m["ott_id"]
            ncbi = [s.split(":", 1)[1] for s in m.get("tax_sources", []) if s.startswith("ncbi:")]
            sp["ncbi"] = ncbi[0] if ncbi else None
    matched = [sp for sp in pool if sp.get("ott")]
    log(f"  matched {len(matched)} of {len(pool)} names to Open Tree")
    return matched


# ---------------------------------------------------------------- 3. topology

def induced_subtree(ott_ids):
    ids = list(ott_ids)
    for _ in range(10):
        status, d = http("https://api.opentreeoflife.org/v3/tree_of_life/induced_subtree",
                         body={"ott_ids": ids, "label_format": "name_and_id"}, allow_status=(400,))
        if status == 200:
            return d, set(ids)
        unknown = set()
        if isinstance(d, dict):
            for k in (d.get("unknown") or {}):
                unknown.add(int(re.sub(r"\D", "", k)))
            msg = d.get("message", "")
        else:
            msg = ""
        if not unknown:
            raise RuntimeError(f"induced_subtree failed: {str(d)[:400]}")
        log(f"  dropping {len(unknown)} ids that are not in the synthetic tree {msg[:80]}")
        ids = [i for i in ids if i not in unknown]
    raise RuntimeError("induced_subtree kept failing")


def parse_newick(s):
    """Minimal Newick parser -> nested dicts {label, children}."""
    pos = 0

    def label():
        nonlocal pos
        if s[pos] == "'":
            end = pos + 1
            out = []
            while True:
                if s[end] == "'" and end + 1 < len(s) and s[end + 1] == "'":
                    out.append("'")
                    end += 2
                elif s[end] == "'":
                    break
                else:
                    out.append(s[end])
                    end += 1
            pos = end + 1
            return "".join(out)
        start = pos
        while pos < len(s) and s[pos] not in ",();:":
            pos += 1
        return s[start:pos]

    def node():
        nonlocal pos
        children = []
        if s[pos] == "(":
            pos += 1
            while True:
                children.append(node())
                if s[pos] == ",":
                    pos += 1
                    continue
                if s[pos] == ")":
                    pos += 1
                    break
        lab = label()
        if pos < len(s) and s[pos] == ":":
            pos += 1
            while pos < len(s) and s[pos] not in ",);":
                pos += 1
        return {"label": lab, "children": children}

    return node()


LABEL_RE = re.compile(r"^(.*)_ott(\d+)$")


def build_tree(newick, species, broken):
    by_ott = {sp["ott"]: sp for sp in species}
    # broken taxa appear under an mrca label instead of their own
    mrca_to_ott = {v: int(re.sub(r"\D", "", k)) for k, v in (broken or {}).items()}
    raw = parse_newick(newick.strip().rstrip(";"))

    def convert(n):
        lab = n["label"]
        m = LABEL_RE.match(lab)
        name, ott = (m.group(1).replace("_", " "), int(m.group(2))) if m else (None, None)
        if lab in mrca_to_ott:
            ott = mrca_to_ott[lab]
        kids = [convert(c) for c in n["children"]]
        kids = [k for k in kids if k]
        if ott in by_ott and not kids:
            sp = by_ott[ott]
            return {"name": sp["name"], "ott": ott, "sp": sp, "children": []}
        if not kids:
            return None  # a tip that is not one of our species
        node_id = lab if lab.startswith("mrca") else f"ott{ott}"
        return {"name": name, "ott": ott, "children": kids, "node_id": node_id,
                "ids": {name: node_id} if name else {}}

    tree = convert(raw)

    def collapse(n):
        n["children"] = [collapse(c) for c in n["children"]]
        while len(n["children"]) == 1:
            only = n["children"][0]
            # keep the broader name (the outer node); remember the narrower one as an alias
            aliases = n.get("aliases", []) + ([only["name"]] if only["name"] and n["name"] else []) + only.get("aliases", [])
            if only.get("sp"):
                # a species under a single-species genus etc.: the species survives
                only["aliases"] = ([n["name"]] if n["name"] else []) + only.get("aliases", []) + n.get("aliases", [])
                return only
            merged = {
                "name": n["name"] or only["name"],
                "ott": n["ott"] if n["name"] else only["ott"],
                "children": only["children"],
                "aliases": [a for a in aliases if a and a != (n["name"] or only["name"])],
                "node_id": n["node_id"] if n["name"] else only["node_id"],
                "ids": {**only.get("ids", {}), **n.get("ids", {})},
            }
            n = merged
        return n

    tree = collapse(tree)
    placed = set()

    def walk(n):
        if n.get("sp"):
            placed.add(n["ott"])
        for c in n["children"]:
            walk(c)
    walk(tree)
    log(f"  tree has {len(placed)} species tips")
    return tree


def iter_nodes(n):
    yield n
    for c in n["children"]:
        yield from iter_nodes(c)


# ---------------------------------------------------------------- 4. clade common names

def inat_taxa(ids):
    """iNaturalist taxa by id: id -> {name, common, rank_level}."""
    ids = sorted(ids)
    taxa = {}
    for i in range(0, len(ids), 30):
        chunk = ",".join(map(str, ids[i:i + 30]))
        _, d = http(f"https://api.inaturalist.org/v1/taxa/{chunk}", params={"per_page": 30})
        for t in d.get("results", []):
            taxa[t["id"]] = {"name": t["name"], "common": t.get("preferred_common_name"),
                             "rank_level": t.get("rank_level") or 0}
    return taxa


PROPER_WORDS = {"new", "old", "world", "american", "african", "asian", "european", "australian",
                "indian", "pacific", "atlantic"}


def tidy_common(c):
    """iNaturalist title-cases group names ("Ants, Bees, Wasps, and Sawflies"); use sentence case."""
    words = c.split(" ")
    return " ".join(w if w.lower().strip(",") in PROPER_WORDS else w.lower() for w in words)


CLASSIC_RANKS = {60, 50, 40, 30, 20}  # phylum, class, order, family, genus


def clade_names(tree, species):
    """Name clades from iNaturalist's taxonomy where it contains exactly the same sampled species:
    fills in nodes Open Tree left unnamed (e.g. Squamata, which it does not treat as one lineage)
    and prefers familiar ranked names over obscure ones (Primates over Primatomorpha when no
    colugos are sampled). Then adds English common names."""
    taxa = inat_taxa({a for sp in species for a in sp.get("anc", []) if a != sp["inat"]})
    in_tree = {m["sp"]["inat"] for m in iter_nodes(tree) if m.get("sp")}
    members = {}
    for sp in species:
        if sp["inat"] in in_tree:
            for a in sp.get("anc", []):
                if a != sp["inat"] and a in taxa:
                    members.setdefault(a, set()).add(sp["inat"])
    by_members = {}
    for tid, m in members.items():
        by_members.setdefault(frozenset(m), []).append(taxa[tid])
    common_by_name = {t["name"]: t["common"] for t in taxa.values() if t["common"]}

    def leafset(n):
        return frozenset(m["sp"]["inat"] for m in iter_nodes(n) if m.get("sp"))

    renamed = filled = 0
    for n in iter_nodes(tree):
        if not n["children"]:
            continue
        cands = by_members.get(leafset(n), [])
        if not cands:
            continue
        # standard ranks first, the broadest of them (Primates over Cercopithecidae);
        # otherwise the narrowest, which best describes what was sampled (Cetacea over Whippomorpha)
        best = max(cands, key=lambda t: (t["rank_level"] in CLASSIC_RANKS,
                                         t["rank_level"] if t["rank_level"] in CLASSIC_RANKS else -t["rank_level"]))
        aliases = n.get("aliases", [])
        if not n["name"]:
            n["name"] = best["name"]
            filled += 1
        elif n["name"] != best["name"]:
            aliases = [n["name"]] + aliases
            n["name"] = best["name"]
            renamed += 1
        extra = [t["name"] for t in cands if t["name"] != n["name"]]
        n["aliases"] = list(dict.fromkeys(a for a in aliases + extra if a and a != n["name"]))
    # never reuse a name inside the clade that already carries it (Open Tree and iNaturalist can
    # put the same name on two nested nodes); the inner one gets a descriptive label instead
    def dedupe(n, used):
        if n["children"] and n["name"] in used:
            n["name"] = None
        inner = used | ({n["name"]} if n["name"] else set())
        for c in n["children"]:
            dedupe(c, inner)
    dedupe(tree, set())
    log(f"  iNaturalist taxonomy named {filled} unnamed clades and replaced {renamed} obscure names")

    named = [n for n in iter_nodes(tree) if n["children"] and n["name"]]
    for n in named:
        c = common_by_name.get(n["name"])
        if c and c.lower() != n["name"].lower():
            n["common"] = tidy_common(c)
    log(f"  iNaturalist common names for {sum(1 for n in named if n.get('common'))} of {len(named)} named clades")
    missing = [n for n in named if not n.get("common") and n.get("ott")]
    try:
        wikidata_names(missing)
    except RuntimeError as e:
        log(f"  ! Wikidata unavailable, skipping ({str(e)[:120]})")
    log(f"  common names for {sum(1 for n in named if n.get('common'))} of {len(named)} named clades")


def wikidata_names(named):
    otts = sorted({str(n["ott"]) for n in named})
    names = {}
    for i in range(0, len(otts), 150):
        chunk = otts[i:i + 150]
        values = " ".join(f'"{o}"' for o in chunk)
        q = f"""SELECT ?ott ?common WHERE {{
          VALUES ?ott {{ {values} }}
          ?item wdt:P9157 ?ott .
          OPTIONAL {{ ?item wdt:P1843 ?common . FILTER(LANG(?common) = "en") }}
        }}"""
        _, d = http("https://query.wikidata.org/sparql", params={"query": q, "format": "json"},
                    accept="application/sparql-results+json")
        for b in d["results"]["bindings"]:
            if "common" in b and b["ott"]["value"] not in names:
                names[b["ott"]["value"]] = b["common"]["value"]
    for n in named:
        c = names.get(str(n["ott"]))
        if c and c.lower() != n["name"].lower():
            n["common"] = tidy_common(c)


def species_totals(tree):
    """Total species in each clade from the full Open Tree synthetic tree (not just our sample)."""
    internal = [n for n in iter_nodes(tree) if n["children"]]
    for n in internal:
        n["count_id"] = n.get("ids", {}).get(n["name"]) or n.get("node_id")
    ids = sorted({n["count_id"] for n in internal if n.get("count_id")})
    tips = {}
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        status, d = http("https://api.opentreeoflife.org/v3/tree_of_life/node_info",
                         body={"node_ids": chunk}, allow_status=(400,))
        if status != 200:  # one bad id fails the batch: ask one at a time
            d = []
            for nid in chunk:
                st, one = http("https://api.opentreeoflife.org/v3/tree_of_life/node_info",
                               body={"node_id": nid}, allow_status=(400,))
                if st == 200:
                    d.append(one)
        for x in d:
            tips[x.get("node_id")] = x.get("num_tips")
    for n in internal:
        t = tips.get(n.get("count_id"))
        n["total"] = max(t or 0, size(n))
    log(f"  species totals for {sum(1 for n in internal if n.get('count_id') in tips)} of {len(internal)} clades")


def taxon_age(name):
    """Median of the published crown-age estimates TimeTree lists for a named taxon."""
    status, d = http(f"https://timetree.org/api/taxon/{urllib.parse.quote(name)}", allow_status=(400, 404, 500))
    if status != 200 or not isinstance(d, dict):
        return None
    ages = sorted(x["f_time_estimate"] for x in d.get("study_times", [])
                  if isinstance(x.get("f_time_estimate"), (int, float)) and x["f_time_estimate"] > 0)
    if len(ages) < 2:
        return None
    mid = len(ages) // 2
    return ages[mid] if len(ages) % 2 else (ages[mid - 1] + ages[mid]) / 2


def describe_unnamed(tree):
    """Clades with no formal name get a label from their two largest subgroups,
    e.g. "Strigiformes + Accipitriformes" / "owls + hawks, eagles, and kites"."""
    def head(n):  # the name that best stands for this subtree
        if n["name"]:
            return n["name"], n.get("common") or (n["sp"].get("common") if n.get("sp") else None)
        return head(max(n["children"], key=size))

    count = 0
    for n in iter_nodes(tree):
        if n["children"] and not n["name"]:
            kids = sorted(n["children"], key=size, reverse=True)
            heads = [head(k) for k in kids[:2]]
            more = f" + {len(kids) - 2} more" if len(kids) > 2 else ""
            n["label"] = " + ".join(h[0] for h in heads) + more
            if all(h[1] for h in heads):
                n["label_common"] = " + ".join(h[1] for h in heads) + more
            count += 1
    log(f"  described {count} clades that have no formal name")


# ---------------------------------------------------------------- 5. dates

def timetree_pair(a, b):
    status, text = http(f"https://timetree.org/api/pairwise/{a}/{b}", accept="text/csv", raw=True, allow_status=(400, 404, 500))
    if status != 200 or not text.strip():
        return None
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        return None
    for key in ("adjusted_age", "precomputed_age"):
        try:
            v = float(rows[0].get(key) or "nan")
            if v > 0 and math.isfinite(v):
                return v
        except ValueError:
            pass
    return None


def date_tree(tree):
    def reps(n, limit=3):
        out = []
        for m in iter_nodes(n):
            if m.get("sp") and m["sp"].get("ncbi"):
                out.append(m["sp"]["ncbi"])
                if len(out) >= limit:
                    break
        return out

    internal = [n for n in iter_nodes(tree) if n["children"]]
    dated = 0
    for i, n in enumerate(internal):
        if i % 100 == 0:
            log(f"  dating {i}/{len(internal)}")
        kids = sorted(n["children"], key=lambda c: -sum(1 for _ in iter_nodes(c)))
        age = None
        # compare one species from the two largest children; try a few representatives
        ra, rb = reps(kids[0]), reps(kids[1])
        for a in ra:
            for b in rb:
                age = timetree_pair(a, b)
                if age:
                    break
            if age:
                break
        if age:
            n["age"] = age
            n["dated"] = True
            dated += 1
    log(f"  TimeTree dated {dated} of {len(internal)} splits from species pairs")
    # named clades: use the published crown age, so the age is the whole clade's, not just our sample's
    published = 0
    for n in internal:
        if n["name"] and n is not tree:
            age = taxon_age(n["name"])
            if age:
                n["age"], n["dated"], n["published"] = age, True, True
                published += 1
    log(f"  published crown ages for {published} named clades")

    # leaves are today; make every dated node at least as old as its dated descendants
    def fix(n):
        if not n["children"]:
            n["age"], n["dated"] = 0.0, True
            return 0.0
        oldest = max(fix(c) for c in n["children"])
        if n.get("dated") and n["age"] <= oldest:
            n["age"] = oldest * 1.01 + 0.1
        return n["age"] if n.get("dated") else oldest
    fix(tree)
    if not tree.get("dated"):
        tree["age"] = max(c.get("age", 0) for c in tree["children"]) * 1.1 + 1
        tree["dated"] = True

    # a date that is not younger than its parent's comes from a conflicting topology: re-estimate it
    def demote(n, parent_age):
        # a published crown age wins over a pairwise date when they conflict
        if n.get("published"):
            pass
        elif n["children"] and n.get("dated") and n is not tree and n["age"] >= parent_age * 0.995:
            n["dated"] = False
        for c in n["children"]:
            demote(c, n["age"] if n.get("dated") else parent_age)
    demote(tree, float("inf"))
    fix(tree)

    # undated nodes: evenly spaced between the dated ancestor and the oldest dated descendant
    def anchor(n):
        if n.get("dated"):
            return n["age"], 0
        best = max((anchor(c) for c in n["children"]), key=lambda x: x[0])
        return best[0], best[1] + 1

    def fill(n, parent_age):
        if not n.get("dated"):
            d, k = anchor(n)
            n["age"] = d + (parent_age - d) * k / (k + 1)
        for c in n["children"]:
            fill(c, n["age"])
    fill(tree, tree["age"])


# ---------------------------------------------------------------- 6. photos

def fetch_photos(species, per_species):
    for i, sp in enumerate(species):
        if i % 50 == 0:
            log(f"  photos {i}/{len(species)}")
        url = "https://api.inaturalist.org/v1/observations"
        params = {"taxon_id": sp["inat"], "quality_grade": "research", "photo_license": LICENSES,
                  "photos": "true", "per_page": 10, "order_by": "votes", **EVIDENCE_ORGANISM}
        if sp.get("default_photo") and not is_cached(url, params):
            sp["photos"] = [sp["default_photo"]]  # skips a slow search; one photo instead of several
            continue
        _, d = http(url, params=params)
        if not d.get("results"):
            params = {k: v for k, v in params.items() if k not in EVIDENCE_ORGANISM}
            _, d = http(url, params=params)
        photos = []
        for o in d.get("results", []):
            for p in o.get("photos", []):
                if p.get("license_code") in LICENSES.split(","):
                    photos.append({
                        "u": p["url"].replace("/square.", "/medium."),
                        "a": p.get("attribution", ""),
                        "l": p["license_code"],
                        "o": o.get("uri"),
                    })
                    break  # one photo per observation, for variety
            if len(photos) >= per_species:
                break
        sp["photos"] = photos


# ---------------------------------------------------------------- 7. output

def compact(n):
    out = {"n": n["name"], "a": round(n.get("age", 0), 1)}
    if n.get("ott"):
        out["ott"] = n["ott"]
    if n.get("aliases"):
        out["al"] = n["aliases"]
    if n["children"]:
        if n.get("common"):
            out["c"] = n["common"]
        if not n.get("dated"):
            out["est"] = 1
        if n.get("total"):
            out["t"] = n["total"]
        if n.get("label"):
            out["lb"] = n["label"]
            if n.get("label_common"):
                out["lc"] = n["label_common"]
        out["k"] = [compact(c) for c in sorted(n["children"], key=size)]
    else:
        sp = n["sp"]
        out.update({"c": sp.get("common"), "inat": sp["inat"], "obs": sp["obs"]})
        if sp.get("photos"):
            out["ph"] = sp["photos"]
    return out


def size(n):
    return sum(1 for m in iter_nodes(n) if not m["children"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scale", type=float, default=1.0, help="multiply every group quota (1.0 is about 1,000 species)")
    ap.add_argument("--photos", type=int, default=3, help="photos per species")
    ap.add_argument("--skip-photos", action="store_true")
    args = ap.parse_args()

    log("1. species pool (iNaturalist)")
    pool = species_pool(args.scale)
    pool += anchor_species(pool)
    log("2. matching names (Open Tree)")
    species = match_ott(pool)
    log("3. topology (Open Tree induced subtree)")
    d, kept = induced_subtree(sorted({sp["ott"] for sp in species}))
    species = [sp for sp in species if sp["ott"] in kept]
    tree = build_tree(d["newick"], species, d.get("broken"))
    tree["name"] = tree["name"] or "Animalia"
    log("4. clade names (iNaturalist, Wikidata)")
    clade_names(tree, species)
    describe_unnamed(tree)
    species_totals(tree)
    log("5. dates (TimeTree)")
    date_tree(tree)
    in_tree = {m["sp"]["inat"]: m["sp"] for m in iter_nodes(tree) if m.get("sp")}
    if not args.skip_photos:
        log("6. photos (iNaturalist)")
        fetch_photos(list(in_tree.values()), args.photos)

    log("7. writing output")
    OUT_DIR.mkdir(exist_ok=True)
    data = {
        "meta": {
            "built": time.strftime("%Y-%m-%d"),
            "species": len(in_tree),
            "sources": {
                "topology": "Open Tree of Life synthetic tree (CC0), induced subtree",
                "dates": "TimeTree pairwise estimates; nodes marked est=1 are interpolated",
                "names": "iNaturalist (species), Wikidata (clades)",
                "photos": "iNaturalist observations; each photo keeps its own license and attribution",
            },
        },
        "tree": compact(tree),
    }
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (OUT_DIR / "tree.json").write_text(text)
    (OUT_DIR / "tree.js").write_text("window.BG_TREE = " + text + ";\n")
    nodes = list(iter_nodes(tree))
    log(f"done: {len(in_tree)} species, {sum(1 for n in nodes if n['children'])} clades, "
        f"{sum(1 for n in nodes if n['children'] and n['name'])} named, "
        f"root age {tree['age']:.0f} Mya, {len(text) // 1024} KB")


if __name__ == "__main__":
    main()
