// Runs every scheduling scenario against one revision of the sources. `readSource(file)` returns that revision's text
// for a script (null when the revision does not have it), so the same scenarios can replay base and head.
const { createEnvironment } = require('./sync-scheduler-harness');
const scenarios = require('./sync-scheduler-scenarios');

async function runScenario(name, readSource) {
  const made = [];
  const make = o => { const e = createEnvironment(Object.assign({ readSource }, o)); made.push(e); return e; };
  let trace, error = null;
  try { trace = await scenarios[name](make); }
  catch (e) { error = e; }
  finally { made.forEach(e => e.dispose()); }
  if (error) throw error;
  return trace;
}

async function runAll(readSource) {
  const out = {};
  for (const name of Object.keys(scenarios)) out[name] = await runScenario(name, readSource);
  return out;
}

module.exports = { runScenario, runAll, scenarioNames: () => Object.keys(scenarios) };
