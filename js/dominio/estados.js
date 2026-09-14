// Máquina de estados de los circuitos de cheque.
// Todo el comportamiento de la app (qué botones se ven, quién puede apretarlos,
// qué campos se piden) sale de acá. No hardcodear estados en las vistas.

export const ROLES = {
  productor:  { nombre: 'Productor',   descripcion: 'Carga solicitudes de sus comitentes' },
  backoffice: { nombre: 'Back office', descripcion: 'Opera el circuito completo' },
  compliance: { nombre: 'Compliance',  descripcion: 'Aprueba excepciones y alertas UIF' },
  admin:      { nombre: 'Administrador', descripcion: 'Todo + ABM de usuarios y comitentes' },
  lectura:    { nombre: 'Solo lectura', descripcion: 'Consulta sin operar' }
};

// Rol "efectivo" para permisos: admin puede todo lo de backoffice y compliance.
export function rolesEfectivos(rol) {
  if (rol === 'admin') return ['admin', 'backoffice', 'compliance', 'productor'];
  if (rol === 'compliance') return ['compliance', 'backoffice'];
  if (rol === 'backoffice') return ['backoffice'];
  if (rol === 'productor') return ['productor'];
  return ['lectura'];
}

export const CIRCUITOS = {
  ingreso: {
    id: 'ingreso',
    nombre: 'Ingreso',
    titulo: 'Cheque de cliente a depositar',
    descripcion: 'El comitente entrega un cheque para acreditar en su cuenta comitente.',
    signo: 1
  },
  egreso: {
    id: 'egreso',
    nombre: 'Egreso',
    titulo: 'Cheque / ECHEQ a favor del cliente',
    descripcion: 'El comitente retira fondos y Equanima emite o endosa un cheque a su favor.',
    signo: -1
  },
  endoso: {
    id: 'endoso',
    nombre: 'Endoso',
    titulo: 'Cheque de terceros endosado',
    descripcion: 'Cheque recibido de un tercero que se endosa y transfiere a otro beneficiario.',
    signo: 0
  }
};

// tono: color semántico. etapa: posición en el stepper (0 = arranque).
export const ESTADOS = {
  // --- comunes a los tres circuitos ---
  borrador:             { nombre: 'Borrador',            tono: 'gris',    etapa: 0, descripcion: 'Cargado pero todavía no enviado a back office.' },
  solicitado:           { nombre: 'Solicitado',          tono: 'azul',    etapa: 1, descripcion: 'Enviado por el productor. Espera que back office lo tome.' },
  en_revision:          { nombre: 'En revisión',         tono: 'azul',    etapa: 2, descripcion: 'Back office lo está revisando.' },
  observado:            { nombre: 'Observado',           tono: 'ambar',   etapa: 2, descripcion: 'Falta información. La pelota está del lado del productor.' },
  esperando_compliance: { nombre: 'Espera compliance',   tono: 'ambar',   etapa: 2, descripcion: 'Alerta de titularidad o umbral UIF. Requiere aprobación.' },
  rechazado_interno:    { nombre: 'Rechazado',           tono: 'rojo',    etapa: 9, terminal: true, descripcion: 'Back office o compliance no lo aceptó.' },
  anulado:              { nombre: 'Anulado',             tono: 'gris',    etapa: 9, terminal: true, descripcion: 'Dado de baja antes de operarse.' },

  // --- ingreso ---
  aprobado_ingreso:     { nombre: 'Aprobado',            tono: 'violeta', etapa: 3, descripcion: 'Validado. Falta tener el cheque en mano.' },
  recibido:             { nombre: 'Recibido',            tono: 'violeta', etapa: 4, descripcion: 'El cheque físico o el ECHEQ ya está en poder de Equanima.' },
  depositado:           { nombre: 'Depositado',          tono: 'cian',    etapa: 5, descripcion: 'Presentado al banco. Corre el plazo de acreditación.' },
  acreditado:           { nombre: 'Acreditado',          tono: 'verde',   etapa: 6, terminal: true, descripcion: 'Fondos acreditados en la cuenta comitente.' },
  rechazado_banco:      { nombre: 'Rechazado por banco', tono: 'rojo',    etapa: 9, terminal: true, descripcion: 'Sin fondos, defecto formal u orden de no pagar.' },

  // --- egreso ---
  aprobado_egreso:      { nombre: 'Aprobado',            tono: 'violeta', etapa: 3, descripcion: 'Saldo verificado. Listo para emitir.' },
  emitido:              { nombre: 'Emitido',             tono: 'cian',    etapa: 4, descripcion: 'ECHEQ emitido o cheque firmado.' },
  entregado:            { nombre: 'Entregado',           tono: 'cian',    etapa: 5, descripcion: 'En poder del beneficiario.' },
  debitado:             { nombre: 'Debitado',            tono: 'verde',   etapa: 6, terminal: true, descripcion: 'Cobrado por el beneficiario y debitado de la cuenta.' },

  // --- endoso ---
  aprobado_endoso:      { nombre: 'Aprobado',            tono: 'violeta', etapa: 3, descripcion: 'Cadena de endosos validada.' },
  endosado:             { nombre: 'Endosado',            tono: 'cian',    etapa: 4, descripcion: 'Endoso aplicado a favor del beneficiario final.' },
  transferido:          { nombre: 'Transferido',         tono: 'verde',   etapa: 6, terminal: true, descripcion: 'Entregado al beneficiario final. Circuito cerrado.' }
};

// Stepper que se dibuja en la ficha: la línea "feliz" de cada circuito.
export const LINEA_FELIZ = {
  ingreso: ['solicitado', 'en_revision', 'aprobado_ingreso', 'recibido', 'depositado', 'acreditado'],
  egreso:  ['solicitado', 'en_revision', 'aprobado_egreso', 'emitido', 'entregado', 'debitado'],
  endoso:  ['solicitado', 'en_revision', 'aprobado_endoso', 'endosado', 'transferido']
};

// Transiciones. `campos` son los que el modal pide antes de confirmar.
// `roles` es quién puede dispararla. `tono` pinta el botón.
const T = (a, etiqueta, roles, extra) => Object.assign({ a, etiqueta, roles }, extra || {});

const COMUNES_INICIO = {
  borrador: [
    T('solicitado', 'Enviar a back office', ['productor', 'backoffice'], { tono: 'primario' }),
    T('anulado', 'Anular', ['productor', 'backoffice'], { tono: 'fantasma', motivo: true })
  ],
  solicitado: [
    T('en_revision', 'Tomar', ['backoffice'], { tono: 'primario' }),
    T('observado', 'Observar', ['backoffice'], { tono: 'advertencia', motivo: true }),
    T('anulado', 'Anular', ['productor', 'backoffice'], { tono: 'fantasma', motivo: true })
  ],
  observado: [
    T('solicitado', 'Reenviar corregido', ['productor', 'backoffice'], { tono: 'primario' }),
    T('anulado', 'Anular', ['productor', 'backoffice'], { tono: 'fantasma', motivo: true })
  ]
};

function revisionDe(estadoAprobado) {
  return [
    T(estadoAprobado, 'Aprobar', ['backoffice'], { tono: 'exito', validarAlertas: true }),
    T('esperando_compliance', 'Elevar a compliance', ['backoffice'], { tono: 'advertencia', motivo: true }),
    T('observado', 'Observar', ['backoffice'], { tono: 'advertencia', motivo: true }),
    T('rechazado_interno', 'Rechazar', ['backoffice'], { tono: 'peligro', motivo: true })
  ];
}

function complianceDe(estadoAprobado) {
  return [
    T(estadoAprobado, 'Aprobar excepción', ['compliance'], { tono: 'exito', motivo: true, motivoEtiqueta: 'Fundamento de la excepción' }),
    T('rechazado_interno', 'Rechazar', ['compliance'], { tono: 'peligro', motivo: true })
  ];
}

export const TRANSICIONES = {
  ingreso: Object.assign({}, COMUNES_INICIO, {
    en_revision: revisionDe('aprobado_ingreso'),
    esperando_compliance: complianceDe('aprobado_ingreso'),
    aprobado_ingreso: [
      T('recibido', 'Marcar recibido', ['backoffice'], { tono: 'primario', campos: ['fecha_recepcion'] }),
      T('rechazado_interno', 'Rechazar', ['backoffice'], { tono: 'peligro', motivo: true })
    ],
    recibido: [
      T('depositado', 'Registrar depósito', ['backoffice'], { tono: 'primario', campos: ['fecha_deposito', 'cuenta_deposito'] }),
      T('endosado', 'Derivar a endoso', ['backoffice'], { tono: 'fantasma', motivo: true })
    ],
    depositado: [
      T('acreditado', 'Confirmar acreditación', ['backoffice'], { tono: 'exito', campos: ['fecha_acreditacion'] }),
      T('rechazado_banco', 'Rechazo del banco', ['backoffice'], { tono: 'peligro', campos: ['motivo_rechazo_banco'] })
    ],
    rechazado_banco: [
      T('recibido', 'Reingresar para nuevo depósito', ['backoffice'], { tono: 'fantasma', motivo: true })
    ]
  }),

  egreso: Object.assign({}, COMUNES_INICIO, {
    en_revision: revisionDe('aprobado_egreso'),
    esperando_compliance: complianceDe('aprobado_egreso'),
    aprobado_egreso: [
      T('emitido', 'Registrar emisión', ['backoffice'], { tono: 'primario', campos: ['numero_cheque', 'fecha_emision', 'fecha_pago', 'echeq_id'] }),
      T('rechazado_interno', 'Rechazar', ['backoffice'], { tono: 'peligro', motivo: true })
    ],
    emitido: [
      T('entregado', 'Marcar entregado', ['backoffice'], { tono: 'primario', campos: ['fecha_entrega'] }),
      T('anulado', 'Anular emisión', ['backoffice'], { tono: 'peligro', motivo: true })
    ],
    entregado: [
      T('debitado', 'Confirmar débito', ['backoffice'], { tono: 'exito', campos: ['fecha_acreditacion'] }),
      T('rechazado_banco', 'Rechazado / devuelto', ['backoffice'], { tono: 'peligro', campos: ['motivo_rechazo_banco'] })
    ]
  }),

  endoso: Object.assign({}, COMUNES_INICIO, {
    en_revision: revisionDe('aprobado_endoso'),
    esperando_compliance: complianceDe('aprobado_endoso'),
    aprobado_endoso: [
      T('endosado', 'Registrar endoso', ['backoffice'], { tono: 'primario', campos: ['fecha_endoso', 'endosatario_nombre', 'endosatario_cuit'] }),
      T('rechazado_interno', 'Rechazar', ['backoffice'], { tono: 'peligro', motivo: true })
    ],
    endosado: [
      T('transferido', 'Confirmar transferencia', ['backoffice'], { tono: 'exito', campos: ['fecha_entrega'] }),
      T('rechazado_banco', 'Rechazado / devuelto', ['backoffice'], { tono: 'peligro', campos: ['motivo_rechazo_banco'] })
    ]
  })
};

export function transicionesDisponibles(cheque, rol) {
  const mapa = TRANSICIONES[cheque.circuito] || {};
  const lista = mapa[cheque.estado] || [];
  const mios = rolesEfectivos(rol);
  return lista.filter(t => t.roles.some(r => mios.indexOf(r) >= 0));
}

export function estado(id) {
  return ESTADOS[id] || { nombre: id, tono: 'gris', etapa: 0, descripcion: '' };
}

export function esTerminal(id) {
  return !!estado(id).terminal;
}

// Estados que representan plata que todavía está en el aire.
export const EN_CURSO = Object.keys(ESTADOS).filter(k => !ESTADOS[k].terminal && k !== 'borrador');

// Colas de trabajo: qué espera una acción de quién.
export const PENDIENTE_BACKOFFICE = ['solicitado', 'en_revision', 'aprobado_ingreso', 'recibido', 'aprobado_egreso', 'emitido', 'aprobado_endoso', 'endosado', 'depositado', 'entregado'];
export const PENDIENTE_PRODUCTOR  = ['borrador', 'observado'];
export const PENDIENTE_COMPLIANCE = ['esperando_compliance'];
