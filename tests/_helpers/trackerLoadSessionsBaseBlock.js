// Runs the session-rebuild block exactly as it is written inside processLoadedProject (tracker-app.js), cut out between
// its two comment landmarks and evaluated with the same free variables the closure gives it. Used to characterise the
// block before it moves; it fails loudly if a landmark is missing.
const vm = require('vm');
const { loadSource } = require('./loadSource');
const { NOW } = require('./trackerLoadSessionsCases');
const { browserScripts } = require('./browserScripts');

const START = '  // Legacy migration: if no statsSessions but totalTime exists';
const END = '  // Sessions the person deleted stay deleted';

function blockRunner(source) {
  const a = source.indexOf(START), b = source.indexOf(END, a);
  if (a < 0 || b < 0) throw new Error('session rebuild landmarks not found in tracker-app.js');
  const block = source.slice(a, b);
  const store = {};
  const FixedDate = class extends Date { constructor(...args) { if (args.length) super(...args); else super(NOW); } };
  const helpers = browserScripts(['helpers.js'], { addEventListener() {}, console, document: { addEventListener() {} }, navigator: {}, localStorage: { getItem: () => null } });
  const ctx = vm.createContext({
    console, Date: FixedDate, Number, Array, Math, JSON, Object, String,
    getStitchingDate: helpers.getStitchingDate,
    localStorage: { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null) },
  });
  const fn = vm.runInContext('(function(project, restored){\n' + block + '\n return rawStatsSessions;})', ctx);
  return (project, pattern, pending, key) => {
    Object.keys(store).forEach((k) => delete store[k]);
    if (pending !== undefined) store[key !== undefined ? key : 'cs_pending_session_' + (project.id || '')] = pending;
    return fn(project, pattern);
  };
}

module.exports = { blockRunner, loadSource };
