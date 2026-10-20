-- La dueña elige quién participa en cada proyecto. Las participantes ven todo
-- el proyecto (todas sus tareas), tengan tareas asignadas o no.
-- Las tareas solo se pueden asignar a participantes del proyecto (o a la
-- dueña y las administradoras), también cuando asigna la dueña.

create or replace function public.can_see_task(tid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from tasks t where t.id = tid and public.can_access_project(t.project_id))
$$;

drop policy if exists "ver tareas" on public.tasks;
create policy "ver tareas" on public.tasks for select
  using (public.can_access_project(project_id));

drop policy if exists "editar tarea" on public.tasks;
create policy "editar tarea" on public.tasks for update
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

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
    raise exception 'Esa persona no participa en este proyecto. Sumala primero en Participantes.';
  end if;
  return new;
end;
$$;

-- Cualquier participante puede pasar una tarea del proyecto a otra participante.
create or replace function public.pass_task(task uuid, to_user uuid, note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t tasks%rowtype;
begin
  select * into t from tasks where id = task;
  if not found or not public.can_access_project(t.project_id) then
    raise exception 'Tarea no encontrada';
  end if;
  if coalesce(trim(note), '') <> '' then
    insert into comments (task_id, user_id, body) values (task, auth.uid(), trim(note));
  end if;
  -- El trigger de asignación verifica que la persona participe del proyecto.
  update tasks set assignee_id = to_user where id = task;
end;
$$;
