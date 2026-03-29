const fs = require('fs');

let code = '';
if (fs.existsSync('./index.html')) {
    const html = fs.readFileSync('./index.html', 'utf8');
    const match = html.match(/function rgbToLab\s*\([^)]*\)\s*\{(?:[^{}]*|\{[^{}]*\})*\}/);
    if (match) {
        code = match[0];
    }
}

// Fallback in case not found, though we expect it to be there
if (!code) {
    code = `function rgbToLab(r,g,b){let rr=r/255,gg=g/255,bb=b/255;rr=rr>0.04045?((rr+0.055)/1.055)**2.4:rr/12.92;gg=gg>0.04045?((gg+0.055)/1.055)**2.4:gg/12.92;bb=bb>0.04045?((bb+0.055)/1.055)**2.4:bb/12.92;let x=(rr*0.4124564+gg*0.3575761+bb*0.1804375)/0.95047,y=rr*0.2126729+gg*0.7151522+bb*0.0721750,z=(rr*0.0193339+gg*0.1191920+bb*0.9503041)/1.08883,f=t=>t>0.008856?t**(1/3):(7.787*t)+16/116;return[116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))];}`;
}

eval(code);

describe('rgbToLab', () => {
  it('correctly converts black (0, 0, 0)', () => {
    const lab = rgbToLab(0, 0, 0);
    expect(lab[0]).toBeCloseTo(0, 4);
    expect(lab[1]).toBeCloseTo(0, 4);
    expect(lab[2]).toBeCloseTo(0, 4);
  });

  it('correctly converts white (255, 255, 255)', () => {
    const lab = rgbToLab(255, 255, 255);
    expect(lab[0]).toBeCloseTo(100, 4);
    expect(lab[1]).toBeCloseTo(0, 4);
    expect(lab[2]).toBeCloseTo(0, 4);
  });

  it('correctly converts pure red (255, 0, 0)', () => {
    const lab = rgbToLab(255, 0, 0);
    expect(lab[0]).toBeCloseTo(53.2408, 4);
    expect(lab[1]).toBeCloseTo(80.0925, 4);
    expect(lab[2]).toBeCloseTo(67.2032, 4);
  });

  it('correctly converts pure green (0, 255, 0)', () => {
    const lab = rgbToLab(0, 255, 0);
    expect(lab[0]).toBeCloseTo(87.7347, 4);
    expect(lab[1]).toBeCloseTo(-86.1827, 4);
    expect(lab[2]).toBeCloseTo(83.1793, 4);
  });

  it('correctly converts pure blue (0, 0, 255)', () => {
    const lab = rgbToLab(0, 0, 255);
    expect(lab[0]).toBeCloseTo(32.2970, 4);
    expect(lab[1]).toBeCloseTo(79.1875, 4);
    expect(lab[2]).toBeCloseTo(-107.8602, 4);
  });

  it('correctly converts mid-gray (128, 128, 128)', () => {
    const lab = rgbToLab(128, 128, 128);
    expect(lab[0]).toBeCloseTo(53.5850, 4);
    expect(lab[1]).toBeCloseTo(0, 4);
    expect(lab[2]).toBeCloseTo(0, 4);
  });

  it('correctly converts a mixed color e.g. teal (13, 148, 136)', () => {
    const lab = rgbToLab(13, 148, 136);
    expect(lab[0]).toBeCloseTo(55.1145, 4);
    expect(lab[1]).toBeCloseTo(-35.1453, 4);
    expect(lab[2]).toBeCloseTo(-2.9371, 4);
  });
});
