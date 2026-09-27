// Tree view: a left-to-right tree of the clade being viewed, cut off at a number of named levels
// (unnamed splits are kept as branch points but do not count) or at an age. Cut-off groups are drawn
// as wedges with their size and a few photos. Same interface as the radial view.
(function () {
  BG.views = BG.views || {};
  BG.views.tree = function (host) {
    const { root } = BG;
    const EPOCHS = [["Paleocene", 66, 56], ["Eocene", 56, 33.9], ["Oligocene", 33.9, 23], ["Miocene", 23, 5.33],
      ["Pliocene", 5.33, 2.58], ["Pleistocene", 2.58, 0.0117]];
    const el = host.el;
    el.innerHTML = `<div class="tv-axis"><svg class="tv-axis-svg" aria-hidden="true"></svg></div>
      <svg class="tv-svg" role="img" aria-label="Tree of the clade being viewed"></svg>`;
    const axis = d3.select(el).select(".tv-axis-svg"), svg = d3.select(el).select(".tv-svg");
    const layer = name => svg.append("g").attr("class", name);
    const gEra = layer("eras"), gArea = layer("areas"), gBranch = layer("branches"), gLabel = layer("labels"),
      gLine = layer("lines"), gPin = layer("pins");

    let viewRoot = root, active = false, hoverN = null, selN = null, result = null, marks = null;
    let L = null;   // layout: { tips, shown: Set, pos: Map(node -> {x, y, end}), W, H, xTip, tmax, X }
    const S = k => BGSettings.get(k);
    const limitRoot = () => (BG.roundClade ? BG.roundClade() : root);
    const tmaxFor = n => n === root ? BG.MAX_AGE : Math.max(n.age * 1.12, 0.05);
    const f1 = v => v.toFixed(1);

    // ---- which nodes are drawn: everything down to the cut; a cut clade becomes one row
    function collapsedAt(n, namedLevel) {
      if (!n.children || n === viewRoot) return false;
      if (S("treeCut") === "time") return n.age < S("treeAge");
      const depth = S("treeDepth");
      return depth > 0 && !n.unnamed && namedLevel >= depth;
    }

    function layout() {
      const W = Math.max(320, el.clientWidth || 700);
      const labelW = Math.min(360, Math.max(170, W * 0.44));
      const x0 = 14, xTip = W - labelW;
      const tips = [], shown = new Set(), tipOf = new Set();
      (function walk(n, level) {
        shown.add(n);
        const lvl = n !== viewRoot && !n.unnamed && n.children ? level + 1 : level;
        if (!n.children || collapsedAt(n, lvl)) { tips.push(n); tipOf.add(n); return; }
        n.children.forEach(c => walk(c, lvl));
      })(viewRoot, 0);

      // rows: species are short, cut-off groups are taller to fit their photos
      const groupRow = S("treeThumbs") ? 50 : 36, spRow = 28, top = 8;
      let y = top;
      const pos = new Map();
      tips.forEach(t => {
        const h = t.children ? groupRow : spRow;
        pos.set(t, { y: y + h / 2, h });
        y += h;
      });
      const H = y + top;

      const tmax = tmaxFor(viewRoot);
      const X = t => x0 + (xTip - x0) * (1 - Math.sqrt(Math.max(0, Math.min(t, tmax)) / tmax));
      const timed = S("treeLengths") === "time";
      const WEDGE = 26;   // width of a cut-off group's wedge when branches are evenly spaced
      const height = new Map();
      (function h(n) {
        const v = tipOf.has(n) ? 0 : 1 + Math.max(...n.children.map(h));
        height.set(n, v);
        return v;
      })(viewRoot);
      const step = (xTip - WEDGE - x0) / Math.max(1, height.get(viewRoot));
      (function place(n) {
        const p = pos.get(n) || {};
        if (tipOf.has(n)) {
          if (n.children) {             // a cut-off group: its split, then a wedge to the tips' line
            p.x = timed ? X(n.age) : xTip - WEDGE;
            p.end = xTip;
          } else {                      // a species: living ones reach today, extinct ones stop early
            p.x = timed ? X(n.data.extinct ? n.data.la : 0) : xTip;
            p.end = p.x;
          }
        } else {
          n.children.forEach(place);
          const ys = n.children.map(c => pos.get(c).y);
          p.y = (ys[0] + ys[ys.length - 1]) / 2;
          p.x = timed ? X(n.age) : xTip - WEDGE - height.get(n) * step;
          p.end = p.x;
        }
        pos.set(n, p);
      })(viewRoot);
      L = { tips, shown, tipOf, pos, W, H, x0, xTip, tmax, X, timed };
    }

    // the drawn node that stands for n (n itself, or the cut-off group it is inside)
    const rep = n => n.ancestors().find(a => L.shown.has(a)) || null;
    const inView = n => n === viewRoot || n.ancestors().includes(viewRoot);
    const px = n => L.pos.get(n);

    function render() {
      if (!active) return;
      layout();
      const { W, H, xTip, X, timed, tips, pos } = L;
      svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
      axis.attr("width", W).attr("height", 30).attr("viewBox", `0 0 ${W} 30`);

      // geological periods (time scale only)
      const eras = timed && S("showEras") ? (L.tmax < 70 ? EPOCHS : BG.ERAS).filter(d => d[2] < L.tmax) : [];
      gEra.selectAll("rect").data(eras, d => d[0]).join("rect").attr("class", (d, i) => i % 2 ? "band" : "band off")
        .attr("x", d => X(Math.min(d[1], L.tmax))).attr("width", d => X(d[2]) - X(Math.min(d[1], L.tmax)))
        .attr("y", 0).attr("height", H);
      axis.selectAll("rect").data(eras, d => d[0]).join("rect").attr("class", (d, i) => i % 2 ? "band" : "band off")
        .attr("x", d => X(Math.min(d[1], L.tmax))).attr("width", d => X(d[2]) - X(Math.min(d[1], L.tmax)))
        .attr("y", 0).attr("height", 30);
      const axisLabels = eras.map(d => {
        const w = X(d[2]) - X(Math.min(d[1], L.tmax));
        const text = d[0].length * 6.3 < w - 4 ? d[0] : w > 24 ? d[0].slice(0, 3) : "";
        return { key: d[0], x: (X(d[2]) + X(Math.min(d[1], L.tmax))) / 2, text };
      }).concat(timed ? [{ key: "today", x: xTip + 4, text: "today →", start: true }]
        : [{ key: "note", x: 14, text: "Branches evenly spaced (not to time scale)", start: true }]);
      axis.selectAll("text").data(axisLabels, d => d.key).join("text").attr("class", "eralabel")
        .attr("x", d => d.x).attr("y", 15).attr("text-anchor", d => d.start ? "start" : "middle")
        .style("font-size", "11px").text(d => d.text);

      // branches
      const segs = [];
      L.shown.forEach(n => {
        const p = pos.get(n);
        const from = n === viewRoot ? L.x0 - 8 : pos.get(n.parent).x;
        segs.push({ k: "h" + n.name, h: n.hue, d: `M${f1(from)},${f1(p.y)}H${f1(p.x)}` });
        if (!L.tipOf.has(n)) {
          const ys = n.children.map(c => pos.get(c).y);
          segs.push({ k: "v" + n.name, h: n.hue, d: `M${f1(p.x)},${f1(ys[0])}V${f1(ys[ys.length - 1])}` });
        }
        if (!n.children && n.data.extinct && p.x < xTip - 1) {
          segs.push({ k: "g" + n.name, ghost: true, d: `M${f1(p.x)},${f1(p.y)}H${f1(xTip)}` });
        }
      });
      gBranch.selectAll("path.seg").data(segs, d => d.k).join("path")
        .attr("class", d => "seg " + (d.ghost ? "ghost" : "stroke-h"))
        .attr("style", d => d.ghost ? "stroke-dasharray:1 4" : `--h:${d.h.toFixed(1)}`)
        .style("stroke-width", d => d.ghost ? "1px" : "1.8px").attr("d", d => d.d);
      // cut-off groups: a wedge from their split to the tips' line
      const groups = tips.filter(t => t.children);
      gBranch.selectAll("path.wedge").data(groups, n => n.name).join("path").attr("class", "wedge fill-h")
        .attr("style", n => `--h:${n.hue.toFixed(1)}`)
        .attr("d", n => { const p = pos.get(n), h = p.h / 2 - 5; return `M${f1(p.x)},${f1(p.y)}L${f1(xTip)},${f1(p.y - h)}V${f1(p.y + h)}Z`; });
      gBranch.selectAll("circle").data([...L.shown].filter(n => n.children && !L.tipOf.has(n)), n => n.name).join("circle")
        .attr("class", "dot-h").attr("style", n => `--h:${n.hue.toFixed(1)}`)
        .attr("cx", n => pos.get(n).x).attr("cy", n => pos.get(n).y).attr("r", 2.6);

      // tip labels
      const tipText = gLabel.selectAll("g.tip").data(tips, n => n.name).join(enter => {
        const g = enter.append("g").attr("class", "tip");
        const t = g.append("text").attr("class", "tlabel");
        t.append("tspan").attr("class", "n");
        t.append("tspan").attr("class", "c");
        g.append("text").attr("class", "tcount");
        return g;
      });
      const maxChars = Math.floor((W - xTip - 20) / 7);
      const clip = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s;
      tipText.each(function (n) {
        const g = d3.select(this), p = pos.get(n), group = !!n.children;
        const thumbs = group && S("treeThumbs") ? 3 : 0;
        const room = maxChars - thumbs * 6;
        const t = g.select("text.tlabel").attr("x", xTip + 8).attr("y", group ? p.y - 8 : p.y);
        const name = (n.data.extinct ? "† " : "") + n.name;
        t.select(".n").classed("sp", !group && BG.REAL).style("font-size", group ? "13.5px" : "13px").text(clip(name, room));
        const common = S("commonNames") && n.data.common ? n.data.common : "";
        t.select(".c").style("font-size", "12px").text(common && name.length + 2 < room ? "  " + clip(common, room - name.length - 2) : "");
        g.select("text.tcount").attr("x", xTip + 8).attr("y", p.y + 10).style("font-size", "11.5px")
          .text(group ? `${n.data.total ? "~" + BG.fmtCount(n.data.total) + " species" : n.nLeaves + " species"} · ${n.nLeaves} on the map` : "");
        // a few photos of the group's best-known species
        const pics = !thumbs ? [] : n.leaves().filter(l => (l.data.photos || []).length)
          .sort((a, b) => (b.data.obs || 0) - (a.data.obs || 0)).slice(0, thumbs);
        g.selectAll("image").data(pics, l => l.name).join("image")
          .attr("href", l => l.data.photos[0].u.replace("/medium.", "/square."))
          .attr("width", 38).attr("height", 38).attr("preserveAspectRatio", "xMidYMid slice")
          .attr("x", (l, i) => W - 8 - (pics.length - i) * 42).attr("y", p.y - 19);
      });

      // names of drawn clades sit on their branch, when there is room
      const named = [...L.shown].filter(n => n !== viewRoot && n.children && !L.tipOf.has(n) && !n.unnamed &&
        pos.get(n).x - pos.get(n.parent).x >= n.name.length * 7 + 12);
      gLabel.selectAll("text.clabel").data(named, n => n.name).join("text").attr("class", "clabel halo")
        .attr("x", n => pos.get(n).x - 5).attr("y", n => pos.get(n).y - 6).attr("text-anchor", "end")
        .style("font-size", "10px").style("letter-spacing", ".06em").style("stroke-width", "3px").text(n => n.name);

      drawMarks();
    }

    // ---- marks: highlights, games' pins, areas, routes and time lines
    function routeUp(n, top) {
      const r = rep(n);
      if (!r) return [];
      const pts = [[px(r).end, px(r).y]];
      for (let m = r; m !== top && m.parent && m !== viewRoot; m = m.parent) {
        pts.push([px(m.parent).x, px(m).y], [px(m.parent).x, px(m.parent).y]);
      }
      return pts;
    }
    const polyD = pts => "M" + pts.map(p => f1(p[0]) + "," + f1(p[1])).join("L");
    function block(n) {
      const r = rep(n);
      if (!r) return null;
      const tips = L.tips.filter(t => t === r || t.ancestors().includes(r));
      const a = px(tips[0]), b = px(tips[tips.length - 1]);
      return { x: L.tipOf.has(r) && !r.children ? L.xTip - 4 : px(r).x, y: a.y - a.h / 2 + 1, y2: b.y + b.h / 2 - 1 };
    }

    function drawMarks() {
      if (!active || !L) return;
      const areas = [], lines = [], pins = [], rings = [];
      const area = (n, kind, w) => { const b = block(n); if (b && inView(n)) areas.push({ ...b, kind, w }); };
      const pinAt = (n, kind, label) => { const r = rep(n); if (r && inView(n)) pins.push({ x: px(r).end, y: px(r).y, kind, label }); };
      if (marks) {
        (marks.areas || []).forEach(m => area(m.node, m.kind || "", m.strong ? 2.5 : 1.5));
        (marks.routes || []).forEach(m => {
          if (!inView(m.via)) return;
          lines.push({ d: polyD(routeUp(m.from, m.via).concat(routeUp(m.to, m.via).reverse())), kind: (m.alt ? "alt " : "") + (m.kind || "") });
        });
        (marks.pins || []).forEach(m => pinAt(m.node, m.kind, m.label));
        (marks.rings || []).forEach(m => { if (L.timed && m.age <= L.tmax) rings.push({ x: L.X(m.age), kind: m.kind || "", label: m.label }); });
      } else if (result) {
        const r = result;
        if (!r.same) area(r.anc, "", 2.5);
        if (inView(r.anc)) {
          lines.push({ d: polyD(routeUp(r.guess, r.anc).concat(routeUp(r.answer, r.anc).reverse())), kind: "" });
          pinAt(r.guess, "guess");
          pinAt(r.answer, "answer");
        }
      } else {
        [[hoverN, false], [selN, true]].forEach(([n, strong]) => {
          if (!n || !inView(n) || (n === hoverN && n === selN && !strong)) return;
          if (n.children) area(n, "", strong ? 2 : 1.2);
          lines.push({ d: polyD(routeUp(n, viewRoot)), kind: "", w: strong ? 3 : 2.2 });
          if (strong) pinAt(n, "pick");
        });
      }
      gArea.selectAll("rect").data(areas).join("rect").attr("class", d => "hl-area " + d.kind).attr("rx", 5)
        .attr("x", d => d.x).attr("y", d => d.y).attr("width", d => L.W - d.x - 2).attr("height", d => d.y2 - d.y)
        .style("stroke-width", d => d.w + "px");
      gLine.selectAll("path").data(lines).join("path").attr("class", d => "hl-line " + d.kind).attr("d", d => d.d)
        .style("stroke-width", d => (d.w || 3) + "px");
      gLine.selectAll("line.hl-ring").data(rings).join("line").attr("class", d => "hl-ring " + d.kind)
        .attr("x1", d => d.x).attr("x2", d => d.x).attr("y1", 0).attr("y2", L.H)
        .style("stroke-width", "2.5px").style("stroke-dasharray", "6 5");
      gLine.selectAll("text.hl-ring-label").data(rings.filter(d => d.label)).join("text")
        .attr("class", d => "hl-ring-label halo " + d.kind).attr("x", d => d.x + 4).attr("y", 12)
        .style("font-size", "11.5px").style("stroke-width", "3px").text(d => d.label);
      BG.drawPins(gPin, pins, 1);
    }

    // ---- pointer: the row picks a tip, how far left picks how far back along its lineage
    function hit(e) {
      if (!L) return null;
      const [x, y] = d3.pointer(e, svg.node());
      const tip = L.tips.find(t => { const p = px(t); return y >= p.y - p.h / 2 && y < p.y + p.h / 2; });
      if (!tip) return null;
      // walk up while the pointer is left of this node's branch
      let n = tip;
      while (n !== viewRoot && x < px(n.parent).x) n = n.parent;
      return n;
    }

    function setRoot(n) {
      if (!n) return;
      if (!n.children) n = n.parent;
      const limit = limitRoot();
      if (limit !== root && !n.ancestors().includes(limit)) n = limit;
      const changed = n !== viewRoot;
      viewRoot = n;
      host.onRoot(viewRoot);
      if (changed) el.scrollTop = 0;
      render();
    }
    const goUp = () => { if (viewRoot.parent && viewRoot !== limitRoot()) setRoot(viewRoot.parent); };
    function scrollTo(n) {
      const b = L && block(n);
      if (b) el.scrollTo({ top: Math.max(0, (b.y + b.y2) / 2 - el.clientHeight / 2 + 30), behavior: "smooth" });
    }

    svg.on("pointermove", e => BG.hover(hit(e)))
      .on("pointerleave", () => BG.hover(null))
      .on("click", e => { const n = hit(e); if (n) BG.click(n); })
      .on("dblclick", e => {
        const n = hit(e);
        if (!n || !n.children) return;
        setRoot(n);
        BG.pin(n);
      });

    BGSettings.on(key => {
      if (["treeCut", "treeDepth", "treeAge", "treeLengths", "treeThumbs", "showEras", "commonNames"].includes(key)) render();
    });
    new ResizeObserver(() => render()).observe(el);

    return {
      highlight(n) { hoverN = n; drawMarks(); },
      select(n) { selN = n; drawMarks(); },
      focus(n) { setRoot(n.children ? n : n.parent); },
      reveal(res) { result = res; drawMarks(); if (res) scrollTo(res.anc); },
      reset(n) { setRoot(n || root); },
      root: () => viewRoot,
      setRoot,
      marks(spec) { marks = spec; drawMarks(); if (spec && spec.pins && spec.pins.length) scrollTo(spec.pins[0].node); },
      goUp,
      show(on) { active = on; if (on) { host.onRoot(viewRoot); render(); } },
    };
  };
})();
