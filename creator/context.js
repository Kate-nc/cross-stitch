/* creator/context.js — Shared context for CreatorApp sub-components.
   Loaded as a plain <script> tag before any creator component or hook files.
   React is already a global from the CDN script. */

window.CreatorContext = React.createContext(null);
