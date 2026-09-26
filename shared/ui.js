// Side panel and game rounds for BioGuessing.
// A view passes an object with highlight(node), select(node), focus(node), reveal(result|null), reset()
// and reports pointer activity back through BG.hover(node) and BG.click(node).
(function () {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  BG.pxPerUnit = svgNode => (svgNode.getBoundingClientRect().width || 700) / 1000;

  const PIN = "M0,0 C-3,-8 -10,-12 -10,-20 A10,10 0 1 1 10,-20 C10,-12 3,-8 0,0Z";
  // pins: [{x, y, kind: "guess" | "answer" | "pick"}], scale = viewBox units per screen px
  BG.drawPins = function (g, pins, scale) {
    g.selectAll("g.pin").data(pins).join(enter => {
      const p = enter.append("g");
      p.append("path").attr("d", PIN);
      p.append("circle").attr("cy", -20).attr("r", 3.5);
      return p;
    })
      .attr("class", d => "pin " + d.kind)
      .attr("transform", d => `translate(${d.x},${d.y}) scale(${scale})`);
  };

  BG.init = function (view, opts = {}) {
    const panel = document.getElementById("panel");
    panel.innerHTML = `
      <div class="tabs" role="group" aria-label="Mode">
        <button id="tab-explore" aria-pressed="true">Explore</button>
        <button id="tab-guess" aria-pressed="false">Try a round</button>
      </div>
      <section class="panel" id="explore-panel">
        <h2>Where you are</h2>
        <p class="hint" id="crumb-hint">Hover or tap the tree to see a lineage. Click a species or clade for details, double-click a clade to open it, or click a line below to open that clade.</p>
        <figure class="exphoto" id="ex-photo" hidden>
          <img id="ex-img" alt="" crossorigin="anonymous">
          <figcaption>
            <strong id="ex-common"></strong>
            <em id="ex-sci"></em>
            <span class="lived" id="ex-lived" hidden></span>
            <small id="ex-credit"></small>
          </figcaption>
        </figure>
        <div class="thumbs" id="ex-thumbs" hidden></div>
        <ul class="crumbs" id="crumbs"></ul>
      </section>
      <section class="panel" id="guess-panel" hidden>
        ${opts.cladeFilter ? `
        <label class="field" for="round-clade"><span class="hint">Species from</span>
          <select id="round-clade"></select>
          <small class="hint" id="round-count"></small>
        </label>` : ""}
        <h2>Mystery animal</h2>
        <div class="photo">
          <img id="m-img" alt="Photo of the mystery animal" crossorigin="anonymous" hidden>
          <span class="cn" id="m-common"></span>
          <span class="sp" id="m-species"></span>
          <small id="m-credit">The real game would show only a photo here.</small>
        </div>
        <div class="pick"><span class="hint">Your pick</span><strong id="pick-name">Nothing yet</strong></div>
        <button id="lock" class="primary" disabled>Lock in guess</button>
        <div class="result" id="result" hidden>
          <div class="score" id="score"></div>
          <div class="bar"><i id="scorebar" style="width:0"></i></div>
          <dl class="kv">
            <dt><span class="swatch" style="background:var(--guess)"></span>Your guess</dt><dd id="r-guess"></dd>
            <dt><span class="swatch" style="background:var(--answer)"></span>Answer</dt><dd id="r-answer"></dd>
            <dt>Shared ancestor</dt><dd id="r-mrca"></dd>
          </dl>
        </div>
        <button id="next">Next animal</button>
      </section>
      ${opts.controls && opts.controls.length ? `
      <section class="panel">
        <h2>Layers</h2>
        <div class="toggles">${opts.controls.map(c =>
          `<label><input type="checkbox" id="${c.id}"${c.checked ? " checked" : ""}><span>${c.label}</span></label>`).join("")}
        </div>
      </section>` : ""}
      <section class="panel">
        <h2>How to read it</h2>
        ${opts.about || ""}
      </section>`;

    const $ = id => document.getElementById(id);
    (opts.controls || []).forEach(c => { $(c.id).onchange = e => c.onchange(e.target.checked); });

    const S = { mode: "explore", pinned: null, hovered: null, selected: null, round: 0, target: null, result: null,
      filter: BG.root, rounds: BG.MYSTERY };
    BG.state = S;
    const label = n => (n.data.extinct ? "† " : "") + (n.data.common ? `${n.name} (${n.data.common})` : n.name);
    const source = ph => /wikimedia/.test(ph.o || "") ? "Wikimedia Commons" : "iNaturalist";
    const esc = t => String(t).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

    function crumbs(n) {
      $("crumb-hint").hidden = !!n;
      const ul = $("crumbs");
      ul.textContent = "";
      if (!n) return;
      n.ancestors().reverse().forEach(a => {
        const li = document.createElement("li");
        li.style.paddingLeft = (6 + Math.min(a.depth, 12) * 3) + "px";
        li.innerHTML = `<span class="n"></span><span class="c"></span><span class="a"></span>`;
        li.children[0].textContent = a.name;
        li.children[1].textContent = a.data.common;
        li.children[2].textContent = a.children ? `~${BG.fmtAge(a.age)} Mya` : a.data.extinct ? "† extinct" : "";
        if (a.unnamed) li.style.opacity = ".65";
        const tip = [];
        if (a.data.total) tip.push(`About ${a.data.total.toLocaleString("en-US")} species in total, ${a.nLeaves} on this map`);
        if (a.data.aliases && a.data.aliases.length) tip.push("Also: " + a.data.aliases.join(", "));
        if (tip.length) li.title = tip.join("\n");
        li.onmouseenter = () => view.highlight(a);
        li.onmouseleave = () => view.highlight(S.hovered);
        li.onclick = () => view.focus(a);
        ul.appendChild(li);
      });
    }

    // explore mode: a clicked species shows its photo; a clicked clade shows some of its species
    let photoIdx = 0;
    function showSpecies(n) {
      const fig = $("ex-photo"), thumbs = $("ex-thumbs");
      fig.hidden = true;
      thumbs.hidden = true;
      if (!n) return;
      if (!n.children) {
        const photos = n.data.photos || [];
        if (!photos.length) return;
        const ph = photos[photoIdx % photos.length];
        $("ex-img").hidden = false;
        $("ex-img").onerror = () => { $("ex-img").hidden = true; };
        $("ex-img").src = ph.u;
        $("ex-img").alt = n.data.common || n.name;
        $("ex-img").title = photos.length > 1 ? `Photo ${photoIdx % photos.length + 1} of ${photos.length}. Click for the next one.` : "";
        $("ex-img").style.cursor = photos.length > 1 ? "pointer" : "";
        $("ex-common").textContent = n.data.common || "";
        $("ex-sci").textContent = n.name;
        $("ex-lived").textContent = n.data.extinct ? "† " + BG.livedText(n) : "";
        $("ex-lived").hidden = !n.data.extinct;
        $("ex-credit").innerHTML = `${esc(ph.a)} · <a href="${esc(ph.o)}" target="_blank" rel="noopener">View on ${source(ph)}</a>`;
        fig.hidden = false;
        return;
      }
      const top = n.leaves().filter(l => (l.data.photos || []).length)
        .sort((a, b) => (b.data.obs || 0) - (a.data.obs || 0)).slice(0, 6);
      if (!top.length) return;
      thumbs.innerHTML = "";
      top.forEach(l => {
        const b = document.createElement("button");
        b.className = "thumb";
        b.title = `${l.data.common ? l.data.common + " · " : ""}${l.name}`;
        const img = document.createElement("img");
        img.crossOrigin = "anonymous";
        img.src = l.data.photos[0].u.replace("/medium.", "/square.");
        img.alt = l.data.common || l.name;
        img.onerror = () => { b.textContent = l.data.common || l.name; b.classList.add("thumb-text"); };
        b.appendChild(img);
        b.onclick = () => { BG.click(l); view.focus(l.parent || l); };
        thumbs.appendChild(b);
      });
      const more = n.nLeaves - top.length;
      if (more > 0) {
        const span = document.createElement("span");
        span.className = "hint";
        span.textContent = `+${more.toLocaleString("en-US")} more on the map` +
          (n.data.total ? `, of about ${n.data.total.toLocaleString("en-US")} species in total` : "");
        thumbs.appendChild(span);
      }
      thumbs.hidden = false;
    }
    $("ex-img").onclick = () => {
      const n = S.pinned;
      if (n && !n.children && (n.data.photos || []).length > 1) { photoIdx++; showSpecies(n); }
    };

    BG.hover = n => {
      n = n || null;
      if (n === S.hovered) return;
      S.hovered = n;
      if (S.result) return;
      view.highlight(n);
      if (S.mode === "explore" && !S.pinned) crumbs(n);
    };

    BG.click = n => {
      n = n || null;
      if (S.mode === "explore") {
        S.pinned = S.pinned === n ? null : n;
        view.select(S.pinned);
        crumbs(S.pinned || S.hovered);
        photoIdx = 0;
        showSpecies(S.pinned);
        return;
      }
      if (S.result || !n) return;
      S.selected = n;
      view.select(n);
      $("pick-name").textContent = label(n);
      $("lock").disabled = false;
    };

    BG.selected = () => (S.mode === "explore" ? S.pinned : S.selected);
    BG.pin = n => {
      if (S.mode !== "explore") return;
      S.pinned = n;
      view.select(n);
      crumbs(n);
      photoIdx = 0;
      showSpecies(n);
    };
    BG.roundClade = () => (S.mode === "guess" ? S.filter : BG.root);

    $("lock").onclick = () => {
      if (!S.selected || S.result) return;
      const res = BG.score(S.selected, S.target.leaf);
      S.result = res;
      $("score").innerHTML = `${res.points.toLocaleString("en-US")} <span>/ 5,000</span>`;
      $("scorebar").style.width = (res.points / 50) + "%";
      $("r-guess").textContent = label(res.guess);
      $("r-answer").textContent = label(res.answer);
      $("r-mrca").textContent = res.same ? "Exact match" : `${res.anc.name}, ~${BG.fmtAge(res.anc.age)} million years ago`;
      $("m-common").textContent = S.target.common;
      $("m-species").textContent = S.target.species + (S.target.leaf.data.extinct ? ` · † ${BG.livedText(S.target.leaf)}` : "");
      $("result").hidden = false;
      $("lock").hidden = true;
      view.highlight(null);
      view.select(null);
      view.reveal(res);
    };

    // Each round's photo is chosen one round ahead and preloaded, so it is ready when you get there.
    const roundPhotos = new Map();
    function photoFor(round) {
      if (!roundPhotos.has(round)) {
        const m = S.rounds[round % S.rounds.length];
        const photos = BG.byName.get(m[2]).data.photos || [];
        roundPhotos.set(round, photos.length ? photos[Math.floor(Math.random() * photos.length)] : null);
      }
      return roundPhotos.get(round);
    }
    function preload(round) {
      const ph = photoFor(round);
      if (!ph) return;
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.src = ph.u;
    }

    function newRound() {
      const m = S.rounds[S.round % S.rounds.length];
      S.target = { common: m[0], species: m[1], leaf: BG.byName.get(m[2]) };
      S.selected = null;
      S.result = null;
      const ph = photoFor(S.round);
      const img = $("m-img");
      if (ph) {
        // if the image is blocked or missing, fall back to naming the animal
        img.onerror = () => {
          img.hidden = true;
          $("m-common").textContent = S.target.common;
          $("m-species").textContent = S.target.species;
          $("m-credit").innerHTML = `The photo could not load here. <a href="${esc(ph.o)}" target="_blank" rel="noopener">See it on ${source(ph)}</a>`;
        };
        img.src = ph.u;
        img.hidden = false;
        $("m-common").textContent = "";
        $("m-species").textContent = "";
        $("m-credit").innerHTML = `${esc(ph.a)} · <a href="${esc(ph.o)}" target="_blank" rel="noopener">${source(ph)}</a>`;
      } else {
        img.hidden = true;
        $("m-common").textContent = S.target.common;
        $("m-species").textContent = S.target.species;
      }
      $("pick-name").textContent = "Nothing yet";
      $("lock").disabled = true;
      $("lock").hidden = false;
      $("result").hidden = true;
      $("scorebar").style.width = "0";
      view.reveal(null);
      view.select(null);
      view.highlight(null);
      view.reset(S.filter);
      preload(S.round + 1);
    }

    // Rounds can be limited to one clade: all animals, the clade being viewed, or a well-sampled named clade.
    function setFilter(n) {
      S.filter = n || BG.root;
      S.rounds = BG.MYSTERY.filter(m => {
        const l = BG.byName.get(m[2]);
        return l && (S.filter === BG.root || l.ancestors().includes(S.filter));
      });
      if (!S.rounds.length) S.rounds = BG.MYSTERY;
      S.round = 0;
      roundPhotos.clear();
      const count = $("round-count");
      if (count) count.textContent = `${S.rounds.length.toLocaleString("en-US")} species to guess`;
    }
    function fillCladeMenu(current) {
      const sel = $("round-clade");
      if (!sel) return;
      const named = [];
      BG.root.eachBefore(n => {
        if (n.children && !n.unnamed && n !== BG.root && n.nLeaves >= 25) named.push(n);
      });
      const items = [{ n: BG.root, label: "All animals" }];
      if (current && current !== BG.root && !named.includes(current)) {
        items.push({ n: current, label: `This view: ${current.name}` });
      }
      named.forEach(n => {
        const depth = n.ancestors().filter(a => named.includes(a)).length - 1;
        items.push({ n, label: `${"\u2003".repeat(depth)}${n.name}${n.data.common ? " (" + n.data.common + ")" : ""}` });
      });
      sel.innerHTML = "";
      items.forEach((it, i) => {
        const o = document.createElement("option");
        o.value = i;
        o.textContent = it.label;
        if (it.n === current) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = () => { setFilter(items[+sel.value].n); newRound(); };
    }

    function setMode(m) {
      S.mode = m;
      $("tab-explore").setAttribute("aria-pressed", m === "explore");
      $("tab-guess").setAttribute("aria-pressed", m === "guess");
      $("explore-panel").hidden = m !== "explore";
      $("guess-panel").hidden = m !== "guess";
      S.pinned = null;
      S.hovered = null;
      crumbs(null);
      showSpecies(null);
      if (m === "guess") {
        // play within whatever clade is being viewed
        const current = view.root ? view.root() : BG.root;
        setFilter(current);
        fillCladeMenu(current);
        newRound();
      }
      else {
        S.result = null;
        S.selected = null;
        view.reveal(null);
        view.select(null);
        view.highlight(null);
      }
    }

    $("tab-explore").onclick = () => setMode("explore");
    $("tab-guess").onclick = () => setMode("guess");
    $("next").onclick = () => { S.round++; newRound(); };
  };
})();
