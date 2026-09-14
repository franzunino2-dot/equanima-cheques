// Conciliación bancaria. Funciona de dos maneras:
//   1. Importando el archivo que baja del homebanking (hoy).
//   2. Con el sync automático contra la API del banco (docs/INTEGRACION_BIND.md).
// El motor de matcheo es el mismo en los dos casos.

import { S, visibles, comitente, transicionar } from '../store.js';
import { aviso, confirmar } from '../ui/dialogos.js';
import { badgeEstado, vacio } from '../ui/componentes.js';
import { esc, plata, fechaFmt, parsearMonto, soloDigitos, hoyISO } from '../dominio/formato.js';
import { nombreBanco } from '../dominio/bancos.js';

let movimientos = [];   // lo último importado
let conciliado = [];

// --- parseo ---

function detectarSeparador(texto) {
  const l = texto.split(/\r?\n/)[0] || '';
  const c = (l.match(/;/g) || []).length;
  const k = (l.match(/,/g) || []).length;
  const t = (l.match(/\t/g) || []).length;
  if (t > c && t > k) return '\t';
  return c >= k ? ';' : ',';
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

const SINONIMOS = {
  echeq_id: ['idecheq', 'echeqid', 'idcheque', 'nrocheque', 'numerocheque', 'cheque', 'numero', 'nro', 'idechq'],
  monto: ['importe', 'monto', 'valor', 'importecheque'],
  fecha_pago: ['fechapago', 'fechadepago', 'fechavencimiento', 'vencimiento', 'fechacobro'],
  fecha_mov: ['fecha', 'fechamovimiento', 'fechaacreditacion', 'fechaoperacion'],
  cuit: ['cuitlibrador', 'cuit', 'cuitemisor', 'cuitgirador'],
  nombre: ['librador', 'razonsocial', 'nombre', 'emisor', 'beneficiario'],
  estado: ['estado', 'situacion', 'estadocheque'],
  banco: ['banco', 'bancogirado', 'entidad', 'codigobanco']
};

function mapearColumnas(cab) {
  const mapa = {};
  cab.forEach((c, i) => {
    const n = normalizar(c);
    Object.keys(SINONIMOS).forEach(k => {
      if (mapa[k] === undefined && SINONIMOS[k].indexOf(n) >= 0) mapa[k] = i;
    });
  });
  return mapa;
}

function fechaFlexible(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    return a + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  return null;
}

export function parsearArchivo(texto) {
  const t = texto.trim();
  if (t[0] === '[' || t[0] === '{') {
    try {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : (j.cheques || j.movimientos || j.data || []);
      return arr.map(o => ({
        echeq_id: String(o.echeq_id || o.idEcheq || o.cheque_id || o.numero || ''),
        monto: parsearMonto(o.monto || o.importe || 0),
        fecha_pago: fechaFlexible(o.fecha_pago || o.fechaPago || o.vencimiento),
        fecha_mov: fechaFlexible(o.fecha || o.fecha_mov || o.fechaAcreditacion) || hoyISO(),
        cuit: soloDigitos(o.cuit || o.cuit_librador || ''),
        nombre: o.nombre || o.librador || '',
        estado: String(o.estado || '').toUpperCase(),
        banco: String(o.banco || '')
      })).filter(m => m.monto > 0 || m.echeq_id);
    } catch (e) { return []; }
  }

  const sep = detectarSeparador(t);
  const lineas = t.split(/\r?\n/).filter(l => l.trim());
  if (lineas.length < 2) return [];
  const partir = l => l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
  const mapa = mapearColumnas(partir(lineas[0]));
  return lineas.slice(1).map(l => {
    const c = partir(l);
    const v = k => mapa[k] !== undefined ? c[mapa[k]] : '';
    return {
      echeq_id: String(v('echeq_id') || '').replace(/\s/g, ''),
      monto: parsearMonto(v('monto')),
      fecha_pago: fechaFlexible(v('fecha_pago')),
      fecha_mov: fechaFlexible(v('fecha_mov')) || hoyISO(),
      cuit: soloDigitos(v('cuit')),
      nombre: v('nombre'),
      estado: String(v('estado') || '').toUpperCase(),
      banco: String(v('banco') || '')
    };
  }).filter(m => m.monto > 0 || m.echeq_id);
}

// --- matcheo ---

export function conciliar(movs, cheques) {
  return movs.map(m => {
    let ch = null, criterio = null;

    if (m.echeq_id) {
      ch = cheques.find(c => c.echeq_id && String(c.echeq_id).replace(/\s/g, '') === m.echeq_id);
      if (ch) criterio = 'ID ECHEQ';
      if (!ch) {
        ch = cheques.find(c => c.numero_cheque && String(c.numero_cheque) === m.echeq_id);
        if (ch) criterio = 'número de cheque';
      }
    }
    if (!ch && m.monto && m.fecha_pago) {
      const cand = cheques.filter(c =>
        Math.abs(Number(c.monto || 0) - m.monto) < 1 && c.fecha_pago === m.fecha_pago);
      if (cand.length === 1) { ch = cand[0]; criterio = 'importe + fecha de pago'; }
      else if (cand.length > 1) criterio = 'ambiguo (' + cand.length + ' candidatos)';
    }
    if (!ch && m.monto && m.cuit) {
      const cand = cheques.filter(c =>
        Math.abs(Number(c.monto || 0) - m.monto) < 1 && soloDigitos(c.cuit_librador) === m.cuit);
      if (cand.length === 1) { ch = cand[0]; criterio = 'importe + CUIT'; }
    }

    // ¿Qué dice el banco que pasó?
    let sugerido = null;
    const e = m.estado || '';
    if (/ACREDIT|PAGAD|COBRAD|LIQUIDAD/.test(e)) sugerido = 'acreditado';
    else if (/RECHAZ|DEVUELT|IMPAG/.test(e)) sugerido = 'rechazado_banco';
    else if (/DEPOSIT|PRESENTAD|CAMARA/.test(e)) sugerido = 'depositado';

    return { mov: m, cheque: ch, criterio, sugerido };
  });
}

// --- vista ---

function estadoIntegracion() {
  const url = window.CFG.SYNC_ENDPOINT;
  if (!url) {
    return '<div class="tarjeta integracion">' +
      '<h3>Integración con el banco <span class="badge t-gris">sin configurar</span></h3>' +
      '<p>Mientras tanto, importá el archivo que bajás del homebanking y la página lo cruza sola contra ' +
      'los cheques cargados. Cuando esté la API, esto mismo pasa a correr cada ' +
      ((window.CFG.SYNC_INTERVALO_MS || 300000) / 60000) + ' minutos sin que nadie toque nada.</p>' +
      '<p class="tenue">Adaptador previsto: <strong>' + esc(window.CFG.BANCO_ADAPTADOR || 'bind') + '</strong>. ' +
      'Los pasos están en <code>docs/INTEGRACION_BIND.md</code>.</p></div>';
  }
  return '<div class="tarjeta integracion">' +
    '<h3>Integración con el banco <span class="badge t-verde">activa</span></h3>' +
    '<p class="tenue">Endpoint: <code>' + esc(url) + '</code></p>' +
    '<button class="btn fantasma" id="btn-sync">Sincronizar ahora</button></div>';
}

export function vistaBanco() {
  const cabecera =
    '<div class="vista vista-banco">' +
    '<header class="vista-head"><div><h1>Banco</h1>' +
    '<p class="tenue">Cruce entre lo que dice el banco y lo que dice la página</p></div></header>' +
    estadoIntegracion() +
    '<div class="tarjeta">' +
    '<h3>Importar archivo</h3>' +
    '<p class="tenue">CSV, TXT o JSON del homebanking. Se detectan solas las columnas ' +
    'con el ID del ECHEQ, el importe, la fecha de pago, el CUIT del librador y el estado.</p>' +
    '<input type="file" id="archivo-banco" accept=".csv,.txt,.json,.tsv">' +
    '</div>';

  if (!conciliado.length) {
    return cabecera + vacio('Todavía no importaste nada.', 'Elegí el archivo y se concilia al instante.') + '</div>';
  }

  const ok = conciliado.filter(r => r.cheque);
  const huerfanos = conciliado.filter(r => !r.cheque);
  const accionables = ok.filter(r => r.sugerido && r.cheque.estado !== r.sugerido);

  const filas = conciliado.map((r, i) => {
    const ch = r.cheque;
    const com = ch ? comitente(ch.comitente_id) : null;
    return '<tr class="' + (ch ? 'conc-ok' : 'conc-huerfano') + '">' +
      '<td>' + (ch ? '<input type="checkbox" class="sel-conc" data-i="' + i + '"' +
        (r.sugerido && ch.estado !== r.sugerido ? ' checked' : '') + '>' : '') + '</td>' +
      '<td>' + esc(r.mov.echeq_id || '—') + '</td>' +
      '<td class="num">' + esc(plata(r.mov.monto, 'ARS')) + '</td>' +
      '<td>' + esc(fechaFmt(r.mov.fecha_pago)) + '</td>' +
      '<td>' + esc(r.mov.nombre || '') + '<div class="sub tenue">' + esc(r.mov.cuit || '') + '</div></td>' +
      '<td>' + esc(r.mov.estado || '—') + '</td>' +
      '<td>' + (ch
        ? '<a href="#/cheque/' + esc(ch.id) + '">' + esc(ch.codigo) + '</a>' +
          '<div class="sub tenue">' + esc(com ? com.numero + ' ' + com.denominacion : '') + '</div>'
        : '<span class="txt-rojo">sin cheque cargado</span>') + '</td>' +
      '<td class="tenue">' + esc(r.criterio || '—') + '</td>' +
      '<td>' + (ch ? badgeEstado(ch.estado) : '') +
        (r.sugerido && ch && ch.estado !== r.sugerido ? ' → ' + badgeEstado(r.sugerido) : '') + '</td>' +
      '</tr>';
  }).join('');

  return cabecera +
    '<div class="resumen-conc">' +
    '<span><strong>' + conciliado.length + '</strong> movimientos</span>' +
    '<span class="n-entra"><strong>' + ok.length + '</strong> cruzados</span>' +
    '<span class="txt-rojo"><strong>' + huerfanos.length + '</strong> sin cheque cargado</span>' +
    '<span><strong>' + accionables.length + '</strong> con cambio de estado para aplicar</span>' +
    '</div>' +
    (accionables.length ? '<button class="btn primario" id="btn-aplicar">Aplicar ' + accionables.length + ' cambios de estado</button>' : '') +
    '<div class="tabla-wrap"><table class="tabla"><thead><tr>' +
    '<th></th><th>ID / número</th><th class="num">Importe</th><th>Fecha pago</th><th>Librador</th>' +
    '<th>Estado banco</th><th>Cheque</th><th>Cruzado por</th><th>Estado actual</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
    (huerfanos.length ? '<p class="nota nota-alerta">' + huerfanos.length +
      ' movimientos no coinciden con ningún cheque cargado. O el productor no lo avisó, ' +
      'o el ID no coincide. Revisalos antes de dar por cerrada la conciliación.</p>' : '') +
    '</div>';
}

export function conectarBanco(raiz, redibujar) {
  const input = raiz.querySelector('#archivo-banco');
  if (input) input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    const texto = await f.text();
    movimientos = parsearArchivo(texto);
    if (!movimientos.length) {
      aviso('No se reconoció ninguna fila en ese archivo', 'error');
      return;
    }
    conciliado = conciliar(movimientos, visibles());
    aviso(movimientos.length + ' movimientos leídos', 'exito');
    redibujar();
  });

  const aplicar = raiz.querySelector('#btn-aplicar');
  if (aplicar) aplicar.addEventListener('click', async () => {
    const elegidos = [];
    raiz.querySelectorAll('.sel-conc:checked').forEach(c => {
      const r = conciliado[Number(c.getAttribute('data-i'))];
      if (r && r.cheque && r.sugerido && r.cheque.estado !== r.sugerido) elegidos.push(r);
    });
    if (!elegidos.length) { aviso('No hay nada seleccionado', 'error'); return; }
    const ok = await confirmar('Aplicar cambios',
      'Se van a actualizar ' + elegidos.length + ' cheques con lo que informó el banco. Queda registrado en la trazabilidad de cada uno.');
    if (!ok) return;
    let hechos = 0, fallidos = 0;
    for (const r of elegidos) {
      try {
        await transicionar(r.cheque.id, r.sugerido, {
          motivo: 'Conciliación bancaria — el banco informó "' + (r.mov.estado || r.sugerido) + '"',
          campos: r.sugerido === 'acreditado'
            ? { fecha_acreditacion: r.mov.fecha_mov }
            : r.sugerido === 'rechazado_banco'
              ? { motivo_rechazo_banco: r.mov.estado || 'Informado por el banco' }
              : {}
        });
        hechos++;
      } catch (e) { fallidos++; }
    }
    conciliado = conciliar(movimientos, visibles());
    aviso(hechos + ' aplicados' + (fallidos ? ', ' + fallidos + ' fallaron' : ''), fallidos ? 'error' : 'exito');
    redibujar();
  });

  const sync = raiz.querySelector('#btn-sync');
  if (sync) sync.addEventListener('click', async () => {
    sync.disabled = true;
    try {
      const r = await fetch(window.CFG.SYNC_ENDPOINT, { method: 'POST' });
      const j = await r.json();
      aviso('Sincronizado: ' + (j.procesados || 0) + ' movimientos', 'exito');
      redibujar();
    } catch (e) {
      aviso('No se pudo sincronizar: ' + e.message, 'error');
    }
    sync.disabled = false;
  });
}
