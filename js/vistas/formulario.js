// Alta y edición de un cheque. Valida en vivo mientras se escribe.

import { S, cheque, comitente, crearCheque, actualizarCheque, visibles, esBackoffice } from '../store.js';
import { CIRCUITOS } from '../dominio/estados.js';
import { validar, faltantes, ETIQUETAS_CAMPO } from '../dominio/validaciones.js';
import { BANCOS, bancoDesdeCBU } from '../dominio/bancos.js';
import { filaAlerta, vacio } from '../ui/componentes.js';
import { aviso } from '../ui/dialogos.js';
import { esc, hoyISO, parsearMonto, plata, cuitFmt, soloDigitos } from '../dominio/formato.js';

let borrador = null;

function nuevoBorrador(circuito) {
  return {
    circuito: circuito || 'ingreso',
    soporte: 'echeq',
    moneda: 'ARS',
    estado: 'borrador',
    comitente_id: '',
    monto: '',
    banco_girado: '',
    numero_cheque: '',
    echeq_id: '',
    fecha_emision: hoyISO(),
    fecha_pago: '',
    nombre_librador: '',
    cuit_librador: '',
    nombre_beneficiario: '',
    cuit_beneficiario: '',
    endosatario_nombre: '',
    endosatario_cuit: '',
    cbu_destino: '',
    cruzado: false,
    no_a_la_orden: false,
    endosado_por_tercero: false,
    observaciones: ''
  };
}

export function iniciarFormulario(id) {
  if (id) {
    const ch = cheque(id);
    borrador = ch ? Object.assign({}, ch) : nuevoBorrador();
  } else {
    borrador = nuevoBorrador();
  }
}

function campo(nombre, etiqueta, tipo, extra) {
  extra = extra || {};
  const v = borrador[nombre];
  const req = extra.requerido ? ' <i class="req">*</i>' : '';
  let control;
  if (tipo === 'select') {
    control = '<select name="' + esc(nombre) + '"' + (extra.attrs || '') + '>' +
      '<option value="">' + esc(extra.vacio || 'Elegir…') + '</option>' +
      extra.opciones.map(o => '<option value="' + esc(o.v) + '"' + (String(v) === String(o.v) ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') +
      '</select>';
  } else if (tipo === 'textarea') {
    control = '<textarea name="' + esc(nombre) + '" rows="2">' + esc(v || '') + '</textarea>';
  } else if (tipo === 'check') {
    return '<label class="check"><input type="checkbox" name="' + esc(nombre) + '"' + (v ? ' checked' : '') + '> ' + esc(etiqueta) + '</label>';
  } else {
    control = '<input type="' + tipo + '" name="' + esc(nombre) + '" value="' + esc(v == null ? '' : v) + '"' +
      (extra.placeholder ? ' placeholder="' + esc(extra.placeholder) + '"' : '') +
      (extra.attrs || '') + '>';
  }
  return '<label class="campo' + (extra.ancho ? ' ancho' : '') + '"><span>' + esc(etiqueta) + req + '</span>' + control +
    (extra.ayuda ? '<small class="tenue">' + esc(extra.ayuda) + '</small>' : '') + '</label>';
}

function comitentesDisponibles() {
  let lista = S.comitentes.filter(c => c.activo !== false);
  if (S.usuario && S.usuario.rol === 'productor') {
    lista = lista.filter(c => c.productor_id === S.usuario.id);
  }
  return lista.map(c => ({ v: c.id, t: c.numero + ' — ' + c.denominacion }));
}

export function formulario(id) {
  if (!borrador) iniciarFormulario(id);
  const b = borrador;
  const esEdicion = !!id;
  const com = comitente(b.comitente_id);

  const selectorCircuito = esEdicion ? '' :
    '<div class="selector-circuito">' + Object.keys(CIRCUITOS).map(k => {
      const c = CIRCUITOS[k];
      return '<button type="button" class="tarjeta-circuito' + (b.circuito === k ? ' activa' : '') + '" data-circ="' + esc(k) + '">' +
        '<strong>' + esc(c.nombre) + '</strong><span>' + esc(c.titulo) + '</span>' +
        '<small class="tenue">' + esc(c.descripcion) + '</small></button>';
    }).join('') + '</div>';

  const bancos = BANCOS.map(x => ({ v: x.cod, t: x.nombre }));
  const esIngreso = b.circuito === 'ingreso';
  const esEgreso = b.circuito === 'egreso';
  const esEndoso = b.circuito === 'endoso';

  let campos = '<div class="grilla-form">';
  campos += campo('comitente_id', 'Cuenta comitente', 'select', { requerido: true, opciones: comitentesDisponibles(), vacio: 'Elegir comitente…' });
  campos += campo('soporte', 'Soporte', 'select', { requerido: true, opciones: [{ v: 'echeq', t: 'ECHEQ (electrónico)' }, { v: 'fisico', t: 'Cheque físico' }] });
  campos += campo('moneda', 'Moneda', 'select', { opciones: [{ v: 'ARS', t: 'Pesos' }, { v: 'USD', t: 'Dólares' }] });
  campos += campo('monto', 'Importe', 'text', { requerido: true, placeholder: '0,00', attrs: ' inputmode="decimal"' });

  if (esIngreso || esEndoso) {
    campos += campo('banco_girado', 'Banco girado', 'select', { requerido: true, opciones: bancos });
    campos += b.soporte === 'echeq'
      ? campo('echeq_id', 'ID ECHEQ', 'text', { placeholder: 'Como figura en el homebanking' })
      : campo('numero_cheque', 'Número de cheque', 'text', { requerido: true });
    campos += campo('nombre_librador', 'Librador (quien firma el cheque)', 'text', { requerido: true, ancho: true });
    campos += campo('cuit_librador', 'CUIT del librador', 'text', {
      requerido: true, placeholder: '20-12345678-3',
      ayuda: com ? 'El comitente es ' + cuitFmt(com.cuit) + '. Tienen que coincidir.' : ''
    });
  }
  if (esEgreso) {
    campos += campo('nombre_beneficiario', 'Beneficiario', 'text', { requerido: true, ancho: true });
    campos += campo('cuit_beneficiario', 'CUIT del beneficiario', 'text', { requerido: true });
    campos += campo('cbu_destino', 'CBU destino (opcional)', 'text', { ayuda: 'Para ECHEQ nominativo.' });
  }
  if (esEndoso) {
    campos += campo('endosatario_nombre', 'Endosatario (a favor de quién se endosa)', 'text', { requerido: true, ancho: true });
    campos += campo('endosatario_cuit', 'CUIT del endosatario', 'text', {});
  }

  campos += campo('fecha_emision', 'Fecha de emisión', 'date', {});
  campos += campo('fecha_pago', 'Fecha de pago', 'date', { requerido: true, ayuda: 'Cuando el cheque se hace efectivo.' });
  campos += '<div class="campo ancho checks">' +
    campo('cruzado', 'Cruzado', 'check') +
    campo('no_a_la_orden', 'No a la orden (no se puede endosar)', 'check') +
    (esIngreso ? campo('endosado_por_tercero', 'Viene endosado por un tercero', 'check') : '') +
    '</div>';
  campos += campo('observaciones', 'Observaciones', 'textarea', { ancho: true });
  campos += '</div>';

  const previo = Object.assign({}, b, { monto: parsearMonto(b.monto), id: id || 'nuevo' });
  const alertas = validar(previo, {
    comitente: com,
    otrosCheques: visibles(),
    config: { umbralUIF: window.CFG.UMBRAL_UIF, tipoCambio: window.CFG.TIPO_CAMBIO_REFERENCIA }
  }).filter(a => a.nivel !== 'info' || b.soporte === 'fisico');

  const falta = faltantes(previo);
  const panelLateral =
    '<aside class="lateral">' +
    '<div class="tarjeta">' +
    '<h3>Control en vivo</h3>' +
    (alertas.length
      ? '<ul class="lista-alertas">' + alertas.map(filaAlerta).join('') + '</ul>'
      : '<p class="ok-todo">✓ Sin observaciones.</p>') +
    (falta.length
      ? '<p class="faltan">Falta cargar: ' + esc(falta.map(f => ETIQUETAS_CAMPO[f] || f).join(', ')) + '</p>'
      : '') +
    '</div>' +
    (com ? '<div class="tarjeta"><h3>Comitente</h3>' +
      '<p><strong>' + esc(com.numero) + '</strong> — ' + esc(com.denominacion) + '</p>' +
      '<p class="tenue">CUIT ' + esc(cuitFmt(com.cuit)) + '</p>' +
      ((esIngreso || esEndoso) ? '<button type="button" class="btn fantasma" id="btn-titular">Usar al comitente como librador</button>' : '') +
      (esEgreso ? '<button type="button" class="btn fantasma" id="btn-titular">Usar al comitente como beneficiario</button>' : '') +
      '</div>' : '') +
    '</aside>';

  return '<div class="vista vista-form">' +
    '<header class="vista-head"><div><a class="volver" href="#/cheques">← Cheques</a>' +
    '<h1>' + (esEdicion ? 'Editar ' + esc(cheque(id) ? cheque(id).codigo : '') : 'Cargar cheque') + '</h1></div></header>' +
    selectorCircuito +
    '<form id="form-cheque" class="form-doble"><div class="principal">' + campos +
    '<div class="form-acciones">' +
    (esEdicion
      ? '<button type="button" class="btn primario" id="btn-guardar">Guardar cambios</button>'
      : '<button type="button" class="btn fantasma" id="btn-borrador">Guardar borrador</button>' +
        '<button type="button" class="btn primario" id="btn-enviar">Enviar a back office</button>') +
    '<a class="btn fantasma" href="#/cheques">Cancelar</a>' +
    '</div></div>' + panelLateral + '</form></div>';
}

export function conectarFormulario(raiz, id, redibujar) {
  raiz.querySelectorAll('[data-circ]').forEach(b => {
    b.addEventListener('click', () => {
      borrador.circuito = b.getAttribute('data-circ');
      redibujar();
    });
  });

  const form = raiz.querySelector('#form-cheque');
  if (!form) return;

  form.addEventListener('input', ev => {
    const el = ev.target;
    if (!el.name) return;
    borrador[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    // Redibujar solo el panel de control, para no perder el foco.
    actualizarLateral(raiz, id);
  });

  form.addEventListener('change', ev => {
    const el = ev.target;
    if (!el.name) return;
    borrador[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.name === 'cbu_destino') {
      const b = bancoDesdeCBU(el.value);
      if (b && !borrador.banco_girado) borrador.banco_girado = b.cod;
    }
    if (['comitente_id', 'soporte', 'circuito'].indexOf(el.name) >= 0) redibujar();
    else actualizarLateral(raiz, id);
  });

  const titular = raiz.querySelector('#btn-titular');
  if (titular) titular.addEventListener('click', () => {
    const com = comitente(borrador.comitente_id);
    if (!com) return;
    if (borrador.circuito === 'egreso') {
      borrador.nombre_beneficiario = com.denominacion;
      borrador.cuit_beneficiario = com.cuit;
    } else {
      borrador.nombre_librador = com.denominacion;
      borrador.cuit_librador = com.cuit;
    }
    redibujar();
  });

  const guardar = async estadoDestino => {
    const datos = Object.assign({}, borrador);
    datos.monto = parsearMonto(datos.monto);
    datos.cuit_librador = soloDigitos(datos.cuit_librador) || null;
    datos.cuit_beneficiario = soloDigitos(datos.cuit_beneficiario) || null;
    datos.endosatario_cuit = soloDigitos(datos.endosatario_cuit) || null;
    ['banco_girado', 'numero_cheque', 'echeq_id', 'nombre_librador', 'nombre_beneficiario',
     'endosatario_nombre', 'cbu_destino', 'observaciones', 'fecha_emision', 'fecha_pago'
    ].forEach(k => { if (datos[k] === '') datos[k] = null; });

    if (estadoDestino === 'solicitado') {
      const falta = faltantes(datos);
      if (falta.length) {
        aviso('Falta: ' + falta.map(f => ETIQUETAS_CAMPO[f] || f).join(', '), 'error');
        return;
      }
      datos.estado = 'solicitado';
    }

    try {
      if (id) {
        delete datos.id; delete datos.codigo; delete datos.creado_en; delete datos.actualizado_en;
        await actualizarCheque(id, datos);
        aviso('Cambios guardados', 'exito');
        location.hash = '#/cheque/' + id;
      } else {
        const ch = await crearCheque(datos);
        aviso(estadoDestino === 'solicitado' ? 'Enviado a back office' : 'Borrador guardado', 'exito');
        borrador = null;
        location.hash = '#/cheque/' + ch.id;
      }
    } catch (e) {
      aviso('No se pudo guardar: ' + (e.message || e), 'error');
    }
  };

  const bB = raiz.querySelector('#btn-borrador');
  if (bB) bB.addEventListener('click', () => guardar('borrador'));
  const bE = raiz.querySelector('#btn-enviar');
  if (bE) bE.addEventListener('click', () => guardar('solicitado'));
  const bG = raiz.querySelector('#btn-guardar');
  if (bG) bG.addEventListener('click', () => guardar(null));
}

function actualizarLateral(raiz, id) {
  const lateral = raiz.querySelector('.lateral .tarjeta');
  if (!lateral) return;
  const com = comitente(borrador.comitente_id);
  const previo = Object.assign({}, borrador, { monto: parsearMonto(borrador.monto), id: id || 'nuevo' });
  const alertas = validar(previo, {
    comitente: com,
    otrosCheques: visibles(),
    config: { umbralUIF: window.CFG.UMBRAL_UIF, tipoCambio: window.CFG.TIPO_CAMBIO_REFERENCIA }
  }).filter(a => a.nivel !== 'info' || borrador.soporte === 'fisico');
  const falta = faltantes(previo);
  lateral.innerHTML = '<h3>Control en vivo</h3>' +
    (alertas.length ? '<ul class="lista-alertas">' + alertas.map(filaAlerta).join('') + '</ul>' : '<p class="ok-todo">✓ Sin observaciones.</p>') +
    (falta.length ? '<p class="faltan">Falta cargar: ' + esc(falta.map(f => ETIQUETAS_CAMPO[f] || f).join(', ')) + '</p>' : '');
}
