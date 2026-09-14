// Estado central. Las vistas leen de acá y se redibujan cuando cambia.

import { backend } from './backend/index.js';
import { validar } from './dominio/validaciones.js';
import { rolesEfectivos, PENDIENTE_BACKOFFICE, PENDIENTE_PRODUCTOR, PENDIENTE_COMPLIANCE, esTerminal } from './dominio/estados.js';
import { diasDesdeHoy, hoyISO, sumarHabiles } from './dominio/formato.js';

export const S = {
  usuario: null,
  cheques: [],
  eventos: [],
  comitentes: [],
  usuarios: [],
  cargando: true,
  error: null,
  filtros: {
    texto: '',
    circuito: '',
    estado: '',
    productor: '',
    comitente: '',
    banco: '',
    desde: '',
    hasta: '',
    soloMios: false,
    alertas: false
  },
  orden: { campo: 'fecha_pago', dir: 'asc' }
};

const oyentes = [];
export function alCambiar(fn) { oyentes.push(fn); }
export function notificar() { oyentes.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }

export async function cargar() {
  S.cargando = true; S.error = null; notificar();
  try {
    const d = await backend.cargarTodo();
    S.cheques = d.cheques;
    S.eventos = d.eventos;
    S.comitentes = d.comitentes;
    S.usuarios = d.usuarios;
  } catch (e) {
    S.error = e.message || String(e);
  }
  S.cargando = false;
  notificar();
}

// --- lookups ---

export function comitente(id) {
  return S.comitentes.find(c => c.id === id) || null;
}
export function comitentePorNumero(num) {
  return S.comitentes.find(c => String(c.numero) === String(num)) || null;
}
export function usuario(id) {
  return S.usuarios.find(u => u.id === id) || null;
}
export function nombreUsuario(id) {
  const u = usuario(id);
  return u ? u.nombre : '—';
}
export function cheque(id) {
  return S.cheques.find(c => c.id === id) || null;
}
export function eventosDe(id) {
  return S.eventos.filter(e => e.cheque_id === id).sort((a, b) => Date.parse(a.en) - Date.parse(b.en));
}

// --- permisos ---

export function puedeVer(ch) {
  if (!S.usuario) return false;
  const roles = rolesEfectivos(S.usuario.rol);
  if (roles.indexOf('backoffice') >= 0 || roles.indexOf('admin') >= 0 || roles.indexOf('compliance') >= 0) return true;
  if (S.usuario.rol === 'lectura') return true;
  // Productor: solo sus comitentes.
  const c = comitente(ch.comitente_id);
  return ch.productor_id === S.usuario.id || ch.creado_por === S.usuario.id || (c && c.productor_id === S.usuario.id);
}

export function esBackoffice() {
  const r = rolesEfectivos(S.usuario ? S.usuario.rol : 'lectura');
  return r.indexOf('backoffice') >= 0;
}
export function esCompliance() {
  const r = rolesEfectivos(S.usuario ? S.usuario.rol : 'lectura');
  return r.indexOf('compliance') >= 0;
}
export function esAdmin() {
  return S.usuario && S.usuario.rol === 'admin';
}
export function puedeCrear() {
  return S.usuario && ['admin', 'backoffice', 'productor', 'compliance'].indexOf(S.usuario.rol) >= 0;
}

// --- derivados ---

export function visibles() {
  return S.cheques.filter(puedeVer);
}

export function alertasDe(ch) {
  return validar(ch, {
    comitente: comitente(ch.comitente_id),
    otrosCheques: S.cheques,
    config: {
      umbralUIF: window.CFG.UMBRAL_UIF,
      tipoCambio: window.CFG.TIPO_CAMBIO_REFERENCIA
    }
  });
}

export function bloqueantesDe(ch) {
  return alertasDe(ch).filter(a => a.nivel === 'bloqueante');
}

// Fecha en la que se espera que el dinero esté disponible.
export function fechaEfectiva(ch) {
  if (ch.fecha_acreditacion) return ch.fecha_acreditacion;
  if (ch.fecha_deposito) return sumarHabiles(ch.fecha_deposito, window.CFG.DIAS_ACREDITACION || 2);
  if (ch.fecha_pago) {
    const d = diasDesdeHoy(ch.fecha_pago);
    const base = d !== null && d < 0 ? hoyISO() : ch.fecha_pago;
    return sumarHabiles(base, window.CFG.DIAS_ACREDITACION || 2);
  }
  return null;
}

export function filtrar(lista, f) {
  f = f || S.filtros;
  const t = (f.texto || '').trim().toLowerCase();
  return lista.filter(ch => {
    if (f.circuito && ch.circuito !== f.circuito) return false;
    if (f.estado && ch.estado !== f.estado) return false;
    if (f.productor && ch.productor_id !== f.productor) return false;
    if (f.comitente && ch.comitente_id !== f.comitente) return false;
    if (f.banco && String(ch.banco_girado) !== String(f.banco)) return false;
    if (f.desde && (ch.fecha_pago || '') < f.desde) return false;
    if (f.hasta && (ch.fecha_pago || '') > f.hasta) return false;
    if (f.soloMios && S.usuario && ch.productor_id !== S.usuario.id) return false;
    if (f.alertas && !bloqueantesDe(ch).length) return false;
    if (t) {
      const com = comitente(ch.comitente_id);
      const heno = [
        ch.codigo, ch.numero_cheque, ch.echeq_id, ch.nombre_librador, ch.cuit_librador,
        ch.nombre_beneficiario, ch.cuit_beneficiario, ch.observaciones,
        com ? com.numero : '', com ? com.denominacion : '', com ? com.cuit : ''
      ].join(' ').toLowerCase();
      if (heno.indexOf(t) < 0) return false;
    }
    return true;
  });
}

export function ordenar(lista, orden) {
  orden = orden || S.orden;
  const dir = orden.dir === 'desc' ? -1 : 1;
  const k = orden.campo;
  return lista.slice().sort((a, b) => {
    let va = a[k], vb = b[k];
    if (k === 'comitente') {
      va = (comitente(a.comitente_id) || {}).numero || '';
      vb = (comitente(b.comitente_id) || {}).numero || '';
    }
    if (k === 'monto') { va = Number(va || 0); vb = Number(vb || 0); }
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

// Lo que espera una acción del usuario que está mirando.
export function miBandeja() {
  const lista = visibles();
  const rol = S.usuario ? S.usuario.rol : 'lectura';
  const roles = rolesEfectivos(rol);
  let estados = [];
  if (roles.indexOf('compliance') >= 0) estados = estados.concat(PENDIENTE_COMPLIANCE);
  if (roles.indexOf('backoffice') >= 0) estados = estados.concat(PENDIENTE_BACKOFFICE);
  if (roles.indexOf('productor') >= 0) estados = estados.concat(PENDIENTE_PRODUCTOR);
  if (!estados.length) return [];
  return lista.filter(ch => estados.indexOf(ch.estado) >= 0);
}

export function kpis() {
  const lista = visibles();
  const hoy = hoyISO();
  const enCurso = lista.filter(ch => !esTerminal(ch.estado) && ch.estado !== 'borrador');

  const sumar = arr => arr.reduce((s, ch) => s + (ch.moneda === 'USD'
    ? Number(ch.monto || 0) * (window.CFG.TIPO_CAMBIO_REFERENCIA || 1)
    : Number(ch.monto || 0)), 0);

  const aDepositar = enCurso.filter(ch =>
    ch.circuito === 'ingreso' && ['aprobado_ingreso', 'recibido'].indexOf(ch.estado) >= 0 &&
    ch.fecha_pago && diasDesdeHoy(ch.fecha_pago) <= 0);

  const venceEn48 = enCurso.filter(ch => {
    const d = ch.fecha_pago ? diasDesdeHoy(ch.fecha_pago) : null;
    return d !== null && d >= 0 && d <= 2;
  });

  const enCamara = enCurso.filter(ch => ch.estado === 'depositado');
  const conAlerta = enCurso.filter(ch => bloqueantesDe(ch).length > 0);
  const acreditadosHoy = lista.filter(ch => ch.fecha_acreditacion === hoy);
  const rechazados30 = lista.filter(ch => ch.estado === 'rechazado_banco' &&
    ch.actualizado_en && (Date.now() - Date.parse(ch.actualizado_en)) < 30 * 86400000);

  return {
    pendientes: { n: miBandeja().length, monto: sumar(miBandeja()) },
    aDepositar: { n: aDepositar.length, monto: sumar(aDepositar), items: aDepositar },
    venceEn48: { n: venceEn48.length, monto: sumar(venceEn48), items: venceEn48 },
    enCamara: { n: enCamara.length, monto: sumar(enCamara), items: enCamara },
    conAlerta: { n: conAlerta.length, monto: sumar(conAlerta), items: conAlerta },
    acreditadosHoy: { n: acreditadosHoy.length, monto: sumar(acreditadosHoy) },
    rechazados30: { n: rechazados30.length, monto: sumar(rechazados30), items: rechazados30 },
    carteraIngreso: sumar(enCurso.filter(ch => ch.circuito === 'ingreso')),
    carteraEgreso: sumar(enCurso.filter(ch => ch.circuito === 'egreso')),
    enCurso
  };
}

// Flujo de fondos proyectado por día.
export function agenda(dias) {
  dias = dias || 45;
  const lista = visibles().filter(ch => !esTerminal(ch.estado) && ch.estado !== 'borrador');
  const mapa = {};
  lista.forEach(ch => {
    const f = fechaEfectiva(ch);
    if (!f) return;
    const d = diasDesdeHoy(f);
    if (d === null || d > dias) return;
    const clave = d < 0 ? hoyISO() : f;
    if (!mapa[clave]) mapa[clave] = { fecha: clave, entra: 0, sale: 0, items: [] };
    const m = ch.moneda === 'USD' ? Number(ch.monto || 0) * (window.CFG.TIPO_CAMBIO_REFERENCIA || 1) : Number(ch.monto || 0);
    if (ch.circuito === 'ingreso') mapa[clave].entra += m;
    else if (ch.circuito === 'egreso') mapa[clave].sale += m;
    mapa[clave].items.push(ch);
  });
  return Object.values(mapa).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
}

// --- acciones ---

export async function crearCheque(datos) {
  const ch = await backend.crearCheque(datos, S.usuario);
  await cargar();
  return ch;
}

export async function actualizarCheque(id, patch) {
  await backend.actualizarCheque(id, patch, S.usuario);
  await cargar();
}

export async function transicionar(id, destino, opciones) {
  await backend.transicionar(id, destino, opciones, S.usuario);
  await cargar();
}

export async function comentar(id, texto) {
  await backend.comentar(id, texto, S.usuario);
  await cargar();
}

export async function guardarComitente(datos) {
  await backend.guardarComitente(datos, S.usuario);
  await cargar();
}
