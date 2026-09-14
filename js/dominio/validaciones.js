// Reglas de control del cheque. Devuelven una lista de alertas.
//
// nivel:
//   'bloqueante' -> back office no puede aprobar solo; va a compliance
//   'alerta'     -> se puede aprobar, pero queda registrado que se vio
//   'info'       -> dato útil, no impide nada
//
// Estas reglas son el motivo de existir de la página: hoy se chequean a ojo.

import { cuitValido, cbuValido, soloDigitos, diasDesdeHoy, diasEntre, plata, fechaFmt } from './formato.js';

export const UMBRAL_UIF_ARS = 10000000;  // configurable desde config.js
export const PLAZO_PRESENTACION_DIAS = 30;   // desde la fecha de pago
export const MAX_DIFERIMIENTO_DIAS = 360;    // tope legal del cheque de pago diferido

function A(id, nivel, titulo, detalle, campo) {
  return { id, nivel, titulo, detalle, campo };
}

/**
 * @param {object} cheque
 * @param {object} ctx  { comitente, cuentasComitente, otrosCheques, config }
 */
export function validar(cheque, ctx) {
  ctx = ctx || {};
  const out = [];
  const c = cheque || {};
  const comitente = ctx.comitente || null;
  const cfg = ctx.config || {};
  const umbral = cfg.umbralUIF || UMBRAL_UIF_ARS;

  // --- formato ---
  if (c.cuit_librador && !cuitValido(c.cuit_librador)) {
    out.push(A('cuit_librador_invalido', 'bloqueante', 'CUIT del librador inválido',
      'El dígito verificador no cierra. Verificá el número antes de seguir.', 'cuit_librador'));
  }
  if (c.cuit_beneficiario && !cuitValido(c.cuit_beneficiario)) {
    out.push(A('cuit_beneficiario_invalido', 'bloqueante', 'CUIT del beneficiario inválido',
      'El dígito verificador no cierra.', 'cuit_beneficiario'));
  }
  if (c.cbu_destino && !cbuValido(c.cbu_destino)) {
    out.push(A('cbu_invalido', 'bloqueante', 'CBU inválido',
      'Los dígitos verificadores del CBU no cierran.', 'cbu_destino'));
  }
  if (!c.monto || Number(c.monto) <= 0) {
    out.push(A('monto_cero', 'bloqueante', 'Monto sin cargar', 'Todo cheque necesita importe.', 'monto'));
  }

  // --- titularidad: la regla que más problemas evita ---
  // Fondos de terceros: el dinero que entra a la cuenta comitente tiene que
  // salir de una cuenta bancaria del propio comitente.
  if (c.circuito === 'ingreso' && comitente) {
    const cuitCom = soloDigitos(comitente.cuit);
    const cuitLib = soloDigitos(c.cuit_librador);
    if (cuitCom && cuitLib && cuitCom !== cuitLib) {
      out.push(A('titularidad', 'bloqueante', 'El librador no es el comitente',
        'Librador ' + (c.nombre_librador || '') + ' (' + cuitLib + ') distinto del titular de la cuenta ' +
        comitente.numero + ' — ' + comitente.denominacion + ' (' + cuitCom + '). ' +
        'Fondos de terceros: requiere aprobación de compliance con fundamento documentado.', 'cuit_librador'));
    }
    if (c.endosado_por_tercero) {
      out.push(A('cheque_endosado', 'bloqueante', 'Cheque recibido con endoso de tercero',
        'El cheque no fue librado a favor del comitente sino endosado. Verificar cadena de endosos y origen de fondos.', null));
    }
  }

  // En egreso, el beneficiario debe ser el comitente que retira.
  if (c.circuito === 'egreso' && comitente) {
    const cuitCom = soloDigitos(comitente.cuit);
    const cuitBen = soloDigitos(c.cuit_beneficiario);
    if (cuitCom && cuitBen && cuitCom !== cuitBen) {
      out.push(A('beneficiario_no_comitente', 'bloqueante', 'El beneficiario no es el comitente',
        'El pago sale a favor de ' + (c.nombre_beneficiario || cuitBen) + ', que no es el titular de la cuenta ' +
        comitente.numero + '. Requiere aprobación de compliance.', 'cuit_beneficiario'));
    }
  }

  // --- no a la orden: por ley no se puede endosar ---
  if (c.no_a_la_orden && (c.circuito === 'endoso' || c.estado === 'endosado')) {
    out.push(A('no_a_la_orden', 'bloqueante', 'Cheque "no a la orden": no se puede endosar',
      'Un cheque con cláusula no a la orden solo se transmite por cesión de créditos, no por endoso.', null));
  }

  // --- fechas ---
  if (c.fecha_emision && c.fecha_pago) {
    const dif = diasEntre(c.fecha_emision, c.fecha_pago);
    if (dif < 0) {
      out.push(A('fecha_pago_anterior', 'bloqueante', 'Fecha de pago anterior a la de emisión',
        'Revisá las fechas: ' + fechaFmt(c.fecha_emision) + ' → ' + fechaFmt(c.fecha_pago) + '.', 'fecha_pago'));
    } else if (dif > MAX_DIFERIMIENTO_DIAS) {
      out.push(A('diferimiento_excedido', 'alerta', 'Diferimiento mayor al máximo legal',
        dif + ' días entre emisión y pago. El tope del cheque de pago diferido es ' + MAX_DIFERIMIENTO_DIAS + ' días.', 'fecha_pago'));
    }
  }

  if (c.fecha_pago) {
    const d = diasDesdeHoy(c.fecha_pago);
    const yaCobrado = ['acreditado', 'debitado', 'transferido', 'anulado', 'rechazado_interno'].indexOf(c.estado) >= 0;
    if (!yaCobrado) {
      if (d !== null && d < -PLAZO_PRESENTACION_DIAS) {
        out.push(A('fuera_de_plazo', 'bloqueante', 'Fuera del plazo de presentación',
          'La fecha de pago fue el ' + fechaFmt(c.fecha_pago) + ', hace ' + Math.abs(d) + ' días. ' +
          'Pasados ' + PLAZO_PRESENTACION_DIAS + ' días el banco lo rechaza por vencido.', 'fecha_pago'));
      } else if (d !== null && d < 0) {
        const quedan = PLAZO_PRESENTACION_DIAS + d;
        out.push(A('plazo_corriendo', 'alerta', 'Plazo de presentación corriendo',
          'Quedan ' + quedan + ' días para presentarlo antes de que venza.', 'fecha_pago'));
      } else if (d !== null && d <= 2 && c.circuito === 'ingreso' && ['recibido', 'aprobado_ingreso'].indexOf(c.estado) >= 0) {
        out.push(A('depositar_ya', 'alerta', 'Se hace efectivo en ' + (d === 0 ? 'el día' : d + ' días'),
          'Conviene depositarlo ahora para que acredite a tiempo.', 'fecha_pago'));
      }
    }
  }

  // --- umbral UIF ---
  const montoARS = c.moneda === 'USD' ? Number(c.monto || 0) * (cfg.tipoCambio || 1) : Number(c.monto || 0);
  if (montoARS >= umbral) {
    out.push(A('umbral_uif', 'alerta', 'Supera el umbral de monitoreo',
      'Importe ' + plata(c.monto, c.moneda) + ', por encima de ' + plata(umbral, 'ARS') +
      '. Verificar perfil del cliente y respaldo documental del origen de fondos.', 'monto'));
  }

  // --- duplicado ---
  const otros = ctx.otrosCheques || [];
  if (c.numero_cheque && c.banco_girado) {
    const dup = otros.filter(o =>
      o.id !== c.id &&
      String(o.numero_cheque || '') === String(c.numero_cheque) &&
      String(o.banco_girado || '') === String(c.banco_girado) &&
      ['anulado', 'rechazado_interno'].indexOf(o.estado) < 0
    );
    if (dup.length) {
      out.push(A('duplicado', 'bloqueante', 'Ya existe un cheque con ese número y banco',
        'Coincide con ' + dup.map(d => '#' + (d.codigo || d.id.slice(0, 6))).join(', ') + '. Verificá que no lo estés cargando dos veces.', 'numero_cheque'));
    }
  }
  if (c.echeq_id) {
    const dupE = otros.filter(o => o.id !== c.id && o.echeq_id && o.echeq_id === c.echeq_id);
    if (dupE.length) {
      out.push(A('duplicado_echeq', 'bloqueante', 'Ese ID de ECHEQ ya está cargado',
        'Coincide con ' + dupE.map(d => '#' + (d.codigo || d.id.slice(0, 6))).join(', ') + '.', 'echeq_id'));
    }
  }

  // --- comitente ---
  if (comitente && comitente.activo === false) {
    out.push(A('comitente_inactivo', 'bloqueante', 'Cuenta comitente inactiva',
      'La cuenta ' + comitente.numero + ' figura dada de baja.', 'comitente_id'));
  }
  if (!c.comitente_id) {
    out.push(A('sin_comitente', 'bloqueante', 'Sin cuenta comitente asignada',
      'Todo cheque tiene que imputarse a una cuenta.', 'comitente_id'));
  }

  // --- info ---
  if (c.soporte === 'fisico') {
    out.push(A('fisico', 'info', 'Cheque físico',
      'Requiere guarda del papel y, en el circuito de ingreso, depósito presencial o por buzón.', null));
  }

  return out;
}

export function tieneBloqueantes(alertas) {
  return alertas.some(a => a.nivel === 'bloqueante');
}

export function resumenAlertas(alertas) {
  return {
    bloqueantes: alertas.filter(a => a.nivel === 'bloqueante').length,
    alertas: alertas.filter(a => a.nivel === 'alerta').length,
    info: alertas.filter(a => a.nivel === 'info').length
  };
}

// Campos mínimos para pasar de borrador a solicitado, por circuito.
export const REQUERIDOS = {
  ingreso: ['comitente_id', 'soporte', 'banco_girado', 'monto', 'fecha_pago', 'cuit_librador', 'nombre_librador'],
  egreso:  ['comitente_id', 'soporte', 'monto', 'fecha_pago', 'cuit_beneficiario', 'nombre_beneficiario'],
  endoso:  ['comitente_id', 'soporte', 'banco_girado', 'monto', 'fecha_pago', 'cuit_librador', 'nombre_librador', 'endosatario_nombre']
};

export const ETIQUETAS_CAMPO = {
  comitente_id: 'Cuenta comitente',
  soporte: 'Soporte',
  banco_girado: 'Banco girado',
  monto: 'Importe',
  moneda: 'Moneda',
  fecha_emision: 'Fecha de emisión',
  fecha_pago: 'Fecha de pago',
  fecha_recepcion: 'Fecha de recepción',
  fecha_deposito: 'Fecha de depósito',
  fecha_acreditacion: 'Fecha de acreditación',
  fecha_entrega: 'Fecha de entrega',
  fecha_endoso: 'Fecha de endoso',
  cuit_librador: 'CUIT del librador',
  nombre_librador: 'Librador',
  cuit_beneficiario: 'CUIT del beneficiario',
  nombre_beneficiario: 'Beneficiario',
  endosatario_nombre: 'Endosatario',
  endosatario_cuit: 'CUIT del endosatario',
  numero_cheque: 'Número de cheque',
  echeq_id: 'ID ECHEQ',
  cuenta_deposito: 'Cuenta de depósito',
  motivo_rechazo_banco: 'Motivo del rechazo',
  cbu_destino: 'CBU destino',
  observaciones: 'Observaciones'
};

export function faltantes(cheque) {
  const req = REQUERIDOS[cheque.circuito] || [];
  return req.filter(k => {
    const v = cheque[k];
    return v === null || v === undefined || v === '' || (k === 'monto' && Number(v) <= 0);
  });
}
