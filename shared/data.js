// Tree data and helpers for BioGuessing.
// Internal nodes: N(name, common name, crown age in Mya, children). Leaves: L(name, common name, ~species).
(function () {
  const N = (name, common, age, children) => ({ name, common, age, children });
  const L = (name, common, species) => ({ name, common, species });

  const TREE = N("Animalia", "animals", 700, [
    L("Porifera", "sponges", 9000),
    L("Cnidaria", "jellyfish, corals", 11000),
    N("Bilateria", "bilaterians", 600, [
      N("Protostomia", "protostomes", 580, [
        N("Ecdysozoa", "moulting animals", 560, [
          L("Nematoda", "roundworms", 25000),
          N("Arthropoda", "arthropods", 540, [
            N("Chelicerata", "chelicerates", 500, [
              L("Arachnida", "spiders, scorpions", 110000),
              L("Xiphosura", "horseshoe crabs", 4),
            ]),
            L("Myriapoda", "centipedes, millipedes", 16000),
            N("Pancrustacea", "crustaceans & insects", 510, [
              L("Malacostraca", "crabs, shrimp, woodlice", 40000),
              L("Branchiopoda", "water fleas", 1200),
              N("Insecta", "insects", 480, [
                L("Odonata", "dragonflies", 6000),
                L("Orthoptera", "grasshoppers, crickets", 29000),
                L("Hemiptera", "true bugs", 80000),
                N("Holometabola", "complete metamorphosis", 350, [
                  L("Hymenoptera", "bees, wasps, ants", 150000),
                  L("Coleoptera", "beetles", 400000),
                  L("Lepidoptera", "butterflies, moths", 180000),
                  L("Diptera", "flies, mosquitoes", 150000),
                ]),
              ]),
            ]),
          ]),
        ]),
        N("Spiralia", "spiralians", 570, [
          N("Mollusca", "molluscs", 540, [
            L("Gastropoda", "snails, slugs", 65000),
            L("Bivalvia", "clams, mussels", 9000),
            L("Cephalopoda", "octopuses, squid", 800),
          ]),
          L("Annelida", "segmented worms", 22000),
          L("Platyhelminthes", "flatworms", 29000),
        ]),
      ]),
      N("Deuterostomia", "deuterostomes", 580, [
        N("Echinodermata", "echinoderms", 480, [
          L("Asteroidea", "sea stars", 1900),
          L("Echinoidea", "sea urchins", 950),
        ]),
        N("Chordata", "chordates", 550, [
          L("Tunicata", "sea squirts", 3000),
          N("Vertebrata", "vertebrates", 500, [
            L("Cyclostomata", "lampreys, hagfish", 120),
            N("Gnathostomata", "jawed vertebrates", 465, [
              L("Chondrichthyes", "sharks, rays", 1200),
              N("Osteichthyes", "bony vertebrates", 435, [
                L("Actinopterygii", "ray-finned fish", 32000),
                N("Sarcopterygii", "lobe-finned vertebrates", 415, [
                  L("Actinistia", "coelacanths", 2),
                  N("Rhipidistia", "lungfish & tetrapods", 400, [
                    L("Dipnoi", "lungfish", 6),
                    N("Tetrapoda", "tetrapods", 352, [
                      N("Amphibia", "amphibians", 300, [
                        L("Anura", "frogs, toads", 7600),
                        L("Caudata", "salamanders, newts", 800),
                      ]),
                      N("Amniota", "amniotes", 312, [
                        N("Mammalia", "mammals", 180, [
                          L("Monotremata", "platypus, echidnas", 5),
                          N("Theria", "live-bearing mammals", 160, [
                            L("Marsupialia", "kangaroos, opossums", 380),
                            N("Placentalia", "placental mammals", 100, [
                              L("Afrotheria", "elephants, aardvarks", 90),
                              L("Xenarthra", "sloths, armadillos", 30),
                              N("Boreoeutheria", "northern placentals", 90, [
                                N("Euarchontoglires", "primates, rodents & kin", 85, [
                                  L("Primates", "primates", 500),
                                  L("Rodentia", "rodents", 2500),
                                  L("Lagomorpha", "rabbits, hares", 90),
                                ]),
                                N("Laurasiatheria", "laurasiatherians", 80, [
                                  L("Eulipotyphla", "hedgehogs, shrews", 500),
                                  L("Chiroptera", "bats", 1400),
                                  L("Carnivora", "cats, dogs, seals", 290),
                                  L("Perissodactyla", "horses, rhinos", 17),
                                  N("Artiodactyla", "even-toed ungulates & whales", 65, [
                                    L("Ruminantia", "deer, cattle, giraffes", 200),
                                    L("Suina", "pigs, peccaries", 20),
                                    L("Cetacea", "whales, dolphins", 90),
                                  ]),
                                ]),
                              ]),
                            ]),
                          ]),
                        ]),
                        N("Sauropsida", "reptiles & birds", 280, [
                          N("Lepidosauria", "lizards, snakes, tuatara", 240, [
                            L("Squamata", "lizards, snakes", 11000),
                            L("Rhynchocephalia", "tuatara", 1),
                          ]),
                          N("Archelosauria", "turtles, crocs & birds", 255, [
                            L("Testudines", "turtles", 360),
                            N("Archosauria", "crocodiles & birds", 245, [
                              L("Crocodylia", "crocodiles, alligators", 27),
                              N("Aves", "birds", 100, [
                                L("Palaeognathae", "ostriches, kiwis", 60),
                                N("Neognathae", "neognath birds", 85, [
                                  L("Galloanserae", "ducks, chickens", 450),
                                  N("Neoaves", "most other birds", 70, [
                                    L("Sphenisciformes", "penguins", 18),
                                    L("Strigiformes", "owls", 250),
                                    L("Accipitriformes", "hawks, eagles", 260),
                                    L("Psittaciformes", "parrots", 400),
                                    L("Passeriformes", "songbirds", 6500),
                                  ]),
                                ]),
                              ]),
                            ]),
                          ]),
                        ]),
                      ]),
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]),
  ]);

  // [common name, species, leaf group it belongs to]
  const MYSTERY = [
    ["Orca", "Orcinus orca", "Cetacea"],
    ["Western honey bee", "Apis mellifera", "Hymenoptera"],
    ["Common octopus", "Octopus vulgaris", "Cephalopoda"],
    ["Axolotl", "Ambystoma mexicanum", "Caudata"],
    ["Atlantic horseshoe crab", "Limulus polyphemus", "Xiphosura"],
    ["Platypus", "Ornithorhynchus anatinus", "Monotremata"],
    ["Tuatara", "Sphenodon punctatus", "Rhynchocephalia"],
    ["Sea lamprey", "Petromyzon marinus", "Cyclostomata"],
    ["Emperor penguin", "Aptenodytes forsteri", "Sphenisciformes"],
    ["Aardvark", "Orycteropus afer", "Afrotheria"],
    ["Common woodlouse", "Oniscus asellus", "Malacostraca"],
    ["Coelacanth", "Latimeria chalumnae", "Actinistia"],
    ["Giant panda", "Ailuropoda melanoleuca", "Carnivora"],
    ["Vase tunicate", "Ciona intestinalis", "Tunicata"],
    ["Common eastern firefly", "Photinus pyralis", "Coleoptera"],
  ];

  // Geological periods: [name, start Mya, end Mya]
  const ERAS = [
    ["Cryogenian", 720, 635], ["Ediacaran", 635, 539], ["Cambrian", 539, 485],
    ["Ordovician", 485, 444], ["Silurian", 444, 419], ["Devonian", 419, 359],
    ["Carboniferous", 359, 299], ["Permian", 299, 252], ["Triassic", 252, 201],
    ["Jurassic", 201, 145], ["Cretaceous", 145, 66], ["Paleogene", 66, 23], ["Neogene", 23, 0],
  ];

  // Real data from pipeline/build_tree.py, when data/tree.js has been loaded before this file.
  function fromCompact(o) {
    // clades without a formal name carry a descriptive label ("Strigiformes + Accipitriformes")
    const n = { name: o.n, label: o.lb, common: o.c || o.lc || "", age: o.a, est: !!o.est, aliases: o.al || [], ott: o.ott, total: o.t };
    if (o.k) Object.assign(n, { children: o.k.map(fromCompact), age0: o.a0 });
    else Object.assign(n, { inat: o.inat, obs: o.obs, photos: o.ph || [] });
    if (o.x) Object.assign(n, { extinct: true, fa: o.x[0], la: o.x[1] });
    return n;
  }
  const REAL = !!(window.BG_TREE && window.BG_TREE.tree);
  const FULL = REAL ? fromCompact(window.BG_TREE.tree) : TREE;

  // Extinct animals can be switched off; the choice is remembered in this browser.
  const EXTINCT_KEY = "bg-show-extinct";
  let showExtinct = true;
  try { showExtinct = localStorage.getItem(EXTINCT_KEY) !== "0"; } catch (e) { /* storage unavailable */ }
  const hasExtinct = (function any(n) { return n.extinct || (n.children || []).some(any); })(FULL);
  // Without fossils: drop them, collapse clades left with one child, and use the living-only ages.
  function pruneExtinct(n) {
    if (!n.children) return n.extinct ? null : n;
    const kids = n.children.map(pruneExtinct).filter(Boolean);
    if (!kids.length) return null;
    if (kids.length === 1) return kids[0];
    return { ...n, children: kids, age: n.age0 != null ? n.age0 : n.age };
  }
  const SOURCE = showExtinct || !hasExtinct ? FULL : pruneExtinct(FULL);
  function setShowExtinct(v) {
    try { localStorage.setItem(EXTINCT_KEY, v ? "1" : "0"); } catch (e) { /* storage unavailable */ }
    location.reload();
  }

  const rootAge = SOURCE.age || 700;
  const MAX_AGE = Math.max(720, Math.ceil(rootAge * 1.04));
  if (MAX_AGE > 720) ERAS.unshift(["Tonian", MAX_AGE, 720]);
  // Square-root time scale: 0 today, 1 at MAX_AGE. Spreads out the recent radiations.
  const tf = t => Math.sqrt(Math.max(0, Math.min(MAX_AGE, t)) / MAX_AGE);
  const tfInv = f => Math.max(0, Math.min(1, f)) ** 2 * MAX_AGE;

  const root = d3.hierarchy(SOURCE).sum(d => d.children ? 0 : d.species ? 1 + Math.log10(d.species + 1) : 1);
  root.each(n => {
    n.age = n.children ? n.data.age : n.data.extinct ? n.data.la : 0;
    n.unnamed = !n.data.name;
    const named = n.ancestors().find(a => a.data.name);
    n.name = n.data.name || n.data.label || (named ? `Unnamed clade in ${named.data.name}` : "Unnamed clade");
    n.nLeaves = n.leaves().length;
  });
  const nodes = root.descendants();
  const leaves = root.leaves();
  leaves.forEach((l, i) => { l.index = i; });
  const byName = new Map(nodes.filter(n => !n.unnamed).map(n => [n.name, n]));
  // With real data, every species that has a photo is a possible round, in shuffled order.
  let mystery = MYSTERY;
  if (REAL) {
    const withPhotos = leaves.filter(l => l.data.photos.length);
    mystery = d3.shuffle(withPhotos.length ? withPhotos : leaves.slice())
      .map(l => [l.data.common || l.name, l.name, l.name]);
  }

  // Each clade gets a slice of the hue wheel proportional to its number of groups.
  (function assignHue(n, h0, h1) {
    n.hue = (h0 + h1) / 2;
    if (!n.children) return;
    const total = n.leaves().length;
    let h = h0;
    n.children.forEach((c, i) => {
      const w = (h1 - h0) * c.leaves().length / total;
      c.sib = i;
      assignHue(c, h, h + w);
      h += w;
    });
  })(root, 10, 350);

  function mrca(a, b) {
    const anc = new Set(a.ancestors());
    return b.ancestors().find(n => anc.has(n));
  }

  // Points fall off with the log of how long ago the guess and answer shared an ancestor:
  // ~4,200 at 5 My, ~2,700 at 30 My, ~1,250 at 180 My, near 0 by 700 My.
  function score(guess, answer) {
    const same = guess === answer;
    const anc = same ? guess : mrca(guess, answer);
    const t = 1 - Math.log(Math.max(anc.age, 2) / 2) / Math.log(400);
    const points = same ? 5000 : Math.round(5000 * Math.max(0, Math.min(1, t)));
    return { guess, answer, anc, same, points };
  }

  // The lineage whose branch passes through time t on the way from the root to this leaf.
  function lineageAt(leaf, t) {
    let n = leaf;
    while (n.parent && t >= n.parent.age) n = n.parent;
    return n;
  }

  const fmtAge = a => a >= 10 ? String(Math.round(a)) : a.toFixed(1);
  // 83.6 -> "83.6 million years ago", 0.0117 -> "12 thousand years ago"
  const fmtAgo = a => a >= 1 ? `${fmtAge(a)} million years ago` : `${Math.max(1, Math.round(a * 1000))} thousand years ago`;
  const livedText = n => !n.data.extinct ? "" : n.data.la < 0.012
    ? `Lived from ${fmtAgo(n.data.fa)} until historical times`
    : `Lived ${n.data.fa >= 1 && n.data.la >= 1 ? `${fmtAge(n.data.fa)}–${fmtAge(n.data.la)} million years ago` : `from ${fmtAgo(n.data.fa)} to ${fmtAgo(n.data.la)}`}`;
  // 287458 -> "287k", 9328 -> "9.3k", 412 -> "412"
  const fmtCount = c => c >= 1e6 ? (c / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
    : c >= 1e4 ? Math.round(c / 1e3) + "k" : c >= 1e3 ? (c / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(c);

  window.BG = {
    root, nodes, leaves, byName, MYSTERY: mystery, ERAS, MAX_AGE, tf, tfInv, mrca, score, lineageAt, fmtAge, fmtCount, livedText,
    showExtinct, hasExtinct, setShowExtinct,
    REAL, meta: REAL ? window.BG_TREE.meta : null, leafNoun: REAL ? "species" : "groups",
  };
})();
