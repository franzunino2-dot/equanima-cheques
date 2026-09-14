# Integración con el banco (BIND)

El objetivo: que nadie tenga que mirar el homebanking para saber si un cheque
acreditó. El banco avisa, la página cambia sola de estado y queda registrado en
la trazabilidad como "informado por el banco".

## Por qué hace falta una pieza en el medio

GitHub Pages sirve archivos estáticos. No puede guardar la credencial del banco
ni recibir un webhook. Y aunque pudiera, poner la clave del banco en el front
sería regalarla: cualquiera que abra el inspector la ve.

Entonces:

```
BIND  ──webhook/poll──►  Edge Function (Supabase)  ──►  banco_movimientos
                              ▲                              │
                     credencial guardada acá                 │ conciliación
                     (nunca llega al browser)                ▼
                                                          cheques
```

La Edge Function corre en Supabase, con la credencial en sus secrets. El front
solo lee `banco_movimientos` y `cheques`, con las políticas RLS de siempre.

## Lo que hay que conseguir de BIND

Antes de escribir código, con el ejecutivo de cuentas de BIND:

1. **Alta en el portal de APIs** y credenciales de producción y de sandbox
   (`client_id` / `client_secret`, o certificado, según el producto contratado).
2. **Qué APIs quedan habilitadas.** Las que sirven acá:
   - *Consulta de ECHEQs recibidos* — los cheques emitidos a favor del CUIT de
     Equanima. Es lo que reemplaza el aviso del productor.
   - *Estado de ECHEQ* — depositado / acreditado / rechazado y el motivo.
   - *Movimientos de cuenta* — para cruzar la acreditación real.
   - *Emisión de ECHEQ* — para el circuito de egreso, si lo habilitan. Sin esto,
     la emisión se sigue haciendo a mano en el homebanking y la página solo la
     registra.
3. **Webhooks o polling.** Si hay webhook, pedir la URL de callback y cómo se
   firma (HMAC en un header). Si no hay, polling cada 5 minutos alcanza.
4. **Límites de rate** y ventana horaria.
5. **IPs de salida** que haya que declarar. Las de Supabase Edge Functions no
   son fijas: si BIND exige lista blanca de IPs, hay que correr esto en un VPS
   propio o en la máquina de la oficina en vez de en una Edge Function. Es la
   pregunta que más conviene hacer primero, porque cambia el despliegue.

## Qué escribir después

`supabase/functions/bind-sync/index.ts` ya tiene el esqueleto. Lo que falta es
solo el pedazo del medio (`traerDeBind`), que depende de la documentación real.

El adaptador tiene una sola responsabilidad: traducir la respuesta de BIND a
esta forma, que es la que entiende el resto del sistema.

```ts
{
  externo_id:    string,   // id del movimiento en el banco, para no duplicar
  echeq_id:      string,
  numero_cheque: string | null,
  cuit_librador: string,
  nombre:        string,
  monto:         number,
  moneda:        'ARS' | 'USD',
  fecha_pago:    'YYYY-MM-DD',
  fecha_mov:     'YYYY-MM-DD',
  estado_banco:  string,   // tal cual lo manda el banco, sin normalizar
  crudo:         object    // la respuesta entera, por si después falta un campo
}
```

Cambiar de banco (Galicia, Comafi) es escribir otro archivo con esa misma
salida. Nada más del sistema se entera.

## Cómo se concilia

El motor ya está escrito y probado en `js/vistas/banco.js` (`conciliar()`), que
hoy usa la importación manual. Cruza en este orden:

1. **ID de ECHEQ** exacto.
2. **Número de cheque** exacto.
3. **Importe + fecha de pago**, si da un único candidato.
4. **Importe + CUIT del librador**, si da un único candidato.

Si hay más de un candidato lo marca ambiguo y no toca nada: ante la duda, no
adivina. Lo que no cruza con ningún cheque cargado queda listado aparte — eso es
plata que entró sin que nadie la haya avisado, y es justamente lo que hoy se
descubre tarde.

Del estado que informa el banco deduce el estado nuevo:

| Lo que dice el banco | Pasa a |
|---|---|
| `ACREDITADO`, `PAGADO`, `COBRADO`, `LIQUIDADO` | `acreditado` |
| `RECHAZADO`, `DEVUELTO`, `IMPAGO` | `rechazado_banco` |
| `DEPOSITADO`, `PRESENTADO`, `EN CAMARA` | `depositado` |

Y aplica la transición por `transicionar_cheque()`, la misma función que usa la
gente. O sea: valida contra la máquina de estados igual que si lo hubiera
apretado alguien, y deja el evento en la trazabilidad.

## Orden sugerido

1. Importación manual del archivo del homebanking — **ya funciona**, sirve desde
   el día uno y valida el motor de conciliación con datos reales.
2. Polling de consulta (solo lectura): el banco informa, la página actualiza.
   Acá se gana casi todo el beneficio con casi nada de riesgo.
3. Webhook, si BIND lo ofrece, para bajar la latencia de 5 minutos a segundos.
4. Emisión de ECHEQ desde la página. Último: es la única parte que *escribe* en
   el banco, y conviene tenerla recién cuando el resto lleve meses andando.

## Seguridad

- La credencial del banco vive en los secrets de la Edge Function. Nunca en
  `config.js`, nunca en el repo, nunca en el browser.
- La Edge Function usa la `service_role` key: salteá RLS, así que tiene que
  validar la firma del webhook antes de escribir nada.
- Todo lo que escribe la integración queda marcado como tal en `eventos`, para
  poder distinguir después qué hizo una persona y qué hizo el sistema.
- La emisión de ECHEQ (paso 4) mueve plata de verdad: exige doble confirmación y
  límite de importe por operación antes de habilitarla.
