# Data pipeline

`build_tree.py` builds `data/tree.json` and `data/tree.js` (the same data wrapped as
`window.BG_TREE = …` so the pages can load it straight from disk). It uses the Python
standard library only.

```sh
python3 pipeline/build_tree.py              # ~1,000 species with photos, about 30 minutes
python3 pipeline/build_tree.py --scale 0.05 --skip-photos   # quick test, ~75 species
```

Every HTTP response is cached in `pipeline/cache/`, so a rerun only fetches what changed.
Delete the cache to refresh everything.

## Sources

| Step | Source | Notes |
|---|---|---|
| Species pool | iNaturalist `observations/species_counts` | Per group (quotas in `GROUPS`): research grade, CC0 / CC-BY / CC-BY-NC photos, annotated as showing the organism, at most 2 per genus. Picked in turns across orders, then families, so big lineages don't crowd out the rest. |
| Anchors | `ANCHORS` list | Species on the early branches of big groups (bichir, gar, platypus, silverfish…), so clades span their real crown. |
| Name matching | Open Tree `tnrs/match_names` | Also gives the NCBI id used for dating. |
| Topology | Open Tree `tree_of_life/induced_subtree` (CC0) | Single-child nodes are collapsed; the narrower names are kept as `al` (aliases). |
| Clade names | iNaturalist taxonomy, then Wikidata (P9157 → P1843) | A clade takes the iNaturalist name covering exactly the same sampled species (standard ranks preferred). Clades with no formal name get a label from their two largest subgroups (`lb`, `lc`). Wikidata is skipped if it is unavailable. |
| Curated topology | `CURATED_TOPOLOGY` | Where the synthesis follows a minority result, named groups are regrouped by hand (Laurasiatheria: bats outside Ferae + Euungulata, after Upham et al. 2019 and Foley et al. 2023). Skipped if the groups don't cover the clade. |
| Species totals | Open Tree `tree_of_life/node_info` | `num_tips` of the clade in the full synthetic tree, i.e. all species, not just the sampled ones. |
| Dates | TimeTree `api/taxon/{name}`, then `api/pairwise/{ncbi}/{ncbi}` | Named clades use the median of the published crown-age estimates TimeTree lists. Other splits use the pairwise time between one species on each side. Splits with no data, or whose date conflicts with the topology, are interpolated (`est: 1`). |
| Extinct species | `EXTINCT` list, Paleobiology Database, Wikipedia / Wikimedia Commons | Famous extinct animals whose first appearance is in the Mesozoic or later. Time ranges from PBDB; pictures are the lead image of the species' Wikipedia article, kept only with a CC0, public-domain, CC-BY or CC-BY-SA license. Placed by hand (`FOSSIL_IN`, `FOSSIL_STEM`) because Open Tree places many fossils badly. A fossil's branch ends at its last appearance; the split it joins is at least as old as its first appearance (or its extinct genus's or family's). Fossil clade ages come from `FOSSIL_CLADE_AGE`. The tree is also dated without fossils (`a0`) for when the page hides them. |
| Photos | iNaturalist observations | Up to 3 per species from different observations, each with its license, attribution and observation link. |

## Output format

```
{ meta: {...}, tree: node }
node = { n: name|null, a: age in Mya, ott, al: [aliases], c: common name,
         est: 1 if the age is interpolated,
         t: total species in the clade, lb / lc: descriptive label when there is no name,
         a0: the clade's age when extinct species are hidden (only where it differs),
         x: [first, last appearance in Mya] for extinct species,
         gr: [[name, common, total], ...] named groups a species is the only sampled member of, broadest first,
         k: [children]                        // clades only
         inat, obs, ph: [{u, a, l, o}] }      // species only: photo url, attribution, license, observation
```

Photos are licensed by their authors. Keep the attribution next to any photo you show, and
drop CC-BY-NC photos (`LICENSES`) if the game ever becomes commercial.
