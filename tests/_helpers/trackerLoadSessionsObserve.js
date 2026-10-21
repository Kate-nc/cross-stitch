// Observes what the Tracker's session rebuild does to its inputs as well as what it returns, so a refactor is held to
// property order, undefined-versus-absent keys, in-place patching of session objects and which results are the input's
// own objects. `run(project, pattern, pending)` is whatever implementation is under test; `pending` is the raw
// localStorage string for the project's pending-session key, or undefined.
const { CASES, NOW } = require('./trackerLoadSessionsCases');

const UNDEF = '<undefined>';
const ser = (v) => JSON.stringify(v, (k, x) => (x === undefined ? UNDEF : x));

function observe(c, run) {
  const project = c.project();
  const pattern = c.pattern();
  const patternBefore = ser(pattern);
  const inputSessions = Array.isArray(project.statsSessions) ? project.statsSessions.slice() : [];
  const inputArray = project.statsSessions;
  let result, error = null;
  try { result = run(project, pattern, c.pending, c.pendingKey); } catch (e) { error = String(e && e.message || e); }
  if (error) return { error };
  return {
    result: ser(result),
    projectAfter: ser(project),
    patternUnchanged: ser(pattern) === patternBefore,
    resultIsInputArray: result === inputArray,
    sameObjectAsInput: result.map((s) => inputSessions.indexOf(s) >= 0),
  };
}

module.exports = { CASES, NOW, observe, ser };
