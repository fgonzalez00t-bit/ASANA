-- Esquema inicial: espacios de trabajo, miembros, invitaciones, proyectos,
-- secciones, tareas (con subtareas) y comentarios. Todo protegido con RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  section_id uuid references public.sections (id) on delete set null,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  priority text check (priority in ('baja', 'media', 'alta')),
  completed boolean not null default false,
  completed_at timestamptz,
  position double precision not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index on public.workspace_members (user_id);
create index on public.projects (workspace_id);
create index on public.sections (project_id);
create index on public.tasks (project_id);
create index on public.tasks (assignee_id);
create index on public.tasks (parent_task_id);
create index on public.comments (task_id);

-- ---------------------------------------------------------------------------
-- Funciones auxiliares (security definer para evitar recursión en RLS)
-- ---------------------------------------------------------------------------

create or replace function public.workspace_role(ws uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select role from workspace_members
  where workspace_id = ws and user_id = auth.uid()
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid()
  )
$$;

create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.workspace_role(ws) in ('owner', 'admin'), false)
$$;

create or replace function public.project_workspace(p uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select workspace_id from projects where id = p
$$;

create or replace function public.task_workspace(tid uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select p.workspace_id from tasks t join projects p on p.id = t.project_id
  where t.id = tid
$$;

create or replace function public.shares_workspace(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from workspace_members a
    join workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Crea el perfil cuando alguien se registra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Quien crea un espacio queda como dueña.
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- Marca la fecha de completado.
create or replace function public.handle_task_completed()
returns trigger
language plpgsql
as $$
begin
  if new.completed and not coalesce(old.completed, false) then
    new.completed_at := now();
  elsif not new.completed then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger on_task_completed
  before insert or update of completed on public.tasks
  for each row execute function public.handle_task_completed();

-- ---------------------------------------------------------------------------
-- Invitaciones
-- ---------------------------------------------------------------------------

-- Datos públicos mínimos de una invitación, para mostrar "Te invitaron a X".
create or replace function public.invitation_info(invite_token uuid)
returns table (workspace_name text, email text, accepted boolean)
language sql stable security definer set search_path = public
as $$
  select w.name, i.email, i.accepted_at is not null
  from invitations i join workspaces w on w.id = i.workspace_id
  where i.token = invite_token
$$;

-- La persona invitada (con sesión iniciada y el mismo email) acepta.
create or replace function public.accept_invitation(invite_token uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  inv invitations%rowtype;
  my_email text;
begin
  select * into inv from invitations where token = invite_token;
  if not found then
    raise exception 'Invitación no encontrada';
  end if;

  select email into my_email from profiles where id = auth.uid();
  if my_email is null or lower(my_email) <> lower(inv.email) then
    raise exception 'Esta invitación es para %', inv.email;
  end if;

  insert into workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do nothing;

  update invitations set accepted_at = coalesce(accepted_at, now()) where id = inv.id;
  return inv.workspace_id;
end;
$$;

grant execute on function public.invitation_info(uuid) to anon, authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.sections enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;

-- Perfiles: me veo a mí y a quienes comparten un espacio conmigo.
create policy "ver perfiles" on public.profiles for select
  using (id = auth.uid() or public.shares_workspace(id));
create policy "editar mi perfil" on public.profiles for update
  using (id = auth.uid());

-- Espacios
create policy "ver espacios" on public.workspaces for select
  using (owner_id = auth.uid() or public.is_workspace_member(id));
create policy "crear espacio" on public.workspaces for insert
  with check (owner_id = auth.uid());
create policy "editar espacio" on public.workspaces for update
  using (public.workspace_role(id) = 'owner');
create policy "borrar espacio" on public.workspaces for delete
  using (public.workspace_role(id) = 'owner');

-- Miembros: las admins gestionan; nadie toca el rol de la dueña; una
-- miembro puede salir sola.
create policy "ver miembros" on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));
create policy "cambiar rol" on public.workspace_members for update
  using (public.is_workspace_admin(workspace_id) and role <> 'owner')
  with check (role <> 'owner');
create policy "quitar miembro" on public.workspace_members for delete
  using (role <> 'owner' and (public.is_workspace_admin(workspace_id) or user_id = auth.uid()));

-- Invitaciones: solo admins.
create policy "ver invitaciones" on public.invitations for select
  using (public.is_workspace_admin(workspace_id));
create policy "crear invitacion" on public.invitations for insert
  with check (public.is_workspace_admin(workspace_id) and invited_by = auth.uid());
create policy "borrar invitacion" on public.invitations for delete
  using (public.is_workspace_admin(workspace_id));

-- Proyectos y secciones: todas las miembros ven; las admins los gestionan.
create policy "ver proyectos" on public.projects for select
  using (public.is_workspace_member(workspace_id));
create policy "crear proyecto" on public.projects for insert
  with check (public.is_workspace_admin(workspace_id));
create policy "editar proyecto" on public.projects for update
  using (public.is_workspace_admin(workspace_id));
create policy "borrar proyecto" on public.projects for delete
  using (public.is_workspace_admin(workspace_id));

create policy "ver secciones" on public.sections for select
  using (public.is_workspace_member(public.project_workspace(project_id)));
create policy "crear seccion" on public.sections for insert
  with check (public.is_workspace_admin(public.project_workspace(project_id)));
create policy "editar seccion" on public.sections for update
  using (public.is_workspace_admin(public.project_workspace(project_id)));
create policy "borrar seccion" on public.sections for delete
  using (public.is_workspace_admin(public.project_workspace(project_id)));

-- Tareas: todas ven y crean; editan admins, la responsable o quien la creó.
create policy "ver tareas" on public.tasks for select
  using (public.is_workspace_member(public.project_workspace(project_id)));
create policy "crear tarea" on public.tasks for insert
  with check (
    public.is_workspace_member(public.project_workspace(project_id))
    and created_by = auth.uid()
  );
create policy "editar tarea" on public.tasks for update
  using (
    public.is_workspace_admin(public.project_workspace(project_id))
    or assignee_id = auth.uid()
    or created_by = auth.uid()
  );
create policy "borrar tarea" on public.tasks for delete
  using (
    public.is_workspace_admin(public.project_workspace(project_id))
    or created_by = auth.uid()
  );

-- Comentarios
create policy "ver comentarios" on public.comments for select
  using (public.is_workspace_member(public.task_workspace(task_id)));
create policy "comentar" on public.comments for insert
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(public.task_workspace(task_id))
  );
create policy "borrar mi comentario" on public.comments for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Tiempo real para tareas y secciones
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.tasks, public.sections;
