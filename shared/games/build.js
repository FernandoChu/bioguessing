// Game: Build the tree. Four species; drag them onto the tips of a tree (two pairs, or a ladder) so
// the branches show how they are related. Scored by how many of the true groupings you rebuilt.
(function () {
  const K = () => BG.kit;
  const S = { filter: null, q: null, shape: "pairs", slots: [null, null, null, null], picked: null, done: false, played: 0, points: 0 };
  let ctx = null, $ = null;
  const L = ["A", "B", "C", "D"];
  const key = set => [...set].sort().join("");

  // ---- the question
  // groupings (of 2 or 3) that form a clade among the four in the real tree
  function trueClusters(sp) {
    const out = [];
    for (let m = 1; m < 15; m++) {
      const idx = [0, 1, 2, 3].filter(i => m & (1 << i));
      if (idx.length !== 2 && idx.length !== 3) continue;
      const anc = idx.map(i => sp[i]).reduce((a, b) => BG.mrca(a, b));
      const inside = [0, 1, 2, 3].filter(i => sp[i].ancestors().includes(anc));
      if (inside.length === idx.length) out.push({ set: idx, anc });
    }
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
      while (sp.length < 4) sp.push(K().pickBy(pool.filter(p => !sp.includes(p)), K().fame));
      d3.shuffle(sp);
      const clusters = trueClusters(sp);
      // a fully resolved tree of four has exactly two groupings; skip unresolved splits
      if (clusters.length === 2) return { species: sp, clusters };
    }
    return null;
  }

  // ---- the tree the player fills in
  // slot i is a tip; the shape decides which tips are grouped
  const playerTree = () => {
    const s = S.slots;
    return S.shape === "pairs" ? [[s[0], s[1]], [s[2], s[3]]] : [[[s[0], s[1]], s[2]], s[3]];
  };
  const playerClusters = () => {
    const s = S.slots;
    return S.shape === "pairs" ? [key([s[0], s[1]]), key([s[2], s[3]])] : [key([s[0], s[1]]), key([s[0], s[1], s[2]])];
  };

  const ROW = 58, TOP = 29, TIP = 46;   // tip rows in px; tips start at TIP% of the width
  const yOf = i => TOP + i * ROW;
  // branches of the template, in a 0..100 (x, percent) by px (y) space
  function templateEdges() {
    const e = [];
    const elbow = (x, ya, yb, xa, xb) => { e.push({ d: `M${x},${ya}V${yb}` }, { d: `M${x},${ya}H${xa}` }, { d: `M${x},${yb}H${xb}` }); };
    if (S.shape === "pairs") {
      const y1 = (yOf(0) + yOf(1)) / 2, y2 = (yOf(2) + yOf(3)) / 2;
      elbow(30, yOf(0), yOf(1), TIP, TIP); e.slice(-3).forEach(x => { x.g = 0; });
      elbow(30, yOf(2), yOf(3), TIP, TIP); e.slice(-3).forEach(x => { x.g = 1; });
      elbow(10, y1, y2, 30, 30);
      e.push({ d: `M2,${(y1 + y2) / 2}H10` });
    } else {
      const y1 = (yOf(0) + yOf(1)) / 2, y2 = (y1 + yOf(2)) / 2;
      elbow(34, yOf(0), yOf(1), TIP, TIP); e.slice(-3).forEach(x => { x.g = 0; });
      elbow(20, y1, yOf(2), 34, TIP); e.slice(-3).forEach(x => { x.g = 1; });
      elbow(8, y2, yOf(3), 20, TIP);
      e.push({ d: `M2,${(y2 + yOf(3)) / 2}H8` });
    }
    return e;
  }

  function chip(i) {
    const l = S.q.species[i];
    const ph = K().photoOf(l);
    const el = document.createElement("div");
    el.className = "bt-chip";
    el.dataset.idx = i;
    el.title = l.data.common ? `${l.data.common} · ${l.name}` : l.name;
    el.innerHTML = `<img alt="" crossorigin="anonymous" draggable="false"><b>${L[i]}</b><span></span>`;
    const img = el.querySelector("img");
    img.onerror = () => { img.style.visibility = "hidden"; };
    if (ph) img.src = ph.u.replace("/medium.", "/square.");
    el.querySelector("span").textContent = K().nameOf(l);
    if (S.picked === i) el.classList.add("picked");
    el.addEventListener("pointerdown", e => startDrag(e, i, el));
    return el;
  }

  function render() {
    const box = $("bt-tree");
    const h = TOP * 2 + ROW * 3;
    box.style.height = h + "px";
    const good = S.done ? new Set(S.q.clusters.map(c => key(c.set))) : null;
    const mine = S.done ? playerClusters() : [];
    $("bt-branches").setAttribute("viewBox", `0 0 100 ${h}`);
    $("bt-branches").innerHTML = templateEdges().map(e => {
      const cls = S.done && e.g !== undefined ? (good.has(mine[e.g]) ? " ok" : " bad") : "";
      return `<path class="edge${cls}" d="${e.d}"/>`;
    }).join("");
    box.querySelectorAll(".bt-slot").forEach(el => el.remove());
    S.slots.forEach((idx, i) => {
      const slot = document.createElement("div");
      slot.className = "bt-slot" + (idx === null ? " empty" : "");
      slot.dataset.slot = i;
      slot.style.top = (yOf(i) - 23) + "px";
      slot.style.left = TIP + "%";
      if (idx === null) slot.textContent = "Drop a species here";
      else slot.appendChild(chip(idx));
      // tapping an empty tip places the picked species there (taps on chips are handled by the chip)
      slot.onclick = e => { if (!e.target.closest(".bt-chip") && S.picked !== null && !S.done) place(S.picked, i); };
      box.appendChild(slot);
    });
    const tray = $("bt-tray");
    tray.onclick = e => { if (!e.target.closest(".bt-chip") && S.picked !== null && S.slots.includes(S.picked) && !S.done) unplace(S.picked); };
    tray.innerHTML = "";
    [0, 1, 2, 3].filter(i => !S.slots.includes(i)).forEach(i => tray.appendChild(chip(i)));
    if (!tray.children.length && !S.done) tray.innerHTML = `<span class="hint">All four are on the tree. Rearrange them, or check your tree.</span>`;
    $("bt-check").disabled = S.slots.includes(null) || S.done;
    [...$("bt-shape").children].forEach(b => b.setAttribute("aria-pressed", b.dataset.shape === S.shape));
  }

  // put species idx on tip slot; whatever was there goes where idx came from
  function place(idx, slot) {
    const from = S.slots.indexOf(idx);
    const occupant = S.slots[slot];
    if (from >= 0) S.slots[from] = occupant;
    S.slots[slot] = idx;
    S.picked = null;
    render();
  }
  function unplace(idx) {
    const from = S.slots.indexOf(idx);
    if (from >= 0) S.slots[from] = null;
    S.picked = null;
    render();
  }

  // pointer dragging (works with mouse and touch); a short press without moving picks the chip,
  // so it can also be placed by tapping a tip
  function startDrag(e, idx, el) {
    if (S.done) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let ghost = null;
    const move = ev => {
      if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 5) {
        ghost = el.cloneNode(true);
        ghost.classList.add("ghost");
        const r = el.getBoundingClientRect();
        ghost.style.width = r.width + "px";
        document.body.appendChild(ghost);
        el.classList.add("dragging");
      }
      if (ghost) {
        ghost.style.left = ev.clientX + "px";
        ghost.style.top = ev.clientY + "px";
        document.querySelectorAll(".bt-slot.over").forEach(s => s.classList.remove("over"));
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const slot = under && under.closest(".bt-slot");
        if (slot) slot.classList.add("over");
      }
    };
    const up = ev => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      if (!ghost) {   // a tap: swap with the picked species if this chip is on the tree, else pick it
        const mySlot = S.slots.indexOf(idx);
        if (S.picked !== null && S.picked !== idx && mySlot >= 0) place(S.picked, mySlot);
        else { S.picked = S.picked === idx ? null : idx; render(); }
        return;
      }
      ghost.remove();
      el.classList.remove("dragging");
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const slot = under && under.closest(".bt-slot");
      if (slot) place(idx, +slot.dataset.slot);
      else if (under && under.closest("#bt-tray")) unplace(idx);
      else render();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  // ---- the real tree, drawn small for comparison
  function trueTree() {
    const pair = S.q.clusters.filter(c => c.set.length === 2);
    const triple = S.q.clusters.find(c => c.set.length === 3);
    if (pair.length === 2) return [pair[0].set, pair[1].set];
    const out = [0, 1, 2, 3].find(i => !triple.set.includes(i));
    const third = triple.set.find(i => !pair[0].set.includes(i));
    return [[pair[0].set, third], out];
  }
  function cladogram(tree) {
    const W = 200, H = 150, leafX = 120;
    const order = [], pos = new Map();
    (function walk(t) { if (Array.isArray(t)) { walk(t[0]); walk(t[1]); } else order.push(t); })(tree);
    const height = t => Array.isArray(t) ? 1 + Math.max(height(t[0]), height(t[1])) : 0;
    const step = (leafX - 14) / height(tree);
    let svg = "";
    (function place(t) {
      if (!Array.isArray(t)) { pos.set(t, [leafX, 18 + order.indexOf(t) * ((H - 36) / 3)]); return pos.get(t); }
      const a = place(t[0]), b = place(t[1]);
      const p = [leafX - height(t) * step, (a[1] + b[1]) / 2];
      [a, b].forEach(c => { svg += `<path class="edge ok" d="M${p[0]},${c[1]}H${c[0]}"/>`; });
      svg += `<path class="edge ok" d="M${p[0]},${a[1]}V${b[1]}"/>`;
      return p;
    })(tree);
    order.forEach(i => { const [x, y] = pos.get(i); svg += `<text x="${x + 6}" y="${y}">${L[i]} ${ctx.esc(K().nameOf(S.q.species[i]))}</text>`; });
    return `<svg viewBox="0 0 ${W + 150} ${H}" role="img" aria-label="The real tree">${svg}</svg>`;
  }

  // ---- flow
  function newQuestion() {
    S.q = makeQuestion();
    S.slots = [null, null, null, null];
    S.picked = null;
    S.done = false;
    $("bt-result").hidden = true;
    ctx.view.marks(null);
    ctx.view.reset(S.filter);
    if (!S.q) {
      $("bt-play").hidden = true;
      $("bt-empty").hidden = false;
      return;
    }
    $("bt-play").hidden = false;
    $("bt-empty").hidden = true;
    ctx.view.marks({ pins: S.q.species.map((l, i) => ({ node: l, kind: "pick", label: L[i] })) });
    render();
  }

  function check() {
    if (S.slots.includes(null) || S.done) return;
    S.done = true;
    const truth = new Set(S.q.clusters.map(c => key(c.set)));
    const right = playerClusters().filter(g => truth.has(g)).length;
    const points = [0, 2500, 5000][right];
    S.played++;
    S.points += points;
    render();
    $("bt-score").innerHTML = `${points.toLocaleString("en-US")} <span>/ 5,000 · ${right} of 2 groupings right</span>`;
    $("bt-real").innerHTML = cladogram(trueTree());
    const name = i => `${L[i]} ${ctx.esc(K().nameOf(S.q.species[i]))}`;
    $("bt-explain").innerHTML = S.q.clusters.slice().sort((a, b) => a.anc.age - b.anc.age).map(c =>
      `${c.set.map(name).join(" + ")}: shared ancestor about <b>${BG.fmtAge(c.anc.age)} million years ago</b>, in ${ctx.esc(K().cladeName(c.anc))}.`
    ).join("<br>");
    $("bt-tally").textContent = `${S.played} played · ${Math.round(S.points / S.played).toLocaleString("en-US")} points on average`;
    $("bt-result").hidden = false;
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
    blurb: "Four species: drag them onto a tree to show how they are related.",
    howTo: `<ol class="legend">
      <li><b>Choose a shape</b>: two pairs, or a ladder where a pair is joined by one species and then another.</li>
      <li><b>Drag each species</b> onto a tip of the tree. Species on tips joined by a short branch are closest relatives. You can also tap a species and then tap a tip.</li>
      <li><b>Check</b>: each of the two groupings you got right is worth 2,500 points. Your branches turn <b style="color:var(--good)">green</b> where right and <b style="color:var(--answer)">orange</b> where wrong, next to the real tree.</li>
    </ol>`,

    mount(el, c) {
      ctx = c;
      $ = c.$;
      el.innerHTML = `
        ${K().filterField("bt-clade", "bt-count")}
        <section class="panel">
          <h2>How are these four related?</h2>
          <p class="hint" id="bt-empty" hidden>This clade is too small for this game. Choose a bigger one above.</p>
          <div id="bt-play" class="bt">
            <div class="seg" role="group" aria-label="Tree shape" id="bt-shape">
              <button data-shape="pairs" aria-pressed="true">Two pairs</button>
              <button data-shape="ladder" aria-pressed="false">Ladder</button>
            </div>
            <div class="bt-tree" id="bt-tree"><svg id="bt-branches" preserveAspectRatio="none" aria-hidden="true"></svg></div>
            <div class="bt-tray" id="bt-tray" aria-label="Species to place"></div>
            <button id="bt-check" class="primary" disabled>Check</button>
          </div>
          <div class="result" id="bt-result" hidden>
            <div class="score" id="bt-score"></div>
            <div class="cladograms one"><figure><figcaption>The real tree</figcaption><div id="bt-real"></div></figure></div>
            <p class="hint" id="bt-explain"></p>
            <div class="tally" id="bt-tally"></div>
          </div>
          <button id="bt-next">Next four</button>
        </section>`;
      [...$("bt-shape").children].forEach(b => {
        b.onclick = () => { if (!S.done) { S.shape = b.dataset.shape; render(); } };
      });
      $("bt-check").onclick = check;
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
