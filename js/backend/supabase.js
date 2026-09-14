// Backend real sobre Supabase. Misma interfaz que demo.js.
// La seguridad de verdad está en las políticas RLS (supabase/schema.sql),
// no en este archivo: acá solo se piden datos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

let sb = null;
let perfil = null;
let suscriptores = [];
let canal = null;

function avisar() { suscriptores.forEach(f => { try { f(); } catch (e) {} }); }

function cliente() {
  if (!sb) {
    sb = createClient(window.CFG.SUPABASE_URL, window.CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return sb;
}

async function cargarPerfil(user) {
  if (!user) return null;
  const { data, error } = await cliente()
    .from('perfiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  // Primer ingreso: se crea el perfil con rol mínimo. Un admin lo promueve.
  const nuevo = {
    id: user.id,
    email: user.email,
    nombre: (user.user_metadata && user.user_metadata.full_name) || user.email,
    avatar_url: (user.user_metadata && user.user_metadata.avatar_url) || null,
    rol: 'lectura'
  };
  const { data: creado, error: e2 } = await cliente()
    .from('perfiles').insert(nuevo).select().single();
  if (e2) throw e2;
  return creado;
}

export const backend = {
  nombre: 'supabase',
  esDemo: false,

  async iniciar() { cliente(); },

  async sesion() {
    const { data } = await cliente().auth.getSession();
    const user = data && data.session ? data.session.user : null;
    if (!user) { perfil = null; return null; }
    const dom = window.CFG.ALLOWED_EMAIL_DOMAIN;
    if (dom && user.email && user.email.split('@')[1] !== dom) {
      await cliente().auth.signOut();
      throw new Error('Solo se puede entrar con un mail @' + dom);
    }
    perfil = await cargarPerfil(user);
    return perfil;
  },

  async entrar() {
    const { error } = await cliente().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname,
        queryParams: { hd: window.CFG.ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' }
      }
    });
    if (error) throw error;
  },

  async salir() {
    if (canal) { cliente().removeChannel(canal); canal = null; }
    await cliente().auth.signOut();
    perfil = null;
  },

  async cargarTodo() {
    const c = cliente();
    const [chq, evt, com, usr] = await Promise.all([
      c.from('cheques').select('*').order('creado_en', { ascending: false }),
      c.from('eventos').select('*').order('en', { ascending: true }),
      c.from('comitentes').select('*').order('numero', { ascending: true }),
      c.from('perfiles').select('id,nombre,email,rol,avatar_url,activo')
    ]);
    const err = [chq, evt, com, usr].find(r => r.error);
    if (err) throw err.error;
    return {
      cheques: chq.data || [],
      eventos: evt.data || [],
      comitentes: com.data || [],
      usuarios: usr.data || []
    };
  },

  async crearCheque(datos, usuario) {
    const fila = Object.assign({}, datos, {
      creado_por: usuario.id,
      productor_id: datos.productor_id || usuario.id
    });
    const { data, error } = await cliente().from('cheques').insert(fila).select().single();
    if (error) throw error;
    return data;
  },

  async actualizarCheque(id, patch) {
    const { data, error } = await cliente()
      .from('cheques').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // La transición pasa por una función de base: valida la transición contra la
  // máquina de estados del servidor y escribe el evento en la misma transacción.
  async transicionar(id, destino, opciones) {
    opciones = opciones || {};
    const { data, error } = await cliente().rpc('transicionar_cheque', {
      p_cheque: id,
      p_destino: destino,
      p_motivo: opciones.motivo || null,
      p_campos: opciones.campos || {}
    });
    if (error) throw error;
    return data;
  },

  async comentar(id, texto) {
    const { error } = await cliente().from('eventos')
      .insert({ cheque_id: id, tipo: 'comentario', nota: texto });
    if (error) throw error;
  },

  async guardarComitente(datos) {
    const { error } = await cliente().from('comitentes').upsert(datos, { onConflict: 'numero' });
    if (error) throw error;
  },

  async subirAdjunto(chequeId, file) {
    const ruta = chequeId + '/' + Date.now() + '_' + file.name.replace(/[^\w.\-]/g, '_');
    const { error } = await cliente().storage.from('cheques').upload(ruta, file);
    if (error) throw error;
    const { error: e2 } = await cliente().from('adjuntos')
      .insert({ cheque_id: chequeId, ruta, nombre: file.name, tipo: file.type, tamano: file.size });
    if (e2) throw e2;
    return ruta;
  },

  async urlAdjunto(ruta) {
    const { data, error } = await cliente().storage.from('cheques').createSignedUrl(ruta, 3600);
    if (error) throw error;
    return data.signedUrl;
  },

  async adjuntos(chequeId) {
    const { data, error } = await cliente().from('adjuntos').select('*').eq('cheque_id', chequeId);
    if (error) throw error;
    return data || [];
  },

  suscribir(fn) {
    suscriptores.push(fn);
    if (!canal) {
      canal = cliente().channel('cheques-vivo')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cheques' }, avisar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, avisar)
        .subscribe();
    }
    return () => { suscriptores = suscriptores.filter(f => f !== fn); };
  }
};
