// Page shell for BioGuessing: the Explore / Play switch, the Explore panel, and the game registry.
// The map view passes an object with highlight(node), select(node), focus(node), reveal(result|null),
// reset(rootNode), root() and setRoot(node), and reports pointer activity through BG.hover / BG.click.
//
// Games live in shared/games/*.js and register themselves with BG.registerGame({
//   id, title, blurb, howTo,          // text for the game picker and the "How to play" section
//   mount(el, ctx),                   // build the game's panel inside el (called once)
//   enter(ctx), leave(ctx),           // start / stop when the game is chosen or the player leaves Play
//   hover(node), click(node),         // pointer activity on the map while the game is running
//   limitRoot(),                      // optional: the map may not go above this clade
// })
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

  const games = [];
  BG.registerGame = game => { games.push(game); };

  // shared helpers for the panel and the games
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const label = n => (n.data.extinct ? "† " : "") + (n.data.common ? `${n.name} (${n.data.common})` : n.name);
  const source = ph => /wikimedia/.test(ph.o || "") ? "Wikimedia Commons" : "iNaturalist";
  const credit = (ph, text) => `${esc(ph.a)} · <a href="${esc(ph.o)}" target="_blank" rel="noopener">${text || source(ph)}</a>`;

  // A <select> of clades to play in: all animals, the clade being viewed, and well-sampled named clades.
  function cladeMenu(sel, current, onPick) {
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
      items.push({ n, label: `${" ".repeat(depth)}${n.name}${n.data.common ? " (" + n.data.common + ")" : ""}` });
    });
    sel.innerHTML = "";
    items.forEach((it, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = it.label;
      if (it.n === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => onPick(items[+sel.value].n);
  }

  BG.init = function (view, opts = {}) {
    const $ = id => document.getElementById(id);
    const S = { mode: "explore", pinned: null, hovered: null, game: games[0] || null };
    BG.state = S;
    const ctx = { view, $, esc, label, source, credit, cladeMenu };

    // ---- mode switch, in the page header
    $("modes").innerHTML = `
      <div class="modes" role="tablist" aria-label="Mode">
        <button role="tab" id="mode-explore" aria-selected="true">Explore</button>
        <button role="tab" id="mode-play" aria-selected="false">Play</button>
      </div>`;

    const layers = opts.controls && opts.controls.length ? `
      <section class="panel">
        <h2>Layers</h2>
        <div class="toggles">${opts.controls.map(c =>
          `<label><input type="checkbox" id="${c.id}"${c.checked ? " checked" : ""}><span>${c.label}</span></label>`).join("")}
        </div>
      </section>` : "";

    $("panel").innerHTML = `
      <div id="explore-mode" class="mode-panels">
        <section class="panel">
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
        ${layers}
        <section class="panel">
          <h2>How to read the map</h2>
          ${opts.about || ""}
        </section>
      </div>
      <div id="play-mode" class="mode-panels" hidden>
        <section class="panel">
          <h2>Games</h2>
          <div class="games" id="game-list"></div>
        </section>
        <div id="game-body"></div>
        ${layers.replace(/id="(t-[a-z-]+)"/g, 'id="$1-play"')}
        <section class="panel">
          <h2>How to play</h2>
          <div id="game-howto"></div>
        </section>
      </div>`;

    (opts.controls || []).forEach(c => {
      [$(c.id), $(c.id + "-play")].forEach(box => {
        if (!box) return;
        box.onchange = e => {
          [$(c.id), $(c.id + "-play")].forEach(b => { if (b) b.checked = e.target.checked; });
          c.onchange(e.target.checked);
        };
      });
    });

    // ---- Explore: lineage, species photos and clade thumbnails
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
        const img = $("ex-img");
        img.hidden = false;
        img.onerror = () => { img.hidden = true; };
        img.src = ph.u;
        img.alt = n.data.common || n.name;
        img.title = photos.length > 1 ? `Photo ${photoIdx % photos.length + 1} of ${photos.length}. Click for the next one.` : "";
        img.style.cursor = photos.length > 1 ? "pointer" : "";
        $("ex-common").textContent = n.data.common || "";
        $("ex-sci").textContent = n.name;
        $("ex-lived").textContent = n.data.extinct ? "† " + BG.livedText(n) : "";
        $("ex-lived").hidden = !n.data.extinct;
        $("ex-credit").innerHTML = credit(ph, `View on ${source(ph)}`);
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
        b.onclick = () => { explorePick(l, true); view.focus(l.parent || l); };
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
    function explorePick(n, keep) {
      S.pinned = keep ? n : (S.pinned === n ? null : n);
      view.select(S.pinned);
      crumbs(S.pinned || S.hovered);
      photoIdx = 0;
      showSpecies(S.pinned);
    }

    // ---- pointer routing: Explore handles it, or the running game does
    BG.hover = n => {
      n = n || null;
      if (n === S.hovered) return;
      S.hovered = n;
      if (S.mode === "play") { if (S.game) S.game.hover(n); return; }
      view.highlight(n);
      if (!S.pinned) crumbs(n);
    };
    BG.click = n => {
      n = n || null;
      if (S.mode === "play") { if (S.game) S.game.click(n); return; }
      explorePick(n, false);
    };
    // a clade that was just opened stays selected in Explore
    BG.pin = n => { if (S.mode === "explore") explorePick(n, true); };
    BG.roundClade = () => (S.mode === "play" && S.game && S.game.limitRoot ? S.game.limitRoot() : BG.root);

    // ---- games
    const mounted = new Set();
    function chooseGame(game) {
      if (S.game && S.mode === "play" && S.game !== game) S.game.leave(ctx);
      S.game = game;
      document.querySelectorAll("#game-list .game").forEach(b => b.setAttribute("aria-pressed", b.dataset.id === game.id));
      document.querySelectorAll("#game-body > .game-panel").forEach(el => { el.hidden = el.dataset.id !== game.id; });
      if (!mounted.has(game.id)) {
        const el = document.createElement("div");
        el.className = "game-panel";
        el.dataset.id = game.id;
        $("game-body").appendChild(el);
        game.mount(el, ctx);
        mounted.add(game.id);
      }
      $("game-howto").innerHTML = game.howTo || "";
      game.enter(ctx);
    }
    $("game-list").innerHTML = games.map(g =>
      `<button class="game" data-id="${esc(g.id)}" aria-pressed="false"><strong>${esc(g.title)}</strong><span>${esc(g.blurb || "")}</span></button>`
    ).join("") || `<p class="hint">No games yet.</p>`;
    document.querySelectorAll("#game-list .game").forEach(b => {
      b.onclick = () => { const g = games.find(x => x.id === b.dataset.id); if (g && g !== S.game) chooseGame(g); };
    });

    function setMode(m) {
      if (m === S.mode) return;
      if (S.mode === "play" && S.game) S.game.leave(ctx);
      S.mode = m;
      document.body.classList.toggle("playing", m === "play");
      $("mode-explore").setAttribute("aria-selected", m === "explore");
      $("mode-play").setAttribute("aria-selected", m === "play");
      $("explore-mode").hidden = m !== "explore";
      $("play-mode").hidden = m !== "play";
      S.pinned = null;
      S.hovered = null;
      crumbs(null);
      showSpecies(null);
      view.reveal(null);
      view.select(null);
      view.highlight(null);
      if (m === "play" && S.game) chooseGame(S.game);
    }
    $("mode-explore").onclick = () => setMode("explore");
    $("mode-play").onclick = () => setMode("play");
  };
})();
