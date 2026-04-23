// Test for project-library.js — verifies pseudo-project synthesis and the
// onOpenProject routing for managerOnly entries. Avoids jsdom by stubbing
// minimal DOM/IndexedDB.

const fs = require('fs');
const path = require('path');

global.window = global;
global.document = {
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  visibilityState: 'visible'
};

// React stub — supports useState/useEffect/useCallback/createElement
let _states = [];
let _stateIdx = 0;
let _effects = [];
let _callbacks = [];
let _cbIdx = 0;
function reset() { _states = []; _stateIdx = 0; _effects = []; _callbacks = []; _cbIdx = 0; }

global.React = {
  useState(initial) {
    const idx = _stateIdx++;
    if (_states.length <= idx) _states.push(typeof initial === 'function' ? initial() : initial);
    return [_states[idx], (val) => { _states[idx] = typeof val === 'function' ? val(_states[idx]) : val; }];
  },
  useEffect(fn) { _effects.push(fn); },
  useCallback(fn) {
    const idx = _cbIdx++;
    if (_callbacks.length <= idx) _callbacks.push(fn);
    return _callbacks[idx];
  },
  createElement(type, props /*, ...children */) {
    return { type: typeof type === 'function' ? (type.name || 'Component') : type, props: props || {}, _component: type };
  }
};

global.indexedDB = { open() { const req = {}; setTimeout(() => { req.result = { objectStoreNames: { contains: () => false } }; if (req.onsuccess) req.onsuccess({ target: req }); }, 0); return req; } };

global.window.MultiProjectDashboard = function MultiProjectDashboard(props) {
  return { type: 'MultiProjectDashboard', props };
};

const src = fs.readFileSync(path.join(__dirname, '..', 'project-library.js'), 'utf8');
eval(src);

describe('project-library.js', () => {
  beforeEach(reset);

  it('exposes useProjectLibrary and ProjectLibrary on window', () => {
    expect(typeof window.useProjectLibrary).toBe('function');
    expect(typeof window.ProjectLibrary).toBe('function');
  });

  it('home mode passes external projects through to MultiProjectDashboard', () => {
    const externalProjects = [{ id: 'p1', name: 'Test' }];
    const result = window.ProjectLibrary({
      mode: 'home',
      projects: externalProjects,
      stash: { 'dmc:310': { owned: 1 } }
    });
    expect(result.type).toBe('MultiProjectDashboard');
    expect(result.props.projects).toEqual(externalProjects);
    expect(result.props.mode).toBe('home');
  });

  it('manager mode synthesises managerOnly pseudo-projects from manualPatterns', () => {
    // Pre-populate state for the hook (skip the load entirely)
    _states.push({
      projects: [{ id: 'proj_1', name: 'Linked One' }],
      manualPatterns: [{ id: 'pat_1', title: 'Manual Pattern', updatedAt: '2024-03-01' }],
      stash: {},
      loading: false
    });
    const result = window.ProjectLibrary({ mode: 'manager' });
    expect(result.type).toBe('MultiProjectDashboard');
    const projects = result.props.projects;
    expect(projects.length).toBe(2);
    const synthetic = projects.find(p => p.managerOnly);
    expect(synthetic).toBeTruthy();
    expect(synthetic.name).toBe('Manual Pattern');
    expect(synthetic.id).toBe('mgr:pat_1');
    expect(synthetic._managerPatternId).toBe('pat_1');
  });

  it('onOpenProject blocks managerOnly clicks and forwards to onOpenManagerOnly', () => {
    const onOpen = jest.fn();
    const onOpenManagerOnly = jest.fn();
    const externalProjects = [{ id: 'mgr:p', name: 'M', managerOnly: true }];
    const result = window.ProjectLibrary({
      mode: 'manager',
      projects: externalProjects,
      onOpenProject: onOpen,
      onOpenManagerOnly: onOpenManagerOnly
    });
    result.props.onOpenProject(externalProjects[0], 'tracker');
    expect(onOpen).not.toHaveBeenCalled();
    expect(onOpenManagerOnly).toHaveBeenCalledWith(externalProjects[0]);
  });

  it('onOpenProject forwards normal project clicks to caller', () => {
    const onOpen = jest.fn();
    const externalProjects = [{ id: 'proj_5', name: 'Normal' }];
    const result = window.ProjectLibrary({
      mode: 'home',
      projects: externalProjects,
      onOpenProject: onOpen
    });
    result.props.onOpenProject(externalProjects[0], 'tracker');
    expect(onOpen).toHaveBeenCalledWith(externalProjects[0], 'tracker');
  });
});
