-- Participantes por proyecto. La dueña elige quién participa en cada proyecto;
-- las participantes ven todas las tareas de ese proyecto y se las pueden pasar
-- entre ellas. Nadie ve proyectos ni personas de proyectos donde no está.
-- Las administradoras (y la dueña) siguen viendo todo.

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_id_idx on public.project_members (user_id);

alter table public.project_members enable row level security;

create or replace function public.is_project_member(pid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid())
$$;

-- ¿Puedo trabajar en este proyecto? (administradora o participante)
create or replace function public.can_access_project(pid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_workspace_admin(public.project_workspace(pid))
    or (public.is_workspace_member(public.project_workspace(pid)) and public.is_project_member(pid))
$$;

drop policy if exists "ver participantes" on public.project_members;
create policy "ver participantes" on public.project_members for select
  using (public.can_access_project(project_id));
drop policy if exists "sumar participante" on public.project_members;
create policy "sumar participante" on public.project_members for insert
  with check (
    public.is_workspace_admin(public.project_workspace(project_id))
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = public.project_workspace(project_id) and wm.user_id = project_members.user_id
    )
  );
drop policy if exists "quitar participante" on public.project_members;
create policy "quitar participante" on public.project_members for delete
  using (public.is_workspace_admin(public.project_workspace(project_id)));

-- Quienes ya tenían tareas en un proyecto quedan como participantes, para
-- que nadie pierda lo que ya veía.
insert into public.project_members (project_id, user_id)
select distinct t.project_id, u.user_id
from public.tasks t
join public.projects p on p.id = t.project_id
cross join lateral (values (t.assignee_id), (t.created_by)) as u (user_id)
join public.workspace_members wm on wm.workspace_id = p.workspace_id and wm.user_id = u.user_id
where u.user_id is not null and wm.role = 'member'
on conflict do nothing;

-- Proyectos
drop policy if exists "ver proyectos" on public.projects;
create policy "ver proyectos" on public.projects for select
  using (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_project_member(id))
  );

-- Secciones
drop policy if exists "ver secciones" on public.sections;
create policy "ver secciones" on public.sections for select
  using (public.can_access_project(project_id));

-- Tareas: las participantes ven y trabajan todas las tareas del proyecto.
create or replace function public.can_see_task(tid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from tasks t where t.id = tid and public.can_access_project(t.project_id))
$$;

drop policy if exists "ver tareas" on public.tasks;
create policy "ver tareas" on public.tasks for select
  using (public.can_access_project(project_id));
drop policy if exists "crear tarea" on public.tasks;
create policy "crear tarea" on public.tasks for insert
  with check (public.can_access_project(project_id) and created_by = auth.uid());
drop policy if exists "editar tarea" on public.tasks;
create policy "editar tarea" on public.tasks for update
  using (public.can_access_project(project_id));

-- Una tarea solo se puede asignar a una participante del proyecto o a una
-- administradora. Las participantes también pueden pasársela entre ellas.
create or replace function public.check_task_assignment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from project_members where project_id = new.project_id and user_id = new.assignee_id)
     and not exists (
       select 1 from workspace_members
       where workspace_id = public.project_workspace(new.project_id)
         and user_id = new.assignee_id and role in ('owner', 'admin')
     ) then
    if public.is_workspace_admin(public.project_workspace(new.project_id)) then
      -- Si la dueña asigna a alguien que no participaba, la suma al proyecto.
      insert into project_members (project_id, user_id, added_by)
      select new.project_id, new.assignee_id, auth.uid()
      where exists (
        select 1 from workspace_members
        where workspace_id = public.project_workspace(new.project_id) and user_id = new.assignee_id
      )
      on conflict do nothing;
    else
      raise exception 'Esa persona no participa en este proyecto';
    end if;
  end if;
  return new;
end;
$$;

-- Personas: cada una ve a la dueña, a las administradoras y a quienes
-- comparten algún proyecto con ella.
create or replace function public.can_see_profile(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select other = auth.uid()
    or exists (
      select 1 from workspace_members mine
      join workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid() and theirs.user_id = other
        and (mine.role in ('owner', 'admin') or theirs.role in ('owner', 'admin'))
    )
    or exists (
      select 1 from project_members a
      join project_members b on b.project_id = a.project_id
      where a.user_id = auth.uid() and b.user_id = other
    )
$$;

drop policy if exists "ver miembros" on public.workspace_members;
create policy "ver miembros" on public.workspace_members for select
  using (
    user_id = auth.uid()
    or public.is_workspace_admin(workspace_id)
    or (role in ('owner', 'admin') and public.is_workspace_member(workspace_id))
    or (public.is_workspace_member(workspace_id) and public.can_see_profile(user_id))
  );

-- Tiempo real para los cambios de participantes.
do $$ begin
  alter publication supabase_realtime add table public.project_members;
exception when duplicate_object then null;
end $$;
