orig_pdf = 'pdf.setFillColor(m.rgb[0],m.rgb[1],m.rgb[2]);pdf.rect(px3,py3,cellMM,cellMM,"F");pdf.setDrawColor(200);pdf.rect(px3,py3,cellMM,cellMM,"S");if(info){pdf.setFontSize(5);pdf.setTextColor(luminance(m.rgb)>128?0:255);pdf.text(info.symbol,px3+cellMM/2,py3+cellMM*0.7,{align:"center"});}'

pdf_repl = """let drawPdfStitch = (st, isSec) => {
        let stType = st.stitchType || "full";
        pdf.setFillColor(st.rgb[0],st.rgb[1],st.rgb[2]);
        if (stType === "full") {
            pdf.rect(px3,py3,cellMM,cellMM,"F");
        } else {
            pdf.setDrawColor(st.rgb[0],st.rgb[1],st.rgb[2]);
            pdf.setLineWidth(0.3);
            let cx = px3 + cellMM/2, cy = py3 + cellMM/2;
            let rL = px3, rR = px3 + cellMM, rT = py3, rB = py3 + cellMM;
            let drawLine = (x1, y1, x2, y2) => { pdf.line(x1, y1, x2, y2); };
            if (stType === "half_bl") drawLine(rL, rB, rR, rT);
            else if (stType === "half_br") drawLine(rR, rB, rL, rT);
            else if (stType === "quarter_tl") drawLine(rL, rT, cx, cy);
            else if (stType === "quarter_tr") drawLine(rR, rT, cx, cy);
            else if (stType === "quarter_bl") drawLine(rL, rB, cx, cy);
            else if (stType === "quarter_br") drawLine(rR, rB, cx, cy);
            else if (stType === "three_quarter_tl") { drawLine(rL, rT, cx, cy); drawLine(rL, rB, rR, rT); }
            else if (stType === "three_quarter_tr") { drawLine(rR, rT, cx, cy); drawLine(rR, rB, rL, rT); }
            else if (stType === "three_quarter_bl") { drawLine(rL, rB, cx, cy); drawLine(rR, rB, rL, rT); }
            else if (stType === "three_quarter_br") { drawLine(rR, rB, cx, cy); drawLine(rL, rB, rR, rT); }
        }
        pdf.setDrawColor(200);pdf.setLineWidth(0.1);pdf.rect(px3,py3,cellMM,cellMM,"S");
        let stInfo = cmap[st.id];
        if(stInfo){
            let isQuarter = stType.startsWith("quarter_") || stType.startsWith("three_quarter_") || isSec;
            let fSz = isQuarter ? 3 : 5;
            pdf.setFontSize(fSz);
            pdf.setTextColor(luminance(st.rgb)>128?0:255);
            let symX = px3+cellMM/2, symY = py3+cellMM*0.7;
            if (isQuarter) {
                let corner = isSec ? stType.split("_")[1] : (stType.startsWith("quarter_") ? stType.split("_")[1] : "");
                let offX = cellMM*0.25, offY = cellMM*0.25;
                if (corner === "tl") { symX -= offX; symY -= offY; }
                else if (corner === "tr") { symX += offX; symY -= offY; }
                else if (corner === "bl") { symX -= offX; symY += offY; }
                else if (corner === "br") { symX += offX; symY += offY; }
            }
            pdf.text(stInfo.symbol,symX,symY,{align:"center"});
        }
    };
    drawPdfStitch(m, false);
    if (m.secondary) { let sec = m.secondary; sec.isSecondary = true; drawPdfStitch(sec, true); }"""

def count_b(s):
    ct = 0
    for c in s:
        if c == '{': ct+=1
        elif c == '}': ct-=1
    return ct

print("orig pdf:", count_b(orig_pdf))
print("new pdf:", count_b(pdf_repl))
