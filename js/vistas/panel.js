// Panel: qué tengo que hacer hoy y dónde está la plata.

import { S, kpis, miBandeja, comitente, alertasDe, agenda, esBackoffice, ordenar } from '../store.js';
import { tarjetaKPI, lineaCheque, CABECERA_TABLA, vacio, badgeEstado, chipCircuito, vencimiento } from '../ui/componentes.js';
import { plata, plataCorta, fechaFmt, esc, diasDesdeHoy } from '../dominio/formato.js';

function tabla(lista, titulo, nota) {
  if (!lista.length) return '';
  const filas = lista.slice(0, 8).map(ch =>
    lineaCheque(ch, { comitente: comitente(ch.comitente_id), alertas: alertasDe(ch) })).join('');
  return '<section class="panel-bloque">' +
    '<h3>' + esc(titulo) + (nota ? ' <span class="tenue">· ' + esc(nota) + '</span>' : '') + '</h3>' +
    '<div class="tabla-wrap"><table class="tabla">' + CABECERA_TABLA + '<tbody>' + filas + '</tbody></table></div>' +
    (lista.length > 8 ? '<p class="tenue mas">y ' + (lista.length - 8) + ' más</p>' : '') +
    '</section>';
}

function barraAgenda() {
  const dias = agenda(30).slice(0, 14);
  if (!dias.length) return '';
  const max = Math.max.apply(null, dias.map(d => Math.max(d.entra, d.sale)).concat([1]));
  const barras = dias.map(d => {
    const he = Math.round((d.entra / max) * 100);
    const hs = Math.round((d.sale / max) * 100);
    const t = fechaFmt(d.fecha) + ' · entra ' + plataCorta(d.entra) + ' · sale ' + plataCorta(d.sale);
    return '<a class="dia" href="#/agenda" title="' + esc(t) + '">' +
      '<span class="barras"><i class="b-entra" style="height:' + he + '%"></i><i class="b-sale" style="height:' + hs + '%"></i></span>' +
      '<span class="dia-lbl">' + esc(fechaFmt(d.fecha).slice(0, 5)) + '</span></a>';
  }).join('');
  return '<section class="panel-bloque">' +
    '<h3>Flujo proyectado <span class="tenue">· próximos días · <i class="pt entra"></i> ingresan <i class="pt sale"></i> salen</span></h3>' +
    '<div class="agenda-mini">' + barras + '</div></section>';
}

export function panel() {
  const k = kpis();
  const bandeja = ordenar(miBandeja(), { campo: 'fecha_pago', dir: 'asc' });
  const nombre = S.usuario ? S.usuario.nombre.split(' ')[0] : '';

  const tarjetas = [
    tarjetaKPI({ titulo: 'Esperan algo tuyo', n: k.pendientes.n, monto: k.pendientes.monto, href: '#/bandeja', tono: 'primario' }),
    tarjetaKPI({ titulo: 'Para depositar', n: k.aDepositar.n, monto: k.aDepositar.monto, href: '#/cheques?estado=recibido', tono: 'ambar' }),
    tarjetaKPI({ titulo: 'Se hacen efectivos en 48 h', n: k.venceEn48.n, monto: k.venceEn48.monto, href: '#/agenda' }),
    tarjetaKPI({ titulo: 'En cámara', n: k.enCamara.n, monto: k.enCamara.monto, href: '#/cheques?estado=depositado', tono: 'cian' }),
    tarjetaKPI({ titulo: 'Con control sin resolver', n: k.conAlerta.n, monto: k.conAlerta.monto, href: '#/cheques?alertas=1', tono: 'rojo' }),
    tarjetaKPI({ titulo: 'Rechazados (30 días)', n: k.rechazados30.n, monto: k.rechazados30.monto, href: '#/cheques?estado=rechazado_banco', tono: 'rojo' })
  ].join('');

  let cuerpo = '<div class="kpis">' + tarjetas + '</div>';

  cuerpo += '<section class="panel-bloque destacado">' +
    '<h3>Tu bandeja <span class="tenue">· ' + bandeja.length + ' pendiente' + (bandeja.length === 1 ? '' : 's') + '</span></h3>' +
    (bandeja.length
      ? '<div class="tabla-wrap"><table class="tabla"><tbody>' +
        bandeja.slice(0, 10).map(ch => {
          const com = comitente(ch.comitente_id);
          const al = alertasDe(ch).filter(a => a.nivel === 'bloqueante');
          return '<tr class="fila-cheque" data-id="' + esc(ch.id) + '">' +
            '<td class="col-cod"><a href="#/cheque/' + esc(ch.id) + '">' + esc(ch.codigo) + '</a></td>' +
            '<td>' + chipCircuito(ch.circuito) + '</td>' +
            '<td>' + (com ? '<strong>' + esc(com.numero) + '</strong> ' + esc(com.denominacion) : '—') + '</td>' +
            '<td class="num">' + esc(plata(ch.monto, ch.moneda)) + '</td>' +
            '<td>' + vencimiento(ch.fecha_pago, ch.estado) + '</td>' +
            '<td>' + badgeEstado(ch.estado) + '</td>' +
            '<td class="col-alerta">' + (al.length ? '<span class="punto p-rojo" title="' + esc(al[0].titulo) + '">' + al.length + '</span>' : '') + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>'
      : vacio('Nada esperando por vos' + (nombre ? ', ' + nombre : '') + '.', 'Cuando llegue una solicitud nueva aparece acá.')) +
    '</section>';

  cuerpo += barraAgenda();

  if (k.conAlerta.n) {
    cuerpo += tabla(k.conAlerta.items, 'Controles sin resolver', 'no se pueden aprobar sin compliance');
  }
  if (esBackoffice() && k.aDepositar.n) {
    cuerpo += tabla(k.aDepositar.items, 'Listos para depositar', 'ya se hicieron efectivos');
  }

  return '<div class="vista vista-panel">' +
    '<header class="vista-head"><div><h1>Panel</h1>' +
    '<p class="tenue">Cartera en curso: entran ' + esc(plataCorta(k.carteraIngreso)) +
    ' · salen ' + esc(plataCorta(k.carteraEgreso)) + '</p></div>' +
    '<a class="btn primario" href="#/nuevo">+ Cargar cheque</a></header>' +
    cuerpo + '</div>';
}
