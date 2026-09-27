// Player settings, kept in this browser. Loaded before the data, so the tree can be pruned
// (extinct animals) before it is laid out.
//   BGSettings.get(key), BGSettings.set(key, value), BGSettings.on(fn)  // fn(key, value) after each change
(function () {
  const KEY = "bg-settings";
  const DEFAULTS = {
    view: "radial",            // "radial" | "tree"
    showExtinct: true,
    showEras: true,            // geological periods / epochs
    commonNames: true,         // hint: common names and descriptions ("sea gooseberries", "1 on the map: ...")
    treeCut: "named",          // "named": count named levels; "time": collapse splits younger than treeAge
    treeDepth: 3,              // named levels shown below the current clade; 0 = everything
    treeAge: 100,              // My, for treeCut "time"
    treeLengths: "time",       // "time": branch lengths to scale; "equal": evenly spaced
    treeThumbs: true,          // hint: photos on the map (tree view)
  };
  let values = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    values = { ...DEFAULTS, ...saved };
    // the extinct toggle used to have its own key
    if (!("showExtinct" in saved) && localStorage.getItem("bg-show-extinct") === "0") values.showExtinct = false;
  } catch (e) { /* storage unavailable: use defaults */ }

  const listeners = [];
  window.BGSettings = {
    DEFAULTS,
    get: k => values[k],
    set(k, v) {
      if (values[k] === v) return;
      values[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* not saved, still applied */ }
      listeners.forEach(fn => fn(k, v));
    },
    on(fn) { listeners.push(fn); },
  };
})();
