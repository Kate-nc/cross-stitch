/* creator/context.js — Shared contexts for CreatorApp sub-components.
   Loaded as a plain <script> tag before any creator component or hook files.
   React is already a global from the CDN script.

   Four contexts, split by concern:
   1. GenerationContext — image-to-pattern generation parameters & callbacks
   2. AppContext        — UI housekeeping (tabs, modals, panels, toasts, refs, export, preview)
   3. CanvasContext     — drawing tools, view, zoom, highlight, selection, edit history
   4. PatternDataContext (was CreatorContext) — core pattern data & derived values
*/

window.GenerationContext = React.createContext(null);
window.AppContext = React.createContext(null);
window.CanvasContext = React.createContext(null);
window.PatternDataContext = React.createContext(null);

window.useGeneration = function useGeneration() { return React.useContext(window.GenerationContext); };
window.useApp = function useApp() { return React.useContext(window.AppContext); };
window.useCanvas = function useCanvas() { return React.useContext(window.CanvasContext); };
window.usePatternData = function usePatternData() { return React.useContext(window.PatternDataContext); };
