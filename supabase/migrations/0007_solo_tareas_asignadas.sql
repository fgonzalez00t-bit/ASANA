-- Dentro de un proyecto, cada colaboradora ve solo las tareas que tiene
-- asignadas (y sus subtareas). La dueña y las administradoras ven todas.
-- Una colaboradora puede pasarle su tarea a otra participante; después de
-- pasarla deja de verla.

create or replace function public.is_assigned_to_me(tid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from tasks where id = tid and assignee_id = auth.uid())
$$;

create or replace function public.can_see_task(tid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from tasks t
    where t.id = tid
      and (
        public.is_workspace_admin(public.project_workspace(t.project_id))
        or (
          public.can_access_project(t.project_id)
          and (t.assignee_id = auth.uid() or (t.parent_task_id is not null and public.is_assigned_to_me(t.parent_task_id)))
        )
      )
  )
$$;

drop policy if exists "ver tareas" on public.tasks;
create policy "ver tareas" on public.tasks for select
  using (
    public.is_workspace_admin(public.project_workspace(project_id))
    or (
      public.can_access_project(project_id)
      and (assignee_id = auth.uid() or (parent_task_id is not null and public.is_assigned_to_me(parent_task_id)))
    )
  );

drop policy if exists "editar tarea" on public.tasks;
create policy "editar tarea" on public.tasks for update
  using (
    public.is_workspace_admin(public.project_workspace(project_id))
    or (
      public.can_access_project(project_id)
      and (assignee_id = auth.uid() or (parent_task_id is not null and public.is_assigned_to_me(parent_task_id)))
    )
  )
  -- Después del cambio la tarea puede quedar de otra persona (al pasarla).
  with check (public.can_access_project(project_id));

-- Pasar una tarea a otra persona, con un comentario opcional. Se hace en el
-- servidor porque quien la pasa deja de verla en el mismo momento.
create or replace function public.pass_task(task uuid, to_user uuid, note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t tasks%rowtype;
  ws uuid;
begin
  select * into t from tasks where id = task;
  if not found then
    raise exception 'Tarea no encontrada';
  end if;
  ws := public.project_workspace(t.project_id);
  if not (public.is_workspace_admin(ws) or (public.can_access_project(t.project_id) and t.assignee_id = auth.uid())) then
    raise exception 'Solo quien tiene la tarea asignada puede pasarla';
  end if;
  if to_user is not null
     and not exists (select 1 from project_members where project_id = t.project_id and user_id = to_user)
     and not exists (select 1 from workspace_members where workspace_id = ws and user_id = to_user and role in ('owner', 'admin')) then
    raise exception 'Esa persona no participa en este proyecto';
  end if;
  if coalesce(trim(note), '') <> '' then
    insert into comments (task_id, user_id, body) values (task, auth.uid(), trim(note));
  end if;
  update tasks set assignee_id = to_user where id = task;
end;
$$;

grant execute on function public.pass_task(uuid, uuid, text) to authenticated;
