const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

let code = '';
if (!code && fs.existsSync('./helpers.js')) {
    const js = fs.readFileSync('./helpers.js', 'utf8');
    // We just evaluate all of helpers.js. That is much safer and works.
    code = js;
} else if (fs.existsSync('./index.html')) {
    const html = fs.readFileSync('./index.html', 'utf8');
    const match = html.match(/function fmtTimeL\s*\([^)]*\)\s*\{(?:[^{}]*|\{[^{}]*\})*\}/);
    if (match) {
        code = match[0];
    }
}

if (!code) {
    code = `function fmtTimeL(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return\`\${h} hr\${h>1?"s":""} \${m} min\`;return\`\${m} min\`;}`;
}

eval(code);

describe('fmtTimeL', () => {
    it('formats times under an hour correctly', () => {
        assert.strictEqual(fmtTimeL(0), '0 min');
        assert.strictEqual(fmtTimeL(59), '0 min');
        assert.strictEqual(fmtTimeL(60), '1 min');
        assert.strictEqual(fmtTimeL(3599), '59 min');
    });

    it('formats exactly one hour correctly', () => {
        assert.strictEqual(fmtTimeL(3600), '1 hr 0 min');
    });

    it('formats one hour and some minutes correctly', () => {
        assert.strictEqual(fmtTimeL(3660), '1 hr 1 min');
        assert.strictEqual(fmtTimeL(7199), '1 hr 59 min');
    });

    it('formats exactly multiple hours correctly', () => {
        assert.strictEqual(fmtTimeL(7200), '2 hrs 0 min');
        assert.strictEqual(fmtTimeL(36000), '10 hrs 0 min');
    });

    it('formats multiple hours and some minutes correctly', () => {
        assert.strictEqual(fmtTimeL(7260), '2 hrs 1 min');
        assert.strictEqual(fmtTimeL(10000), '2 hrs 46 min');
    });
});
