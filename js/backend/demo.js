// Backend de demostración: todo en localStorage, sin red.
// Misma interfaz que supabase.js, así la UI no sabe cuál está corriendo.

import { uuid, hoyISO, sumarDias, isoDe } from '../dominio/formato.js';

const CLAVE = 'eq_cheques_demo_v4';
const CLAVE_USUARIO = 'eq_cheques_demo_usuario';

const USUARIOS = [
  { id: 'u-fran',   nombre: 'Fran Demo', email: 'fran@ejemplo.test',  rol: 'admin' },
  { id: 'u-delfi',  nombre: 'Delfi Demo',     email: 'delfi@ejemplo.test',    rol: 'backoffice' },
  { id: 'u-chelo',  nombre: 'Chelo Demo',      email: 'chelo@ejemplo.test',     rol: 'backoffice' },
  { id: 'u-regi',   nombre: 'Regi Demo',   email: 'regi@ejemplo.test', rol: 'compliance' },
  { id: 'u-emi',    nombre: 'Emi Demo',    email: 'emi@ejemplo.test',    rol: 'productor' },
  { id: 'u-uru',    nombre: 'Uru Demo',  email: 'uru@ejemplo.test', rol: 'productor' },
  { id: 'u-agos',   nombre: 'Agos Demo',   email: 'agos@ejemplo.test',   rol: 'lectura' }
];

const COMITENTES = [
  { id: 'c-1237', numero: '2001', denominacion: 'ALVAREZ, MARTIN GUSTAVO',          cuit: '20304567899', productor_id: 'u-fran',  activo: true },
  { id: 'c-1238', numero: '2002', denominacion: 'FERRARO, NICOLAS ANDRES',      cuit: '20123456786', productor_id: 'u-fran',  activo: true },
  { id: 'c-1323', numero: '2003', denominacion: 'AGROPECUARIA EL MOLINO SRL',  cuit: '30712345671', productor_id: 'u-emi',   activo: true },
  { id: 'c-1329', numero: '2004', denominacion: 'MARTINEZ, LAURA BEATRIZ',     cuit: '27285461230', productor_id: 'u-emi',   activo: true },
  { id: 'c-1363', numero: '2005', denominacion: 'DISTRIBUIDORA DEL SUR SA',    cuit: '30658974129', productor_id: 'u-uru',   activo: true },
  { id: 'c-1416', numero: '2006', denominacion: 'PEREYRA, JUAN CARLOS',        cuit: '20174563218', productor_id: 'u-uru',   activo: true },
  { id: 'c-1483', numero: '2007', denominacion: 'TRANSPORTES ANDINOS SRL',     cuit: '30711223343', productor_id: 'u-emi',   activo: true },
  { id: 'c-1502', numero: '2008', denominacion: 'ROMANO, SILVIA NOEMI',       cuit: '27321456788', productor_id: 'u-fran',  activo: false }
];

function semilla() {
  const hoy = hoyISO();
  const d = n => sumarDias(hoy, n);
  const base = [
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'solicitado',    comitente: 'c-1323', monto: 4850000,  fp: d(12), banco: '007', lib: ['AGROPECUARIA EL MOLINO SRL', '30712345671'], prod: 'u-emi' },
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'en_revision',   comitente: 'c-1363', monto: 12400000, fp: d(5),  banco: '285', lib: ['DISTRIBUIDORA DEL SUR SA', '30658974129'], prod: 'u-uru' },
    { circuito: 'ingreso', soporte: 'fisico', estado: 'esperando_compliance', comitente: 'c-1329', monto: 2300000, fp: d(20), banco: '072', lib: ['SUAREZ, RICARDO ALBERTO', '20145678901'], prod: 'u-emi' },
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'aprobado_ingreso', comitente: 'c-1237', monto: 1750000, fp: d(1),  banco: '017', lib: ['ALVAREZ, MARTIN GUSTAVO', '20304567899'], prod: 'u-fran' },
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'recibido',      comitente: 'c-1483', monto: 8900000,  fp: d(0),  banco: '191', lib: ['TRANSPORTES ANDINOS SRL', '30711223343'], prod: 'u-emi' },
    { circuito: 'ingreso', soporte: 'fisico', estado: 'recibido',      comitente: 'c-1416', monto: 640000,   fp: d(-2), banco: '029', lib: ['PEREYRA, JUAN CARLOS', '20174563218'], prod: 'u-uru' },
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'depositado',    comitente: 'c-1363', monto: 15600000, fp: d(-1), banco: '007', lib: ['DISTRIBUIDORA DEL SUR SA', '30658974129'], prod: 'u-uru' },
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'depositado',    comitente: 'c-1323', monto: 3200000,  fp: d(-3), banco: '322', lib: ['AGROPECUARIA EL MOLINO SRL', '30712345671'], prod: 'u-emi' },
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'acreditado',    comitente: 'c-1238', monto: 5400000,  fp: d(-8), banco: '011', lib: ['FERRARO, NICOLAS ANDRES', '20123456786'], prod: 'u-fran' },
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'acreditado',    comitente: 'c-1483', monto: 2100000,  fp: d(-14), banco: '285', lib: ['TRANSPORTES ANDINOS SRL', '30711223343'], prod: 'u-emi' },
    { circuito: 'ingreso', soporte: 'fisico', estado: 'rechazado_banco', comitente: 'c-1416', monto: 980000, fp: d(-6), banco: '299', lib: ['PEREYRA, JUAN CARLOS', '20174563218'], prod: 'u-uru', motivo: 'Sin fondos suficientes' },
    { circuito: 'ingreso', soporte: 'echeq',  estado: 'observado',     comitente: 'c-1329', monto: 760000,   fp: d(18), banco: '034', lib: ['MARTINEZ, LAURA BEATRIZ', '27285461230'], prod: 'u-emi', obs: 'Falta el comprobante del ECHEQ. Mandá el PDF del banco.' },

    { circuito: 'egreso', soporte: 'echeq', estado: 'solicitado',      comitente: 'c-1237', monto: 3000000,  fp: d(3),  ben: ['ALVAREZ, MARTIN GUSTAVO', '20304567899'], prod: 'u-fran' },
    { circuito: 'egreso', soporte: 'echeq', estado: 'aprobado_egreso', comitente: 'c-1363', monto: 9500000,  fp: d(7),  ben: ['DISTRIBUIDORA DEL SUR SA', '30658974129'], prod: 'u-uru' },
    { circuito: 'egreso', soporte: 'echeq', estado: 'emitido',         comitente: 'c-1483', monto: 4200000,  fp: d(10), ben: ['TRANSPORTES ANDINOS SRL', '30711223343'], prod: 'u-emi' },
    { circuito: 'egreso', soporte: 'echeq', estado: 'entregado',       comitente: 'c-1323', monto: 6800000,  fp: d(2),  ben: ['AGROPECUARIA EL MOLINO SRL', '30712345671'], prod: 'u-emi' },
    { circuito: 'egreso', soporte: 'echeq', estado: 'debitado',        comitente: 'c-1238', monto: 1200000,  fp: d(-5), ben: ['FERRARO, NICOLAS ANDRES', '20123456786'], prod: 'u-fran' },
    { circuito: 'egreso', soporte: 'fisico', estado: 'esperando_compliance', comitente: 'c-1416', monto: 11500000, fp: d(4), ben: ['LOPEZ, MIRTA SUSANA', '27184569030'], prod: 'u-uru' },

    { circuito: 'endoso', soporte: 'echeq', estado: 'aprobado_endoso', comitente: 'c-1363', monto: 7300000, fp: d(15), banco: '150', lib: ['COOPERATIVA AGRICOLA LTDA', '30546789124'], prod: 'u-uru' },
    { circuito: 'endoso', soporte: 'echeq', estado: 'endosado',        comitente: 'c-1323', monto: 2650000, fp: d(9),  banco: '011', lib: ['SEMILLERIA CENTRAL SA', '30598765436'], prod: 'u-emi' },
    { circuito: 'endoso', soporte: 'fisico', estado: 'transferido',    comitente: 'c-1483', monto: 1850000, fp: d(-10), banco: '014', lib: ['LOGISTICA NORTE SRL', '30623456788'], prod: 'u-emi' }
  ];

  const cheques = [];
  const eventos = [];
  base.forEach((b, i) => {
    const id = 'ch-' + String(i + 1).padStart(4, '0');
    const creado = new Date(Date.now() - (base.length - i) * 3600000 * 7).toISOString();
    const ch = {
      id,
      codigo: 'CH-' + String(2601 + i),
      circuito: b.circuito,
      soporte: b.soporte,
      estado: b.estado,
      comitente_id: b.comitente,
      productor_id: b.prod,
      moneda: 'ARS',
      monto: b.monto,
      banco_girado: b.banco || '322',
      numero_cheque: b.soporte === 'fisico' ? String(20000000 + i * 137) : null,
      echeq_id: b.soporte === 'echeq' ? 'ECH' + (7300000 + i * 911) : null,
      fecha_emision: sumarDias(b.fp, -30),
      fecha_pago: b.fp,
      fecha_recepcion: ['recibido', 'depositado', 'acreditado', 'rechazado_banco'].indexOf(b.estado) >= 0 ? sumarDias(hoy, -3) : null,
      fecha_deposito: ['depositado', 'acreditado', 'rechazado_banco'].indexOf(b.estado) >= 0 ? sumarDias(hoy, -2) : null,
      fecha_acreditacion: ['acreditado', 'debitado', 'transferido'].indexOf(b.estado) >= 0 ? sumarDias(hoy, -1) : null,
      fecha_entrega: ['entregado', 'debitado', 'transferido'].indexOf(b.estado) >= 0 ? sumarDias(hoy, -2) : null,
      cuenta_deposito: ['depositado', 'acreditado', 'rechazado_banco'].indexOf(b.estado) >= 0 ? 'bind-ars' : null,
      nombre_librador: b.lib ? b.lib[0] : null,
      cuit_librador: b.lib ? b.lib[1] : null,
      nombre_beneficiario: b.ben ? b.ben[0] : null,
      cuit_beneficiario: b.ben ? b.ben[1] : null,
      endosatario_nombre: b.circuito === 'endoso' ? 'EQUANIMA SECURITIES SA' : null,
      endosatario_cuit: b.circuito === 'endoso' ? '30712345671' : null,
      motivo_rechazo_banco: b.motivo || null,
      observaciones: b.obs || null,
      cruzado: b.soporte === 'fisico',
      no_a_la_orden: false,
      endosado_por_tercero: false,
      creado_por: b.prod,
      creado_en: creado,
      actualizado_en: creado
    };
    cheques.push(ch);
    eventos.push({
      id: uuid(), cheque_id: id, tipo: 'creacion', de: null, a: 'solicitado',
      usuario_id: b.prod, nota: null, en: creado
    });
    if (b.estado !== 'solicitado') {
      eventos.push({
        id: uuid(), cheque_id: id, tipo: 'transicion', de: 'solicitado', a: b.estado,
        usuario_id: 'u-delfi', nota: b.obs || b.motivo || null,
        en: new Date(Date.parse(creado) + 3600000 * 4).toISOString()
      });
    }
  });

  return { cheques, eventos, comitentes: COMITENTES, usuarios: USUARIOS, secuencia: 2601 + base.length };
}

function leer() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage bloqueado */ }
  const s = semilla();
  guardar(s);
  return s;
}

function guardar(s) {
  try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) { /* no persiste */ }
}

let suscriptores = [];
function avisar() { suscriptores.forEach(f => { try { f(); } catch (e) {} }); }

export const backend = {
  nombre: 'demo',
  esDemo: true,

  async iniciar() { leer(); },

  async sesion() {
    const id = localStorage.getItem(CLAVE_USUARIO);
    if (!id) return null;
    return leer().usuarios.find(u => u.id === id) || null;
  },

  usuariosDemo() { return leer().usuarios; },

  async entrarComo(id) {
    localStorage.setItem(CLAVE_USUARIO, id);
    return this.sesion();
  },

  async entrar() { throw new Error('En modo demo se elige usuario de la lista.'); },

  async salir() { localStorage.removeItem(CLAVE_USUARIO); },

  async cargarTodo() {
    const s = leer();
    return {
      cheques: s.cheques.slice(),
      eventos: s.eventos.slice(),
      comitentes: s.comitentes.slice(),
      usuarios: s.usuarios.slice()
    };
  },

  async crearCheque(datos, usuario) {
    const s = leer();
    s.secuencia = (s.secuencia || 2600) + 1;
    const ch = Object.assign({
      id: uuid(),
      codigo: 'CH-' + s.secuencia,
      estado: datos.estado || 'borrador',
      moneda: 'ARS',
      creado_por: usuario.id,
      productor_id: datos.productor_id || usuario.id,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString()
    }, datos);
    s.cheques.unshift(ch);
    s.eventos.push({ id: uuid(), cheque_id: ch.id, tipo: 'creacion', de: null, a: ch.estado, usuario_id: usuario.id, nota: null, en: ch.creado_en });
    guardar(s); avisar();
    return ch;
  },

  async actualizarCheque(id, patch, usuario) {
    const s = leer();
    const ch = s.cheques.find(c => c.id === id);
    if (!ch) throw new Error('Cheque inexistente');
    const cambios = [];
    Object.keys(patch).forEach(k => {
      if (String(ch[k] == null ? '' : ch[k]) !== String(patch[k] == null ? '' : patch[k])) {
        cambios.push(k);
        ch[k] = patch[k];
      }
    });
    ch.actualizado_en = new Date().toISOString();
    if (cambios.length) {
      s.eventos.push({ id: uuid(), cheque_id: id, tipo: 'edicion', de: null, a: null, usuario_id: usuario.id, nota: 'Editó: ' + cambios.join(', '), en: ch.actualizado_en });
    }
    guardar(s); avisar();
    return ch;
  },

  async transicionar(id, destino, opciones, usuario) {
    opciones = opciones || {};
    const s = leer();
    const ch = s.cheques.find(c => c.id === id);
    if (!ch) throw new Error('Cheque inexistente');
    const de = ch.estado;
    Object.assign(ch, opciones.campos || {});
    ch.estado = destino;
    ch.actualizado_en = new Date().toISOString();
    s.eventos.push({
      id: uuid(), cheque_id: id, tipo: 'transicion', de, a: destino,
      usuario_id: usuario.id, nota: opciones.motivo || null, en: ch.actualizado_en
    });
    guardar(s); avisar();
    return ch;
  },

  async comentar(id, texto, usuario) {
    const s = leer();
    s.eventos.push({ id: uuid(), cheque_id: id, tipo: 'comentario', de: null, a: null, usuario_id: usuario.id, nota: texto, en: new Date().toISOString() });
    guardar(s); avisar();
  },

  async guardarComitente(datos) {
    const s = leer();
    if (datos.id) {
      const c = s.comitentes.find(x => x.id === datos.id);
      Object.assign(c, datos);
    } else {
      s.comitentes.push(Object.assign({ id: uuid(), activo: true }, datos));
    }
    guardar(s); avisar();
  },

  suscribir(fn) {
    suscriptores.push(fn);
    return () => { suscriptores = suscriptores.filter(f => f !== fn); };
  },

  reiniciar() {
    localStorage.removeItem(CLAVE);
    leer();
    avisar();
  }
};
