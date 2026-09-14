-- ═══════════════════════════════════════════════════════════════════════════
-- Equanima · Cheques — esquema completo
--
-- Se corre entero en el SQL editor de Supabase. Es idempotente: se puede
-- volver a correr sin romper nada.
--
-- El candado real de esta app son las políticas RLS de acá abajo, NO el
-- JavaScript del front. Cualquiera puede pedirle datos a PostgREST con la
-- clave publicable; lo que decide qué ve es esto.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────── tipos

do $$ begin
  create type rol_usuario as enum ('admin', 'backoffice', 'compliance', 'productor', 'lectura');
exception when duplicate_object then null; end $$;

do $$ begin
  create type circuito_cheque as enum ('ingreso', 'egreso', 'endoso');
exception when duplicate_object then null; end $$;

do $$ begin
  create type soporte_cheque as enum ('echeq', 'fisico');
exception when duplicate_object then null; end $$;

-- Los estados van como text con check, no enum: agregar uno nuevo a un enum
-- en uso obliga a un commit aparte y complica los deploys.

-- ───────────────────────────────────────────────────────── dominio permitido

create or replace function public.dominio_permitido()
returns boolean language sql stable as $$
  select coalesce(
    split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2) = 'equanimasecurities.com',
    false);
$$;

-- ───────────────────────────────────────────────────────────── perfiles

create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nombre      text not null,
  avatar_url  text,
  rol         rol_usuario not null default 'lectura',
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create or replace function public.mi_rol()
returns rol_usuario language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo;
$$;

create or replace function public.tengo_rol(variadic roles rol_usuario[])
returns boolean language sql stable as $$
  select public.mi_rol() = any(roles);
$$;

-- admin puede todo lo de backoffice y compliance
create or replace function public.opera_backoffice()
returns boolean language sql stable as $$
  select public.mi_rol() in ('admin', 'backoffice', 'compliance');
$$;

-- ───────────────────────────────────────────────────────────── comitentes

create table if not exists public.comitentes (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null unique,
  denominacion    text not null,
  cuit            text,
  productor_id    uuid references public.perfiles(id) on delete set null,
  -- lo que viene de Gallo/EGWS y todavía no se mapeó a un perfil
  gallo_manager   text,
  gallo_oficial   text,
  activo          boolean not null default true,
  sincronizado_en timestamptz,
  creado_en       timestamptz not null default now()
);

create index if not exists comitentes_productor on public.comitentes(productor_id);
create index if not exists comitentes_cuit on public.comitentes(cuit);

-- ───────────────────────────────────────────────────────────── cheques

create sequence if not exists public.cheque_codigo_seq start 2601;

create table if not exists public.cheques (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique default ('CH-' || nextval('public.cheque_codigo_seq')),
  circuito            circuito_cheque not null,
  soporte             soporte_cheque not null default 'echeq',
  estado              text not null default 'borrador',

  comitente_id        uuid not null references public.comitentes(id),
  productor_id        uuid references public.perfiles(id),

  moneda              text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  monto               numeric(18,2) not null check (monto > 0),

  banco_girado        text,
  numero_cheque       text,
  echeq_id            text,

  nombre_librador     text,
  cuit_librador       text,
  nombre_beneficiario text,
  cuit_beneficiario   text,
  endosatario_nombre  text,
  endosatario_cuit    text,
  cbu_destino         text,

  fecha_emision       date,
  fecha_pago          date,
  fecha_recepcion     date,
  fecha_deposito      date,
  fecha_acreditacion  date,
  fecha_entrega       date,
  fecha_endoso        date,

  cuenta_deposito     text,
  motivo_rechazo_banco text,
  observaciones       text,

  cruzado             boolean not null default false,
  no_a_la_orden       boolean not null default false,
  endosado_por_tercero boolean not null default false,

  creado_por          uuid references public.perfiles(id),
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create index if not exists cheques_estado on public.cheques(estado);
create index if not exists cheques_comitente on public.cheques(comitente_id);
create index if not exists cheques_productor on public.cheques(productor_id);
create index if not exists cheques_fecha_pago on public.cheques(fecha_pago);
-- Un mismo cheque no se carga dos veces (el índice ignora los dados de baja).
create unique index if not exists cheques_unico_fisico
  on public.cheques(banco_girado, numero_cheque)
  where numero_cheque is not null and estado not in ('anulado', 'rechazado_interno');
create unique index if not exists cheques_unico_echeq
  on public.cheques(echeq_id)
  where echeq_id is not null and estado not in ('anulado', 'rechazado_interno');

-- ───────────────────────────────────────────────────────────── eventos

create table if not exists public.eventos (
  id          uuid primary key default gen_random_uuid(),
  cheque_id   uuid not null references public.cheques(id) on delete cascade,
  tipo        text not null check (tipo in ('creacion', 'transicion', 'edicion', 'comentario', 'sistema')),
  de          text,
  a           text,
  usuario_id  uuid references public.perfiles(id),
  nota        text,
  en          timestamptz not null default now()
);

create index if not exists eventos_cheque on public.eventos(cheque_id, en);

-- ───────────────────────────────────────────────────────────── adjuntos

create table if not exists public.adjuntos (
  id         uuid primary key default gen_random_uuid(),
  cheque_id  uuid not null references public.cheques(id) on delete cascade,
  ruta       text not null,
  nombre     text not null,
  tipo       text,
  tamano     bigint,
  subido_por uuid references public.perfiles(id) default auth.uid(),
  subido_en  timestamptz not null default now()
);

-- ──────────────────────────────────────────── movimientos informados por el banco

create table if not exists public.banco_movimientos (
  id            uuid primary key default gen_random_uuid(),
  origen        text not null default 'bind',
  externo_id    text,
  echeq_id      text,
  numero_cheque text,
  cuit_librador text,
  nombre        text,
  monto         numeric(18,2),
  moneda        text default 'ARS',
  fecha_pago    date,
  fecha_mov     date,
  estado_banco  text,
  crudo         jsonb,
  cheque_id     uuid references public.cheques(id) on delete set null,
  conciliado_en timestamptz,
  recibido_en   timestamptz not null default now(),
  unique (origen, externo_id)
);

create index if not exists banco_mov_sin_conciliar on public.banco_movimientos(conciliado_en) where conciliado_en is null;

-- ───────────────────────────────────── máquina de estados (espejo de estados.js)

create table if not exists public.transiciones (
  circuito circuito_cheque not null,
  desde    text not null,
  hasta    text not null,
  roles    rol_usuario[] not null,
  primary key (circuito, desde, hasta)
);

truncate public.transiciones;

insert into public.transiciones (circuito, desde, hasta, roles) values
-- comunes a los tres circuitos
('ingreso','borrador','solicitado','{productor,backoffice,admin}'),
('ingreso','borrador','anulado','{productor,backoffice,admin}'),
('ingreso','solicitado','en_revision','{backoffice,admin}'),
('ingreso','solicitado','observado','{backoffice,admin}'),
('ingreso','solicitado','anulado','{productor,backoffice,admin}'),
('ingreso','observado','solicitado','{productor,backoffice,admin}'),
('ingreso','observado','anulado','{productor,backoffice,admin}'),
('ingreso','en_revision','aprobado_ingreso','{backoffice,admin}'),
('ingreso','en_revision','esperando_compliance','{backoffice,admin}'),
('ingreso','en_revision','observado','{backoffice,admin}'),
('ingreso','en_revision','rechazado_interno','{backoffice,admin}'),
('ingreso','esperando_compliance','aprobado_ingreso','{compliance,admin}'),
('ingreso','esperando_compliance','rechazado_interno','{compliance,admin}'),
('ingreso','aprobado_ingreso','recibido','{backoffice,admin}'),
('ingreso','aprobado_ingreso','rechazado_interno','{backoffice,admin}'),
('ingreso','recibido','depositado','{backoffice,admin}'),
('ingreso','recibido','endosado','{backoffice,admin}'),
('ingreso','depositado','acreditado','{backoffice,admin}'),
('ingreso','depositado','rechazado_banco','{backoffice,admin}'),
('ingreso','rechazado_banco','recibido','{backoffice,admin}'),

('egreso','borrador','solicitado','{productor,backoffice,admin}'),
('egreso','borrador','anulado','{productor,backoffice,admin}'),
('egreso','solicitado','en_revision','{backoffice,admin}'),
('egreso','solicitado','observado','{backoffice,admin}'),
('egreso','solicitado','anulado','{productor,backoffice,admin}'),
('egreso','observado','solicitado','{productor,backoffice,admin}'),
('egreso','observado','anulado','{productor,backoffice,admin}'),
('egreso','en_revision','aprobado_egreso','{backoffice,admin}'),
('egreso','en_revision','esperando_compliance','{backoffice,admin}'),
('egreso','en_revision','observado','{backoffice,admin}'),
('egreso','en_revision','rechazado_interno','{backoffice,admin}'),
('egreso','esperando_compliance','aprobado_egreso','{compliance,admin}'),
('egreso','esperando_compliance','rechazado_interno','{compliance,admin}'),
('egreso','aprobado_egreso','emitido','{backoffice,admin}'),
('egreso','aprobado_egreso','rechazado_interno','{backoffice,admin}'),
('egreso','emitido','entregado','{backoffice,admin}'),
('egreso','emitido','anulado','{backoffice,admin}'),
('egreso','entregado','debitado','{backoffice,admin}'),
('egreso','entregado','rechazado_banco','{backoffice,admin}'),

('endoso','borrador','solicitado','{productor,backoffice,admin}'),
('endoso','borrador','anulado','{productor,backoffice,admin}'),
('endoso','solicitado','en_revision','{backoffice,admin}'),
('endoso','solicitado','observado','{backoffice,admin}'),
('endoso','solicitado','anulado','{productor,backoffice,admin}'),
('endoso','observado','solicitado','{productor,backoffice,admin}'),
('endoso','observado','anulado','{productor,backoffice,admin}'),
('endoso','en_revision','aprobado_endoso','{backoffice,admin}'),
('endoso','en_revision','esperando_compliance','{backoffice,admin}'),
('endoso','en_revision','observado','{backoffice,admin}'),
('endoso','en_revision','rechazado_interno','{backoffice,admin}'),
('endoso','esperando_compliance','aprobado_endoso','{compliance,admin}'),
('endoso','esperando_compliance','rechazado_interno','{compliance,admin}'),
('endoso','aprobado_endoso','endosado','{backoffice,admin}'),
('endoso','aprobado_endoso','rechazado_interno','{backoffice,admin}'),
('endoso','endosado','transferido','{backoffice,admin}'),
('endoso','endosado','rechazado_banco','{backoffice,admin}');

-- ───────────────────────────────────── ¿este usuario puede ver este cheque?

create or replace function public.puede_ver_cheque(c public.cheques)
returns boolean language sql stable as $$
  select
    public.mi_rol() in ('admin', 'backoffice', 'compliance', 'lectura')
    or c.productor_id = auth.uid()
    or c.creado_por = auth.uid()
    or exists (
      select 1 from public.comitentes co
      where co.id = c.comitente_id and co.productor_id = auth.uid()
    );
$$;

-- ──────────────────────────── transición de estado (la única puerta de escritura)

create or replace function public.transicionar_cheque(
  p_cheque  uuid,
  p_destino text,
  p_motivo  text default null,
  p_campos  jsonb default '{}'::jsonb
) returns public.cheques
language plpgsql security definer set search_path = public as $$
declare
  c public.cheques;
  estado_previo text;
  permitido boolean;
  mi rol_usuario := public.mi_rol();
begin
  select * into c from public.cheques where id = p_cheque for update;
  if not found then
    raise exception 'Cheque inexistente' using errcode = 'PT404';
  end if;

  if not public.puede_ver_cheque(c) then
    raise exception 'Sin permiso sobre este cheque' using errcode = 'PT403';
  end if;

  select true into permitido
    from public.transiciones t
   where t.circuito = c.circuito
     and t.desde = c.estado
     and t.hasta = p_destino
     and mi = any(t.roles);

  if permitido is not true then
    raise exception 'No se puede pasar de % a % con el rol % (circuito %)',
      c.estado, p_destino, mi, c.circuito using errcode = 'PT409';
  end if;

  -- Motivo obligatorio en todo lo que no sea el camino feliz.
  if p_destino in ('observado','rechazado_interno','anulado','rechazado_banco')
     and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Hay que dejar el motivo' using errcode = 'PT422';
  end if;

  -- Guardado antes del update: el RETURNING pisa c con la fila nueva.
  estado_previo := c.estado;

  update public.cheques set
    estado               = p_destino,
    fecha_recepcion      = coalesce((p_campos->>'fecha_recepcion')::date, fecha_recepcion),
    fecha_deposito       = coalesce((p_campos->>'fecha_deposito')::date, fecha_deposito),
    fecha_acreditacion   = coalesce((p_campos->>'fecha_acreditacion')::date, fecha_acreditacion),
    fecha_entrega        = coalesce((p_campos->>'fecha_entrega')::date, fecha_entrega),
    fecha_endoso         = coalesce((p_campos->>'fecha_endoso')::date, fecha_endoso),
    fecha_emision        = coalesce((p_campos->>'fecha_emision')::date, fecha_emision),
    fecha_pago           = coalesce((p_campos->>'fecha_pago')::date, fecha_pago),
    cuenta_deposito      = coalesce(p_campos->>'cuenta_deposito', cuenta_deposito),
    numero_cheque        = coalesce(p_campos->>'numero_cheque', numero_cheque),
    echeq_id             = coalesce(p_campos->>'echeq_id', echeq_id),
    endosatario_nombre   = coalesce(p_campos->>'endosatario_nombre', endosatario_nombre),
    endosatario_cuit     = coalesce(p_campos->>'endosatario_cuit', endosatario_cuit),
    motivo_rechazo_banco = coalesce(p_campos->>'motivo_rechazo_banco', motivo_rechazo_banco),
    actualizado_en       = now()
  where id = p_cheque
  returning * into c;

  insert into public.eventos (cheque_id, tipo, de, a, usuario_id, nota)
  values (p_cheque, 'transicion', estado_previo, p_destino, auth.uid(), nullif(btrim(coalesce(p_motivo,'')), ''));

  return c;
end $$;

revoke all on function public.transicionar_cheque(uuid, text, text, jsonb) from public;
grant execute on function public.transicionar_cheque(uuid, text, text, jsonb) to authenticated;

-- Evento automático al crear.
create or replace function public.evento_creacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.eventos (cheque_id, tipo, a, usuario_id)
  values (new.id, 'creacion', new.estado, auth.uid());
  return new;
end $$;

drop trigger if exists cheques_evento_creacion on public.cheques;
create trigger cheques_evento_creacion after insert on public.cheques
  for each row execute function public.evento_creacion();

create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;

drop trigger if exists cheques_tocar on public.cheques;
create trigger cheques_tocar before update on public.cheques
  for each row execute function public.tocar_actualizado();

-- ═══════════════════════════════════════════════════════════════ RLS

alter table public.perfiles          enable row level security;
alter table public.comitentes        enable row level security;
alter table public.cheques           enable row level security;
alter table public.eventos           enable row level security;
alter table public.adjuntos          enable row level security;
alter table public.banco_movimientos enable row level security;
alter table public.transiciones      enable row level security;

-- perfiles ---------------------------------------------------------------
drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles
  for select to authenticated using (public.dominio_permitido());

drop policy if exists perfiles_crear_el_mio on public.perfiles;
create policy perfiles_crear_el_mio on public.perfiles
  for insert to authenticated
  with check (id = auth.uid() and public.dominio_permitido() and rol = 'lectura');

drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles
  for update to authenticated
  using (public.mi_rol() = 'admin')
  with check (public.mi_rol() = 'admin');

-- comitentes -------------------------------------------------------------
drop policy if exists comitentes_leer on public.comitentes;
create policy comitentes_leer on public.comitentes
  for select to authenticated using (
    public.dominio_permitido() and (
      public.mi_rol() in ('admin','backoffice','compliance','lectura')
      or productor_id = auth.uid()
    ));

drop policy if exists comitentes_escribir on public.comitentes;
create policy comitentes_escribir on public.comitentes
  for all to authenticated
  using (public.mi_rol() in ('admin','backoffice'))
  with check (public.mi_rol() in ('admin','backoffice'));

-- cheques ----------------------------------------------------------------
drop policy if exists cheques_leer on public.cheques;
create policy cheques_leer on public.cheques
  for select to authenticated
  using (public.dominio_permitido() and public.puede_ver_cheque(cheques));

drop policy if exists cheques_crear on public.cheques;
create policy cheques_crear on public.cheques
  for insert to authenticated
  with check (
    public.dominio_permitido()
    and public.mi_rol() in ('admin','backoffice','compliance','productor')
    and estado in ('borrador','solicitado')
    and (
      public.mi_rol() <> 'productor'
      or exists (select 1 from public.comitentes co
                 where co.id = comitente_id and co.productor_id = auth.uid())
    ));

-- El productor solo edita lo suyo mientras está en borrador u observado.
-- El cambio de estado NUNCA pasa por acá: va por transicionar_cheque().
drop policy if exists cheques_editar on public.cheques;
create policy cheques_editar on public.cheques
  for update to authenticated
  using (
    public.dominio_permitido() and (
      public.mi_rol() in ('admin','backoffice')
      or (public.mi_rol() = 'productor'
          and estado in ('borrador','observado')
          and (productor_id = auth.uid() or creado_por = auth.uid()))
    ))
  with check (public.dominio_permitido());

drop policy if exists cheques_borrar on public.cheques;
create policy cheques_borrar on public.cheques
  for delete to authenticated using (public.mi_rol() = 'admin');

-- eventos ----------------------------------------------------------------
drop policy if exists eventos_leer on public.eventos;
create policy eventos_leer on public.eventos
  for select to authenticated using (
    public.dominio_permitido()
    and exists (select 1 from public.cheques c
                where c.id = cheque_id and public.puede_ver_cheque(c)));

drop policy if exists eventos_comentar on public.eventos;
create policy eventos_comentar on public.eventos
  for insert to authenticated with check (
    public.dominio_permitido()
    and tipo = 'comentario'
    and usuario_id is not distinct from auth.uid()
    and exists (select 1 from public.cheques c
                where c.id = cheque_id and public.puede_ver_cheque(c)));

-- La trazabilidad no se edita ni se borra. Ni admin.
-- (sin políticas de update/delete = nadie puede)

-- adjuntos ---------------------------------------------------------------
drop policy if exists adjuntos_leer on public.adjuntos;
create policy adjuntos_leer on public.adjuntos
  for select to authenticated using (
    exists (select 1 from public.cheques c where c.id = cheque_id and public.puede_ver_cheque(c)));

drop policy if exists adjuntos_subir on public.adjuntos;
create policy adjuntos_subir on public.adjuntos
  for insert to authenticated with check (
    exists (select 1 from public.cheques c where c.id = cheque_id and public.puede_ver_cheque(c)));

-- movimientos del banco --------------------------------------------------
drop policy if exists banco_leer on public.banco_movimientos;
create policy banco_leer on public.banco_movimientos
  for select to authenticated using (public.opera_backoffice());

drop policy if exists banco_escribir on public.banco_movimientos;
create policy banco_escribir on public.banco_movimientos
  for all to authenticated
  using (public.mi_rol() in ('admin','backoffice'))
  with check (public.mi_rol() in ('admin','backoffice'));

-- transiciones (catálogo de solo lectura) --------------------------------
drop policy if exists transiciones_leer on public.transiciones;
create policy transiciones_leer on public.transiciones
  for select to authenticated using (public.dominio_permitido());

-- ═══════════════════════════════════════════════════════════ realtime

do $$ begin
  alter publication supabase_realtime add table public.cheques;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.eventos;
exception when duplicate_object then null; end $$;

-- ═══════════════════════════════════════════════════════════ storage

insert into storage.buckets (id, name, public)
values ('cheques', 'cheques', false)
on conflict (id) do nothing;

drop policy if exists cheques_bucket_leer on storage.objects;
create policy cheques_bucket_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'cheques' and public.dominio_permitido());

drop policy if exists cheques_bucket_subir on storage.objects;
create policy cheques_bucket_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cheques' and public.dominio_permitido());

-- ═══════════════════════════════════════════════════════════ primer admin
--
-- Después de entrar por primera vez con Google, tu perfil queda en 'lectura'.
-- Corré esto UNA vez con tu mail para promoverte, y de ahí en más los roles
-- se manejan desde la app:
--
--   update public.perfiles set rol = 'admin' where email = 'TU_MAIL@equanimasecurities.com';
