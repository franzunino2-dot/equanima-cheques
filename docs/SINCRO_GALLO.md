# Padrón de comitentes desde Gallo (EGWS)

El control de titularidad —la regla más importante de la página— compara el CUIT
del librador contra el CUIT del comitente. Ese CUIT tiene que salir de algún
lado, y ese lado es Gallo.

## De dónde sale

El proyecto **1810** (`Documents/GitHub/rentafija`) ya habla con EGWS y expone:

```
GET /api/gallo/comitentes
```

que por dentro combina tres llamadas de EGWS:

| Método EGWS | Da |
|---|---|
| `GetClientes` | `CodigoComitente`, `Nombre`, `CUIT`, `Manager` — el universo real de cuentas |
| `Manager` | código → nombre del productor |
| `Oficiales` | código → nombre del oficial de cuenta |

La respuesta que interesa:

```json
{ "codigo": "1237", "nombre": "ZUNINO DIAZ, GUIDO", "cuit": "20304567899",
  "manager": "Francisco Zunino", "oficial": "…" }
```

`GetTenenciaGeneral` también aparece en ese endpoint, pero trae posiciones y acá
**no se usa**: este proyecto no necesita saber qué tiene cada cuenta, solo quién
es.

## Por qué hay que empujar y no consultar

Gallo vive en la red de la oficina (`192.168.1.x`). Desde GitHub Pages o desde
Supabase no se llega, y abrir ese puerto a internet sería un problema mucho
mayor que el que resuelve. Es el mismo razonamiento que ya está escrito en 1810
para `COMIT_PUSH_URL`: **siempre oficina → nube, nunca al revés.**

```
Gallo (EGWS)  ──►  servidor 1810  ──►  sync-comitentes.js  ──►  Supabase
 red interna        red interna         corre en la oficina      nube
```

## Puesta en marcha

En la máquina de la oficina, con el servidor 1810 andando:

```bash
cd Documents/GitHub/equanima-cheques
cp sync/.env.ejemplo sync/.env
```

Editar `sync/.env`:

```
RENTAFIJA_URL=http://localhost:3000
SUPABASE_URL=https://TU_REF.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_…
```

Probar sin escribir nada:

```bash
node sync/sync-comitentes.js --seco
```

Y cuando se vea bien:

```bash
node sync/sync-comitentes.js
```

Es idempotente: hace upsert por `numero`, así que se puede correr todas las
veces que haga falta.

### Automatizarlo

Tarea programada de Windows, una vez por día alcanza (el padrón casi no cambia):

```powershell
schtasks /create /tn "Sync comitentes cheques" /tr "node C:\Users\Usuario\Documents\GitHub\equanima-cheques\sync\sync-comitentes.js" /sc daily /st 08:00
```

## Qué sube y qué no

**Sube:** número de cuenta, denominación, CUIT, productor, oficial.

**No sube:** tenencias, saldos, posiciones, movimientos, cuentas corrientes.
Eso se queda en la oficina, como está definido en 1810.

## La clave secreta

`SUPABASE_SERVICE_KEY` es la `sb_secret_…`: saltea RLS por completo. Va en
`sync/.env`, que está en `.gitignore`. **Nunca** en `config.js` ni en el repo —
`config.js` lleva la publicable, que es otra cosa.

## Los que quedan sin CUIT

El script avisa cuáles vienen sin CUIT válido desde Gallo. Esas cuentas son un
problema concreto: sin CUIT, el control de titularidad no puede correr y **todos
sus cheques van a caer en compliance**. La pestaña **Comitentes** de la app los
marca en rojo. Se arreglan en Gallo (mejor, porque queda para todos) o a mano
desde la app.

## El mapeo de productores

Gallo devuelve el productor como texto (`manager`). El script intenta enlazarlo
con un perfil de la app comparando el nombre normalizado, y si no lo encuentra
deja el texto en `gallo_manager` para que un admin lo mapee a mano desde la
pestaña Comitentes. Ese enlace es lo que después decide qué ve cada productor.
