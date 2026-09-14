// Modal y avisos. Sin dependencias.

import { esc } from '../dominio/formato.js';

let contenedor = null;

function raiz() {
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'capa-dialogos';
    document.body.appendChild(contenedor);
  }
  return contenedor;
}

export function modal(opciones) {
  return new Promise(resolver => {
    const r = raiz();
    const caja = document.createElement('div');
    caja.className = 'velo';
    caja.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<header><h2>' + esc(opciones.titulo || '') + '</h2>' +
      '<button class="x" data-cerrar aria-label="Cerrar">×</button></header>' +
      '<div class="modal-cuerpo">' + (opciones.cuerpo || '') + '</div>' +
      '<footer>' +
      '<button class="btn fantasma" data-cerrar>' + esc(opciones.cancelar || 'Cancelar') + '</button>' +
      '<button class="btn ' + esc(opciones.tono || 'primario') + '" data-ok>' + esc(opciones.confirmar || 'Confirmar') + '</button>' +
      '</footer></div>';
    r.appendChild(caja);

    const cerrar = valor => {
      caja.remove();
      document.removeEventListener('keydown', teclas);
      resolver(valor);
    };
    const teclas = ev => {
      if (ev.key === 'Escape') cerrar(null);
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) aceptar();
    };
    const aceptar = () => {
      const form = caja.querySelector('.modal-cuerpo');
      const datos = {};
      form.querySelectorAll('[name]').forEach(el => {
        datos[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      if (opciones.validar) {
        const err = opciones.validar(datos);
        if (err) {
          let box = caja.querySelector('.modal-error');
          if (!box) {
            box = document.createElement('p');
            box.className = 'modal-error';
            form.appendChild(box);
          }
          box.textContent = err;
          return;
        }
      }
      cerrar(datos);
    };

    caja.addEventListener('click', ev => {
      if (ev.target === caja || ev.target.closest('[data-cerrar]')) cerrar(null);
      if (ev.target.closest('[data-ok]')) aceptar();
    });
    document.addEventListener('keydown', teclas);
    const primero = caja.querySelector('.modal-cuerpo input, .modal-cuerpo select, .modal-cuerpo textarea');
    if (primero) primero.focus();
  });
}

export async function confirmar(titulo, texto, opciones) {
  const r = await modal(Object.assign({
    titulo,
    cuerpo: '<p>' + esc(texto) + '</p>',
    confirmar: 'Sí, dale'
  }, opciones || {}));
  return r !== null;
}

let pilaAvisos = null;

export function aviso(texto, tono) {
  if (!pilaAvisos) {
    pilaAvisos = document.createElement('div');
    pilaAvisos.id = 'avisos';
    document.body.appendChild(pilaAvisos);
  }
  const el = document.createElement('div');
  el.className = 'aviso' + (tono ? ' a-' + tono : '');
  el.textContent = texto;
  pilaAvisos.appendChild(el);
  setTimeout(() => { el.classList.add('sale'); setTimeout(() => el.remove(), 300); }, 3800);
}
