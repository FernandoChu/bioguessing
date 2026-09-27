// Game: Place the animal. You see a photo, click where it belongs on the tree, and score by how long
// ago your pick and the answer shared an ancestor.
(function () {
  const S = { filter: null, rounds: [], round: 0, target: null, selected: null, result: null };
  let ctx = null, $ = null;
  const roundPhotos = new Map();   // each round's photo is chosen one round ahead and preloaded

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

  // Rounds can be limited to one clade
  function setFilter(n) {
    S.filter = n || BG.root;
    S.rounds = BG.MYSTERY.filter(m => {
      const l = BG.byName.get(m[2]);
      return l && (S.filter === BG.root || l.ancestors().includes(S.filter));
    });
    if (!S.rounds.length) S.rounds = BG.MYSTERY;
    S.round = 0;
    roundPhotos.clear();
    $("pa-count").textContent = `${S.rounds.length.toLocaleString("en-US")} species to guess`;
  }

  function newRound() {
    const m = S.rounds[S.round % S.rounds.length];
    S.target = { common: m[0], species: m[1], leaf: BG.byName.get(m[2]) };
    S.selected = null;
    S.result = null;
    const ph = photoFor(S.round);
    const img = $("pa-img");
    if (ph) {
      // if the image is blocked or missing, fall back to naming the animal
      img.onerror = () => {
        img.hidden = true;
        $("pa-common").textContent = S.target.common;
        $("pa-species").textContent = S.target.species;
        $("pa-credit").innerHTML = `The photo could not load here. <a href="${ctx.esc(ph.o)}" target="_blank" rel="noopener">See it on ${ctx.source(ph)}</a>`;
      };
      img.src = ph.u;
      img.hidden = false;
      $("pa-common").textContent = "";
      $("pa-species").textContent = "";
      $("pa-credit").innerHTML = ctx.credit(ph);
    } else {
      img.hidden = true;
      $("pa-common").textContent = S.target.common;
      $("pa-species").textContent = S.target.species;
      $("pa-credit").textContent = "";
    }
    $("pa-pick").textContent = "Nothing yet";
    $("pa-lock").disabled = true;
    $("pa-lock").hidden = false;
    $("pa-result").hidden = true;
    $("pa-bar").style.width = "0";
    ctx.view.reveal(null);
    ctx.view.select(null);
    ctx.view.highlight(null);
    ctx.view.reset(S.filter);
    preload(S.round + 1);
  }

  function lockIn() {
    if (!S.selected || S.result) return;
    const res = BG.score(S.selected, S.target.leaf);
    S.result = res;
    $("pa-score").innerHTML = `${res.points.toLocaleString("en-US")} <span>/ 5,000</span>`;
    $("pa-bar").style.width = (res.points / 50) + "%";
    $("pa-guess").textContent = ctx.label(res.guess);
    $("pa-answer").textContent = ctx.label(res.answer);
    $("pa-mrca").textContent = res.same ? "Exact match" : `${res.anc.name}, ~${BG.fmtAge(res.anc.age)} million years ago`;
    $("pa-common").textContent = S.target.common;
    $("pa-species").textContent = S.target.species + (S.target.leaf.data.extinct ? ` · † ${BG.livedText(S.target.leaf)}` : "");
    $("pa-result").hidden = false;
    $("pa-lock").hidden = true;
    ctx.view.highlight(null);
    ctx.view.select(null);
    ctx.view.reveal(res);
  }

  BG.registerGame({
    id: "place",
    title: "Place the animal",
    blurb: "See a photo, find where it belongs on the tree.",
    howTo: `<ol class="legend">
      <li><b>Pick a spot.</b> Click near the rim for a specific group, or further in along a branch for an older, broader lineage. Double-click a clade to open it for a closer look.</li>
      <li><b>Lock in your guess.</b> You score up to 5,000 points, depending on how long ago your pick and the answer shared an ancestor.</li>
      <li><b>Choose where the animals come from</b> with "Species from". Starting a game while viewing a clade plays inside it.</li>
    </ol>`,

    mount(el, c) {
      ctx = c;
      $ = c.$;
      el.innerHTML = `
        <section class="panel">
          <label class="field" for="pa-clade"><span class="hint">Species from</span>
            <select id="pa-clade"></select>
            <small class="hint" id="pa-count"></small>
          </label>
          <label class="check"><input type="checkbox" id="pa-hard"><span>Hide photos and common names on the map (harder)</span></label>
        </section>
        <section class="panel">
          <h2>Which animal is this?</h2>
          <div class="photo">
            <img id="pa-img" alt="Photo of the animal to place" crossorigin="anonymous" hidden>
            <span class="cn" id="pa-common"></span>
            <span class="sp" id="pa-species"></span>
            <small id="pa-credit"></small>
          </div>
          <div class="pick"><span class="hint">Your pick</span><strong id="pa-pick">Nothing yet</strong></div>
          <button id="pa-lock" class="primary" disabled>Lock in guess</button>
          <div class="result" id="pa-result" hidden>
            <div class="score" id="pa-score"></div>
            <div class="bar"><i id="pa-bar" style="width:0"></i></div>
            <dl class="kv">
              <dt><span class="swatch" style="background:var(--guess)"></span>Your guess</dt><dd id="pa-guess"></dd>
              <dt><span class="swatch" style="background:var(--answer)"></span>Answer</dt><dd id="pa-answer"></dd>
              <dt>Shared ancestor</dt><dd id="pa-mrca"></dd>
            </dl>
          </div>
          <button id="pa-next">Next animal</button>
        </section>`;
      $("pa-lock").onclick = lockIn;
      // a shortcut for the two map-hint settings; kept in sync when they change in Settings
      const syncHard = () => { $("pa-hard").checked = !BGSettings.get("treeThumbs") && !BGSettings.get("commonNames"); };
      $("pa-hard").onchange = e => {
        const hard = e.target.checked;   // read once: the first change re-syncs the box before the second
        BGSettings.set("treeThumbs", !hard);
        BGSettings.set("commonNames", !hard);
      };
      BGSettings.on(syncHard);
      syncHard();
      $("pa-next").onclick = () => { S.round++; newRound(); };
    },

    enter() {
      // play within whatever clade is being viewed
      const current = ctx.startRoot();
      setFilter(current);
      ctx.cladeMenu($("pa-clade"), current, n => { setFilter(n); newRound(); });
      newRound();
    },

    leave() {
      S.result = null;
      S.selected = null;
      ctx.view.reveal(null);
      ctx.view.select(null);
      ctx.view.highlight(null);
    },

    hover(n) { if (!S.result) ctx.view.highlight(n); },

    click(n) {
      if (S.result || !n) return;
      S.selected = n;
      ctx.view.select(n);
      $("pa-pick").textContent = ctx.label(n);
      $("pa-lock").disabled = false;
    },

    limitRoot: () => S.filter || BG.root,
  });
})();
