// Edge Function: trae del banco los movimientos de ECHEQ y los concilia.
//
// Estado: esqueleto. Lo único que falta es `traerDeBind()`, que depende de la
// documentación real de la API — ver docs/INTEGRACION_BIND.md.
//
// Desplegar:  supabase functions deploy bind-sync
// Secrets:    supabase secrets set BIND_CLIENT_ID=… BIND_CLIENT_SECRET=… BIND_CUIT=…
//
// Se invoca de dos maneras:
//   POST sin body         -> polling: pide al banco lo que haya desde la última vez
//   POST con body firmado -> webhook del banco (valida la firma antes de tocar nada)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!   // saltea RLS: cuidado con lo que se escribe
);

const BIND_BASE = Deno.env.get('BIND_BASE') ?? 'https://api.bind.com.ar';
const BIND_CLIENT_ID = Deno.env.get('BIND_CLIENT_ID') ?? '';
const BIND_CLIENT_SECRET = Deno.env.get('BIND_CLIENT_SECRET') ?? '';
const BIND_WEBHOOK_SECRET = Deno.env.get('BIND_WEBHOOK_SECRET') ?? '';

// Forma común a todos los bancos. Cambiar de banco = escribir otro traerDeX()
// que devuelva esto mismo.
interface Movimiento {
  externo_id: string;
  echeq_id: string | null;
  numero_cheque: string | null;
  cuit_librador: string | null;
  nombre: string | null;
  monto: number;
  moneda: string;
  fecha_pago: string | null;
  fecha_mov: string;
  estado_banco: string;
  crudo: unknown;
}

// ─────────────────────────────────────────────────────────── adaptador BIND

async function tokenBind(): Promise<string> {
  const r = await fetch(BIND_BASE + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: BIND_CLIENT_ID,
      client_secret: BIND_CLIENT_SECRET
    })
  });
  if (!r.ok) throw new Error('BIND auth ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return j.access_token ?? j.token;
}

async function traerDeBind(desde: string): Promise<Movimiento[]> {
  // TODO: reemplazar por el endpoint real en cuanto BIND entregue la doc.
  // El resto de la función ya funciona contra cualquier cosa que devuelva
  // Movimiento[]; esto es lo único específico del banco.
  const token = await tokenBind();
  const url = new URL(BIND_BASE + '/echeq/recibidos');
  url.searchParams.set('cuit', Deno.env.get('BIND_CUIT') ?? '');
  url.searchParams.set('desde', desde);

  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('BIND ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();

  return (j.cheques ?? j.data ?? []).map((c: Record<string, unknown>) => ({
    externo_id: String(c.id ?? c.idMovimiento ?? c.cheque_id ?? ''),
    echeq_id: c.cheque_id ? String(c.cheque_id) : null,
    numero_cheque: c.numero ? String(c.numero) : null,
    cuit_librador: c.cuit_emisor ? String(c.cuit_emisor).replace(/\D/g, '') : null,
    nombre: c.razon_social_emisor ? String(c.razon_social_emisor) : null,
    monto: Number(c.monto ?? 0),
    moneda: String(c.moneda ?? 'ARS'),
    fecha_pago: c.fecha_pago ? String(c.fecha_pago).slice(0, 10) : null,
    fecha_mov: String(c.fecha ?? new Date().toISOString()).slice(0, 10),
    estado_banco: String(c.estado ?? '').toUpperCase(),
    crudo: c
  })).filter((m: Movimiento) => m.externo_id);
}

// ─────────────────────────────────────────────────────── estado que deduce

function estadoSugerido(estadoBanco: string): string | null {
  const e = (estadoBanco || '').toUpperCase();
  if (/ACREDIT|PAGAD|COBRAD|LIQUIDAD/.test(e)) return 'acreditado';
  if (/RECHAZ|DEVUELT|IMPAG/.test(e)) return 'rechazado_banco';
  if (/DEPOSIT|PRESENTAD|CAMARA/.test(e)) return 'depositado';
  return null;
}

// ─────────────────────────────────────────────────────────────── matcheo

async function buscarCheque(m: Movimiento) {
  if (m.echeq_id) {
    const { data } = await sb.from('cheques').select('id,estado,circuito')
      .eq('echeq_id', m.echeq_id).maybeSingle();
    if (data) return data;
  }
  if (m.numero_cheque) {
    const { data } = await sb.from('cheques').select('id,estado,circuito')
      .eq('numero_cheque', m.numero_cheque).limit(2);
    if (data && data.length === 1) return data[0];
  }
  if (m.monto && m.fecha_pago) {
    const { data } = await sb.from('cheques').select('id,estado,circuito')
      .eq('monto', m.monto).eq('fecha_pago', m.fecha_pago).limit(2);
    if (data && data.length === 1) return data[0];   // 2+ candidatos: no adivina
  }
  return null;
}

// ────────────────────────────────────────────────────────────── webhook

async function firmaValida(cuerpo: string, firma: string | null): Promise<boolean> {
  if (!BIND_WEBHOOK_SECRET) return false;   // sin secret configurado no se acepta nada
  if (!firma) return false;
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(BIND_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo));
  const esperado = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  // Comparación en tiempo constante.
  if (esperado.length !== firma.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ firma.charCodeAt(i);
  return dif === 0;
}

// ───────────────────────────────────────────────────────────────── main

Deno.serve(async (req) => {
  try {
    const cuerpo = await req.text();
    let movs: Movimiento[];

    if (cuerpo) {
      // Viene del banco: sin firma válida no se procesa.
      if (!await firmaValida(cuerpo, req.headers.get('x-bind-signature'))) {
        return new Response(JSON.stringify({ ok: false, error: 'firma inválida' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      const j = JSON.parse(cuerpo);
      movs = Array.isArray(j) ? j : [j];
    } else {
      // Polling: desde el último movimiento que guardamos.
      const { data } = await sb.from('banco_movimientos')
        .select('fecha_mov').order('fecha_mov', { ascending: false }).limit(1);
      const desde = data?.[0]?.fecha_mov ??
        new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      movs = await traerDeBind(desde);
    }

    let nuevos = 0, aplicados = 0, huerfanos = 0;

    for (const m of movs) {
      const ch = await buscarCheque(m);
      if (!ch) huerfanos++;

      const { error, data } = await sb.from('banco_movimientos').upsert({
        origen: 'bind',
        externo_id: m.externo_id,
        echeq_id: m.echeq_id,
        numero_cheque: m.numero_cheque,
        cuit_librador: m.cuit_librador,
        nombre: m.nombre,
        monto: m.monto,
        moneda: m.moneda,
        fecha_pago: m.fecha_pago,
        fecha_mov: m.fecha_mov,
        estado_banco: m.estado_banco,
        crudo: m.crudo,
        cheque_id: ch?.id ?? null,
        conciliado_en: ch ? new Date().toISOString() : null
      }, { onConflict: 'origen,externo_id' }).select('id');
      if (error) { console.error('upsert:', error.message); continue; }
      if (data?.length) nuevos++;

      const destino = ch ? estadoSugerido(m.estado_banco) : null;
      if (ch && destino && ch.estado !== destino) {
        // Pasa por la misma función que usa la gente: valida la transición
        // contra la máquina de estados y deja el evento en la trazabilidad.
        const { error: e2 } = await sb.rpc('transicionar_cheque', {
          p_cheque: ch.id,
          p_destino: destino,
          p_motivo: 'Informado por el banco: "' + m.estado_banco + '"',
          p_campos: destino === 'acreditado'
            ? { fecha_acreditacion: m.fecha_mov }
            : destino === 'rechazado_banco'
              ? { motivo_rechazo_banco: m.estado_banco }
              : {}
        });
        // Que no aplique no es error: puede estar en un estado desde el que esa
        // transición no existe (ya acreditado, anulado). Queda el movimiento
        // guardado para que back office lo mire.
        if (e2) console.warn('transición ' + ch.id + ' → ' + destino + ': ' + e2.message);
        else aplicados++;
      }
    }

    return new Response(JSON.stringify({
      ok: true, procesados: movs.length, nuevos, aplicados, huerfanos
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
