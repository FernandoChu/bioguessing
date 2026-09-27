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
  // pins: [{x, y, kind: "guess" | "answer" | "pick", label?}], scale = viewBox units per screen px
  BG.drawPins = function (g, pins, scale) {
    g.selectAll("g.pin").data(pins).join(enter => {
      const p = enter.append("g");
      p.append("path").attr("d", PIN);
      p.append("circle").attr("cy", -20);
      p.append("text").attr("y", -20);
      return p;
    })
      .attr("class", d => "pin " + d.kind + (d.label ? " labelled" : ""))
      .attr("transform", d => `translate(${d.x},${d.y}) scale(${scale})`)
      .each(function (d) {
        const p = d3.select(this);
        p.select("circle").attr("r", d.label ? 7 : 3.5);
        p.select("text").text(d.label || "");
      });
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

  // ---- the settings menu: every control reads and writes BGSettings
  const AGE_MIN = 1;
  function buildSettings($) {
    const box = $("settings"), btn = $("settings-btn");
    const seg = (key, options) => `<div class="seg" role="group" data-key="${key}">${options.map(([v, label]) =>
      `<button data-value="${v}" aria-pressed="false">${label}</button>`).join("")}</div>`;
    const check = (key, label) => `<label class="check"><input type="checkbox" data-key="${key}"><span>${label}</span></label>`;
    box.innerHTML = `
      <div class="settings-head"><h2>Settings</h2><button id="settings-close" aria-label="Close settings">✕</button></div>
      <section>
        <h3>Map view</h3>
        ${seg("view", [["radial", "Radial"], ["tree", "Tree"]])}
      </section>
      <section class="tree-settings">
        <h3>Tree view</h3>
        <span class="hint">Cut the tree</span>
        ${seg("treeCut", [["named", "By named groups"], ["time", "By age"]])}
        <div data-show="treeCut=named" class="stack">
          <span class="hint">Named levels shown below the clade you are viewing</span>
          ${seg("treeDepth", [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], [0, "All"]])}
        </div>
        <div data-show="treeCut=time" class="stack">
          <label class="slider" for="set-age"><span class="hint">Collapse splits younger than</span>
            <output id="set-age-out"></output>
            <input type="range" id="set-age" min="0" max="1000" step="1">
          </label>
        </div>
        <span class="hint">Branch lengths</span>
        ${seg("treeLengths", [["time", "To time scale"], ["spaced", "Spaced where crowded"], ["equal", "Evenly spaced"]])}
        <span class="hint" data-show="treeLengths=time">Exact dates. Where splits are crowded, some names are hidden; hover a branch to see it.</span>
        <span class="hint" data-show="treeLengths=spaced">Crowded splits are pushed apart so every name fits. Positions show the order of splits, not their dates, so periods are hidden.</span>
      </section>
      <section>
        <h3>Hints on the map</h3>
        ${check("treeThumbs", "Photos")}
        ${check("commonNames", "Common names and descriptions")}
        <span class="hint">Turn these off to make games like Place the animal harder: only scientific names and species counts stay on the map.</span>
      </section>
      <section>
        <h3>Time</h3>
        ${check("showEras", "Show geological periods")}
      </section>
      ${BG.hasExtinct ? `<section>
        <h3>Animals</h3>
        ${check("showExtinct", "Include extinct animals (†)")}
        <span class="hint">Changing this reloads the page.</span>
      </section>` : ""}`;

    const ageMax = BG.MAX_AGE;
    const toAge = v => AGE_MIN * Math.pow(ageMax / AGE_MIN, v / 1000);
    const toSlider = a => Math.round(1000 * Math.log(a / AGE_MIN) / Math.log(ageMax / AGE_MIN));
    function sync() {
      box.querySelectorAll(".seg[data-key]").forEach(g => {
        const v = String(BGSettings.get(g.dataset.key));
        g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.value === v));
      });
      box.querySelectorAll("input[type=checkbox][data-key]").forEach(i => { i.checked = !!BGSettings.get(i.dataset.key); });
      box.querySelectorAll("[data-show]").forEach(el => {
        const [k, v] = el.dataset.show.split("=");
        el.hidden = String(BGSettings.get(k)) !== v;
      });
      $("set-age").value = toSlider(BGSettings.get("treeAge"));
      $("set-age-out").textContent = `${BG.fmtAge(BGSettings.get("treeAge"))} million years`;
      box.querySelector(".tree-settings").classList.toggle("inactive", BGSettings.get("view") !== "tree");
    }
    box.querySelectorAll(".seg[data-key]").forEach(g => {
      g.querySelectorAll("button").forEach(b => {
        b.onclick = () => {
          const cur = BGSettings.get(g.dataset.key);
          BGSettings.set(g.dataset.key, typeof cur === "number" ? +b.dataset.value : b.dataset.value);
        };
      });
    });
    box.querySelectorAll("input[type=checkbox][data-key]").forEach(i => {
      i.onchange = () => {
        if (i.dataset.key === "showExtinct") { BG.setShowExtinct(i.checked); return; }
        BGSettings.set(i.dataset.key, i.checked);
      };
    });
    $("set-age").oninput = e => {
      const a = toAge(+e.target.value);
      BGSettings.set("treeAge", +(a >= 10 ? Math.round(a) : a.toFixed(1)));
    };
    BGSettings.on(sync);
    sync();

    const open = on => {
      box.hidden = !on;
      btn.setAttribute("aria-expanded", on);
      if (on) box.querySelector("button, input").focus();
    };
    btn.onclick = () => open(box.hidden);
    $("settings-close").onclick = () => { open(false); btn.focus(); };
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) { open(false); btn.focus(); } });
    document.addEventListener("pointerdown", e => {
      if (!box.hidden && !e.target.closest(".settings-wrap")) open(false);
    });
  }

  BG.init = function (view, opts = {}) {
    const $ = id => document.getElementById(id);
    const S = { mode: "explore", pinned: null, hovered: null, game: games[0] || null, playRoot: BG.root };
    BG.state = S;
    // games start in the clade that was open in Explore, not wherever the previous game left the map
    const ctx = { view, $, esc, label, source, credit, cladeMenu, startRoot: () => S.playRoot };

    // ---- mode switch, in the page header
    $("modes").innerHTML = `
      <div class="modes" role="tablist" aria-label="Mode">
        <button role="tab" id="mode-explore" aria-selected="true">Explore</button>
        <button role="tab" id="mode-play" aria-selected="false">Play</button>
      </div>
      <div class="settings-wrap">
        <button id="settings-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="settings">⚙ Settings</button>
        <div class="settings" id="settings" role="dialog" aria-label="Settings" hidden></div>
      </div>`;
    buildSettings($);

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
        <section class="panel">
          <h2>How to read the map</h2>
          ${opts.about || ""}
        </section>
      </div>
      <div id="play-mode" class="mode-panels" hidden>
        <section class="panel">
          <label class="field" for="game-select"><span class="hint">Game</span>
            <select id="game-select"></select>
            <small class="hint" id="game-blurb"></small>
          </label>
        </section>
        <div id="game-body"></div>
        <section class="panel">
          <h2>How to play</h2>
          <div id="game-howto"></div>
        </section>
      </div>`;


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
      $("game-select").value = game.id;
      $("game-blurb").textContent = game.blurb || "";
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
    $("game-select").innerHTML = games.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join("");
    $("game-select").onchange = () => {
      const g = games.find(x => x.id === $("game-select").value);
      if (g && g !== S.game) chooseGame(g);
    };

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
      if (m === "play") S.playRoot = view.root ? view.root() : BG.root;
      if (m === "play" && S.game) chooseGame(S.game);
    }
    $("mode-explore").onclick = () => setMode("explore");
    $("mode-play").onclick = () => setMode("play");
  };
})();
