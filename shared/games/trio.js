// Game: Closest relatives. Three species; pick the two that are most closely related.
// Every question has exactly one answer: two species come from one side of a split and the third
// from the other, so the pair always shares a younger ancestor than either does with the third.
(function () {
  const S = { filter: null, q: null, chosen: [], done: false, played: 0, right: 0, streak: 0 };
  let ctx = null, $ = null;
  const LETTERS = ["A", "B", "C"];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  // weighted choice
  const pickBy = (arr, weight) => {
    const w = arr.map(weight);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length - 1];
  };
  // well-known species come up more often (fossils count as moderately well known)
  const fame = l => Math.sqrt(l.data.extinct ? 2000 : (l.data.obs || 1));
  const withPhoto = n => n.leaves().filter(l => (l.data.photos || []).length);

  // splits inside the chosen clade that can produce a question: one side holds at least two species
  function splits() {
    const out = [];
    S.filter.each(n => {
      if (!n.children || n.children.length < 2) return;
      if (n.children.some(c => withPhoto(c).length >= 2) && n.children.filter(c => withPhoto(c).length).length >= 2) out.push(n);
    });
    return out;
  }

  function makeQuestion() {
    const options = splits();
    if (!options.length) return null;
    // most splits are small and deep inside groups; weighting by size keeps questions varied
    const split = pickBy(options, n => n.nLeaves);

    const pairSide = pick(split.children.filter(c => withPhoto(c).length >= 2));
    const oddSide = pick(split.children.filter(c => c !== pairSide && withPhoto(c).length));
    const pool = withPhoto(pairSide);
    const a = pickBy(pool, fame);
    const b = pickBy(pool.filter(l => l !== a), fame);
    const c = pickBy(withPhoto(oddSide), fame);
    const species = d3.shuffle([a, b, c]);
    return { species, pair: [a, b], odd: c, pairClade: BG.mrca(a, b), split };
  }

  function card(l, i) {
    const photos = l.data.photos || [];
    const ph = photos[Math.floor(Math.random() * photos.length)];
    const b = document.createElement("button");
    b.className = "card";
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `
      <img alt="" crossorigin="anonymous">
      <span class="t">
        <span class="letter">${LETTERS[i]}</span>
        <span class="tags" hidden></span>
        <strong></strong>
        <em></em>
        <small></small>
      </span>`;
    const img = b.querySelector("img");
    img.onerror = () => { img.style.visibility = "hidden"; };
    if (ph) img.src = ph.u.replace("/medium.", "/small.");
    img.alt = l.data.common || l.name;
    b.querySelector("strong").textContent = (l.data.extinct ? "† " : "") + (l.data.common || l.name);
    b.querySelector("em").textContent = l.data.common ? l.name : "";
    b.querySelector("small").innerHTML = ph ? ctx.credit(ph) : "";
    b.querySelector("small").onclick = e => e.stopPropagation();
    b.onclick = () => toggle(i);
    return b;
  }

  function toggle(i) {
    if (S.done) return;
    const at = S.chosen.indexOf(i);
    if (at >= 0) S.chosen.splice(at, 1);
    else {
      if (S.chosen.length === 2) S.chosen.shift();
      S.chosen.push(i);
    }
    [...$("tr-cards").children].forEach((el, j) => {
      el.setAttribute("aria-pressed", S.chosen.includes(j));
      el.classList.toggle("odd", S.chosen.length === 2 && !S.chosen.includes(j));
    });
    $("tr-check").disabled = S.chosen.length !== 2;
    // show the chosen two on the map while deciding
    ctx.view.marks({ pins: S.chosen.map(j => ({ node: S.q.species[j], kind: "pick", label: LETTERS[j] })) });
  }

  function newQuestion() {
    S.q = makeQuestion();
    S.chosen = [];
    S.done = false;
    $("tr-result").hidden = true;
    $("tr-check").hidden = false;
    $("tr-check").disabled = true;
    const cards = $("tr-cards");
    cards.innerHTML = "";
    ctx.view.marks(null);
    ctx.view.reset(S.filter);
    if (!S.q) {
      cards.innerHTML = `<p class="hint">This clade is too small for this game. Choose a bigger one above.</p>`;
      $("tr-check").hidden = true;
      return;
    }
    S.q.species.forEach((l, i) => cards.appendChild(card(l, i)));
  }

  function check() {
    if (S.chosen.length !== 2 || S.done) return;
    S.done = true;
    const q = S.q;
    const idx = n => q.species.indexOf(n);
    const pairIdx = q.pair.map(idx), oddIdx = idx(q.odd);
    const correct = S.chosen.every(j => pairIdx.includes(j));
    S.played++;
    if (correct) { S.right++; S.streak++; } else S.streak = 0;

    // the answer gets its own colours (green pair, orange odd one out); the player's picks become tags
    [...$("tr-cards").children].forEach((el, j) => {
      el.classList.remove("odd");
      el.setAttribute("aria-pressed", "false");
      el.classList.toggle("right", pairIdx.includes(j));
      el.classList.toggle("outgroup", j === oddIdx);
      const tags = el.querySelector(".tags");
      tags.innerHTML = (pairIdx.includes(j) ? `<span class="tag pair">✓ Closest relatives</span>` : `<span class="tag outgroup">Odd one out</span>`) +
        (S.chosen.includes(j) ? `<span class="tag">Your pick</span>` : "");
      tags.hidden = false;
    });
    const name = n => n.data.common || n.name;
    const clade = n => n.name + (n.data.common ? ` (${n.data.common})` : "");
    $("tr-verdict").textContent = correct ? "Correct!" : "Not quite.";
    $("tr-explain").innerHTML = `
      <b>${LETTERS[pairIdx[0]]} ${ctx.esc(name(q.pair[0]))}</b> and <b>${LETTERS[pairIdx[1]]} ${ctx.esc(name(q.pair[1]))}</b>
      share an ancestor about <b>${BG.fmtAge(q.pairClade.age)} million years ago</b>, in ${ctx.esc(clade(q.pairClade))}.
      <b>${LETTERS[oddIdx]} ${ctx.esc(name(q.odd))}</b> split from both of them about
      <b>${BG.fmtAge(q.split.age)} million years ago</b>, in ${ctx.esc(clade(q.split))}.`;
    $("tr-tally").innerHTML = `<span><b>${S.right}</b> of ${S.played} right</span><span>Streak <b>${S.streak}</b></span>`;
    $("tr-result").hidden = false;
    $("tr-check").hidden = true;

    // open the clade where all three meet, and highlight both clades on the map
    ctx.view.setRoot(q.split);
    ctx.view.marks({
      areas: [{ node: q.split, kind: "soft" }, { node: q.pairClade, strong: true, kind: "pair" }],
      routes: [{ from: q.pair[0], to: q.pair[1], via: q.pairClade, kind: "pair" }, { from: q.odd, to: q.pairClade, via: q.split, alt: true }],
      pins: q.species.map((l, j) => ({ node: l, kind: l === q.odd ? "answer" : "pair", label: LETTERS[j] })),
    });
  }

  function setFilter(n) {
    S.filter = n || BG.root;
    $("tr-count").textContent = `${withPhoto(S.filter).length.toLocaleString("en-US")} species to draw from`;
  }

  BG.registerGame({
    id: "trio",
    title: "Closest relatives",
    blurb: "Three species: which two are most closely related?",
    howTo: `<ol class="legend">
      <li><b>Pick two cards</b>: the two species you think share the most recent common ancestor. The third is the odd one out.</li>
      <li><b>Check</b> to see the answer: the closest relatives turn <b style="color:var(--good)">green</b> and the odd one out <b style="color:var(--answer)">orange</b>, on the cards and on the map. The map opens the clade where all three meet; its dashed outline is the clade that includes the odd one out.</li>
      <li>Looks can mislead. Whales are closer to hippos than hippos are to pigs, and birds are closer to crocodiles than crocodiles are to lizards.</li>
    </ol>`,

    mount(el, c) {
      ctx = c;
      $ = c.$;
      el.innerHTML = `
        <section class="panel">
          <label class="field" for="tr-clade"><span class="hint">Species from</span>
            <select id="tr-clade"></select>
            <small class="hint" id="tr-count"></small>
          </label>
        </section>
        <section class="panel">
          <h2>Which two are closest relatives?</h2>
          <div class="trio" id="tr-cards"></div>
          <button id="tr-check" class="primary" disabled>Check</button>
          <div class="result" id="tr-result" hidden>
            <div class="verdict" id="tr-verdict"></div>
            <p class="hint" id="tr-explain"></p>
            <div class="tally" id="tr-tally"></div>
          </div>
          <button id="tr-next">Next three</button>
        </section>`;
      $("tr-check").onclick = check;
      $("tr-next").onclick = newQuestion;
    },

    enter() {
      const current = ctx.startRoot();
      setFilter(current);
      ctx.cladeMenu($("tr-clade"), current, n => { setFilter(n); newQuestion(); });
      newQuestion();
    },

    leave() {
      S.done = false;
      ctx.view.marks(null);
      ctx.view.highlight(null);
    },

    // the map is for looking around; answers are given with the cards
    hover(n) { if (!S.done) ctx.view.highlight(n); },
    click() {},

    limitRoot: () => S.filter || BG.root,
  });
})();
