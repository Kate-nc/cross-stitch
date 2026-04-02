import sys
import re

with open("tracker-app.js", "r") as f:
    content = f.read()

useEffect_str = """useEffect(() => {
    // Check URL hash for shared project
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('p=')) {
        try {
            const encoded = hash.slice(2);
            // Replace base64url characters
            const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            const binaryStr = atob(base64);
            const binaryData = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                binaryData[i] = binaryStr.charCodeAt(i);
            }
            const decompressed = pako.inflate(binaryData, { to: 'string' });
            const project = JSON.parse(decompressed);
            processLoadedProject(project);
            window.location.hash = ''; // Clear hash after loading
        } catch (err) {
            console.error("Failed to load from URL:", err);
            setLoadError("Failed to load pattern from link.");
        }
    }
}, []);"""

new_useEffect_str = """useEffect(() => {
  // Check for handoff from Creator or Manager
  const handoff = localStorage.getItem('crossstitch_handoff');
  if (handoff) {
    try {
      const projectData = JSON.parse(handoff);
      localStorage.removeItem('crossstitch_handoff'); // one-time read
      processLoadedProject(projectData);
      return; // Skip URL check if handoff successful
    } catch (e) {
      console.error('Failed to load handoff data:', e);
    }
  }

  // Check URL hash for shared project
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('p=')) {
      try {
          const encoded = hash.slice(2);
          // Replace base64url characters
          const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
          const binaryStr = atob(base64);
          const binaryData = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
              binaryData[i] = binaryStr.charCodeAt(i);
          }
          const decompressed = pako.inflate(binaryData, { to: 'string' });
          const project = JSON.parse(decompressed);
          processLoadedProject(project);
          window.location.hash = ''; // Clear hash after loading
      } catch (err) {
          console.error("Failed to load from URL:", err);
          setLoadError("Failed to load pattern from link.");
      }
  }
}, []);"""

content = content.replace(useEffect_str, new_useEffect_str)

with open("tracker-app.js", "w") as f:
    f.write(content)
