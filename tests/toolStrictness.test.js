// tests/toolStrictness.test.js — "How strict" for Fix outline colours and
// Tidy stray stitches (P2-9) maps three levels onto the tools' stored
// numbers. The level shown must always agree with the number the tool uses.

const fs = require("fs");
const path = require("path");

function load() {
  const win = {};
  const src = fs.readFileSync(path.join(__dirname, "..", "creator", "ToolStrip.js"), "utf8");
  // Only the module-level helpers run; the components are just defined.
  new Function("window", "React", src)(win, {});
  return win;
}

describe("tool strictness levels", () => {
  const { TOOL_STRICTNESS, toolStrictnessLevel } = load();

  test("each tool has Gentle, Balanced and Strong, in rising order", () => {
    ["outline", "tidy"].forEach(k => {
      const levels = TOOL_STRICTNESS[k];
      expect(levels.map(l => l.label)).toEqual(["Gentle", "Balanced", "Strong"]);
      expect(levels[0].value).toBeLessThan(levels[1].value);
      expect(levels[1].value).toBeLessThan(levels[2].value);
    });
  });

  test("the numbers are the ones the tools use", () => {
    expect(TOOL_STRICTNESS.outline.map(l => l.value)).toEqual([20, 40, 70]);
    expect(TOOL_STRICTNESS.tidy.map(l => l.value)).toEqual([3, 5, 10]);
  });

  test("Balanced is each tool's default", () => {
    // Outline tolerance defaults to 40, the stray-stitch distance to 5
    // (useCreatorState.js).
    expect(toolStrictnessLevel(TOOL_STRICTNESS.outline, 40).id).toBe("balanced");
    expect(toolStrictnessLevel(TOOL_STRICTNESS.tidy, 5).id).toBe("balanced");
  });

  test("every level maps back to itself", () => {
    ["outline", "tidy"].forEach(k => {
      TOOL_STRICTNESS[k].forEach(l => expect(toolStrictnessLevel(TOOL_STRICTNESS[k], l.value).id).toBe(l.id));
    });
  });

  test("any other stored number shows as the nearest level", () => {
    const o = TOOL_STRICTNESS.outline, t = TOOL_STRICTNESS.tidy;
    expect(toolStrictnessLevel(o, 0).id).toBe("gentle");
    expect(toolStrictnessLevel(o, 29).id).toBe("gentle");
    expect(toolStrictnessLevel(o, 31).id).toBe("balanced");
    expect(toolStrictnessLevel(o, 56).id).toBe("strong");
    expect(toolStrictnessLevel(o, 100).id).toBe("strong");
    expect(toolStrictnessLevel(t, 1).id).toBe("gentle");
    expect(toolStrictnessLevel(t, 7).id).toBe("balanced");
    expect(toolStrictnessLevel(t, 8).id).toBe("strong");
    expect(toolStrictnessLevel(t, 30).id).toBe("strong");
  });

  test("a tie goes to Balanced, and nonsense falls back to it", () => {
    expect(toolStrictnessLevel(TOOL_STRICTNESS.outline, 30).id).toBe("balanced");
    expect(toolStrictnessLevel(TOOL_STRICTNESS.tidy, 4).id).toBe("balanced");
    expect(toolStrictnessLevel(TOOL_STRICTNESS.tidy, NaN).id).toBe("balanced");
    expect(toolStrictnessLevel(TOOL_STRICTNESS.tidy, undefined).id).toBe("balanced");
  });
});
