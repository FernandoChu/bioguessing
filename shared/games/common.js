// Helpers shared by the games.
(function () {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  // weighted random choice
  function pickBy(arr, weight) {
    const w = arr.map(weight);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length - 1];
  }
  // well-known species come up more often (fossils count as moderately well known)
  const fame = l => Math.sqrt(l.data.extinct ? 2000 : (l.data.obs || 1));
  const withPhoto = n => n.leaves().filter(l => (l.data.photos || []).length);
  const photoOf = l => { const p = l.data.photos || []; return p.length ? p[Math.floor(Math.random() * p.length)] : null; };
  const nameOf = l => (l.data.extinct ? "† " : "") + (l.data.common || l.name);
  const cladeName = n => n.name + (n.data.common ? ` (${n.data.common})` : "");

  // A species card: photo, names and credit. Returns the element.
  function speciesCard(l, ctx, { letter = "", size = "small", onClick = null } = {}) {
    const ph = photoOf(l);
    const el = document.createElement(onClick ? "button" : "div");
    el.className = "card";
    el.innerHTML = `
      <img alt="" crossorigin="anonymous">
      <span class="t">
        ${letter ? `<span class="letter">${letter}</span>` : ""}
        <span class="tags" hidden></span>
        <strong></strong>
        <em></em>
        <small></small>
      </span>`;
    const img = el.querySelector("img");
    img.onerror = () => { img.style.visibility = "hidden"; };
    if (ph) img.src = size === "medium" ? ph.u : ph.u.replace("/medium.", "/small.");
    img.alt = l.data.common || l.name;
    el.querySelector("strong").textContent = nameOf(l);
    el.querySelector("em").textContent = l.data.common ? l.name : "";
    const small = el.querySelector("small");
    small.innerHTML = ph ? ctx.credit(ph) : "";
    small.onclick = e => e.stopPropagation();
    if (onClick) el.onclick = onClick;
    return el;
  }

  // "Species from" menu wired to a filter setter; returns nothing
  function speciesFrom(ctx, selectId, countId, onChange) {
    const current = ctx.startRoot();
    const apply = n => {
      const c = document.getElementById(countId);
      if (c) c.textContent = `${withPhoto(n).length.toLocaleString("en-US")} species to draw from`;
      onChange(n);
    };
    ctx.cladeMenu(document.getElementById(selectId), current, apply);
    const c = document.getElementById(countId);
    if (c) c.textContent = `${withPhoto(current).length.toLocaleString("en-US")} species to draw from`;
    return current;
  }

  const filterField = (id, countId) => `
    <section class="panel">
      <label class="field" for="${id}"><span class="hint">Species from</span>
        <select id="${id}"></select>
        <small class="hint" id="${countId}"></small>
      </label>
    </section>`;

  BG.kit = { pick, pickBy, fame, withPhoto, photoOf, nameOf, cladeName, speciesCard, speciesFrom, filterField };
})();
