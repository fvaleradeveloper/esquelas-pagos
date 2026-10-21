// Harness temporal: ejecuta el <script> inline de index.html contra un DOM simulado
// para validar la logica de Lecturas y renderPagosTable.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('k:/esquelas-pagos-4/index.html', 'utf8');

// --- Extraccion del script inline principal ---
const lines = html.split(/\r?\n/);
let inScript = false, buf = [], mainCode = null;
lines.forEach((line, i) => {
    const isOpen = /<script(?![^>]*\bsrc=)/i.test(line);
    const isClose = /<\/script>/i.test(line);
    if (!inScript && isOpen) {
        inScript = true; buf = [];
        const after = line.replace(/<script[^>]*>/i, '');
        if (isClose) { inScript = false; mainCode = after.replace(/<\/script>/i, ''); }
        return;
    }
    if (inScript) {
        if (isClose) {
            inScript = false;
            const code = buf.join('\n') + '\n' + line.replace(/<\/script>/i, '');
            if (code.split('\n').length > 50) mainCode = code;
        } else buf.push(line);
    }
});

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

function makeEl(id) {
    const el = {
        id, _value: '', textContent: '', _innerHTML: '', className: '', checked: false,
        children: [], options: [], style: {}, dataset: {},
        get value() { return this._value; },
        set value(v) { this._value = String(v); },
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) {
            this._innerHTML = v;
            // El DOM real reemplaza todos los hijos al asignar innerHTML
            this.children = [];
        },
        // Soporte minimo de closest() para la delegacion de eventos
        closest(sel) {
            if (sel.includes('data-action') && this.dataset && this.dataset.action) return this;
            if (sel.includes('toggle-pago') && this.dataset && this.dataset.action === 'toggle-pago') return this;
            return null;
        },
        classList: {
            _s: new Set(),
            add(...c) { c.forEach(x => this._s.add(x)); },
            remove(...c) { c.forEach(x => this._s.delete(x)); },
            contains(c) { return this._s.has(c); },
            toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
        },
        appendChild(child) { this.children.push(child); return child; },
        addEventListener() {}, querySelectorAll() { return []; },
        reset() { this._value = ''; this.children = []; this._innerHTML = ''; }
    };
    return el;
}

const elements = new Map();
function getEl(id) {
    if (!elements.has(id)) elements.set(id, makeEl(id));
    return elements.get(id);
}

const store = new Map();
const swalCalls = [];
const Swal = {
    fire(a, b, c) {
        if (typeof a === 'string') swalCalls.push({ title: a, text: b, icon: c });
        else swalCalls.push(a);
        return Promise.resolve({ isConfirmed: true, value: true });
    }
};

// Listeners registrados en `document` (para probar la delegacion de eventos)
const docListeners = {};

function makeCtx(extra = {}) {
    const c = vm.createContext(Object.assign({
        console,
        localStorage: {
            getItem: k => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: k => store.delete(k)
        },
        document: {
            getElementById: id => (htmlIds.has(id) ? getEl(id) : null),
            querySelectorAll: () => [],
            addEventListener: (e, cb) => {
                if (e === 'DOMContentLoaded') { c.__domReady = cb; return; }
                (docListeners[e] = docListeners[e] || []).push(cb);
            },
            createElement: () => makeEl('created')
        },
        Swal, window: { innerWidth: 1400, jspdf: null },
        parseFloat, parseInt, isNaN, JSON, Math, Date, Object, Array, String, Number, Set, Map, Promise, setTimeout
    }, extra));
    c.globalThis = c;
    return c;
}

// Dispara un evento delegado sobre el document simulado
function fireDoc(event, target) {
    const cbs = docListeners[event] || [];
    cbs.forEach(cb => cb({ target }));
}

const ctx = makeCtx();
function run(expr) { return vm.runInContext(expr, ctx); }

store.set('ph_propietarios', JSON.stringify([
    { id: '1', chalet: 'A-01', nombre: 'Ana Perez', telefono: '999' },
    { id: '2', chalet: 'A-02', nombre: 'Luis Gomez', telefono: '888' },
    { id: '3', chalet: 'B-01', nombre: 'Maria Lopez', telefono: '777' },
    { id: '4', chalet: 'B-02', nombre: 'Carlos Diaz', telefono: '666' }
]));
store.set('ph_config', JSON.stringify({ tarifaBase: 5.60, tarifaExceso: 6.85, mantenimiento: 150.00 }));

vm.runInContext(mainCode, ctx, { filename: 'index.html:inline' });

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  [OK] ${name}`); }
    else { fail++; console.log(`  [FALLA] ${name}${extra !== undefined ? ' -> ' + extra : ''}`); }
}
// Deja correr las microtareas de Swal.fire(...).then(...)
const flush = () => new Promise(r => setTimeout(r, 0));

async function main() {
console.log('\n=== 1. Inicializacion (DOMContentLoaded) ===');
ctx.__domReady();
check('db.lecturas inicializado como array', Array.isArray(run('db.lecturas')));
check('select de chalets poblado con 4 opciones', getEl('lecturaChalet').children.length === 4, `children=${getEl('lecturaChalet').children.length}`);
check('mes de lectura prellenado', getEl('lecturaMes').value === new Date().toISOString().slice(0, 7), getEl('lecturaMes').value);
check('tbody vacio con mensaje', getEl('lecturasTableBody').innerHTML.includes('No hay lecturas registradas'));

console.log('\n=== 2. Alta de lectura (saveLectura) ===');
getEl('lecturaChalet').value = 'A-01';
getEl('lecturaMes').value = '2026-05';
getEl('lecturaAnteriorInput').value = '100';
getEl('lecturaActualInput').value = '125';
getEl('lecturaNota').value = 'Prueba';
run('saveLectura({preventDefault(){}})');
check('1 lectura guardada', run('db.lecturas.length') === 1, `length=${run('db.lecturas.length')}`);
check('consumo correcto (25)', run('db.lecturas[0].actual - db.lecturas[0].anterior') === 25);
check('demo=false en lectura real', run('db.lecturas[0].demo') === false);
check('persistida en localStorage ph_lecturas', !!store.get('ph_lecturas'));
check('Swal de exito mostrado', swalCalls.some(c => c.icon === 'success'));
check('formulario limpiado', getEl('lecturaAnteriorInput').value === '' && getEl('lecturaActualInput').value === '');

console.log('\n=== 3. Upsert por chalet + mes ===');
getEl('lecturaChalet').value = 'A-01';
getEl('lecturaMes').value = '2026-05';
getEl('lecturaAnteriorInput').value = '100';
getEl('lecturaActualInput').value = '150';
run('saveLectura({preventDefault(){}})');
check('sigue habiendo 1 sola lectura (upsert)', run('db.lecturas.length') === 1, `length=${run('db.lecturas.length')}`);
check('valor actualizado a 150', run('db.lecturas[0].actual') === 150);
check('la lectura editada deja de ser demo', run('db.lecturas[0].demo') === false);

console.log('\n=== 4. Validaciones ===');
const before = run('db.lecturas.length');
getEl('lecturaChalet').value = 'A-01';
getEl('lecturaMes').value = '2026-06';
getEl('lecturaAnteriorInput').value = '150';
getEl('lecturaActualInput').value = '120';
run('saveLectura({preventDefault(){}})');
check('rechaza lectura regresiva (actual < anterior)', run('db.lecturas.length') === before, `length=${run('db.lecturas.length')}`);
check('mensaje de warning mostrado', swalCalls.some(c => c.icon === 'warning'));

getEl('lecturaChalet').value = '';

console.log('\n=== 5. Prellenado de lectura anterior ===');
getEl('lecturaChalet').value = 'A-01';
getEl('lecturaMes').value = '2026-06';
run('prellenarLecturaAnterior()');
check('prellena con el actual del mes previo (150)', getEl('lecturaAnteriorInput').value === '150', getEl('lecturaAnteriorInput').value);
getEl('lecturaChalet').value = 'B-01';
getEl('lecturaMes').value = '2026-05';
run('prellenarLecturaAnterior()');
check('sin datos previos deja vacio', getEl('lecturaAnteriorInput').value === '', `"${getEl('lecturaAnteriorInput').value}"`);
getEl('lecturaChalet').value = 'A-01';
getEl('lecturaMes').value = '2026-05';
run('prellenarLecturaAnterior()');
check('si el mes ya existe, precarga anterior y actual', getEl('lecturaAnteriorInput').value === '100' && getEl('lecturaActualInput').value === '150');

console.log('\n=== 6. Preview de consumo ===');
getEl('lecturaAnteriorInput').value = '100';
getEl('lecturaActualInput').value = '125';
run('previewLecturaConsumo()');
check('muestra consumo 25.00 m3', getEl('lecturaConsumoPreview').textContent === '25.00 m³', getEl('lecturaConsumoPreview').textContent);
getEl('lecturaActualInput').value = '50';
run('previewLecturaConsumo()');
check('marca consumo invalido en rojo', getEl('lecturaConsumoPreview').className === 'text-red-600', getEl('lecturaConsumoPreview').className);

console.log('\n=== 7. Renderizado del historial ===');
run('renderLecturas()');
const tbody = getEl('lecturasTableBody');
check('tabla con 1 fila', tbody.children.length === 1, `rows=${tbody.children.length}`);
check('muestra el chalet', tbody.children[0].innerHTML.includes('A-01'));
check('muestra el propietario', tbody.children[0].innerHTML.includes('Ana Perez'));
check('muestra el mes formateado', tbody.children[0].innerHTML.includes('Mayo 2026'));
check('etiqueta REAL', tbody.children[0].innerHTML.includes('REAL'));

console.log('\n=== 8. Datos demo ===');
run('cargarDemoLecturas()');
const demoCount = run('db.lecturas.filter(l => l.demo).length');
check('lecturas demo cargadas (2 de 4 propietarios)', demoCount === 2, `demo=${demoCount}`);
check('demo marcadas con demo:true', run('db.lecturas.filter(l => l.demo).every(l => l.demo === true)'));
check('demo con id DEMO-*', run('db.lecturas.filter(l => l.demo).every(l => l.id.startsWith("DEMO-"))'));
run('renderLecturas()');
check('tabla muestra 3 filas (1 real + 2 demo)', getEl('lecturasTableBody').children.length === 3, `rows=${getEl('lecturasTableBody').children.length}`);
check('filas demo con etiqueta DEMO', getEl('lecturasTableBody').children.some(r => r.innerHTML.includes('DEMO')));
check('la lectura real no fue pisada por el demo', run('db.lecturas.find(l => l.chalet === "A-01" && l.mes === "2026-05").demo') === false);

console.log('\n=== 9. Eliminar datos demo ===');
run('eliminarDatosDemo()');
await flush();
check('demo eliminados', run('db.lecturas.filter(l => l.demo).length') === 0);
check('la lectura real sobrevive', run('db.lecturas.length') === 1 && run('db.lecturas[0].demo') === false);
check('localStorage sincronizado', JSON.parse(store.get('ph_lecturas')).filter(l => l.demo).length === 0);

console.log('\n=== 10. Eliminar lectura individual ===');
const idReal = run('db.lecturas[0].id');
run(`deleteLectura(${JSON.stringify(idReal)})`);
await flush();
check('lectura eliminada', run('db.lecturas.length') === 0, `length=${run('db.lecturas.length')}`);
check('localStorage sincronizado tras borrado', JSON.parse(store.get('ph_lecturas')).length === 0);



console.log('\n=== 11. renderPagosTable() ===');
getEl('lecturaChalet').value = 'A-01';
getEl('lecturaMes').value = new Date().toISOString().slice(0, 7);
getEl('lecturaAnteriorInput').value = '100';
getEl('lecturaActualInput').value = '125';
run('saveLectura({preventDefault(){}})');
await flush();
run('renderPagosTable()');
const dash = getEl('dashboardTableBody');
check('tabla de pagos con 4 filas (4 propietarios)', dash.children.length === 4, `rows=${dash.children.length}`);
check('fila con lectura muestra 25 m3', dash.children[0].innerHTML.includes('25 m³'), dash.children[0].innerHTML.replace(/\s+/g, ' ').slice(0, 200));
const agua = (25 * 5.60).toFixed(2);
check(`monto agua S/ ${agua}`, dash.children[0].innerHTML.includes(`S/ ${agua}`));
const total = (25 * 5.60 + 150).toFixed(2);
check(`total mes S/ ${total}`, dash.children[0].innerHTML.includes(`S/ ${total}`));
check('recaudacion en 0 (pago pendiente)', getEl('statRecaudacion').textContent === 'S/ 0.00', getEl('statRecaudacion').textContent);
check(`deuda total S/ ${total}`, getEl('statDeuda').textContent === `S/ ${total}`, getEl('statDeuda').textContent);
run("togglePago('A-01', new Date().toISOString().slice(0,7))");
await flush();
check('tras marcar pagado, recaudacion sube', getEl('statRecaudacion').textContent === `S/ ${total}`, getEl('statRecaudacion').textContent);

console.log('\n=== 12. Persistencia tras "recarga" ===');
store.set('ph_lecturas', JSON.stringify(run('db.lecturas')));
const ctxReload = makeCtx();
vm.runInContext(mainCode, ctxReload, { filename: 'index.html:reload' });
ctxReload.__domReady();
const rr = e => vm.runInContext(e, ctxReload);
check('lecturas restauradas desde localStorage', rr('db.lecturas.length') === 1, `len=${rr('db.lecturas.length')}`);
check('tabla de lecturas repoblada tras recarga', getEl('lecturasTableBody').children.length === 1, `rows=${getEl('lecturasTableBody').children.length}`);
rr('renderPagosTable()');
check('renderPagosTable funciona tras recarga', getEl('dashboardTableBody').children.length === 4, `rows=${getEl('dashboardTableBody').children.length}`);

    console.log('\n=== 13. Seguridad: escape de HTML ===');
    const XSS = '<img src=x onerror="alert(1)">';
    check('escapeHtml escapa < > & " \'', run('escapeHtml(`<b>"x"&\'y\'</b>`)') === '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
    check('escapeHtml convierte null/undefined en cadena vacia', run('escapeHtml(null)') === '' && run('escapeHtml(undefined)') === '');

    run('db.propietarios.push({ id: "XSS-1", chalet: "A-99", nombre: ' + JSON.stringify(XSS) + ', telefono: "111" })');
    run('renderPropietarios()');
    const propRows = getEl('propietariosTableBody').children;
    // renderPropietarios() ordena por chalet: se busca la fila del chalet inyectado
    const xssRow = propRows.find(r => r.innerHTML.includes('A-99')) || { innerHTML: '' };
    check('nombre malicioso escapado en renderPropietarios', !xssRow.innerHTML.includes('<img'), xssRow.innerHTML.replace(/\s+/g, ' ').slice(0, 160));
    check('nombre malicioso mostrado como texto literal', xssRow.innerHTML.includes('&lt;img'), xssRow.innerHTML.replace(/\s+/g, ' ').slice(0, 160));

    run('renderLecturas()');
    const lectRows = getEl('lecturasTableBody').children;
    check('historial de lecturas sin HTML crudo inyectado', !lectRows.some(r => r.innerHTML.includes('<img')));

    run('renderPagosTable()');
    const dashRows = getEl('dashboardTableBody').children;
    check('tabla de pagos sin HTML crudo inyectado', !dashRows.some(r => r.innerHTML.includes('<img')));

    console.log('\n=== 14. Seguridad: sin handlers inline con datos interpolados ===');
    check('sin onclick/onchange con interpolacion en el HTML', !/on(click|change)="[^"]*\$\{/.test(html), 'se detecto handler inline con datos variables');
    check('delete-lectura usa data-action', html.includes('data-action="delete-lectura"'));
    check('toggle-pago usa data-action', html.includes('data-action="toggle-pago"'));
    check('delete-finanza usa data-action', html.includes('data-action="delete-finanza"'));

    console.log('\n=== 15. Delegacion de eventos ===');
    const fakeBtn = makeEl('btn');
    fakeBtn.dataset = { action: 'delete-lectura', id: '999-no-existe' };
    fireDoc('click', fakeBtn);
    await flush();
    check('click delegado se ejecuta sin error', true);

    const fakeCheck = makeEl('chk');
    fakeCheck.dataset = { action: 'toggle-pago', chalet: 'A-01', mes: new Date().toISOString().slice(0, 7) };
    fireDoc('change', fakeCheck);
    await flush();
    check('change delegado registra el pago', run('db.pagos.some(p => p.chalet === "A-01")'));

    console.log('\n=== 16. ID numerico no duplica al editar ===');
    run('db.propietarios.push({ id: 1700000000000, chalet: "C-05", nombre: "Num Id", telefono: "222" })');
    getEl('propId').value = '1700000000000';
    getEl('propChaletLetra').value = 'C';
    getEl('propChaletNum').value = '05';
    getEl('propNombre').value = 'Num Id Editado';
    getEl('propTelefono').value = '333';
    run('savePropietario({preventDefault(){}})');
    check('editar no duplica propietario con id numerico', run('db.propietarios.filter(p => p.chalet === "C-05").length') === 1, 'n=' + run('db.propietarios.filter(p => p.chalet === "C-05").length'));
    check('el nombre fue actualizado', run('db.propietarios.find(p => p.chalet === "C-05").nombre') === 'Num Id Editado');
    check('no se creo un registro extra', run('db.propietarios.length') === 6, 'n=' + run('db.propietarios.length'));


console.log(`\n=== RESULTADO: ${pass} OK / ${fail} FALLAS ===`);
process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('ERROR EN TEST:', e); process.exit(1); });

