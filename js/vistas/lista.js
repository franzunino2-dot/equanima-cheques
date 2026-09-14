// Listado general de cheques con filtros, orden y exportación.

import { S, visibles, filtrar, ordenar, comitente, alertasDe, notificar } from '../store.js';
import { lineaCheque, CABECERA_TABLA, vacio } from '../ui/componentes.js';
import { ESTADOS, CIRCUITOS } from '../dominio/estados.js';
import { BANCOS, nombreBanco } from '../dominio/bancos.js';
import { esc, plata, plataCorta, fechaFmt, cuitFmt } from '../dominio/formato.js';

function opciones(lista, valor, vacioTxt) {
  return '<option value="">' + esc(vacioTxt) + '</option>' +
    lista.map(o => '<option value="' + esc(o.v) + '"' + (String(valor) === String(o.v) ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('');
}

export function lista() {
  const f = S.filtros;
  const todos = visibles();
  const resultado = ordenar(filtrar(todos, f));

  const totalARS = resultado.reduce((s, c) => s + (c.moneda === 'ARS' ? Number(c.monto || 0) : 0), 0);
  const totalUSD = resultado.reduce((s, c) => s + (c.moneda === 'USD' ? Number(c.monto || 0) : 0), 0);

  const estadosUsados = Object.keys(ESTADOS).map(k => ({ v: k, t: ESTADOS[k].nombre + ' (' + todos.filter(c => c.estado === k).length + ')' }))
    .filter(o => todos.some(c => c.estado === o.v));
  const bancosUsados = BANCOS.filter(b => todos.some(c => String(c.banco_girado) === b.cod))
    .map(b => ({ v: b.cod, t: b.nombre }));
  const productores = S.usuarios.filter(u => todos.some(c => c.productor_id === u.id))
    .map(u => ({ v: u.id, t: u.nombre }));
  const coms = S.comitentes.filter(c => todos.some(x => x.comitente_id === c.id))
    .map(c => ({ v: c.id, t: c.numero + ' — ' + c.denominacion }));

  const filtrosHTML =
    '<div class="filtros">' +
    '<input type="search" id="f-texto" placeholder="Buscar comitente, CUIT, número, librador…" value="' + esc(f.texto) + '">' +
    '<select id="f-circuito">' + opciones(Object.keys(CIRCUITOS).map(k => ({ v: k, t: CIRCUITOS[k].nombre })), f.circuito, 'Todos los circuitos') + '</select>' +
    '<select id="f-estado">' + opciones(estadosUsados, f.estado, 'Todos los estados') + '</select>' +
    '<select id="f-comitente">' + opciones(coms, f.comitente, 'Todos los comitentes') + '</select>' +
    '<select id="f-productor">' + opciones(productores, f.productor, 'Todos los productores') + '</select>' +
    '<select id="f-banco">' + opciones(bancosUsados, f.banco, 'Todos los bancos') + '</select>' +
    '<label class="campo-fecha">Desde <input type="date" id="f-desde" value="' + esc(f.desde) + '"></label>' +
    '<label class="campo-fecha">Hasta <input type="date" id="f-hasta" value="' + esc(f.hasta) + '"></label>' +
    '<label class="check"><input type="checkbox" id="f-alertas"' + (f.alertas ? ' checked' : '') + '> Solo con alertas</label>' +
    '<label class="check"><input type="checkbox" id="f-mios"' + (f.soloMios ? ' checked' : '') + '> Solo míos</label>' +
    '<button class="btn fantasma" id="f-limpiar">Limpiar</button>' +
    '<button class="btn fantasma" id="f-csv">Exportar CSV</button>' +
    '</div>';

  const cuerpo = resultado.length
    ? '<div class="tabla-wrap"><table class="tabla" id="tabla-cheques">' + CABECERA_TABLA + '<tbody>' +
      resultado.map(ch => lineaCheque(ch, { comitente: comitente(ch.comitente_id), alertas: alertasDe(ch) })).join('') +
      '</tbody></table></div>'
    : vacio('Ningún cheque coincide con el filtro.', 'Probá limpiar los filtros.');

  return '<div class="vista vista-lista">' +
    '<header class="vista-head"><div><h1>Cheques</h1>' +
    '<p class="tenue">' + resultado.length + ' de ' + todos.length + ' · ' + esc(plata(totalARS, 'ARS')) +
    (totalUSD ? ' + ' + esc(plata(totalUSD, 'USD')) : '') + '</p></div>' +
    '<a class="btn primario" href="#/nuevo">+ Cargar cheque</a></header>' +
    filtrosHTML + cuerpo + '</div>';
}

export function conectarLista(raiz) {
  const f = S.filtros;
  const bind = (id, clave, evento) => {
    const el = raiz.querySelector(id);
    if (!el) return;
    el.addEventListener(evento || 'change', () => {
      f[clave] = el.type === 'checkbox' ? el.checked : el.value;
      notificar();
      const nuevo = document.querySelector(id);
      if (nuevo && evento === 'input') { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
    });
  };
  bind('#f-texto', 'texto', 'input');
  bind('#f-circuito', 'circuito');
  bind('#f-estado', 'estado');
  bind('#f-comitente', 'comitente');
  bind('#f-productor', 'productor');
  bind('#f-banco', 'banco');
  bind('#f-desde', 'desde');
  bind('#f-hasta', 'hasta');
  bind('#f-alertas', 'alertas');
  bind('#f-mios', 'soloMios');

  const limpiar = raiz.querySelector('#f-limpiar');
  if (limpiar) limpiar.addEventListener('click', () => {
    Object.keys(f).forEach(k => { f[k] = (typeof f[k] === 'boolean') ? false : ''; });
    notificar();
  });

  const csv = raiz.querySelector('#f-csv');
  if (csv) csv.addEventListener('click', exportarCSV);

  raiz.querySelectorAll('th[data-orden]').forEach(th => {
    th.addEventListener('click', () => {
      const campo = th.getAttribute('data-orden');
      if (S.orden.campo === campo) S.orden.dir = S.orden.dir === 'asc' ? 'desc' : 'asc';
      else S.orden = { campo, dir: 'asc' };
      notificar();
    });
  });
}

export function exportarCSV() {
  const filas = ordenar(filtrar(visibles()));
  const cab = ['Codigo', 'Circuito', 'Soporte', 'Estado', 'Comitente', 'Denominacion', 'CUIT comitente',
    'Librador', 'CUIT librador', 'Beneficiario', 'CUIT beneficiario', 'Banco girado', 'Numero', 'ECHEQ',
    'Moneda', 'Importe', 'Emision', 'Fecha pago', 'Recepcion', 'Deposito', 'Acreditacion', 'Observaciones'];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cuerpo = filas.map(ch => {
    const c = comitente(ch.comitente_id) || {};
    return [ch.codigo, ch.circuito, ch.soporte, ch.estado, c.numero, c.denominacion, cuitFmt(c.cuit),
      ch.nombre_librador, cuitFmt(ch.cuit_librador), ch.nombre_beneficiario, cuitFmt(ch.cuit_beneficiario),
      nombreBanco(ch.banco_girado), ch.numero_cheque, ch.echeq_id, ch.moneda, ch.monto,
      ch.fecha_emision, ch.fecha_pago, ch.fecha_recepcion, ch.fecha_deposito, ch.fecha_acreditacion,
      ch.observaciones].map(q).join(';');
  }).join('\r\n');
  const texto = '﻿' + cab.map(q).join(';') + '\r\n' + cuerpo;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cheques_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
