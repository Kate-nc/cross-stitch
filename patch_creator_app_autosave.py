import sys
import re

with open("creator-app.js", "r") as f:
    content = f.read()

useEffect_str = """useEffect(() => {
    // Automatically load from IndexedDB on startup
    loadProjectFromDB().then(project => {
        if (project && project.pattern && project.settings) {
            processLoadedProject(project);
        }
    });
}, []);"""

new_useEffect_str = """useEffect(() => {
  // Check for handoff from Tracker
  const handoff = localStorage.getItem('crossstitch_handoff');
  if (handoff) {
    try {
      const projectData = JSON.parse(handoff);
      localStorage.removeItem('crossstitch_handoff'); // one-time read
      processLoadedProject(projectData);
      return; // Skip DB load if handoff successful
    } catch (e) {
      console.error('Failed to load handoff data:', e);
    }
  }

  // Also check URL params for shared links
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('p=')) {
    try {
      const encoded = hash.slice(2);
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const binaryStr = atob(base64);
      const binaryData = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) binaryData[i] = binaryStr.charCodeAt(i);
      const decompressed = pako.inflate(binaryData, { to: 'string' });
      const project = JSON.parse(decompressed);
      processLoadedProject(project);
      window.location.hash = ''; // Clear hash after loading
      return; // Skip DB load if URL load successful
    } catch (err) {
      console.error("Failed to load from URL:", err);
      setLoadError("Failed to load pattern from link.");
    }
  }

  // Fallback to IndexedDB on startup
  loadProjectFromDB().then(project => {
    if (project && project.pattern && project.settings) {
      processLoadedProject(project);
    }
  });
}, []);"""

content = content.replace(useEffect_str, new_useEffect_str)

with open("creator-app.js", "w") as f:
    f.write(content)
