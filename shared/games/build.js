// Game: Build the tree. Four species; join the two closest groups, step by step, until they form one
// tree. Scored by how many of the true groupings you rebuilt.
(function () {
  const K = () => BG.kit;
  const S = { filter: null, q: null, groups: [], joins: [], sel: [], done: false, played: 0, points: 0 };
  let ctx = null, $ = null;
  const L = ["A", "B", "C", "D"];
  const key = set => [...set].sort().join("");

  // groupings (of 2 or 3) that form a clade among the four in the real tree
  function trueClusters(sp) {
    const out = [];
    const subsets = [];
    for (let m = 1; m < 15; m++) {
      const idx = [0, 1, 2, 3].filter(i => m & (1 << i));
      if (idx.length === 2 || idx.length === 3) subsets.push(idx);
    }
    subsets.forEach(idx => {
      const anc = idx.map(i => sp[i]).reduce((a, b) => BG.mrca(a, b));
      const inside = [0, 1, 2, 3].filter(i => sp[i].ancestors().includes(anc));
      if (inside.length === idx.length) out.push({ set: idx, anc });
    });
    return out;
  }

  function makeQuestion() {
    const options = [];
    S.filter.each(n => {
      if (n.children && n.nLeaves >= 4 && n.children.filter(c => K().withPhoto(c).length).length >= 2) options.push(n);
    });
    for (let tries = 0; tries < 60 && options.length; tries++) {
      const x = K().pickBy(options, n => Math.sqrt(n.nLeaves));
      const pool = K().withPhoto(x);
      if (pool.length < 4) continue;
      const sp = [];
      while (sp.length < 4) {
        const l = K().pickBy(pool.filter(p => !sp.includes(p)), K().fame);
        sp.push(l);
      }
      const clusters = trueClusters(sp);
      // a fully resolved tree of four has exactly two groupings; skip unresolved splits
      if (clusters.length === 2) return { species: d3.shuffle(sp), clusters: null, sp };
    }
    return null;
  }

  function newQuestion() {
    const q = makeQuestion();
    S.done = false;
    S.joins = [];
    S.sel = [];
    $("bt-result").hidden = true;
    ctx.view.marks(null);
    ctx.view.reset(S.filter);
    const cards = $("bt-cards");
    cards.innerHTML = "";
    if (!q) {
      S.q = null;
      cards.innerHTML = `<p class="hint">This clade is too small for this game. Choose a bigger one above.</p>`;
      $("bt-build").hidden = true;
      return;
    }
    q.clusters = trueClusters(q.species);
    S.q = q;
    $("bt-build").hidden = false;
    q.species.forEach((l, i) => cards.appendChild(K().speciesCard(l, ctx, { letter: L[i] })));
    ctx.view.marks({ pins: q.species.map((l, i) => ({ node: l, kind: "pick", label: L[i] })) });
    renderGroups();
  }

  // current groups: each species starts alone; every join merges two groups
  function currentGroups() {
    let groups = [[0], [1], [2], [3]];
    S.joins.forEach(([a, b]) => {
      const ga = groups.find(g => g.includes(a)), gb = groups.find(g => g.includes(b));
      groups = groups.filter(g => g !== ga && g !== gb).concat([ga.concat(gb).sort()]);
    });
    return groups;
  }

  function renderGroups() {
    const groups = currentGroups();
    const box = $("bt-groups");
    box.innerHTML = "";
    groups.forEach(g => {
      const b = document.createElement("button");
      const k = key(g);
      b.textContent = g.length === 1 ? `${L[g[0]]} ${K().nameOf(S.q.species[g[0]])}` : `(${g.map(i => L[i]).join(" + ")})`;
      b.setAttribute("aria-pressed", S.sel.includes(k));
      b.onclick = () => {
        if (S.done) return;
        const at = S.sel.indexOf(k);
        if (at >= 0) S.sel.splice(at, 1);
        else { if (S.sel.length === 2) S.sel.shift(); S.sel.push(k); }
        renderGroups();
      };
      box.appendChild(b);
    });
    $("bt-join").disabled = S.sel.length !== 2;
    $("bt-undo").disabled = !S.joins.length;
    $("bt-step").textContent = groups.length === 1 ? "Done." : `Step ${S.joins.length + 1} of 3: pick the two closest groups and join them.`;
  }

  function join() {
    if (S.sel.length !== 2 || S.done) return;
    const groups = currentGroups();
    const [ga, gb] = S.sel.map(k => groups.find(g => key(g) === k));
    S.joins.push([ga[0], gb[0]]);
    S.sel = [];
    renderGroups();
    if (S.joins.length === 3) finish();
  }

  // nested tree from joins, for drawing: a leaf is an index, a clade is [left, right]
  function treeFromJoins(joins) {
    let parts = [0, 1, 2, 3].map(i => ({ t: i, set: [i] }));
    joins.forEach(([a, b]) => {
      const pa = parts.find(p => p.set.includes(a)), pb = parts.find(p => p.set.includes(b));
      parts = parts.filter(p => p !== pa && p !== pb).concat([{ t: [pa.t, pb.t], set: pa.set.concat(pb.set) }]);
    });
    return parts[0].t;
  }
  function trueTree() {
    // rebuild the true joins: smaller groupings first
    const cl = S.q.clusters.slice().sort((a, b) => a.set.length - b.set.length || a.anc.age - b.anc.age);
    const joins = [];
    const merged = [[0], [1], [2], [3]];
    const find = i => merged.find(g => g.includes(i));
    cl.concat([{ set: [0, 1, 2, 3] }]).forEach(c => {
      const parts = [...new Set(c.set.map(find))];
      for (let i = 1; i < parts.length; i++) {
        joins.push([parts[0][0], parts[i][0]]);
        const m = parts[0].concat(parts[i]);
        merged.splice(merged.indexOf(parts[0]), 1);
        merged.splice(merged.indexOf(parts[i]), 1);
        merged.push(m);
        parts[0] = m;
      }
    });
    return treeFromJoins(joins);
  }

  // a small left-to-right cladogram; edges into groupings are coloured by whether they are right
  function cladogram(tree, good) {
    const W = 200, H = 150, leafX = 120;
    const order = [], pos = new Map();
    const leaves = t => Array.isArray(t) ? leaves(t[0]).concat(leaves(t[1])) : [t];
    (function walk(t) { if (Array.isArray(t)) { walk(t[0]); walk(t[1]); } else order.push(t); })(tree);
    const height = t => Array.isArray(t) ? 1 + Math.max(height(t[0]), height(t[1])) : 0;
    const maxH = height(tree), step = (leafX - 14) / maxH;
    let svg = "";
    (function place(t) {
      if (!Array.isArray(t)) { pos.set(t, [leafX, 18 + order.indexOf(t) * ((H - 36) / 3)]); return pos.get(t); }
      const a = place(t[0]), b = place(t[1]);
      const p = [leafX - height(t) * step, (a[1] + b[1]) / 2];
      const set = key(leaves(t));
      const cls = set.length === 4 ? "" : good(set) ? " ok" : " bad";
      [a, b].forEach(c => { svg += `<path class="edge${cls}" d="M${p[0]},${c[1]}H${c[0]}"/>`; });
      svg += `<path class="edge${cls}" d="M${p[0]},${a[1]}V${b[1]}"/>`;
      pos.set(t, p);
      return p;
    })(tree);
    order.forEach(i => { const [x, y] = pos.get(i); svg += `<text x="${x + 6}" y="${y}">${L[i]}</text>`; });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cladogram">${svg}</svg>`;
  }

  function finish() {
    S.done = true;
    const truth = new Set(S.q.clusters.map(c => key(c.set)));
    // the player's groupings: every join except the last, which always makes the whole set
    const groups = [];
    let parts = [[0], [1], [2], [3]];
    S.joins.forEach(([a, b]) => {
      const ga = parts.find(g => g.includes(a)), gb = parts.find(g => g.includes(b));
      const m = ga.concat(gb).sort();
      parts = parts.filter(g => g !== ga && g !== gb).concat([m]);
      if (m.length < 4) groups.push(key(m));
    });
    const right = groups.filter(g => truth.has(g)).length;
    const points = [0, 2500, 5000][right];
    S.played++;
    S.points += points;
    $("bt-score").innerHTML = `${points.toLocaleString("en-US")} <span>/ 5,000 · ${right} of 2 groupings right</span>`;
    $("bt-trees").innerHTML = `
      <figure><figcaption>Your tree</figcaption>${cladogram(treeFromJoins(S.joins), s => truth.has(s))}</figure>
      <figure><figcaption>The real tree</figcaption>${cladogram(trueTree(), () => true)}</figure>`;
    const name = i => `${L[i]} ${ctx.esc(K().nameOf(S.q.species[i]))}`;
    $("bt-explain").innerHTML = S.q.clusters.slice().sort((a, b) => a.anc.age - b.anc.age).map(c =>
      `${c.set.map(name).join(" + ")}: shared ancestor about <b>${BG.fmtAge(c.anc.age)} million years ago</b>, in ${ctx.esc(K().cladeName(c.anc))}.`
    ).join("<br>");
    $("bt-tally").textContent = `${S.played} played · ${Math.round(S.points / S.played).toLocaleString("en-US")} points on average`;
    $("bt-result").hidden = false;
    $("bt-build").hidden = true;
    const all = S.q.species.reduce((a, b) => BG.mrca(a, b));
    ctx.view.setRoot(all);
    const byAge = S.q.clusters.slice().sort((a, b) => a.anc.age - b.anc.age);
    ctx.view.marks({
      areas: byAge.map((c, i) => ({ node: c.anc, kind: i === 0 ? "pair" : "soft", strong: i === 0 })),
      pins: S.q.species.map((l, i) => ({ node: l, kind: "pair", label: L[i] })),
    });
  }

  BG.registerGame({
    id: "build",
    title: "Build the tree",
    blurb: "Four species: rebuild how they are related, one join at a time.",
    howTo: `<ol class="legend">
      <li><b>Pick two groups</b> you think are most closely related and <b>join</b> them. At the start every species is its own group.</li>
      <li>After three joins you have a tree. It is compared with the real one: each of the two groupings you got right is worth 2,500 points.</li>
      <li>The map then opens the clade that holds all four, with the closest grouping in <b style="color:var(--good)">green</b> and the next one dashed.</li>
    </ol>`,

    mount(el, c) {
      ctx = c;
      $ = c.$;
      el.innerHTML = `
        ${K().filterField("bt-clade", "bt-count")}
        <section class="panel">
          <h2>How are these four related?</h2>
          <div class="trio" id="bt-cards"></div>
          <div id="bt-build" class="result">
            <p class="hint" id="bt-step"></p>
            <div class="chips" id="bt-groups"></div>
            <div class="chips">
              <button id="bt-join" class="primary" disabled>Join</button>
              <button id="bt-undo" disabled>Undo</button>
            </div>
          </div>
          <div class="result" id="bt-result" hidden>
            <div class="score" id="bt-score"></div>
            <div class="cladograms" id="bt-trees"></div>
            <p class="hint" id="bt-explain"></p>
            <div class="tally" id="bt-tally"></div>
          </div>
          <button id="bt-next">Next four</button>
        </section>`;
      $("bt-join").onclick = join;
      $("bt-undo").onclick = () => { if (!S.done && S.joins.length) { S.joins.pop(); S.sel = []; renderGroups(); } };
      $("bt-next").onclick = newQuestion;
    },

    enter() {
      S.filter = K().speciesFrom(ctx, "bt-clade", "bt-count", n => { S.filter = n; newQuestion(); });
      newQuestion();
    },
    leave() { ctx.view.marks(null); ctx.view.highlight(null); },
    hover() {},
    click() {},
    limitRoot: () => S.filter || BG.root,
  });
})();
