# Cómo se usa

Manual corto para el equipo. Un cheque siempre está en un estado, y el estado
dice de quién es el turno. Si algo no aparece en tu bandeja, no es tuyo.

## Ingreso — un cliente manda un cheque

**El productor** entra en *Cargar cheque* → **Ingreso**, elige la cuenta
comitente y carga banco, importe, fecha de pago y quién firma el cheque. El
panel de la derecha va avisando en vivo lo que falta y lo que no cierra. Cuando
está completo: *Enviar a back office*.

> Si el cheque lo firma el propio cliente —que es como debería ser— apretá
> **Usar al comitente como librador** y se completa solo con el CUIT correcto.

**Back office** lo ve en su bandeja:

| Estado | Qué hacer |
|---|---|
| Solicitado | *Tomar* para empezar a revisarlo |
| En revisión | *Aprobar* si está todo bien, *Observar* si falta algo, *Elevar a compliance* si hay una alerta roja |
| Aprobado | *Marcar recibido* cuando el cheque esté físicamente en la oficina (o el ECHEQ ya en la cuenta) |
| Recibido | *Registrar depósito* con la fecha y la cuenta |
| Depositado | *Confirmar acreditación* cuando entre la plata, o *Rechazo del banco* con el motivo |

**Observado** devuelve la pelota al productor: corrige y reenvía.

## Egreso — un cliente retira con cheque

Igual, pero al revés: el productor carga a nombre de quién sale, back office
verifica el saldo y aprueba, después *Registrar emisión* con el número o el ID
del ECHEQ, *Marcar entregado*, y *Confirmar débito* cuando el beneficiario lo
cobra.

## Endoso — cheque de un tercero

El comitente trae un cheque que no es suyo. Back office verifica la cadena de
endosos, aprueba, registra el endoso a favor del endosatario final y confirma la
transferencia.

> Un cheque **"no a la orden"** no se puede endosar: es la ley, no una política
> interna. La página lo bloquea.

## Las alertas

**⛔ Rojo (bloqueante).** Back office no puede aprobar. O se corrige el dato, o
se eleva a compliance, que aprueba la excepción dejando escrito el fundamento.
Ese fundamento queda en la trazabilidad para siempre.

La más común, y la razón por la que existe el control: **el librador no es el
comitente.** Es un cheque de un tercero entrando a la cuenta de un cliente.
Puede estar bien —a veces lo está— pero nunca puede pasar sin que alguien lo
haya mirado y firmado.

**⚠️ Ámbar (alerta).** Se puede aprobar igual, pero conviene mirarlo: importe por
encima del umbral, plazo de presentación corriendo, diferimiento largo.

**ℹ️ Gris (info).** Un dato nomás.

## La agenda

Muestra, día por día, cuánto entra y cuánto sale, con el acumulado. Para los
cheques ya depositados, la fecha es estimada: depósito + 2 días hábiles. Los
vencidos sin depositar aparecen en el día de hoy, en rojo — eso es plata que
debería haber entrado y no entró.

## La pestaña Banco

Bajás del homebanking el listado de ECHEQs y lo soltás ahí. La página lo cruza
sola contra lo que hay cargado y te dice:

- qué cheques cambiaron de estado según el banco (y los aplica todos juntos),
- **qué movimientos no coinciden con ningún cheque cargado**.

Eso último es lo que hoy se descubre tarde: plata que entró sin que nadie
avisara, o un ID que no coincide.

## Atajos

- `/` — ir al buscador
- `Ctrl` + `Shift` + `N` — cargar un cheque nuevo
- `Ctrl` + `Enter` — confirmar el diálogo abierto
