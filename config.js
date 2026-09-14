// Configuración de la app.
//
// La clave de abajo es la PUBLICABLE: está pensada para vivir en el browser y
// es segura de commitear. Lo que protege los datos son las políticas RLS de
// supabase/schema.sql, no esta clave. La sb_secret_… NUNCA va acá.
//
// Con SUPABASE_URL vacío, la app corre en modo demo sobre localStorage.

window.CFG = {
  // --- Supabase ---
  SUPABASE_URL: 'https://buhpcbgocmwankamnucp.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Je3kEnn-TzmVT0GuYP7ZJQ_7vZc0UDG',

  // --- Acceso ---
  // 'dominio'  -> login con Google restringido a ALLOWED_EMAIL_DOMAIN (producción)
  // 'demo'     -> sin login, se elige un usuario de prueba (solo con Supabase vacío)
  ACCESS_MODE: 'dominio',
  ALLOWED_EMAIL_DOMAIN: 'equanimasecurities.com',

  // --- Organización ---
  ORG: 'Equanima Securities',
  ORG_CORTO: 'Equanima',
  ORG_CUIT: '30-71234567-8',
  MATRICULA: 'ALyC y AN Integral — CNV Matrícula 191',

  // --- Reglas de negocio ---
  // Importe a partir del cual se marca alerta de monitoreo (pesos).
  UMBRAL_UIF: 10000000,
  // Para convertir montos en dólares al comparar contra el umbral.
  TIPO_CAMBIO_REFERENCIA: 1450,
  // Días hábiles que tarda en acreditar un cheque depositado (estimado que
  // usa la página para proyectar el flujo de fondos).
  DIAS_ACREDITACION: 2,

  // Cuentas bancarias de Equanima donde se depositan los cheques recibidos
  // y desde donde se emiten los ECHEQ.
  CUENTAS: [
    { id: 'bind-ars', banco: '322', alias: 'BIND · CC $', cbu: '3220001805000123456789', moneda: 'ARS' },
    { id: 'bind-usd', banco: '322', alias: 'BIND · CC US$', cbu: '3220001805000987654321', moneda: 'USD' },
    { id: 'galicia-ars', banco: '007', alias: 'Galicia · CC $', cbu: '0070999530004567890123', moneda: 'ARS' }
  ],

  // --- Integración bancaria (ver docs/INTEGRACION_BIND.md) ---
  // El front nunca habla con el banco: llama a una Edge Function de Supabase.
  BANCO_ADAPTADOR: 'bind',
  SYNC_ENDPOINT: '',        // ej: https://<ref>.functions.supabase.co/bind-sync
  SYNC_INTERVALO_MS: 300000 // 5 minutos
};
