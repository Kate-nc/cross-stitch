/* creator/DesignerBrandingSection.js — Designer branding settings card.
 *
 * Reads/writes UserPrefs keys: designerName, designerLogo (data URL),
 * designerLogoPosition, designerCopyright, designerContact.
 *
 * Exposed as window.CreatorDesignerBrandingSection for the Export tab.
 */
(function () {
  "use strict";
  var React = window.React;
  var h = React.createElement;

  function readPrefs() {
    var UP = window.UserPrefs;
    return {
      designerName:         (UP && UP.get("designerName"))         || "",
      designerLogo:         (UP && UP.get("designerLogo"))         || null,
      designerLogoPosition: (UP && UP.get("designerLogoPosition")) || "top-right",
      designerCopyright:    (UP && UP.get("designerCopyright"))    || "",
      designerContact:      (UP && UP.get("designerContact"))      || "",
    };
  }

  // Downscale a logo before saving so localStorage doesn't blow up. Target max 600px on the
  // longest side, JPEG quality 90% (PNG kept as PNG for transparency).
  function downscaleImage(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("Failed to read file")); };
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var maxDim = 600;
          var w = img.naturalWidth, hgt = img.naturalHeight;
          if (w > maxDim || hgt > maxDim) {
            var ratio = w / hgt;
            if (ratio >= 1) { w = maxDim; hgt = Math.round(maxDim / ratio); }
            else { hgt = maxDim; w = Math.round(maxDim * ratio); }
          }
          var c = document.createElement("canvas");
          c.width = w; c.height = hgt;
          c.getContext("2d").drawImage(img, 0, 0, w, hgt);
          var isPng = /image\/png/i.test(file.type);
          resolve(c.toDataURL(isPng ? "image/png" : "image/jpeg", isPng ? undefined : 0.9));
        };
        img.onerror = function () { reject(new Error("Image decode failed")); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  window.CreatorDesignerBrandingSection = function CreatorDesignerBrandingSection() {
    var initial = readPrefs();
    var stateAndSet = React.useState(initial);
    var state = stateAndSet[0];
    var setState = stateAndSet[1];
    var fileRef = React.useRef(null);

    function update(key, value) {
      setState(function (prev) {
        var next = Object.assign({}, prev); next[key] = value; return next;
      });
      try { window.UserPrefs.set(key, value); } catch (_) {}
    }

    function onPickLogo(e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      downscaleImage(f).then(function (dataUrl) {
        update("designerLogo", dataUrl);
      }).catch(function (err) {
        alert("Could not load logo: " + err.message);
      });
    }

    function clearLogo() { update("designerLogo", null); }

    var inputStyle = { padding: "6px 10px", borderRadius: 6, border: "1px solid #CFC4AC", fontSize: 13, width: "100%", boxSizing: "border-box" };
    var labelStyle = { fontSize: 11, fontWeight: 600, color: "#3f3f46", display: "block", marginBottom: 4 };

    return h("div", { style: { background: "#fff", border: "1px solid #E5DCCB", borderRadius: 8, padding: 14 } },
      h("h4", { style: { margin: "0 0 8px", fontSize: 13, color: "#0f172a" } }, "Designer branding"),
      h("p", { style: { fontSize: 11, color: "#8A8270", margin: "0 0 12px" } },
        "These settings apply to every PDF you export. They live on this device only."),

      h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 } },
        h("div", null,
          h("label", { style: labelStyle }, "Designer / shop name"),
          h("input", { type: "text", value: state.designerName, placeholder: "Your shop name",
            onChange: function (e) { update("designerName", e.target.value); }, style: inputStyle })
        ),
        h("div", null,
          h("label", { style: labelStyle }, "Contact / website"),
          h("input", { type: "text", value: state.designerContact, placeholder: "yourshop.example",
            onChange: function (e) { update("designerContact", e.target.value); }, style: inputStyle })
        )
      ),

      h("div", { style: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 } },
        h("div", { style: { flex: "0 0 110px" } },
          h("label", { style: labelStyle }, "Logo"),
          state.designerLogo
            ? h("div", { style: { width: 100, height: 100, border: "1px solid #CFC4AC", borderRadius: 6, background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" } },
                h("img", { src: state.designerLogo, alt: "logo", style: { maxWidth: "100%", maxHeight: "100%" } }))
            : h("button", { onClick: function () { fileRef.current && fileRef.current.click(); },
                style: { width: 100, height: 100, border: "1.5px dashed #CFC4AC", borderRadius: 6, background: "#f8fafc", cursor: "pointer", fontSize: 11, color: "#8A8270" } },
                "Upload logo"),
          h("input", { ref: fileRef, type: "file", accept: "image/png,image/jpeg", style: { display: "none" }, onChange: onPickLogo }),
          state.designerLogo && h("div", { style: { display: "flex", gap: 6, marginTop: 6 } },
            h("button", { onClick: function () { fileRef.current && fileRef.current.click(); }, style: { fontSize: 11, padding: "4px 8px", border: "1px solid #CFC4AC", borderRadius: 6, background: "#fff", cursor: "pointer" } }, "Replace"),
            h("button", { onClick: clearLogo, style: { fontSize: 11, padding: "4px 8px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#b91c1c", cursor: "pointer" } }, "Remove")
          )
        ),
        h("div", { style: { flex: 1 } },
          h("label", { style: labelStyle }, "Logo position"),
          h("div", { style: { display: "flex", gap: 12, fontSize: 12 } },
            h("label", { style: { display: "flex", alignItems: "center", gap: 4, cursor: "pointer" } },
              h("input", { type: "radio", name: "logoPos", value: "top-left",
                checked: state.designerLogoPosition === "top-left",
                onChange: function () { update("designerLogoPosition", "top-left"); } }),
              "Top-left"),
            h("label", { style: { display: "flex", alignItems: "center", gap: 4, cursor: "pointer" } },
              h("input", { type: "radio", name: "logoPos", value: "top-right",
                checked: state.designerLogoPosition === "top-right",
                onChange: function () { update("designerLogoPosition", "top-right"); } }),
              "Top-right")
          ),
          h("label", { style: Object.assign({}, labelStyle, { marginTop: 12 }) }, "Copyright notice"),
          h("textarea", { value: state.designerCopyright, rows: 2, placeholder: "© 2026 Your Shop. For personal use only.",
            onChange: function (e) { update("designerCopyright", e.target.value); },
            style: Object.assign({}, inputStyle, { resize: "vertical", fontFamily: "inherit" }) })
        )
      )
    );
  };
})();
