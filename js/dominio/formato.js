// Formateo y validación de datos argentinos: CUIT, CBU, montos, fechas.

export function soloDigitos(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

// CUIT: 11 dígitos con dígito verificador módulo 11.
export function cuitValido(cuit) {
  const d = soloDigitos(cuit);
  if (d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(d[i]) * pesos[i];
  let ver = 11 - (suma % 11);
  if (ver === 11) ver = 0;
  if (ver === 10) ver = 9;
  return ver === Number(d[10]);
}

export function cuitFmt(cuit) {
  const d = soloDigitos(cuit);
  if (d.length !== 11) return cuit || '';
  return d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10);
}

// CBU: 22 dígitos, dos dígitos verificadores (bloque de 8 y bloque de 14).
export function cbuValido(cbu) {
  const d = soloDigitos(cbu);
  if (d.length !== 22) return false;
  const chk = (bloque, pesos) => {
    let s = 0;
    for (let i = 0; i < pesos.length; i++) s += Number(bloque[i]) * pesos[i];
    return (10 - (s % 10)) % 10;
  };
  const b1 = d.slice(0, 8);
  const b2 = d.slice(8, 22);
  return chk(b1, [7, 1, 3, 9, 7, 1, 3]) === Number(b1[7]) &&
         chk(b2, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === Number(b2[13]);
}

const fmtARS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtARS0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export function plata(n, moneda) {
  const simbolo = moneda === 'USD' ? 'US$' : '$';
  const v = Number(n || 0);
  return simbolo + ' ' + fmtARS.format(v);
}

export function plataCorta(n, moneda) {
  const simbolo = moneda === 'USD' ? 'US$' : '$';
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1e6) return simbolo + ' ' + fmtARS.format(v / 1e6).replace(/,00$/, '') + ' M';
  if (abs >= 1e3) return simbolo + ' ' + fmtARS0.format(v / 1e3) + ' k';
  return simbolo + ' ' + fmtARS0.format(v);
}

// Parsea "1.234.567,89" o "1234567.89" a número.
export function parsearMonto(s) {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  let t = String(s).replace(/[^\d.,-]/g, '');
  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');
  if (ultimaComa > ultimoPunto) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

// --- Fechas: siempre 'YYYY-MM-DD' como representación canónica ---

export function hoyISO() {
  const d = new Date();
  return isoDe(d);
}

export function isoDe(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function desdeISO(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

export function fechaFmt(iso) {
  const d = desdeISO(iso);
  if (!d) return '—';
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}

export function fechaHoraFmt(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

export function diasEntre(isoA, isoB) {
  const a = desdeISO(isoA), b = desdeISO(isoB);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function diasDesdeHoy(iso) {
  return diasEntre(hoyISO(), iso);
}

export function sumarDias(iso, n) {
  const d = desdeISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return isoDe(d);
}

// Próximo día hábil (sin feriados: solo saltea sábado y domingo).
export function proximoHabil(iso) {
  let d = desdeISO(iso);
  if (!d) return null;
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return isoDe(d);
}

export function sumarHabiles(iso, n) {
  let d = desdeISO(iso);
  if (!d) return null;
  let quedan = n;
  while (quedan > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) quedan--;
  }
  return isoDe(d);
}

export function relativo(iso) {
  const n = diasDesdeHoy(iso);
  if (n === null) return '';
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n > 0) return 'en ' + n + ' días';
  return 'hace ' + Math.abs(n) + ' días';
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
