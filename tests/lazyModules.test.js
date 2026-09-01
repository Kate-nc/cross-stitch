const fs = require("fs");
const path = require("path");

function target() {
  const listeners = {};
  return {
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) {
      const index = (listeners[name] || []).indexOf(fn);
      if (index >= 0) listeners[name].splice(index, 1);
    },
    listeners
  };
}

function load(loadScript) {
  const window = Object.assign(target(), { loadScript });
  const document = target();
  const source = fs.readFileSync(path.join(__dirname, "..", "lazy-modules.js"), "utf8");
  new Function("window", "document", "CustomEvent", source)(window, document, function () {});
  return { window, document };
}

describe("lazy modules", () => {
  test("retries a failed lazy-module load", async () => {
    const loadScript = jest.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockImplementationOnce(() => Promise.resolve().then(() => {
        window.BackupRestore = {};
      }));
    const { window } = load(loadScript);

    await expect(window.loadBackupRestore()).rejects.toThrow("temporary failure");
    await expect(window.loadBackupRestore()).resolves.toEqual({});
    expect(loadScript).toHaveBeenCalledTimes(2);
  });

  test("keeps Help triggers after a failed load", async () => {
    const { window, document } = load(() => Promise.reject(new Error("temporary failure")));

    await expect(window.HelpDrawer.open()).rejects.toThrow("temporary failure");
    expect(window.listeners["cs:openHelp"]).toHaveLength(1);
    expect(document.listeners.keydown).toHaveLength(1);
  });
});
