// Game: Which clade? A photo and four clade names; pick the one it belongs to.
// The four options never overlap: they are the first named groups found walking down from a context
// clade. Harder levels use a context clade closer to the species, so the options are closer relatives.
(function () {
  const K = () => BG.kit;
  const S = { filter: null, level: "easy", q: null, done: false, played: 0, right: 0, streak: 0 };
  let ctx = null, $ = null;
  const LEVELS = { easy: null, medium: [40, 300], hard: [8, 40] };

  // an option's display name: a named clade, or a lone species standing for its group (Monotremata)
  const optName = n => n.children ? (n.unnamed ? null : n.name) : (n.data.aliases || []).find(a => a && a !== n.name) || null;
  const optCommon = n => n.children ? n.data.common : "";

  // the first named groups below n, one per branch (unnamed clades are looked through)
  function frontier(n) {
    const out = [];
    (n.children || []).forEach(c => {
      if (optName(c)) out.push(c);
      else if (c.children) out.push(...frontier(c));
    });
    return out;
  }

  function contextFor(target) {
    const band = LEVELS[S.level];
    if (!band) return S.filter;
    const inside = target.ancestors().filter(a => a !== target && a.ancestors().includes(S.filter));
    // the broadest ancestor whose size falls in the band
    const fit = inside.filter(a => a.nLeaves >= band[0] && a.nLeaves <= band[1]);
    return fit.length ? fit[fit.length - 1] : (inside.find(a => a.nLeaves >= band[0]) || S.filter);
  }

  function optionsFor(target, context) {
    let items = frontier(context);
    const expandable = i => i.children && frontier(i).length >= 2;
    if (S.level === "easy") {
      // break up any group holding more than about a sixth of the species, so the options are
      // major groups like mammals, birds, insects or molluscs rather than the first few branches
      const limit = Math.max(8, context.nLeaves / 6);
      for (let guard = 0; guard < 60; guard++) {
        const big = items.find(i => i.nLeaves > limit && expandable(i));
        if (!big) break;
        items = items.filter(i => i !== big).concat(frontier(big));
      }
    } else {
      // split the biggest groups until there are at least four to choose from
      for (let guard = 0; items.length < 4 && guard < 20; guard++) {
        const big = items.filter(expandable).sort((a, b) => b.nLeaves - a.nLeaves)[0];
        if (!big) break;
        items = items.filter(i => i !== big).concat(frontier(big));
      }
    }
    const answer = items.find(i => i === target || target.ancestors().includes(i));
    if (!answer || items.length < 2) return null;
    // distractors: prefer groups that are not single species
    const rest = items.filter(i => i !== answer);
    const sizable = rest.filter(i => i.nLeaves >= 3);
    const others = d3.shuffle(sizable.length >= 3 ? sizable : rest).slice(0, 3);
    return { answer, options: d3.shuffle([answer, ...others]) };
  }

  function newQuestion() {
    S.done = false;
    $("wc-result").hidden = true;
    ctx.view.marks(null);
    ctx.view.reset(S.filter);
    const pool = K().withPhoto(S.filter);
    let q = null;
    for (let tries = 0; tries < 30 && !q; tries++) {
      const target = K().pickBy(pool, K().fame);
      const context = contextFor(target);
      const o = optionsFor(target, context);
      if (o) q = { target, context, ...o };
    }
    S.q = q;
    const box = $("wc-options");
    box.innerHTML = "";
    if (!q) {
      box.innerHTML = `<p class="hint">This clade is too small for this level. Try an easier level or a bigger clade.</p>`;
      $("wc-photo").innerHTML = "";
      return;
    }
    const ph = K().photoOf(q.target);
    $("wc-photo").innerHTML = ph
      ? `<img alt="Photo of the species to classify" crossorigin="anonymous" src="${ctx.esc(ph.u)}"><span class="cn" id="wc-name"></span><span class="sp" id="wc-sci"></span><small>${ctx.credit(ph)}</small>`
      : `<span class="cn" id="wc-name">${ctx.esc(K().nameOf(q.target))}</span><span class="sp" id="wc-sci"></span>`;
    q.options.forEach(n => {
      const b = document.createElement("button");
      b.innerHTML = `<strong></strong><span></span>`;
      b.querySelector("strong").textContent = optName(n);
      b.querySelector("span").textContent = optCommon(n) || "";
      b.onclick = () => answer(n, b);
      box.appendChild(b);
    });
  }

  function answer(n, btn) {
    if (S.done || !S.q) return;
    S.done = true;
    const q = S.q, correct = n === q.answer;
    S.played++;
    if (correct) { S.right++; S.streak++; } else S.streak = 0;
    [...$("wc-options").children].forEach((b, i) => {
      if (q.options[i] === q.answer) b.classList.add("right");
    });
    if (!correct) btn.classList.add("wrong");
    if ($("wc-name")) $("wc-name").textContent = K().nameOf(q.target);
    if ($("wc-sci")) $("wc-sci").textContent = q.target.data.common ? q.target.name : "";
    $("wc-verdict").textContent = correct ? "Correct!" : "Not quite.";
    $("wc-explain").innerHTML = `${ctx.esc(K().nameOf(q.target))} belongs to <b>${ctx.esc(optName(q.answer))}</b>${optCommon(q.answer) ? " (" + ctx.esc(optCommon(q.answer)) + ")" : ""}.`;
    $("wc-tally").innerHTML = `<span><b>${S.right}</b> of ${S.played} right</span><span>Streak <b>${S.streak}</b></span>`;
    $("wc-result").hidden = false;
    ctx.view.setRoot(q.context);
    const areas = [{ node: q.answer, kind: "pair", strong: true }];
    if (!correct && n.children) areas.push({ node: n, kind: "wrong", strong: true });
    ctx.view.marks({ areas, pins: [{ node: q.target, kind: "pair", label: "✓" }].concat(!correct && !n.children ? [{ node: n, kind: "answer", label: "✗" }] : []) });
  }

  BG.registerGame({
    id: "whichclade",
    title: "Which clade?",
    blurb: "A photo and four groups: which one does it belong to?",
    howTo: `<ol class="legend">
      <li><b>Look at the photo</b> and pick the group it belongs to. The four groups never overlap, so exactly one is right.</li>
      <li><b>Easy</b> asks about broad groups, <b>Hard</b> about close relatives.</li>
      <li>The map then shows the right group in <b style="color:var(--good)">green</b>, and your pick in <b style="color:var(--answer)">orange</b> if it was wrong.</li>
    </ol>`,

    mount(el, c) {
      ctx = c;
      $ = c.$;
      el.innerHTML = `
        ${K().filterField("wc-clade", "wc-count")}
        <section class="panel">
          <div class="seg" role="group" aria-label="Level" id="wc-level">
            <button data-level="easy" aria-pressed="true">Easy</button>
            <button data-level="medium" aria-pressed="false">Medium</button>
            <button data-level="hard" aria-pressed="false">Hard</button>
          </div>
          <h2>Which group does it belong to?</h2>
          <div class="photo" id="wc-photo"></div>
          <div class="options" id="wc-options"></div>
          <div class="result" id="wc-result" hidden>
            <div class="verdict" id="wc-verdict"></div>
            <p class="hint" id="wc-explain"></p>
            <div class="tally" id="wc-tally"></div>
          </div>
          <button id="wc-next">Next photo</button>
        </section>`;
      [...$("wc-level").children].forEach(b => {
        b.onclick = () => {
          S.level = b.dataset.level;
          [...$("wc-level").children].forEach(x => x.setAttribute("aria-pressed", x === b));
          newQuestion();
        };
      });
      $("wc-next").onclick = newQuestion;
    },

    enter() {
      S.filter = K().speciesFrom(ctx, "wc-clade", "wc-count", n => { S.filter = n; newQuestion(); });
      newQuestion();
    },
    leave() { ctx.view.marks(null); ctx.view.highlight(null); },
    hover() {},
    click() {},
    limitRoot: () => S.filter || BG.root,
  });
})();
