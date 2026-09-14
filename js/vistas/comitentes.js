// Padrón de comitentes. Se sincroniza desde Gallo/EGWS (ver docs/SINCRO_GALLO.md);
// acá se puede corregir a mano lo que haga falta.

import { S, visibles, nombreUsuario, esAdmin, guardarComitente } from '../store.js';
import { modal, aviso } from '../ui/dialogos.js';
import { vacio } from '../ui/componentes.js';
import { esc, cuitFmt, plata, cuitValido, soloDigitos } from '../dominio/formato.js';

export function vistaComitentes() {
  const chs = visibles();
  const filas = S.comitentes.slice().sort((a, b) => Number(a.numero) - Number(b.numero)).map(c => {
    const suyos = chs.filter(x => x.comitente_id === c.id);
    const enCurso = suyos.filter(x => ['acreditado', 'debitado', 'transferido', 'anulado', 'rechazado_interno', 'rechazado_banco'].indexOf(x.estado) < 0);
    const monto = enCurso.reduce((s, x) => s + (x.circuito === 'ingreso' ? 1 : -1) * Number(x.monto || 0), 0);
    return '<tr' + (c.activo === false ? ' class="inactivo"' : '') + '>' +
      '<td><strong>' + esc(c.numero) + '</strong></td>' +
      '<td>' + esc(c.denominacion) + (c.activo === false ? ' <span class="chip">baja</span>' : '') + '</td>' +
      '<td>' + esc(cuitFmt(c.cuit)) + (cuitValido(c.cuit) ? '' : ' <span class="punto p-rojo" title="CUIT inválido">!</span>') + '</td>' +
      '<td>' + esc(c.productor_id ? nombreUsuario(c.productor_id) : (c.productor_nombre || '—')) + '</td>' +
      '<td class="num">' + suyos.length + '</td>' +
      '<td class="num">' + enCurso.length + '</td>' +
      '<td class="num ' + (monto >= 0 ? 'n-entra' : 'n-sale') + '">' + esc(plata(monto, 'ARS')) + '</td>' +
      '<td><a href="#/cheques?comitente=' + esc(c.id) + '">ver</a>' +
      (esAdmin() ? ' · <button class="enlace" data-editar="' + esc(c.id) + '">editar</button>' : '') + '</td>' +
      '</tr>';
  }).join('');

  const sinCuit = S.comitentes.filter(c => !cuitValido(c.cuit)).length;

  return '<div class="vista vista-comitentes">' +
    '<header class="vista-head"><div><h1>Comitentes</h1>' +
    '<p class="tenue">' + S.comitentes.length + ' cuentas' +
    (sinCuit ? ' · <span class="txt-rojo">' + sinCuit + ' sin CUIT válido</span>' : '') + '</p></div>' +
    (esAdmin() ? '<button class="btn fantasma" id="btn-nuevo-com">+ Agregar</button>' : '') +
    '</header>' +
    (sinCuit ? '<p class="nota nota-alerta">Un comitente sin CUIT válido rompe el control de titularidad: ' +
      'todos los cheques de esa cuenta van a caer en compliance. Corregilo acá o en Gallo y volvé a sincronizar.</p>' : '') +
    (S.comitentes.length
      ? '<div class="tabla-wrap"><table class="tabla"><thead><tr>' +
        '<th>N°</th><th>Denominación</th><th>CUIT</th><th>Productor</th>' +
        '<th class="num">Cheques</th><th class="num">En curso</th><th class="num">Neto en curso</th><th></th>' +
        '</tr></thead><tbody>' + filas + '</tbody></table></div>'
      : vacio('Todavía no hay comitentes cargados.', 'Corré la sincronización con Gallo o agregá uno a mano.')) +
    '</div>';
}

async function editor(c) {
  const productores = S.usuarios.filter(u => ['productor', 'admin', 'backoffice'].indexOf(u.rol) >= 0);
  const datos = await modal({
    titulo: c ? 'Editar comitente ' + c.numero : 'Nuevo comitente',
    cuerpo:
      '<label class="campo"><span>Número de cuenta</span><input name="numero" value="' + esc(c ? c.numero : '') + '"></label>' +
      '<label class="campo"><span>Denominación</span><input name="denominacion" value="' + esc(c ? c.denominacion : '') + '"></label>' +
      '<label class="campo"><span>CUIT</span><input name="cuit" value="' + esc(c ? c.cuit : '') + '" placeholder="20-12345678-3"></label>' +
      '<label class="campo"><span>Productor</span><select name="productor_id">' +
        '<option value="">—</option>' +
        productores.map(u => '<option value="' + esc(u.id) + '"' + (c && c.productor_id === u.id ? ' selected' : '') + '>' + esc(u.nombre) + '</option>').join('') +
      '</select></label>' +
      '<label class="check"><input type="checkbox" name="activo"' + (!c || c.activo !== false ? ' checked' : '') + '> Cuenta activa</label>',
    confirmar: 'Guardar',
    validar: d => {
      if (!String(d.numero || '').trim()) return 'Falta el número de cuenta.';
      if (!String(d.denominacion || '').trim()) return 'Falta la denominación.';
      if (!cuitValido(d.cuit)) return 'El CUIT no es válido (no cierra el dígito verificador).';
      return null;
    }
  });
  if (!datos) return;
  try {
    await guardarComitente({
      id: c ? c.id : undefined,
      numero: String(datos.numero).trim(),
      denominacion: String(datos.denominacion).trim().toUpperCase(),
      cuit: soloDigitos(datos.cuit),
      productor_id: datos.productor_id || null,
      activo: !!datos.activo
    });
    aviso('Comitente guardado', 'exito');
  } catch (e) {
    aviso('No se pudo guardar: ' + (e.message || e), 'error');
  }
}

export function conectarComitentes(raiz) {
  raiz.querySelectorAll('[data-editar]').forEach(b => {
    b.addEventListener('click', () => {
      const c = S.comitentes.find(x => x.id === b.getAttribute('data-editar'));
      if (c) editor(c);
    });
  });
  const nuevo = raiz.querySelector('#btn-nuevo-com');
  if (nuevo) nuevo.addEventListener('click', () => editor(null));
}
