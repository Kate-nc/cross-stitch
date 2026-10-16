/* Beads use half-cell coordinates, as knots do. uid identifies the object;
 * id/brand/label/rgb and unknown fields remain material references.
 * Legacy IDs are deterministic across devices. Keep uid on edits/moves;
 * copies must get a fresh uid. Deleted IDs never transfer to another bead.
 */
(function(root) {
  function normalise(list) {
    if (!Array.isArray(list)) return [];
    var used = new Set(), reserved = new Set(list.filter(Boolean).map(function(b) { return b.uid; }));
    return list.filter(function(b) { return b && Number.isInteger(b.x) && Number.isInteger(b.y); }).map(function(b) {
      var uid = typeof b.uid === 'string' && b.uid.length ? b.uid : null;
      if (!uid || used.has(uid)) {
        var data = Object.keys(b).filter(function(k) { return k !== 'uid'; }).sort().map(function(k) { return [k,b[k]]; });
        var base = 'legacy-bead:' + encodeURIComponent(JSON.stringify(data)), n = 0;
        do { uid = base + ':' + n++; } while (used.has(uid) || reserved.has(uid));
      }
      used.add(uid);
      return Object.assign({},b,{uid:uid});
    });
  }
  function live(list,done) {
    var ids = new Set((list || []).map(function(b) { return b.uid; }));
    return Array.from(new Set(Array.isArray(done) ? done : [])).filter(function(k) { return typeof k === 'string' && ids.has(k); });
  }
  function progress(list,done) { return {total:(list || []).length,done:live(list,done).length}; }
  function toggle(list,done,uid) {
    var marks = live(list,done);
    if (!(list || []).some(function(b) { return b.uid === uid; })) return marks;
    return marks.indexOf(uid) < 0 ? marks.concat([uid]) : marks.filter(function(k) { return k !== uid; });
  }
  function hitTest(list,fx,fy,radius) {
    return (list || []).filter(function(b) { return Math.hypot(b.x/2-fx,b.y/2-fy) <= radius; });
  }
  var api={normalise:normalise,live:live,progress:progress,toggle:toggle,hitTest:hitTest};
  root.Beads=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
