import re

def fix_pdf(filename):
    with open(filename, 'r') as f:
        c = f.read()

    # The PDF export draws fractional lines but misses the background.
    # The canvas draws: ctx.fillStyle = fillCol; ctx.globalAlpha = fillAlpha * 0.35; ctx.fillRect(...)
    # jsPDF doesn't have a simple globalAlpha by default, but wait! jsPDF DOES support `setGState` for transparency, or we can just draw lines.
    # The review says: "The PDF export logic (exportPDF) draws the diagonal lines for fractional stitches but misses the 0.35 opacity background tint rectangle that the canvas rendering uses. This will cause the PDF chart to look slightly different from the on-screen chart."
    # How to draw 0.35 opacity with standard jsPDF?
    # Actually, we can approximate the 0.35 opacity by mixing the color with white.
    # Since the background is white, `color * 0.35 + 255 * 0.65`.
    # Let's add that to `drawPdfStitch` in `creator-app.js` and `index.html`.

    # In `drawPdfStitch`:
    # pdf.setFillColor(st.rgb[0],st.rgb[1],st.rgb[2]);
    # if (stType === "full") {
    #     pdf.rect(px3,py3,cellMM,cellMM,"F");
    # } else {

    # We will modify the `else` block to fill with mixed color.

    pdf_orig = """if (stType === "full") {
            pdf.rect(px3,py3,cellMM,cellMM,"F");
        } else {
            pdf.setDrawColor(st.rgb[0],st.rgb[1],st.rgb[2]);"""

    pdf_repl = """if (stType === "full") {
            pdf.rect(px3,py3,cellMM,cellMM,"F");
        } else {
            let r=Math.round(st.rgb[0]*0.35+255*0.65),g=Math.round(st.rgb[1]*0.35+255*0.65),b=Math.round(st.rgb[2]*0.35+255*0.65);
            pdf.setFillColor(r,g,b);
            pdf.rect(px3,py3,cellMM,cellMM,"F");
            pdf.setDrawColor(st.rgb[0],st.rgb[1],st.rgb[2]);"""

    if pdf_orig in c:
        c = c.replace(pdf_orig, pdf_repl)
        with open(filename, 'w') as f:
            f.write(c)
        print(f"Fixed PDF bg in {filename}")
    else:
        print(f"Could not find PDF bg in {filename}")

fix_pdf('creator-app.js')
fix_pdf('index.html')
