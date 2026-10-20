// Execute complete classic scripts in a private global scope, in loader order.
const vm = require('vm');
const { loadSource } = require('./loadSource');

function browserScripts(paths, globals = {}) {
  const scope = Object.assign({}, globals);
  scope.window = scope;
  const context = vm.createContext(scope);
  paths.forEach(path => vm.runInContext(loadSource(path), context, { filename: path }));
  return scope;
}

module.exports = { browserScripts };
