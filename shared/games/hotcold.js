// Game: Hot and cold. A hidden species; every guess says how long ago it shared an ancestor with the
// answer, and the map closes in on the smallest clade known to contain it.
(function () {
  const K = () => BG.kit;
  const S = { filter: null, target: null, guesses: [], known: null, done: false, hint: false, solved: 0, total: 0 };
  let ctx = null, $ = null;

  function say(html, cls = "") {
    const el = $("hc-say");
    el.className = "hint " + cls;
    el.innerHTML = html;
  }

  function newTarget() {
    const pool = K().withPhoto(S.filter);
    S.target = pool.length ? K().pickBy(pool, K().fame) : null;
    S.guesses = [];
    S.known = S.filter;
    S.done = false;
    S.hint = false;
    $("hc-list").innerHTML = "";
    $("hc-hint-photo").hidden = true;
    $("hc-reveal").hidden = true;
    $("hc-hint").hidden = false;
    $("hc-giveup").hidden = false;
    $("hc-input").value = "";
    // names to type, limited to the chosen clade
    $("hc-names").innerHTML = S.filter.leaves().map(l =>
      `<option value="${ctx.esc(l.data.common ? `${l.data.common} (${l.name})` : l.name)}"></option>`).join("");
    say("Guess any species: click one on the map (zoom in or double-click a clade to find it), or type a name.");
    ctx.view.marks(null);
    ctx.view.reset(S.filter);
  }

  function findTyped(text) {
    const t = text.trim().toLowerCase();
    if (!t) return null;
    const leaves = S.filter.leaves();
    const full = l => (l.data.common ? `${l.data.common} (${l.name})` : l.name).toLowerCase();
    return leaves.find(l => full(l) === t) ||
      leaves.find(l => l.name.toLowerCase() === t || (l.data.common || "").toLowerCase() === t) ||
      leaves.find(l => full(l).includes(t)) || null;
  }

  function guess(l) {
    if (S.done || !S.target) return;
    if (!l) return;
    if (l.children) {
      say(`${ctx.esc(l.name)} is a group, not a species. Zoom in or double-click it to find species inside.`);
      return;
    }
    if (!l.ancestors().includes(S.filter)) { say("That species is outside the clade you are playing in."); return; }
    if (S.guesses.some(g => g.leaf === l)) { say(`You already guessed ${ctx.esc(K().nameOf(l))}.`); return; }

    if (l === S.target) { S.guesses.push({ leaf: l, anc: l }); finish(true); return; }
    const anc = BG.mrca(l, S.target);
    const before = S.known;
    S.guesses.push({ leaf: l, anc });
    // every shared ancestor contains the answer, so they are nested: keep the innermost
    if (anc !== S.known && anc.ancestors().includes(S.known)) S.known = anc;
    const closer = S.known !== before;
    const ago = `about <b>${BG.fmtAge(anc.age)} million years ago</b>`;
    say(`${closer ? "<b>Warmer!</b>" : "<b>Colder.</b>"} ${ctx.esc(K().nameOf(l))} shares an ancestor with the mystery species ${ago}, in ${ctx.esc(K().cladeName(anc))}.`,
      closer ? "warm" : "");
    renderList();
    showOnMap();
  }

  function renderList() {
    const best = S.guesses.reduce((b, g) => (!b || g.anc.age < b.anc.age ? g : b), null);
    $("hc-list").innerHTML = S.guesses.map((g, i) => {
      const win = g.leaf === S.target;
      return `<li class="${win ? "win" : g === best ? "best" : ""}">
        <span class="no">${i + 1}</span>
        <span>${ctx.esc(K().nameOf(g.leaf))}</span>
        <span class="age">${win ? "✓" : "~" + BG.fmtAge(g.anc.age) + " My"}</span>
        ${win ? "" : `<span class="where">in ${ctx.esc(K().cladeName(g.anc))}</span>`}
      </li>`;
    }).reverse().join("");
  }

  function showOnMap(reveal = false) {
    const best = S.guesses.reduce((b, g) => (!b || g.anc.age < b.anc.age ? g : b), null);
    if (ctx.view.root() !== S.known) ctx.view.setRoot(S.known);
    const pins = S.guesses.filter(g => g.leaf !== S.target).map((g, i) => ({
      node: g.leaf, kind: g === best ? "warm" : "cold", label: String(S.guesses.indexOf(g) + 1),
    }));
    const marks = { areas: [{ node: S.known, kind: "hint" }], pins };
    if (reveal) {
      marks.pins.push({ node: S.target, kind: "pair", label: "✓" });
      if (best && best.leaf !== S.target) marks.routes = [{ from: best.leaf, to: S.target, via: best.anc, kind: "pair" }];
    }
    ctx.view.marks(marks);
  }

  function finish(won) {
    S.done = true;
    if (won) { S.solved++; S.total += S.guesses.length; }
    const n = S.guesses.length;
    say(won ? `<b>Found it in ${n} ${n === 1 ? "guess" : "guesses"}!</b>` : "Here is the answer.", won ? "good" : "");
    const card = $("hc-reveal");
    card.innerHTML = "";
    card.appendChild(K().speciesCard(S.target, ctx, { size: "medium" }));
    card.hidden = false;
    $("hc-hint").hidden = true;
    $("hc-hint-photo").hidden = true;
    $("hc-giveup").hidden = true;
    $("hc-tally").textContent = S.solved ? `Solved ${S.solved} · ${(S.total / S.solved).toFixed(1)} guesses on average` : "";
    renderList();
    // open the smallest clade that shows both the answer and the closest guess
    const best = S.guesses.filter(g => g.leaf !== S.target).reduce((b, g) => (!b || g.anc.age < b.anc.age ? g : b), null);
    S.known = best ? best.anc : S.target.parent;
    showOnMap(true);
  }

  BG.registerGame({
    id: "hotcold",
    title: "Hot and cold",
    blurb: "Find a hidden species: every guess tells you how close you are.",
    howTo: `<ol class="legend">
      <li><b>Guess a species</b> by clicking it on the map or typing its name.</li>
      <li>Each guess tells you <b>how long ago</b> it shared an ancestor with the mystery species. The younger, the warmer.</li>
      <li>The map closes in on the <b>smallest clade known to contain the answer</b>, outlined with a dashed line. Numbered pins mark your guesses; the orange one is your closest so far.</li>
      <li>Stuck? Show a photo as a hint, or give up to see the answer.</li>
    </ol>`,

    mount(el, c) {
      ctx = c;
      $ = c.$;
      el.innerHTML = `
        ${K().filterField("hc-clade", "hc-count")}
        <section class="panel">
          <h2>Find the mystery species</h2>
          <p class="hint" id="hc-say"></p>
          <form class="searchrow" id="hc-form" autocomplete="off">
            <input id="hc-input" list="hc-names" placeholder="Type a species name" aria-label="Species name">
            <datalist id="hc-names"></datalist>
            <button type="submit">Guess</button>
          </form>
          <div class="photo" id="hc-hint-photo" hidden></div>
          <div id="hc-reveal" class="trio" hidden></div>
          <ol class="guesses" id="hc-list"></ol>
          <div class="chips">
            <button id="hc-hint">Show a photo (hint)</button>
            <button id="hc-giveup">Give up</button>
            <button id="hc-new">New mystery species</button>
          </div>
          <div class="tally" id="hc-tally"></div>
        </section>`;
      $("hc-form").onsubmit = e => {
        e.preventDefault();
        if (S.done) return;
        const l = findTyped($("hc-input").value);
        if (!l) { say("No species with that name in this clade. Pick one from the suggestions."); return; }
        $("hc-input").value = "";
        guess(l);
      };
      $("hc-hint").onclick = () => {
        if (S.done || !S.target) return;
        const ph = K().photoOf(S.target);
        const box = $("hc-hint-photo");
        box.innerHTML = ph ? `<img alt="Hint: photo of the mystery species" crossorigin="anonymous" src="${ctx.esc(ph.u)}"><small>${ctx.credit(ph)}</small>`
          : `<span class="hint">No photo for this one.</span>`;
        box.hidden = false;
        $("hc-hint").hidden = true;
        S.hint = true;
      };
      $("hc-giveup").onclick = () => { if (!S.done && S.target) finish(false); };
      $("hc-new").onclick = newTarget;
    },

    enter() {
      S.filter = K().speciesFrom(ctx, "hc-clade", "hc-count", n => { S.filter = n; newTarget(); });
      newTarget();
    },

    leave() { ctx.view.marks(null); ctx.view.highlight(null); },
    hover(n) { ctx.view.highlight(n); },
    click(n) { guess(n); },
    limitRoot: () => S.filter || BG.root,
  });
})();
