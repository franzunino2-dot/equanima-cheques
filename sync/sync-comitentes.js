#!/usr/bin/env node
/**
 * Padrón de comitentes: Gallo (EGWS) → Supabase.
 *
 * Corre en la máquina de la OFICINA, que es la única que llega al servidor de
 * Gallo (192.168.1.x). Lee el endpoint que ya expone el proyecto 1810
 * (`GET /api/gallo/comitentes`, que por dentro combina GetClientes + Manager +
 * Oficiales) y hace upsert en la tabla `comitentes`.
 *
 * Sube SOLO el padrón: número, denominación, CUIT, productor y oficial.
 * NO sube tenencias, saldos ni posiciones — eso se queda en la oficina.
 *
 * Uso:
 *   node sync/sync-comitentes.js
 *   node sync/sync-comitentes.js --seco     (muestra qué haría, no escribe)
 *
 * Variables (en sync/.env o en el entorno):
 *   RENTAFIJA_URL         http://localhost:3000     servidor 1810 de la oficina
 *   SUPABASE_URL          https://<ref>.supabase.co
 *   SUPABASE_SERVICE_KEY  la clave sb_secret_… (NUNCA va al front ni al repo)
 */

const fs = require('fs');
const path = require('path');

// --- config ---------------------------------------------------------------

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

const RENTAFIJA_URL = (process.env.RENTAFIJA_URL || 'http://localhost:3000').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SECO = process.argv.includes('--seco');

if (!SUPABASE_URL || !SERVICE_KEY) {
  if (!SECO) {
    console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY. Poné sync/.env (mirá sync/.env.ejemplo).');
    process.exit(1);
  }
}

// --- CUIT -----------------------------------------------------------------

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function cuitValido(cuit) {
  const d = String(cuit || '').replace(/\D/g, '');
  if (d.length !== 11) return false;
  let s = 0;
  for (let i = 0; i < 10; i++) s += Number(d[i]) * PESOS[i];
  let v = 11 - (s % 11);
  if (v === 11) v = 0;
  if (v === 10) v = 9;
  return v === Number(d[10]);
}

// --- Gallo ----------------------------------------------------------------

async function traerDeGallo() {
  const r = await fetch(RENTAFIJA_URL + '/api/gallo/comitentes');
  if (!r.ok) throw new Error('El servidor 1810 contestó ' + r.status + '. ¿Está levantado en ' + RENTAFIJA_URL + '?');
  const j = await r.json();
  if (!j.ok) throw new Error('Gallo: ' + (j.error || 'respuesta sin ok'));
  if (!j.configured) throw new Error('El servidor 1810 no tiene Gallo configurado (faltan GALLO_BASE/USER/PASS).');
  const lista = j.comitentes || [];
  if (!lista.length) throw new Error('Gallo devolvió 0 comitentes. Suele ser que GetClientes falló: reintentá en un minuto.');
  return lista;
}

// --- Supabase -------------------------------------------------------------

async function rest(camino, opciones) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + camino, Object.assign({
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }
  }, opciones || {}));
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r;
}

// Los productores de Gallo vienen como texto ("manager"). Si hay un perfil con
// ese nombre, se lo enlaza; si no, queda el texto en gallo_manager y un admin
// lo mapea desde la app.
async function mapaPerfiles() {
  const r = await rest('perfiles?select=id,nombre,email', { headers: {
    apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY
  } });
  const perfiles = await r.json();
  const mapa = {};
  perfiles.forEach(p => {
    mapa[normalizar(p.nombre)] = p.id;
    mapa[normalizar(p.email.split('@')[0])] = p.id;
  });
  return mapa;
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// --- main -----------------------------------------------------------------

async function main() {
  console.log('Trayendo comitentes de Gallo por ' + RENTAFIJA_URL + '…');
  const crudos = await traerDeGallo();
  console.log('  ' + crudos.length + ' comitentes');

  const perfiles = SECO ? {} : await mapaPerfiles();

  const sinCuit = [];
  const filas = crudos.map(c => {
    const cuit = String(c.cuit || '').replace(/\D/g, '');
    if (!cuitValido(cuit)) sinCuit.push(c.codigo + ' ' + (c.nombre || ''));
    const clave = normalizar(c.manager);
    return {
      numero: String(c.codigo),
      denominacion: String(c.nombre || '').trim().toUpperCase() || ('COMITENTE ' + c.codigo),
      cuit: cuitValido(cuit) ? cuit : null,
      productor_id: perfiles[clave] || null,
      gallo_manager: c.manager && c.manager !== '—' ? c.manager : null,
      gallo_oficial: c.oficial && c.oficial !== '—' ? c.oficial : null,
      activo: true,
      sincronizado_en: new Date().toISOString()
    };
  });

  const conProductor = filas.filter(f => f.productor_id).length;
  console.log('  ' + conProductor + ' enlazados a un perfil de la app');
  if (sinCuit.length) {
    console.log('  ⚠ ' + sinCuit.length + ' sin CUIT válido en Gallo (el control de titularidad no va a poder correr):');
    sinCuit.slice(0, 15).forEach(x => console.log('      ' + x));
    if (sinCuit.length > 15) console.log('      … y ' + (sinCuit.length - 15) + ' más');
  }

  if (SECO) {
    console.log('\n--seco: no se escribió nada. Muestra de las 3 primeras filas:');
    console.log(JSON.stringify(filas.slice(0, 3), null, 2));
    return;
  }

  // De a 200 para no pasarse del límite del body.
  let escritos = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200);
    await rest('comitentes?on_conflict=numero', { method: 'POST', body: JSON.stringify(lote) });
    escritos += lote.length;
    process.stdout.write('\r  escritos ' + escritos + '/' + filas.length);
  }
  console.log('\nListo.');
}

main().catch(e => {
  console.error('\nFalló: ' + e.message);
  process.exit(1);
});
