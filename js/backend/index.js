// Elige el backend según la configuración. El resto de la app importa de acá.

const hayClaves = !!(window.CFG && window.CFG.SUPABASE_URL && window.CFG.SUPABASE_ANON_KEY);
const forzarDemo = (() => {
  try { return localStorage.getItem('eq_cheques_force_demo') === '1'; } catch (e) { return false; }
})();

export const MODO = (hayClaves && !forzarDemo) ? 'supabase' : 'demo';

const mod = MODO === 'supabase'
  ? await import('./supabase.js')
  : await import('./demo.js');

export const backend = mod.backend;
