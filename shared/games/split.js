// Game: When did they split? Two species; guess when their lineages separated.
// The guess is shown as a ring on the map; points depend on how many times too early or late it was.
(function () {
  const K = () => BG.kit;
  const S = { filter: null, q: null, done: false, played: 0, points: 0 };
  let ctx = null, $ = null;
  const MIN = 0.5;   // My, the young end of the slider
  const EPOCHS = [["Paleocene", 66, 56], ["Eocene", 56, 33.9], ["Oligocene", 33.9, 23], ["Miocene", 23, 5.33],
    ["Pliocene", 5.33, 2.58], ["Pleistocene", 2.58, 0.0117], ["Holocene", 0.0117, 0]];
  const maxAge = () => (S.filter === BG.root ? BG.MAX_AGE : Math.max(S.filter.age * 1.12, 5));
  // the slider is logarithmic, so every step is the same factor
  const toAge = v => MIN * Math.pow(maxAge() / MIN, v / 1000);
  const period = a => {
    const list = a < 66 ? EPOCHS : BG.ERAS;
    const p = list.find(d => a <= d[1] && a > d[2]) || list[0];
    return p[0];
  };

  function splits() {
    const out = [];
    S.filter.each(n => {
      if (n.children && n.children.filter(c => K().withPhoto(c).length).length >= 2) out.push(n);
    });
    return out;
  }

  function newQuestion() {
    const options = splits();
    S.done = false;
    $("sp-result").hidden = true;
    $("sp-lock").hidden = false;
    $("sp-slider").disabled = false;
    ctx.view.reset(S.filter);
    const cards = $("sp-cards");
    cards.innerHTML = "";
    if (!options.length) {
      S.q = null;
      cards.innerHTML = `<p class="hint">This clade is too small for this game. Choose a bigger one above.</p>`;
      $("sp-lock").hidden = true;
      return;
    }
    // weighting by the square root of size mixes deep and recent splits
    const split = K().pickBy(options, n => Math.sqrt(n.nLeaves));
    const sides = d3.shuffle(split.children.filter(c => K().withPhoto(c).length)).slice(0, 2);
    const a = K().pickBy(K().withPhoto(sides[0]), K().fame), b = K().pickBy(K().withPhoto(sides[1]), K().fame);
    S.q = { a, b, split };
    cards.appendChild(K().speciesCard(a, ctx, { letter: "A" }));
    cards.appendChild(K().speciesCard(b, ctx, { letter: "B" }));
    $("sp-slider").value = 500;
    update();
  }

  function update() {
    const g = toAge(+$("sp-slider").value);
    $("sp-out").textContent = `${BG.fmtAge(g)} million years ago`;
    $("sp-period").textContent = period(g);
    if (S.done || !S.q) return;
    ctx.view.marks({
      pins: [{ node: S.q.a, kind: "pick", label: "A" }, { node: S.q.b, kind: "pick", label: "B" }],
      rings: [{ age: g, label: `your guess · ${BG.fmtAge(g)} My` }],
    });
  }

  function lockIn() {
    if (S.done || !S.q) return;
    S.done = true;
    const g = toAge(+$("sp-slider").value), t = S.q.split.age;
    const factor = Math.max(g, t) / Math.min(g, t);
    const points = Math.round(5000 * Math.exp(-Math.abs(Math.log(g / t))));
    S.played++;
    S.points += points;
    $("sp-score").innerHTML = `${points.toLocaleString("en-US")} <span>/ 5,000</span>`;
    $("sp-bar").style.width = (points / 50) + "%";
    const off = factor < 1.1 ? "Spot on." : `Your guess was ${factor.toFixed(factor < 10 ? 1 : 0)}× too ${g > t ? "early" : "late"}.`;
    $("sp-explain").innerHTML = `A and B split about <b>${BG.fmtAge(t)} million years ago</b>, in the ${ctx.esc(period(t))}, in ${ctx.esc(K().cladeName(S.q.split))}. ${off}`;
    $("sp-tally").textContent = `${S.played} played · ${Math.round(S.points / S.played).toLocaleString("en-US")} points on average`;
    $("sp-result").hidden = false;
    $("sp-lock").hidden = true;
    $("sp-slider").disabled = true;
    // open a clade old enough that both your ring and the real one are on the map
    let view = S.q.split;
    while (view.parent && view !== S.filter && view.age * 1.12 < Math.max(g, t) * 1.02) view = view.parent;
    if (view === S.q.split && view.parent && view !== S.filter) view = view.parent;
    ctx.view.setRoot(view);
    ctx.view.marks({
      areas: [{ node: S.q.split, kind: "pair", strong: true }],
      routes: [{ from: S.q.a, to: S.q.b, via: S.q.split, kind: "pair" }],
      pins: [{ node: S.q.a, kind: "pair", label: "A" }, { node: S.q.b, kind: "pair", label: "B" }],
      rings: [{ age: t, kind: "pair", label: `split · ${BG.fmtAge(t)} My` }, { age: g, kind: "answer", label: `you · ${BG.fmtAge(g)} My` }],
    });
  }

  BG.registerGame({
    id: "split",
    title: "When did they split?",
    blurb: "Two species: guess when their lineages separated.",
    howTo: `<ol class="legend">
      <li><b>Slide</b> to the time you think the two lineages split. Your guess appears as a ring on the map; further in is longer ago.</li>
      <li><b>Lock in</b> to see the real split, drawn in <b style="color:var(--good)">green</b> next to your guess in <b style="color:var(--answer)">orange</b>.</li>
      <li>Points depend on how many times too early or late you were, so being 10 million years off matters for mammals but hardly at all for sponges.</li>
    </ol>`,

    mount(el, c) {
      ctx = c;
      $ = c.$;
      el.innerHTML = `
        ${K().filterField("sp-clade", "sp-count")}
        <section class="panel">
          <h2>When did these two split?</h2>
          <div class="trio" id="sp-cards"></div>
          <label class="slider" for="sp-slider">
            <span class="hint">Your guess</span>
            <output id="sp-out"></output>
            <span class="hint" id="sp-period"></span>
            <input type="range" id="sp-slider" min="0" max="1000" step="1" value="500" dir="rtl">
            <span class="hint" style="display:flex;justify-content:space-between"><span>longer ago</span><span>recently</span></span>
          </label>
          <button id="sp-lock" class="primary">Lock in guess</button>
          <div class="result" id="sp-result" hidden>
            <div class="score" id="sp-score"></div>
            <div class="bar"><i id="sp-bar" style="width:0"></i></div>
            <p class="hint" id="sp-explain"></p>
            <div class="tally" id="sp-tally"></div>
          </div>
          <button id="sp-next">Next pair</button>
        </section>`;
      $("sp-slider").oninput = update;
      $("sp-lock").onclick = lockIn;
      $("sp-next").onclick = newQuestion;
    },

    enter() {
      S.filter = K().speciesFrom(ctx, "sp-clade", "sp-count", n => { S.filter = n; newQuestion(); });
      newQuestion();
    },
    leave() { ctx.view.marks(null); ctx.view.highlight(null); },
    hover() {},
    click() {},
    limitRoot: () => S.filter || BG.root,
  });
})();
