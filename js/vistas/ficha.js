// Ficha del cheque: estado, controles, datos, acciones y trazabilidad.

import { S, cheque, comitente, eventosDe, alertasDe, nombreUsuario, usuario, transicionar, comentar, fechaEfectiva } from '../store.js';
import { transicionesDisponibles, estado as estadoDef, CIRCUITOS } from '../dominio/estados.js';
import { tieneBloqueantes } from '../dominio/validaciones.js';
import { ETIQUETAS_CAMPO } from '../dominio/validaciones.js';
import { nombreBanco, MOTIVOS_RECHAZO } from '../dominio/bancos.js';
import { stepper, badgeEstado, chipCircuito, chipSoporte, filaAlerta, dato, avatar, vencimiento, vacio } from '../ui/componentes.js';
import { modal, aviso } from '../ui/dialogos.js';
import { esc, plata, fechaFmt, fechaHoraFmt, cuitFmt, hoyISO, relativo } from '../dominio/formato.js';

function campoModal(nombre) {
  const etiqueta = ETIQUETAS_CAMPO[nombre] || nombre;
  const hoy = hoyISO();
  if (nombre.indexOf('fecha_') === 0) {
    return '<label class="campo"><span>' + esc(etiqueta) + '</span>' +
      '<input type="date" name="' + esc(nombre) + '" value="' + esc(hoy) + '"></label>';
  }
  if (nombre === 'cuenta_deposito') {
    const cuentas = (window.CFG.CUENTAS || []);
    return '<label class="campo"><span>' + esc(etiqueta) + '</span><select name="cuenta_deposito">' +
      cuentas.map(c => '<option value="' + esc(c.id) + '">' + esc(c.alias) + '</option>').join('') +
      '</select></label>';
  }
  if (nombre === 'motivo_rechazo_banco') {
    return '<label class="campo"><span>' + esc(etiqueta) + '</span><select name="motivo_rechazo_banco">' +
      MOTIVOS_RECHAZO.map(m => '<option value="' + esc(m) + '">' + esc(m) + '</option>').join('') +
      '</select></label>';
  }
  return '<label class="campo"><span>' + esc(etiqueta) + '</span>' +
    '<input type="text" name="' + esc(nombre) + '"></label>';
}

async function ejecutar(ch, t) {
  const alertas = alertasDe(ch);
  if (t.validarAlertas && tieneBloqueantes(alertas)) {
    const lista = alertas.filter(a => a.nivel === 'bloqueante')
      .map(a => '<li><strong>' + esc(a.titulo) + '</strong><br><span class="tenue">' + esc(a.detalle) + '</span></li>').join('');
    await modal({
      titulo: 'No se puede aprobar todavía',
      cuerpo: '<p>Hay controles sin resolver. Corregilos, o elevá el cheque a compliance para que apruebe la excepción con fundamento.</p><ul class="lista-alertas">' + lista + '</ul>',
      confirmar: 'Entendido',
      cancelar: 'Cerrar'
    });
    return;
  }

  let cuerpo = '<p class="tenue">' + esc(estadoDef(t.a).descripcion) + '</p>';
  (t.campos || []).forEach(c => { cuerpo += campoModal(c); });
  if (t.motivo) {
    cuerpo += '<label class="campo"><span>' + esc(t.motivoEtiqueta || 'Motivo / nota') + '</span>' +
      '<textarea name="motivo" rows="3" placeholder="Queda registrado en la trazabilidad"></textarea></label>';
  }

  const datos = await modal({
    titulo: t.etiqueta,
    cuerpo,
    confirmar: t.etiqueta,
    tono: t.tono === 'peligro' ? 'peligro' : t.tono === 'exito' ? 'exito' : 'primario',
    validar: d => {
      if (t.motivo && !(d.motivo || '').trim()) return 'Escribí el motivo: queda en la trazabilidad.';
      const falta = (t.campos || []).find(c => !d[c]);
      if (falta) return 'Falta completar ' + (ETIQUETAS_CAMPO[falta] || falta) + '.';
      return null;
    }
  });
  if (!datos) return;

  const campos = {};
  (t.campos || []).forEach(c => { campos[c] = datos[c]; });
  if (t.a === 'acreditado' || t.a === 'debitado') campos.fecha_acreditacion = datos.fecha_acreditacion;

  try {
    await transicionar(ch.id, t.a, { motivo: datos.motivo || null, campos });
    aviso('Listo: ' + estadoDef(t.a).nombre.toLowerCase(), 'exito');
  } catch (e) {
    aviso('No se pudo: ' + (e.message || e), 'error');
  }
}

function bloqueDatos(ch) {
  const com = comitente(ch.comitente_id);
  const esEgreso = ch.circuito === 'egreso';
  const efectiva = fechaEfectiva(ch);

  let html = '<div class="grilla-datos">';
  html += dato('Cuenta comitente', com
    ? '<strong>' + esc(com.numero) + '</strong> — ' + esc(com.denominacion) + '<br><span class="tenue">' + esc(cuitFmt(com.cuit)) + '</span>'
    : null);
  html += dato('Productor', esc(nombreUsuario(ch.productor_id)));
  html += dato('Importe', '<strong class="monto-grande">' + esc(plata(ch.monto, ch.moneda)) + '</strong>');
  html += dato('Soporte', chipSoporte(ch.soporte) + (ch.cruzado ? ' <span class="chip">Cruzado</span>' : '') +
    (ch.no_a_la_orden ? ' <span class="chip chip-alerta">No a la orden</span>' : ''));
  html += dato('Banco girado', esc(nombreBanco(ch.banco_girado)));
  html += dato(ch.soporte === 'echeq' ? 'ID ECHEQ' : 'Número de cheque', esc(ch.echeq_id || ch.numero_cheque || ''));
  html += dato('Librador', ch.nombre_librador
    ? esc(ch.nombre_librador) + '<br><span class="tenue">' + esc(cuitFmt(ch.cuit_librador)) + '</span>' : null);
  html += dato(esEgreso ? 'Beneficiario' : 'Endosatario', (esEgreso ? ch.nombre_beneficiario : ch.endosatario_nombre)
    ? esc(esEgreso ? ch.nombre_beneficiario : ch.endosatario_nombre) +
      '<br><span class="tenue">' + esc(cuitFmt(esEgreso ? ch.cuit_beneficiario : ch.endosatario_cuit)) + '</span>' : null);
  html += dato('Fecha de emisión', esc(fechaFmt(ch.fecha_emision)));
  html += dato('Fecha de pago', vencimiento(ch.fecha_pago, ch.estado));
  html += dato('Recibido', esc(fechaFmt(ch.fecha_recepcion)));
  html += dato('Depositado', ch.fecha_deposito
    ? esc(fechaFmt(ch.fecha_deposito)) + (ch.cuenta_deposito ? '<br><span class="tenue">' + esc(nombreCuenta(ch.cuenta_deposito)) + '</span>' : '') : null);
  html += dato('Acreditado', esc(fechaFmt(ch.fecha_acreditacion)));
  html += dato('Disponible estimado', efectiva && !ch.fecha_acreditacion
    ? esc(fechaFmt(efectiva)) + ' <span class="tenue">(' + esc(relativo(efectiva)) + ')</span>' : esc(fechaFmt(ch.fecha_acreditacion)));
  if (ch.motivo_rechazo_banco) html += dato('Motivo del rechazo', '<span class="txt-rojo">' + esc(ch.motivo_rechazo_banco) + '</span>', 'ancho');
  if (ch.observaciones) html += dato('Observaciones', esc(ch.observaciones), 'ancho');
  html += '</div>';
  return html;
}

function nombreCuenta(id) {
  const c = (window.CFG.CUENTAS || []).find(x => x.id === id);
  return c ? c.alias : id;
}

function bloqueEventos(ch) {
  const evs = eventosDe(ch.id);
  if (!evs.length) return vacio('Sin movimientos todavía.');
  return '<ol class="linea-tiempo">' + evs.slice().reverse().map(e => {
    const u = usuario(e.usuario_id);
    let texto;
    if (e.tipo === 'creacion') texto = 'Creó el cheque';
    else if (e.tipo === 'transicion') texto = (e.de ? estadoDef(e.de).nombre + ' → ' : '') + '<strong>' + esc(estadoDef(e.a).nombre) + '</strong>';
    else if (e.tipo === 'comentario') texto = 'Comentó';
    else texto = esc(e.nota || e.tipo);
    return '<li class="ev ev-' + esc(e.tipo) + '">' +
      avatar(u ? u.nombre : '?', u ? u.avatar_url : null) +
      '<div><div class="ev-cab"><strong>' + esc(u ? u.nombre : 'Sistema') + '</strong> ' + texto +
      '<span class="tenue"> · ' + esc(fechaHoraFmt(e.en)) + '</span></div>' +
      (e.nota && e.tipo !== 'comentario' ? '<div class="ev-nota">' + esc(e.nota) + '</div>' : '') +
      (e.tipo === 'comentario' ? '<div class="ev-nota">' + esc(e.nota) + '</div>' : '') +
      '</div></li>';
  }).join('') + '</ol>';
}

export function ficha(id) {
  const ch = cheque(id);
  if (!ch) return '<div class="vista">' + vacio('No encontramos ese cheque.', 'Puede que no tengas permiso para verlo.') + '</div>';

  const alertas = alertasDe(ch);
  const trans = transicionesDisponibles(ch, S.usuario ? S.usuario.rol : 'lectura');
  const circ = CIRCUITOS[ch.circuito] || {};

  const botones = trans.map(t =>
    '<button class="btn ' + esc(t.tono || 'primario') + '" data-trans="' + esc(t.a) + '">' + esc(t.etiqueta) + '</button>'
  ).join('');

  const bloqueAlertas = alertas.length
    ? '<section class="tarjeta">' +
      '<h3>Controles' + (tieneBloqueantes(alertas) ? ' <span class="badge t-rojo">requiere resolución</span>' : '') + '</h3>' +
      '<ul class="lista-alertas">' + alertas.map(filaAlerta).join('') + '</ul></section>'
    : '<section class="tarjeta"><h3>Controles</h3><p class="ok-todo">✓ Sin observaciones. Librador, fechas, importe y duplicados verificados.</p></section>';

  return '<div class="vista vista-ficha">' +
    '<header class="vista-head">' +
    '<div><a class="volver" href="#/cheques">← Cheques</a>' +
    '<h1>' + esc(ch.codigo) + ' ' + chipCircuito(ch.circuito) + ' ' + badgeEstado(ch.estado) + '</h1>' +
    '<p class="tenue">' + esc(circ.titulo || '') + '</p></div>' +
    '<div class="acciones">' + botones +
    '<a class="btn fantasma" href="#/editar/' + esc(ch.id) + '">Editar</a></div></header>' +

    '<section class="tarjeta"><h3>Circuito</h3>' + stepper(ch) + '</section>' +
    bloqueAlertas +
    '<section class="tarjeta"><h3>Datos del cheque</h3>' + bloqueDatos(ch) + '</section>' +
    '<section class="tarjeta"><h3>Trazabilidad</h3>' +
    '<form class="comentar" id="form-comentario">' +
    '<input type="text" id="txt-comentario" placeholder="Dejá una nota para el equipo…" autocomplete="off">' +
    '<button class="btn fantasma" type="submit">Comentar</button></form>' +
    bloqueEventos(ch) + '</section>' +
    '</div>';
}

export function conectarFicha(raiz, id) {
  const ch = cheque(id);
  if (!ch) return;
  const trans = transicionesDisponibles(ch, S.usuario ? S.usuario.rol : 'lectura');
  raiz.querySelectorAll('[data-trans]').forEach(b => {
    b.addEventListener('click', () => {
      const t = trans.find(x => x.a === b.getAttribute('data-trans'));
      if (t) ejecutar(ch, t);
    });
  });
  const form = raiz.querySelector('#form-comentario');
  if (form) form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const input = raiz.querySelector('#txt-comentario');
    const texto = (input.value || '').trim();
    if (!texto) return;
    input.value = '';
    try { await comentar(ch.id, texto); } catch (e) { aviso('No se pudo comentar: ' + e.message, 'error'); }
  });
}
