// Verificador temporal: extrae el <script> inline de index.html y valida la sintaxis
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('k:/esquelas-pagos-4/index.html', 'utf8');
const lines = html.split(/\r?\n/);

let inScript = false;
let buf = [];
let startLine = 0;
const blocks = [];

lines.forEach((line, i) => {
    const isOpen = /<script(?![^>]*\bsrc=)/i.test(line);
    const isClose = /<\/script>/i.test(line);
    if (!inScript && isOpen) {
        inScript = true;
        startLine = i + 1;
        buf = [];
        const after = line.replace(/<script[^>]*>/i, '');
        if (isClose) {
            inScript = false;
            blocks.push({ startLine, code: after.replace(/<\/script>/i, '') });
        }
        return;
    }
    if (inScript) {
        if (isClose) {
            inScript = false;
            blocks.push({ startLine, code: buf.join('\n') + '\n' + line.replace(/<\/script>/i, '') });
        } else {
            buf.push(line);
        }
    }
});

console.log('Bloques <script> inline encontrados:', blocks.length);
let failed = 0;
blocks.forEach((b, idx) => {
    const full = html.slice(0, html.indexOf(b.code)) ;
    try {
        new vm.Script(b.code, { filename: `index.html:inline-${idx + 1}@line${b.startLine}` });
        console.log(`  [OK] Bloque ${idx + 1} (linea ~${b.startLine}) - sintaxis valida (${b.code.split('\n').length} lineas)`);
    } catch (e) {
        failed++;
        console.log(`  [ERROR] Bloque ${idx + 1} (linea ~${b.startLine}): ${e.message}`);
        const stack = (e.stack || '').split('\n').slice(0, 6).join('\n');
        console.log(stack);
    }
});
process.exit(failed > 0 ? 1 : 0);
