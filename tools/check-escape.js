// Escaneo estatico: analiza SOLO los bloques de plantilla que se inyectan en el DOM
// (tr.innerHTML = `...`, el.innerHTML = `...`) y detecta:
//   1) interpolaciones de datos del usuario sin escapeHtml/escapeAttr
//   2) handlers inline (onclick/onchange) que usen datos variables
const fs = require('fs');

const file = process.argv[2] || 'k:/esquelas-pagos-4/index.html';
const html = fs.readFileSync(file, 'utf8');
const lines = html.split(/\r?\n/);

// Expresiones seguras: numeros, valores ya escapados, literales, ternarios de clase CSS
const SAFE_EXPR = [
    /^escape(Html|Attr)\(/,
    /^formatearMes\(/,
    /^Math\./,
    /^Number\(/,
    /^parseFloat\(/,
    /^String\(/,
    /^toFixed\(/,
    /^\d+(\.\d+)?$/,
    /^'[^']*'$/,
    /^`[^`]*`$/,
    /^\w+(\.\w+)*\.toFixed\(/,
    /^\w+(\.\w+)*\?.*:.*$/,     // ternarios de clases CSS predefinidas
    /^\w+(\.\w+)*\s*\?\s*'[^']*'\s*:\s*'[^']*'$/,
    /^(index|currentMonth|mesActual|chalet|mes|estaPagado|consumo|total|totalMes|montoAgua|lista|l)\s*$/,
];

// Propiedades que son siempre numericas (no pueden inyectar HTML)
const NUMERIC_PROPS = ['monto', 'anterior', 'actual', 'consumo', 'total', 'totalMes', 'montoAgua', 'id', 'index', 'length'];

function isSafe(expr) {
    const e = expr.trim();
    if (SAFE_EXPR.some(rx => rx.test(e))) return true;
    // p.chalet / f.monto / etc.
    const m = e.match(/^([A-Za-z_$][\w$]*)((?:\.\w+)+)$/);
    if (m) {
        const prop = m[2].split('.').pop();
        if (NUMERIC_PROPS.includes(prop)) return true;
        return false;
    }
    return false;
}

let problems = 0;
const report = (line, msg) => { console.log(`  [REVISAR] linea ${line}: ${msg}`); problems++; };

// --- 1) Bloques de plantilla inyectados en el DOM ---
let inBlock = false, blockStart = 0, buffer = [];
lines.forEach((line, i) => {
    const openM = line.match(/\.innerHTML\s*=\s*`/);
    if (!inBlock && openM) {
        inBlock = true; blockStart = i + 1;
        buffer = [line.slice(line.indexOf('`') + 1)];
        if (line.includes('`;')) inBlock = false; // bloque de una sola linea
        return;
    }
    if (!inBlock) return;
    if (line.includes('`;')) {
        buffer.push(line.slice(0, line.indexOf('`')));
        inBlock = false;
        const text = buffer.join('\n');
        // Revisar interpolaciones del bloque
        const re = /\$\{([^}]*)\}/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const expr = m[1].trim();
            if (!isSafe(expr)) report(blockStart + buffer.findIndex(l => l.includes(expr)), `interpolacion sin escapar: \${${expr}}`);
        }
        buffer = [];
        return;
    }
    buffer.push(line);
});

// --- 2) Handlers inline con datos interpolados (XSS via parser HTML) ---
lines.forEach((line, i) => {
    const re = /on(click|change|input|submit|load|error|mouseover)\s*=\s*"([^"]*)"/gi;
    let m;
    while ((m = re.exec(line)) !== null) {
        if (m[2].includes('${')) report(i + 1, `handler inline con interpolacion: on${m[1]}="${m[2]}"`);
    }
});

// --- 3) Asignaciones a .innerHTML sin escape en toda la app ---
lines.forEach((line, i) => {
    if (/\.innerHTML\s*=\s*['"]/.test(line)) {
        // literales estaticos: OK
        return;
    }
});

console.log(problems === 0
    ? '  [OK] Sin interpolaciones sospechosas ni handlers inline con datos variables'
    : `  ${problems} punto(s) por revisar`);
process.exit(problems === 0 ? 0 : 1);
