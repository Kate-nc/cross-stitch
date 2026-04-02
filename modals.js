const SharedModals = {
  Help: ({ onClose }) => {
    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 600, maxHeight: "80vh", overflowY: "auto" } },
        React.createElement("button", { className: "modal-close", onClick: onClose }, "×"),
        React.createElement("h3", { style: { marginTop: 0, marginBottom: 15, fontSize: 22, color: "#18181b" } }, "Help & User Guide"),

        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 16 } }, "Pattern Creator"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#71717a", fontSize: 14, lineHeight: 1.5 } }, "Convert any image into a cross-stitch pattern. Adjust dimensions, color palette size, and apply filters to get the perfect design."),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Palette Control:"), " Limit the maximum number of colors to keep the project manageable."),
              React.createElement("li", null, React.createElement("strong", null, "Min Stitches/Colour:"), " Remove colors that are only used for a few stitches (useful for cleaning up noise)."),
              React.createElement("li", null, React.createElement("strong", null, "Skip Background:"), " Select a color from your image to be treated as empty canvas. Click 'Pick' and then click on your image.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 16 } }, "Pattern Editing"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#71717a", fontSize: 14, lineHeight: 1.5 } }, "Once generated, you can manually edit the pattern:"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Paint & Fill:"), " Select a color from the palette below the canvas, then use the Paint or Fill tools to modify individual stitches or areas."),
              React.createElement("li", null, React.createElement("strong", null, "Backstitch:"), " Draw lines between grid corners. Use the 'Erase Line' tool to remove them.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 16 } }, "Stitch Tracker"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#71717a", fontSize: 14, lineHeight: 1.5 } }, "Load a saved project to track your stitching progress interactively."),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Track Mode:"), " Click or drag across the pattern to mark stitches as complete. Use the timer to estimate your completion date."),
              React.createElement("li", null, React.createElement("strong", null, "Navigate Mode:"), " Place a guide crosshair on the canvas. If you select a color, you can click to place parking markers."),
              React.createElement("li", null, React.createElement("strong", null, "Colours Drawer:"), " Open the drawer at the bottom to see your progress per color. Click a color to highlight only those stitches on the canvas.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 16 } }, "Saving & Exporting"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Save Project (.json):"), " This is the recommended way to save. It keeps your generated pattern, edits, and tracking progress in one file. You can load this file in either the Creator or Tracker."),
              React.createElement("li", null, React.createElement("strong", null, "Export PDF:"), " Generates a printable multi-page chart with a thread legend."),
              React.createElement("li", null, React.createElement("strong", null, "Open in Stitch Tracker (Link):"), " Creates a sharable URL that opens the pattern directly in the Tracker without needing a file (only works for smaller patterns).")
            )
          )
        )
      )
    );
  },

  About: ({ onClose }) => {
    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 500 } },
        React.createElement("button", { className: "modal-close", onClick: onClose }, "×"),
        React.createElement("h3", { style: { marginTop: 0, marginBottom: 15, fontSize: 22, color: "#18181b" } }, "About"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
          React.createElement("p", { style: { margin: 0, color: "#71717a", fontSize: 15, lineHeight: 1.5 } },
            "Cross Stitch Pattern Generator is a free, client-side web application designed to help you create and track cross-stitch patterns directly in your browser."
          ),
          React.createElement("p", { style: { margin: 0, color: "#71717a", fontSize: 14, lineHeight: 1.5 } },
            "Because this app runs entirely in your browser, ",
            React.createElement("strong", { style: { color: "#18181b" } }, "no images or pattern data are ever uploaded to a server."),
            " Your projects remain private and local to your device."
          ),
          React.createElement("div", { style: { padding: "12px", background: "#fafafa", borderRadius: 8, border: "0.5px solid #e4e4e7" } },
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 14 } }, "Technologies Used:"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, "React (UI Framework)"),
              React.createElement("li", null, "jsPDF (PDF Generation)"),
              React.createElement("li", null, "pako (URL Compression)")
            )
          ),
          React.createElement("p", { style: { margin: 0, color: "#a1a1aa", fontSize: 12, textAlign: "center", marginTop: 10 } },
            "Version 1.0.0"
          )
        )
      )
    );
  },
  Calculator: ({ onClose, initialPatterns = [] }) => {
  const { useState, useMemo, useEffect } = React;

  const [stitchCount, setStitchCount] = useState(initialPatterns.length > 0 ? "" : "1000");
  const [fabricCount, setFabricCount] = useState(14);
  const [strandsUsed, setStrandsUsed] = useState(2);
  const [threadBrand, setThreadBrand] = useState("DMC");
  const [isBlended, setIsBlended] = useState(false);
  const [blendRatio, setBlendRatio] = useState([1, 1]);
  const [wasteFactor, setWasteFactor] = useState(0.20);
  const [copied, setCopied] = useState(false);
  const [expandedHelp, setExpandedHelp] = useState({});

  // Batch mode state
  const isBatchMode = initialPatterns && initialPatterns.length > 0;

  const threadBrands = {
    DMC: 8.0,
    Anchor: 8.0,
    Madeira: 10.0,
    Cosmo: 8.0
  };

  useEffect(() => {
    if (isBlended) {
      if (strandsUsed === 1) {
        setIsBlended(false);
      } else {
        const a = Math.ceil(strandsUsed / 2);
        const b = strandsUsed - a;
        if (blendRatio[0] + blendRatio[1] !== strandsUsed) {
           setBlendRatio([a, b]);
        }
      }
    }
  }, [strandsUsed, isBlended]);

  const toggleHelp = (key) => {
    setExpandedHelp(prev => ({...prev, [key]: !prev[key]}));
  };

  const calculateResult = (stCount) => {
    const count = parseInt(stCount);
    if (!count || count < 1) return null;

    const holePitchCm = 2.54 / fabricCount;
    const threadPerStitchCm = holePitchCm * 4.8 * strandsUsed;
    const totalThreadCm = count * threadPerStitchCm;
    const skeinLengthCm = threadBrands[threadBrand] * 100;

    if (!isBlended) {
      const usablePerSkeinCm = skeinLengthCm * (6 / strandsUsed) * (1 - wasteFactor);
      const skeinsExact = totalThreadCm / usablePerSkeinCm;
      return {
        single: true,
        skeinsToBuy: Math.ceil(skeinsExact),
        exactUsage: skeinsExact.toFixed(2),
        threadNeeded: (totalThreadCm / 100).toFixed(1)
      };
    } else {
      const colorAStrands = blendRatio[0];
      const colorBStrands = blendRatio[1];

      const colorAThreadCm = totalThreadCm * (colorAStrands / strandsUsed);
      const colorBThreadCm = totalThreadCm * (colorBStrands / strandsUsed);

      const colorAUsableCm = skeinLengthCm * (6 / colorAStrands) * (1 - wasteFactor);
      const colorBUsableCm = skeinLengthCm * (6 / colorBStrands) * (1 - wasteFactor);

      const skeinsAExact = colorAThreadCm / colorAUsableCm;
      const skeinsBExact = colorBThreadCm / colorBUsableCm;

      return {
        single: false,
        colorA: {
          skeinsToBuy: Math.ceil(skeinsAExact),
          exactUsage: skeinsAExact.toFixed(2)
        },
        colorB: {
          skeinsToBuy: Math.ceil(skeinsBExact),
          exactUsage: skeinsBExact.toFixed(2)
        },
        threadNeeded: (totalThreadCm / 100).toFixed(1)
      };
    }
  };

  const currentResult = isBatchMode ? null : calculateResult(stitchCount);

  const batchResults = useMemo(() => {
    if (!isBatchMode) return null;
    return initialPatterns.map(p => {
       const res = calculateResult(p.count);
       return { ...p, result: res };
    });
  }, [initialPatterns, fabricCount, strandsUsed, threadBrand, isBlended, blendRatio, wasteFactor]);

  const copyBatchList = () => {
    if (!batchResults) return;
    let txt = batchResults.map(b => {
      let r = b.result;
      if (!r) return "";
      let name = b.type === "blend" ? (b.threads[0].name + "+" + b.threads[1].name) : b.name;
      if (r.single) {
         return `DMC ${b.id} (${name}) — ${r.skeinsToBuy} skeins`;
      } else {
         return `DMC ${b.id} (${name}) — Color A: ${r.colorA.skeinsToBuy} skeins, Color B: ${r.colorB.skeinsToBuy} skeins`;
      }
    }).filter(Boolean).join("\n");
    let totalSkeins = batchResults.reduce((acc, b) => {
        if (!b.result) return acc;
        if (b.result.single) return acc + b.result.skeinsToBuy;
        return acc + b.result.colorA.skeinsToBuy + b.result.colorB.skeinsToBuy;
    }, 0);
    txt += `\nTotal: ${totalSkeins} skeins`;
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getValidRatios = (strands) => {
    const ratios = [];
    for (let i = strands - 1; i >= 1; i--) {
      ratios.push([i, strands - i]);
    }
    return ratios;
  };


  const HelpIcon = ({ topic }) => {
    return React.createElement("span", {
      onClick: () => toggleHelp(topic),
      style: {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, borderRadius: "50%", background: "#e4e4e7",
        color: "#71717a", fontSize: 10, fontWeight: "bold", cursor: "pointer",
        marginLeft: 6
      },
      title: "Click for more info"
    }, "i");
  };

  const HelpBox = ({ topic, children }) => {
    if (!expandedHelp[topic]) return null;
    return React.createElement("div", {
      style: { marginTop: 6, marginBottom: 12, padding: "8px 12px", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 6, fontSize: 12, color: "#0f766e" }
    }, children);
  };

  return React.createElement("div", { className: "modal-overlay", onClick: onClose, style: { zIndex: 1100 } },
    React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 600, width: "90%", maxHeight: "90vh", overflowY: "auto", padding: 24, position: "relative" } },
      React.createElement("button", { className: "modal-close", onClick: onClose, style: { position: "absolute", top: 20, right: 20 } }, "×"),

      React.createElement("h3", { style: { marginTop: 0, marginBottom: 8, fontSize: 22, color: "#18181b", display: "flex", alignItems: "center", gap: 8 } },
        "🧵 Thread/Skein Calculator"
      ),
      React.createElement("p", { style: { fontSize: 14, color: "#71717a", marginBottom: 24 } },
        "Estimate how many skeins of embroidery floss you need."
      ),

      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },

        !isBatchMode && React.createElement("div", null,
          React.createElement("label", { style: { display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 6 } },
            "Stitch Count ", HelpIcon({ topic: "stitchCount" })
          ),
          React.createElement("input", {
            type: "number", min: "1", value: stitchCount, onChange: e => setStitchCount(e.target.value),
            style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 14 },
            placeholder: "e.g., 1000"
          }),
          HelpBox({ topic: "stitchCount", children:
            "The number of full cross stitches for a single color. If your pattern has a thread legend, it usually lists the stitch count per color. Enter each color separately."
          })
        ),

        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
          React.createElement("div", null,
            React.createElement("label", { style: { display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 6 } },
              "Fabric Count ", HelpIcon({ topic: "fabricCount" })
            ),
            React.createElement("select", {
              value: fabricCount, onChange: e => setFabricCount(Number(e.target.value)),
              style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 14, background: "#fff" }
            },
              React.createElement("option", { value: "11" }, "11-count"),
              React.createElement("option", { value: "14" }, "14-count"),
              React.createElement("option", { value: "16" }, "16-count"),
              React.createElement("option", { value: "18" }, "18-count"),
              React.createElement("option", { value: "20" }, "20-count"),
              React.createElement("option", { value: "22" }, "22-count"),
              React.createElement("option", { value: "25" }, "25-count"),
              React.createElement("option", { value: "28" }, "28-count"),
              React.createElement("option", { value: "32" }, "32-count")
            ),
            HelpBox({ topic: "fabricCount", children:
              'The number of stitches per inch on your fabric. Common choices: 14-count is standard. 18-count is for finer detail. If you are stitching "over 2" on evenweave/linen, halve your fabric count (e.g. 28-count over 2 = 14-count).'
            })
          ),

          React.createElement("div", null,
            React.createElement("label", { style: { display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 6 } },
              "Number of Strands ", HelpIcon({ topic: "strandsUsed" })
            ),
            React.createElement("input", {
              type: "number", min: "1", max: "6", value: strandsUsed, onChange: e => setStrandsUsed(Number(e.target.value)),
              style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 14 }
            }),
            HelpBox({ topic: "strandsUsed", children:
              "How many individual strands you thread through your needle at once. A standard skein has 6 strands. Most patterns use 2 strands. This is the TOTAL number of strands, including all colors if blending."
            })
          )
        ),

        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
          React.createElement("div", null,
            React.createElement("label", { style: { display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 6 } },
              "Thread Brand ", HelpIcon({ topic: "threadBrand" })
            ),
            React.createElement("select", {
              value: threadBrand, onChange: e => setThreadBrand(e.target.value),
              style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 14, background: "#fff" }
            },
              React.createElement("option", { value: "DMC" }, "DMC (8.0m)"),
              React.createElement("option", { value: "Anchor" }, "Anchor (8.0m)"),
              React.createElement("option", { value: "Cosmo" }, "Cosmo (8.0m)"),
              React.createElement("option", { value: "Madeira" }, "Madeira (10.0m)")
            ),
            HelpBox({ topic: "threadBrand", children:
              "Different brands have different skein lengths. DMC is 8 metres. Madeira is 10 metres. Choose the closest if your brand isn't listed."
            })
          ),

          React.createElement("div", null,
            React.createElement("label", { style: { display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 6 } },
              "Stitching Style (Waste) ", HelpIcon({ topic: "wasteFactor" })
            ),
            React.createElement("select", {
              value: wasteFactor, onChange: e => setWasteFactor(Number(e.target.value)),
              style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 14, background: "#fff" }
            },
              React.createElement("option", { value: 0.10 }, "Experienced (+10%)"),
              React.createElement("option", { value: 0.20 }, "Average (+20%)"),
              React.createElement("option", { value: 0.30 }, "Beginner (+30%)")
            ),
            HelpBox({ topic: "wasteFactor", children:
              "Experienced (+10%): waste very little thread. Average (+20%): normal stitching. Beginner (+30%): accounts for extra waste from mistakes and less efficient thread management."
            })
          )
        ),

        React.createElement("div", { style: { background: "#fafafa", padding: 16, borderRadius: 8, border: "0.5px solid #e4e4e7" } },
          React.createElement("label", { style: { display: "flex", alignItems: "center", fontSize: 14, fontWeight: 600, color: "#18181b", cursor: "pointer", marginBottom: isBlended ? 12 : 0 } },
            React.createElement("input", {
              type: "checkbox", checked: isBlended, onChange: e => setIsBlended(e.target.checked), disabled: strandsUsed < 2,
              style: { marginRight: 8, width: 16, height: 16 }
            }),
            "Blended Thread ", HelpIcon({ topic: "blendedThread" })
          ),
          HelpBox({ topic: "blendedThread", children:
            "Turn this on if you're combining strands from two different colored skeins in the same needle (e.g. 1 strand of dark blue + 1 strand of light blue). Requires at least 2 strands."
          }),

          isBlended && strandsUsed < 2 && React.createElement("div", { style: { fontSize: 12, color: "#dc2626", marginTop: 4 } },
            "Blending requires at least 2 strands."
          ),

          isBlended && strandsUsed >= 2 && React.createElement("div", { style: { marginTop: 12 } },
            React.createElement("label", { style: { display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: "#18181b", marginBottom: 6 } },
              "Blend Ratio (Color A : Color B) ", HelpIcon({ topic: "blendRatio" })
            ),
            React.createElement("select", {
              value: `${blendRatio[0]},${blendRatio[1]}`,
              onChange: e => {
                const [a, b] = e.target.value.split(',').map(Number);
                setBlendRatio([a, b]);
              },
              style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 14, background: "#fff" }
            },
              getValidRatios(strandsUsed).map(ratio => React.createElement("option", { key: ratio.join(','), value: ratio.join(',') }, `${ratio[0]} : ${ratio[1]}`))
            ),
            HelpBox({ topic: "blendRatio", children:
              "How the strands in your needle are split between the two colors. The ratio must equal the total number of strands used."
            })
          )
        ),

        React.createElement("hr", { style: { border: "none", borderTop: "1px solid #e4e4e7", margin: "8px 0" } }),

        !isBatchMode ? React.createElement("div", { style: { background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #d4d4d8", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" } },
          React.createElement("h4", { style: { margin: "0 0 16px 0", fontSize: 16, color: "#18181b" } }, "Estimate Result"),

          currentResult ? (
            currentResult.single ? React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
              React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 12, color: "#71717a", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, "Skeins to buy"),
                React.createElement("div", { style: { fontSize: 24, fontWeight: 700, color: "#0d9488" } }, `${currentResult.skeinsToBuy} skein${currentResult.skeinsToBuy > 1 ? "s" : ""}`),
                React.createElement("div", { style: { fontSize: 12, color: "#a1a1aa", marginTop: 4 } }, `Exact usage: ${currentResult.exactUsage} skeins`)
              ),
              React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 12, color: "#71717a", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, "Thread length needed"),
                React.createElement("div", { style: { fontSize: 20, fontWeight: 600, color: "#18181b", marginTop: 4 } }, `${currentResult.threadNeeded} m`)
              ),
              currentResult.skeinsToBuy >= 3 && React.createElement("div", { style: { gridColumn: "1 / -1", fontSize: 12, color: "#d97706", background: "#fffbeb", padding: "8px 12px", borderRadius: 6, border: "1px solid #fde68a" } },
                "For colors needing 3+ skeins, try to buy from the same dye lot to avoid visible shade differences."
              )
            ) : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
                React.createElement("div", { style: { background: "#fafafa", padding: 12, borderRadius: 8, border: "0.5px solid #e4e4e7" } },
                  React.createElement("div", { style: { fontSize: 12, color: "#71717a", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, "Color A"),
                  React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: "#0d9488" } }, `${currentResult.colorA.skeinsToBuy} skein${currentResult.colorA.skeinsToBuy > 1 ? "s" : ""}`),
                  React.createElement("div", { style: { fontSize: 11, color: "#a1a1aa", marginTop: 4 } }, `Exact usage: ${currentResult.colorA.exactUsage} sk`)
                ),
                React.createElement("div", { style: { background: "#fafafa", padding: 12, borderRadius: 8, border: "0.5px solid #e4e4e7" } },
                  React.createElement("div", { style: { fontSize: 12, color: "#71717a", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, "Color B"),
                  React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: "#0d9488" } }, `${currentResult.colorB.skeinsToBuy} skein${currentResult.colorB.skeinsToBuy > 1 ? "s" : ""}`),
                  React.createElement("div", { style: { fontSize: 11, color: "#a1a1aa", marginTop: 4 } }, `Exact usage: ${currentResult.colorB.exactUsage} sk`)
                )
              ),
              React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 12, color: "#71717a", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, "Total thread length needed"),
                React.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#18181b" } }, `${currentResult.threadNeeded} m`)
              ),
              (currentResult.colorA.skeinsToBuy >= 3 || currentResult.colorB.skeinsToBuy >= 3) && React.createElement("div", { style: { fontSize: 12, color: "#d97706", background: "#fffbeb", padding: "8px 12px", borderRadius: 6, border: "1px solid #fde68a" } },
                "For colors needing 3+ skeins, try to buy from the same dye lot to avoid visible shade differences."
              )
            )
          ) : React.createElement("div", { style: { fontSize: 14, color: "#a1a1aa" } }, "Enter a stitch count to see the estimate."),

          React.createElement("div", { style: { fontSize: 11, color: "#71717a", marginTop: 16, fontStyle: "italic", lineHeight: 1.4 } },
            "This is an estimate. Actual usage varies with stitching tension, thread carry distance, and mistakes. When in doubt, buy one extra skein of dominant colors."
          )
        ) : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("h4", { style: { margin: 0, fontSize: 16, color: "#18181b" } }, "Shopping List"),
            React.createElement("button", {
              onClick: copyBatchList,
              style: { padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }
            }, copied ? "Copied!" : "Copy List")
          ),

          React.createElement("div", { style: { maxHeight: 300, overflowY: "auto", border: "0.5px solid #e4e4e7", borderRadius: 8, background: "#fff" } },
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
              React.createElement("thead", null,
                React.createElement("tr", { style: { background: "#fafafa" } },
                  React.createElement("th", { style: { padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e4e4e7", color: "#71717a", fontWeight: 600 } }, "Color"),
                  React.createElement("th", { style: { padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #e4e4e7", color: "#71717a", fontWeight: 600 } }, "Stitches"),
                  React.createElement("th", { style: { padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #e4e4e7", color: "#71717a", fontWeight: 600 } }, "Skeins")
                )
              ),
              React.createElement("tbody", null,
                batchResults.map((b, i) => {
                  let name = b.type === "blend" ? (b.threads[0].name + "+" + b.threads[1].name) : b.name;
                  let skeinText = "";
                  if (b.result) {
                    if (b.result.single) {
                      skeinText = `${b.result.skeinsToBuy}`;
                    } else {
                      skeinText = `A:${b.result.colorA.skeinsToBuy} B:${b.result.colorB.skeinsToBuy}`;
                    }
                  }
                  return React.createElement("tr", { key: i, style: { borderBottom: "0.5px solid #f4f4f5" } },
                    React.createElement("td", { style: { padding: "8px 12px" } },
                      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                        React.createElement("div", { style: { width: 16, height: 16, borderRadius: 4, background: `rgb(${b.rgb})`, border: "1px solid #d4d4d8" } }),
                        React.createElement("span", { style: { fontWeight: 600 } }, b.id),
                        React.createElement("span", { style: { color: "#71717a", fontSize: 12 } }, name)
                      )
                    ),
                    React.createElement("td", { style: { padding: "8px 12px", textAlign: "right" } }, b.count.toLocaleString()),
                    React.createElement("td", { style: { padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#0d9488" } }, skeinText)
                  );
                })
              )
            )
          ),
          React.createElement("div", { style: { fontSize: 11, color: "#71717a", fontStyle: "italic", lineHeight: 1.4 } },
            "This is an estimate. Actual usage varies with stitching tension, thread carry distance, and mistakes. When in doubt, buy one extra skein of dominant colors."
          )
        ),

        React.createElement("div", { style: { marginTop: 12, padding: "12px", background: "#f4f4f5", borderRadius: 8, fontSize: 12, color: "#71717a", lineHeight: 1.5 } },
          React.createElement("h5", { style: { margin: "0 0 4px 0", color: "#18181b", fontSize: 13 } }, "How does this calculator work?"),
          "Each cross stitch uses a specific length of thread determined by the size of the stitch (which depends on your fabric count) and how many strands you use. This calculator multiplies the thread-per-stitch by your total stitch count, then divides by the usable thread in a skein to tell you how many to buy.",
          React.createElement("ul", { style: { margin: "8px 0 0 0", paddingLeft: 20 } },
            React.createElement("li", null, "The estimate covers ", React.createElement("strong", null, "full cross stitches only"), " — backstitch, half stitches, and French knots are not included."),
            React.createElement("li", null, "If your pattern has lots of scattered single stitches (confetti), you may use slightly more thread.")
          )
        )
      )
    )
  );

  }
};