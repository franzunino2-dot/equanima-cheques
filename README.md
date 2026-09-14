# Equanima · Cheques

Circuito de cheques entre productores y back office. Reemplaza el ida y vuelta
por WhatsApp: el productor carga la solicitud, back office la trabaja, y los dos
miran el mismo estado.

**Producción:** https://franzunino2-dot.github.io/equanima-cheques/

## Qué resuelve

Tres circuitos, cada uno con su máquina de estados:

| Circuito | Qué es | Camino |
|---|---|---|
| **Ingreso** | El comitente entrega un cheque para acreditar en su cuenta | solicitado → en revisión → aprobado → recibido → depositado → **acreditado** |
| **Egreso** | El comitente retira fondos y Equanima le emite un ECHEQ | solicitado → en revisión → aprobado → emitido → entregado → **debitado** |
| **Endoso** | Cheque de un tercero que se endosa y transfiere | solicitado → en revisión → aprobado → endosado → **transferido** |

Y los controles que hoy se hacen a ojo, hechos solos:

- **Titularidad** — el CUIT del librador tiene que ser el del comitente. Si no,
  el cheque no se puede aprobar: va a compliance con fundamento documentado.
- **CUIT y CBU** — dígito verificador, no formato.
- **Duplicados** — mismo banco + número, o mismo ID de ECHEQ.
- **Plazo de presentación** — 30 días desde la fecha de pago; avisa antes.
- **Diferimiento** — tope legal de 360 días.
- **"No a la orden"** — no se puede endosar, por ley.
- **Umbral de monitoreo** — importes por encima del límite configurado.

## Cómo está armado

- Vanilla JS con módulos ES, sin build step (requisito de GitHub Pages).
- **Supabase** (Postgres + Auth + Realtime + Storage) para los datos.
- Login con Google restringido a `@equanimasecurities.com`.
- Nombres de funciones y variables en español.

```
js/dominio/     estados, validaciones, bancos, formato   ← la lógica de negocio
js/backend/     supabase.js | demo.js (misma interfaz)
js/vistas/      panel, lista, ficha, formulario, agenda, comitentes, banco
supabase/       schema.sql (tablas + RLS + máquina de estados del servidor)
sync/           padrón de comitentes desde Gallo/EGWS
docs/           circuitos, integración con el banco, sincronización
```

La máquina de estados vive en `js/dominio/estados.js` **y** en la tabla
`transiciones` del schema. El front decide qué botones mostrar; el servidor
decide qué se puede hacer. Si tocás una, tocá la otra.

## Roles

| Rol | Puede |
|---|---|
| **Productor** | Carga solicitudes de *sus* comitentes y ve solo esas |
| **Back office** | Todo el circuito: tomar, observar, aprobar, depositar, acreditar |
| **Compliance** | Aprobar excepciones de titularidad y alertas de umbral |
| **Admin** | Todo + ABM de comitentes y roles |
| **Solo lectura** | Consulta |

Al entrar por primera vez, el perfil queda en `lectura`. Un admin lo promueve.

## Modo demo

Con `config.js` sin claves, la app corre sobre `localStorage` con ~21 cheques de
ejemplo en todos los estados y 7 usuarios de prueba, uno por rol. Sirve para
mostrarle el circuito al equipo sin configurar nada.

Para forzarlo teniendo Supabase configurado:

```js
localStorage.eq_cheques_force_demo = '1'
```

## Puesta en marcha

1. **Supabase** — proyecto nuevo en la org Equanima. Correr `supabase/schema.sql`
   entero en el SQL editor.
2. **Acceso** — el magic link funciona sin configurar nada (Email ya viene
   habilitado). Para Google: Authentication → Providers → Google, con un OAuth
   Client creado en Google Cloud y el callback `https://<ref>.supabase.co/auth/v1/callback`.
   En Authentication → URL Configuration cargar el Site URL y la redirect URL del sitio.
3. **Entrar y promoverte a admin** — se entra por magic link (llega un mail con
   un botón) o con Google. La primera vez el perfil queda en `lectura`; después:
   ```sql
   update public.perfiles set rol = 'admin' where email = 'TU_MAIL@equanimasecurities.com';
   ```
4. **Claves** — van en `config.js`: la URL del proyecto y la clave **publicable**
   (`sb_publishable_…`), que es segura de commitear. La `sb_secret_…` no va nunca
   al front. Alternativamente se pueden cargar como secrets del repo
   (`SUPABASE_URL` / `SUPABASE_ANON_KEY`) y el workflow regenera `config.js`.
5. **Comitentes** — `node sync/sync-comitentes.js` desde la oficina
   (ver [docs/SINCRO_GALLO.md](docs/SINCRO_GALLO.md)).
6. **Banco** — ver [docs/INTEGRACION_BIND.md](docs/INTEGRACION_BIND.md). Hasta
   que esté, la pestaña **Banco** concilia el archivo del homebanking.

## Desarrollo

```bash
npx serve --cors -l 5503 .
```

GitHub Pages cachea: para ver un cambio recién pusheado, agregá `?v=algo` a la URL.
