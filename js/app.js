// Arranque, layout y router.

import { backend, MODO } from './backend/index.js';
import { S, cargar, alCambiar, miBandeja, esBackoffice, puedeCrear, comitente, alertasDe, ordenar } from './store.js';
import { panel } from './vistas/panel.js';
import { lista, conectarLista } from './vistas/lista.js';
import { ficha, conectarFicha } from './vistas/ficha.js';
import { formulario, conectarFormulario, iniciarFormulario } from './vistas/formulario.js';
import { vistaAgenda } from './vistas/agenda.js';
import { vistaComitentes, conectarComitentes } from './vistas/comitentes.js';
import { vistaBanco, conectarBanco } from './vistas/banco.js';
import { avatar, lineaCheque, CABECERA_TABLA, vacio } from './ui/componentes.js';
import { aviso } from './ui/dialogos.js';
import { esc } from './dominio/formato.js';
import { ROLES } from './dominio/estados.js';

const app = document.getElementById('app');

const RUTAS = [
  { id: 'panel',      hash: '#/panel',      nombre: 'Panel',      icono: '▤' },
  { id: 'bandeja',    hash: '#/bandeja',    nombre: 'Mi bandeja', icono: '✦', contador: () => miBandeja().length },
  { id: 'cheques',    hash: '#/cheques',    nombre: 'Cheques',    icono: '▦' },
  { id: 'agenda',     hash: '#/agenda',     nombre: 'Agenda',     icono: '◷' },
  { id: 'banco',      hash: '#/banco',      nombre: 'Banco',      icono: '⇄', soloBackoffice: true },
  { id: 'comitentes', hash: '#/comitentes', nombre: 'Comitentes', icono: '☰' }
];

function rutaActual() {
  const h = (location.hash || '#/panel').replace(/^#/, '');
  const [camino, query] = h.split('?');
  const partes = camino.split('/').filter(Boolean);
  const params = {};
  (query || '').split('&').filter(Boolean).forEach(p => {
    const [k, v] = p.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { seccion: partes[0] || 'panel', id: partes[1] || null, params };
}

// --- login ---

function pantallaLogin(mensaje) {
  const dom = window.CFG.ALLOWED_EMAIL_DOMAIN;
  let extra = '';
  if (MODO === 'demo') {
    const us = backend.usuariosDemo();
    extra = '<div class="demo-box"><p class="tenue">Estás en <strong>modo demo</strong>: los datos viven en este navegador ' +
      'y no salen a ningún lado. Entrá con cualquiera de estos perfiles para ver cómo cambia la página según el rol.</p>' +
      '<div class="demo-usuarios">' + us.map(u =>
        '<button class="demo-usuario" data-usuario="' + esc(u.id) + '">' +
        avatar(u.nombre) + '<span><strong>' + esc(u.nombre) + '</strong><small>' + esc(ROLES[u.rol].nombre) + '</small></span></button>'
      ).join('') + '</div></div>';
  } else {
    extra =
      '<form class="login-mail" id="form-mail">' +
      '<label class="campo"><span>Tu mail de ' + esc(window.CFG.ORG_CORTO) + '</span>' +
      '<input type="email" id="mail-login" placeholder="nombre@' + esc(dom) + '" autocomplete="email" required></label>' +
      '<button class="btn primario grande" type="submit">Mandame el link para entrar</button>' +
      '</form>' +
      '<p class="tenue">Te llega un mail con un botón. No hay contraseña que recordar.</p>' +
      '<div class="separador"><span>o</span></div>' +
      '<button class="btn grande" id="btn-google">Entrar con Google</button>' +
      '<p class="tenue">Solo cuentas <strong>@' + esc(dom) + '</strong></p>';
  }
  app.innerHTML =
    '<div class="login">' +
    '<div class="login-caja">' +
    '<div class="marca"><span class="marca-logo">EQ</span><div><strong>Cheques</strong>' +
    '<small>' + esc(window.CFG.ORG) + '</small></div></div>' +
    '<h1>Circuito de cheques</h1>' +
    '<p class="tenue">Productores y back office mirando lo mismo: qué se recibió, qué se depositó, qué acreditó y qué falta.</p>' +
    (mensaje ? '<p class="modal-error">' + esc(mensaje) + '</p>' : '') +
    extra +
    '</div></div>';

  const g = app.querySelector('#btn-google');
  if (g) g.addEventListener('click', async () => {
    try { await backend.entrar(); } catch (e) { pantallaLogin(e.message); }
  });

  const fm = app.querySelector('#form-mail');
  if (fm) fm.addEventListener('submit', async ev => {
    ev.preventDefault();
    const input = app.querySelector('#mail-login');
    const boton = fm.querySelector('button');
    boton.disabled = true;
    boton.textContent = 'Mandando…';
    try {
      const mail = await backend.entrarPorMail(input.value);
      app.querySelector('.login-caja').innerHTML =
        '<div class="marca"><span class="marca-logo">EQ</span><div><strong>Cheques</strong>' +
        '<small>' + esc(window.CFG.ORG) + '</small></div></div>' +
        '<h1>Revisá tu mail</h1>' +
        '<p>Te mandamos un link a <strong>' + esc(mail) + '</strong>. Abrilo desde este mismo navegador y entrás.</p>' +
        '<p class="tenue">Si no aparece en un minuto, mirá en spam. El link vence en una hora.</p>' +
        '<button class="btn fantasma" onclick="location.reload()">Usar otro mail</button>';
    } catch (e) {
      boton.disabled = false;
      boton.textContent = 'Mandame el link para entrar';
      let err = app.querySelector('.modal-error');
      if (!err) {
        err = document.createElement('p');
        err.className = 'modal-error';
        fm.appendChild(err);
      }
      err.textContent = e.message || String(e);
    }
  });
  app.querySelectorAll('[data-usuario]').forEach(b => {
    b.addEventListener('click', async () => {
      S.usuario = await backend.entrarComo(b.getAttribute('data-usuario'));
      await cargar();
      dibujar();
    });
  });
}

// --- layout ---

function barraLateral() {
  const r = rutaActual();
  const items = RUTAS.filter(x => !x.soloBackoffice || esBackoffice()).map(x => {
    const n = x.contador ? x.contador() : 0;
    return '<a class="nav-item' + (r.seccion === x.id ? ' activo' : '') + '" href="' + x.hash + '">' +
      '<span class="nav-ico">' + x.icono + '</span><span>' + esc(x.nombre) + '</span>' +
      (n ? '<span class="nav-n">' + n + '</span>' : '') + '</a>';
  }).join('');

  const u = S.usuario;
  return '<nav class="lateral-nav">' +
    '<div class="marca"><span class="marca-logo">EQ</span><div><strong>Cheques</strong>' +
    '<small>' + esc(window.CFG.ORG_CORTO) + '</small></div></div>' +
    (puedeCrear() ? '<a class="btn primario bloque" href="#/nuevo">+ Cargar cheque</a>' : '') +
    '<div class="nav-items">' + items + '</div>' +
    '<div class="nav-pie">' +
    (MODO === 'demo' ? '<div class="aviso-demo">Modo demo · datos locales<br><button class="enlace" id="btn-reset">reiniciar datos</button></div>' : '') +
    '<div class="usuario-box">' + avatar(u ? u.nombre : '?', u ? u.avatar_url : null) +
    '<div><strong>' + esc(u ? u.nombre : '') + '</strong><small>' + esc(u ? ROLES[u.rol].nombre : '') + '</small></div>' +
    '<button class="enlace" id="btn-salir" title="Salir">⏻</button></div>' +
    '</div></nav>';
}

function contenido() {
  const r = rutaActual();
  if (S.cargando) return '<div class="vista"><div class="cargando">Cargando…</div></div>';
  if (S.error) return '<div class="vista"><div class="vacio"><p>No se pudieron traer los datos.</p>' +
    '<p class="tenue">' + esc(S.error) + '</p></div></div>';

  switch (r.seccion) {
    case 'panel': return panel();
    case 'bandeja': {
      S.filtros.texto = '';
      return '<div class="vista"><header class="vista-head"><h1>Mi bandeja</h1></header>' +
        vistaBandeja() + '</div>';
    }
    case 'cheques':
      if (r.params.estado !== undefined) S.filtros.estado = r.params.estado;
      if (r.params.comitente !== undefined) S.filtros.comitente = r.params.comitente;
      if (r.params.alertas !== undefined) S.filtros.alertas = r.params.alertas === '1';
      return lista();
    case 'cheque': return ficha(r.id);
    case 'nuevo': return formulario(null);
    case 'editar': return formulario(r.id);
    case 'agenda': return vistaAgenda();
    case 'comitentes': return vistaComitentes();
    case 'banco': return esBackoffice() ? vistaBanco() : '<div class="vista"><div class="vacio"><p>Esta sección es de back office.</p></div></div>';
    default: return panel();
  }
}

function vistaBandeja() {
  const b = miBandeja();
  if (!b.length) return vacio('No hay nada esperando por vos.', 'Las solicitudes nuevas aparecen acá apenas se envían.');
  return '<div class="tabla-wrap"><table class="tabla">' + CABECERA_TABLA + '<tbody>' +
    ordenar(b, { campo: 'fecha_pago', dir: 'asc' })
      .map(ch => lineaCheque(ch, { comitente: comitente(ch.comitente_id), alertas: alertasDe(ch) })).join('') +
    '</tbody></table></div>';
}

let ultimaSeccion = null;

export function dibujar() {
  if (!S.usuario) { pantallaLogin(); return; }
  const r = rutaActual();

  app.innerHTML = '<div class="layout">' + barraLateral() +
    '<main class="principal-wrap" id="principal">' + contenido() + '</main></div>';

  const raiz = document.getElementById('principal');
  if (r.seccion === 'cheques') conectarLista(raiz);
  if (r.seccion === 'cheque') conectarFicha(raiz, r.id);
  if (r.seccion === 'nuevo' || r.seccion === 'editar') conectarFormulario(raiz, r.id, dibujar);
  if (r.seccion === 'comitentes') conectarComitentes(raiz);
  if (r.seccion === 'banco') conectarBanco(raiz, dibujar);

  const salir = app.querySelector('#btn-salir');
  if (salir) salir.addEventListener('click', async () => {
    await backend.salir();
    S.usuario = null;
    dibujar();
  });
  const reset = app.querySelector('#btn-reset');
  if (reset) reset.addEventListener('click', () => {
    backend.reiniciar();
    cargar().then(dibujar);
  });

  if (ultimaSeccion !== r.seccion + (r.id || '')) {
    raiz.scrollTop = 0;
    ultimaSeccion = r.seccion + (r.id || '');
  }
}

// --- arranque ---

async function arrancar() {
  await backend.iniciar();
  try {
    S.usuario = await backend.sesion();
  } catch (e) {
    pantallaLogin(e.message);
    return;
  }
  if (!S.usuario) { pantallaLogin(); return; }

  alCambiar(dibujar);
  backend.suscribir(() => { cargar(); });

  window.addEventListener('hashchange', () => {
    const r = rutaActual();
    if (r.seccion === 'nuevo' || r.seccion === 'editar') iniciarFormulario(r.id);
    dibujar();
  });

  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      ev.preventDefault();
      location.hash = '#/cheques';
      setTimeout(() => { const i = document.querySelector('#f-texto'); if (i) i.focus(); }, 60);
    }
    if (ev.key === 'n' && (ev.metaKey || ev.ctrlKey) && ev.shiftKey) {
      ev.preventDefault();
      location.hash = '#/nuevo';
    }
  });

  await cargar();
  dibujar();
}

arrancar().catch(e => {
  console.error(e);
  app.innerHTML = '<div class="login"><div class="login-caja"><h1>No arrancó</h1>' +
    '<p class="modal-error">' + esc(e.message || String(e)) + '</p></div></div>';
});
