// Piezas de UI compartidas. Todo devuelve HTML como string.

import { esc, plata, plataCorta, fechaFmt, relativo, iniciales, cuitFmt, diasDesdeHoy } from '../dominio/formato.js';
import { estado as estadoDef, CIRCUITOS, LINEA_FELIZ } from '../dominio/estados.js';
import { nombreBanco } from '../dominio/bancos.js';

// El nombre oficial del banco es largo y en la tabla no entra. Sacamos el
// relleno ("Banco de la Provincia de…") y dejamos lo que identifica.
export function bancoCorto(cod) {
  const n = nombreBanco(cod);
  if (!n || n === '—') return '—';
  const m = n.match(/\(([^)]+)\)/);       // "Banco Industrial (BIND)" -> BIND
  if (m) return m[1];
  return n
    .replace(/^Banco de la Provincia de\s+/i, '')
    .replace(/^Banco de la\s+/i, '')
    .replace(/^Banco del\s+/i, '')
    .replace(/^Banco de\s+/i, '')
    .replace(/^Banco\s+/i, '')
    .replace(/\s+(Argentina|Cooperativo|Cooperativa|S\.A\.?|SA)\b.*$/i, '')
    .replace(/\s+y Buenos Aires$/i, '')
    .trim() || n;
}

export function badgeEstado(id) {
  const e = estadoDef(id);
  return '<span class="badge t-' + e.tono + '" title="' + esc(e.descripcion) + '">' + esc(e.nombre) + '</span>';
}

export function chipCircuito(id) {
  const c = CIRCUITOS[id];
  if (!c) return '';
  return '<span class="chip c-' + id + '" title="' + esc(c.titulo) + '">' + esc(c.nombre) + '</span>';
}

export function chipSoporte(s) {
  return s === 'echeq'
    ? '<span class="chip chip-soporte">ECHEQ</span>'
    : '<span class="chip chip-soporte chip-fisico">Físico</span>';
}

export function avatar(nombre, url) {
  if (url) return '<img class="avatar" src="' + esc(url) + '" alt="' + esc(nombre) + '">';
  const ini = iniciales(nombre);
  let h = 0;
  for (let i = 0; i < String(nombre || '').length; i++) h = (h * 31 + nombre.charCodeAt(i)) % 360;
  return '<span class="avatar" style="background:hsl(' + h + ' 45% 42%)" title="' + esc(nombre) + '">' + esc(ini) + '</span>';
}

export function puntoAlerta(alertas) {
  const b = alertas.filter(a => a.nivel === 'bloqueante').length;
  const a = alertas.filter(a2 => a2.nivel === 'alerta').length;
  if (b) return '<span class="punto p-rojo" title="' + b + ' control(es) sin resolver">' + b + '</span>';
  if (a) return '<span class="punto p-ambar" title="' + a + ' alerta(s)">' + a + '</span>';
  return '<span class="punto p-verde" title="Sin alertas">✓</span>';
}

export function vencimiento(iso, estadoId) {
  if (!iso) return '<span class="tenue">—</span>';
  const d = diasDesdeHoy(iso);
  const terminal = ['acreditado', 'debitado', 'transferido', 'anulado', 'rechazado_interno', 'rechazado_banco'].indexOf(estadoId) >= 0;
  let cls = '';
  if (!terminal) {
    if (d < 0) cls = ' venc-pasado';
    else if (d <= 2) cls = ' venc-cerca';
  }
  return '<span class="venc' + cls + '">' + fechaFmt(iso) +
    (terminal ? '' : ' <em>' + esc(relativo(iso)) + '</em>') + '</span>';
}

export function stepper(cheque) {
  const linea = LINEA_FELIZ[cheque.circuito] || [];
  const actual = estadoDef(cheque.estado);
  const desviado = linea.indexOf(cheque.estado) < 0;
  const pasos = linea.map(id => {
    const e = estadoDef(id);
    let cls = 'paso';
    if (e.etapa < actual.etapa) cls += ' hecho';
    else if (id === cheque.estado) cls += ' actual';
    if (desviado && e.etapa >= actual.etapa) cls += ' gris';
    return '<div class="' + cls + '"><span class="bolita"></span><span class="rot">' + esc(e.nombre) + '</span></div>';
  }).join('');
  const aviso = desviado
    ? '<div class="stepper-desvio">' + badgeEstado(cheque.estado) + ' <span class="tenue">' + esc(actual.descripcion) + '</span></div>'
    : '';
  return '<div class="stepper">' + pasos + '</div>' + aviso;
}

export function tarjetaKPI(o) {
  return '<a class="kpi' + (o.tono ? ' k-' + o.tono : '') + '" href="' + esc(o.href || '#') + '">' +
    '<span class="kpi-n">' + o.n + '</span>' +
    '<span class="kpi-t">' + esc(o.titulo) + '</span>' +
    (o.monto != null ? '<span class="kpi-m">' + esc(plataCorta(o.monto)) + '</span>' : '') +
    (o.nota ? '<span class="kpi-nota">' + esc(o.nota) + '</span>' : '') +
    '</a>';
}

export function filaAlerta(a) {
  const icono = a.nivel === 'bloqueante' ? '⛔' : a.nivel === 'alerta' ? '⚠️' : 'ℹ️';
  return '<li class="alerta a-' + a.nivel + '">' +
    '<span class="alerta-ico">' + icono + '</span>' +
    '<span><strong>' + esc(a.titulo) + '</strong><br><span class="tenue">' + esc(a.detalle) + '</span></span>' +
    '</li>';
}

export function vacio(texto, sub) {
  return '<div class="vacio"><p>' + esc(texto) + '</p>' + (sub ? '<p class="tenue">' + esc(sub) + '</p>' : '') + '</div>';
}

export function dato(etiqueta, valor, extra) {
  return '<div class="dato' + (extra ? ' ' + extra : '') + '">' +
    '<span class="dato-e">' + esc(etiqueta) + '</span>' +
    '<span class="dato-v">' + (valor == null || valor === '' ? '<span class="tenue">—</span>' : valor) + '</span></div>';
}

export function lineaCheque(ch, ctx) {
  const com = ctx.comitente;
  const alertas = ctx.alertas || [];
  return '<tr data-id="' + esc(ch.id) + '" class="fila-cheque">' +
    '<td class="col-alerta">' + puntoAlerta(alertas) + '</td>' +
    '<td class="col-cod"><a href="#/cheque/' + esc(ch.id) + '">' + esc(ch.codigo || ch.id.slice(0, 6)) + '</a>' +
      '<div class="sub">' + chipCircuito(ch.circuito) + ' ' + chipSoporte(ch.soporte) + '</div></td>' +
    '<td class="col-com">' + (com
      ? '<strong>' + esc(com.numero) + '</strong> <span class="tenue">' + esc(com.denominacion) + '</span>'
      : '<span class="tenue">sin comitente</span>') + '</td>' +
    '<td class="col-parte">' + esc(ch.circuito === 'egreso' ? (ch.nombre_beneficiario || '—') : (ch.nombre_librador || '—')) +
      '<div class="sub tenue">' + esc(ch.circuito === 'egreso' ? cuitFmt(ch.cuit_beneficiario) : cuitFmt(ch.cuit_librador)) + '</div></td>' +
    '<td class="col-banco" title="' + esc(nombreBanco(ch.banco_girado)) + '">' + esc(bancoCorto(ch.banco_girado)) + '</td>' +
    '<td class="col-monto num">' + esc(plata(ch.monto, ch.moneda)) + '</td>' +
    '<td class="col-venc">' + vencimiento(ch.fecha_pago, ch.estado) + '</td>' +
    '<td class="col-estado">' + badgeEstado(ch.estado) + '</td>' +
    '</tr>';
}

export const CABECERA_TABLA =
  '<thead><tr>' +
  '<th class="col-alerta"></th>' +
  '<th data-orden="codigo">Cheque</th>' +
  '<th data-orden="comitente">Comitente</th>' +
  '<th data-orden="nombre_librador">Librador / Beneficiario</th>' +
  '<th data-orden="banco_girado">Banco</th>' +
  '<th data-orden="monto" class="num">Importe</th>' +
  '<th data-orden="fecha_pago">Fecha de pago</th>' +
  '<th data-orden="estado">Estado</th>' +
  '</tr></thead>';
