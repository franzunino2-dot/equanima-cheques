// Agenda de vencimientos: cuándo entra y cuándo sale la plata.

import { agenda, comitente, alertasDe } from '../store.js';
import { badgeEstado, chipCircuito, vacio } from '../ui/componentes.js';
import { esc, plata, plataCorta, fechaFmt, relativo, diasDesdeHoy } from '../dominio/formato.js';

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function vistaAgenda() {
  const dias = agenda(60);
  if (!dias.length) {
    return '<div class="vista"><header class="vista-head"><h1>Agenda</h1></header>' +
      vacio('No hay cheques en curso.', 'Cuando se apruebe alguno aparece su fecha proyectada.') + '</div>';
  }

  let acumulado = 0;
  const totalEntra = dias.reduce((s, d) => s + d.entra, 0);
  const totalSale = dias.reduce((s, d) => s + d.sale, 0);

  const filas = dias.map(d => {
    acumulado += d.entra - d.sale;
    const fecha = new Date(d.fecha.slice(0, 4), Number(d.fecha.slice(5, 7)) - 1, d.fecha.slice(8, 10));
    const atrasado = diasDesdeHoy(d.fecha) <= 0;
    const items = d.items.map(ch => {
      const com = comitente(ch.comitente_id);
      const al = alertasDe(ch).filter(a => a.nivel === 'bloqueante').length;
      return '<li class="item-dia i-' + esc(ch.circuito) + '">' +
        '<a href="#/cheque/' + esc(ch.id) + '">' + esc(ch.codigo) + '</a> ' +
        chipCircuito(ch.circuito) + ' ' +
        '<span class="tenue">' + esc(com ? com.numero + ' ' + com.denominacion : '') + '</span> ' +
        '<span class="num">' + esc(plata(ch.monto, ch.moneda)) + '</span> ' +
        badgeEstado(ch.estado) +
        (al ? ' <span class="punto p-rojo">' + al + '</span>' : '') +
        '</li>';
    }).join('');

    return '<section class="dia-agenda' + (atrasado ? ' atrasado' : '') + '">' +
      '<header><div class="dia-fecha"><strong>' + esc(fechaFmt(d.fecha)) + '</strong>' +
      '<span class="tenue"> ' + esc(DIAS_SEMANA[fecha.getDay()]) + ' · ' + esc(relativo(d.fecha)) + '</span></div>' +
      '<div class="dia-nums">' +
      (d.entra ? '<span class="n-entra">+ ' + esc(plataCorta(d.entra)) + '</span>' : '') +
      (d.sale ? '<span class="n-sale">− ' + esc(plataCorta(d.sale)) + '</span>' : '') +
      '<span class="n-acum" title="Acumulado desde hoy">= ' + esc(plataCorta(acumulado)) + '</span>' +
      '</div></header><ul class="items-dia">' + items + '</ul></section>';
  }).join('');

  return '<div class="vista vista-agenda">' +
    '<header class="vista-head"><div><h1>Agenda</h1>' +
    '<p class="tenue">Próximos 60 días · entran ' + esc(plataCorta(totalEntra)) +
    ' · salen ' + esc(plataCorta(totalSale)) +
    ' · neto ' + esc(plataCorta(totalEntra - totalSale)) + '</p></div></header>' +
    '<p class="nota">Las fechas de los cheques ya depositados son estimadas: fecha de depósito + ' +
    (window.CFG.DIAS_ACREDITACION || 2) + ' días hábiles. Los vencidos sin depositar se muestran en el día de hoy.</p>' +
    filas + '</div>';
}
