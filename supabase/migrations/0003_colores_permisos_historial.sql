-- Colores en tareas, colaboradoras que solo ven lo suyo e historial de cambios.

-- ---------------------------------------------------------------------------
-- Color de la tarea (opcional; si no tiene, se usa el del proyecto)
-- ---------------------------------------------------------------------------

alter table public.tasks add column if not exists color text;

-- ---------------------------------------------------------------------------
-- Quién ve cada tarea: las administradoras ven todo; una miembro ve las que
-- tiene asignadas, las que creó y las subtareas de esas.
-- ---------------------------------------------------------------------------

create or replace function public.can_see_task(tid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    left join tasks parent on parent.id = t.parent_task_id
    where t.id = tid
      and (
        public.is_workspace_admin(p.workspace_id)
        or (
          public.is_workspace_member(p.workspace_id)
          and (
            t.assignee_id = auth.uid()
            or t.created_by = auth.uid()
            or parent.assignee_id = auth.uid()
            or parent.created_by = auth.uid()
          )
        )
      )
  )
$$;

drop policy if exists "ver tareas" on public.tasks;
create policy "ver tareas" on public.tasks for select
  using (public.can_see_task(id));

-- Quien ve una tarea puede trabajarla (una miembro solo ve las suyas).
drop policy if exists "editar tarea" on public.tasks;
create policy "editar tarea" on public.tasks for update
  using (public.can_see_task(id));

-- Una miembro ve solo los proyectos donde tiene alguna tarea.
create or replace function public.can_see_project(pid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_workspace_admin(p.workspace_id)
    or (
      public.is_workspace_member(p.workspace_id)
      and exists (
        select 1 from tasks t
        where t.project_id = p.id
          and (t.assignee_id = auth.uid() or t.created_by = auth.uid())
      )
    )
  from projects p where p.id = pid
$$;

drop policy if exists "ver proyectos" on public.projects;
create policy "ver proyectos" on public.projects for select
  using (coalesce(public.can_see_project(id), false));

-- Solo las administradoras asignan tareas a otras personas. Una miembro puede
-- tomarla para sí o dejarla sin asignar.
create or replace function public.check_task_assignment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.assignee_id is not null
     and new.assignee_id <> coalesce(auth.uid(), new.assignee_id)
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not public.is_workspace_admin(public.project_workspace(new.project_id)) then
    raise exception 'Solo una administradora puede asignar tareas a otras personas';
  end if;
  return new;
end;
$$;

drop trigger if exists on_task_assignment on public.tasks;
create trigger on_task_assignment
  before insert or update of assignee_id on public.tasks
  for each row execute function public.check_task_assignment();

-- Comentarios y adjuntos siguen la visibilidad de su tarea.
drop policy if exists "ver comentarios" on public.comments;
create policy "ver comentarios" on public.comments for select
  using (public.can_see_task(task_id));
drop policy if exists "comentar" on public.comments;
create policy "comentar" on public.comments for insert
  with check (user_id = auth.uid() and public.can_see_task(task_id));

drop policy if exists "ver adjuntos" on public.attachments;
create policy "ver adjuntos" on public.attachments for select
  using (public.can_see_task(task_id));
drop policy if exists "subir adjunto" on public.attachments;
create policy "subir adjunto" on public.attachments for insert
  with check (uploaded_by = auth.uid() and public.can_see_task(task_id));

-- El segundo tramo de la ruta del archivo es la tarea.
create or replace function public.storage_path_task(object_name text)
returns uuid
language sql immutable
as $$
  select case
    when split_part(object_name, '/', 2) ~ '^[0-9a-f-]{36}$'
    then split_part(object_name, '/', 2)::uuid
  end
$$;

drop policy if exists "ver archivos del espacio" on storage.objects;
create policy "ver archivos del espacio" on storage.objects for select
  using (bucket_id = 'adjuntos' and public.can_see_task(public.storage_path_task(name)));
drop policy if exists "subir archivos al espacio" on storage.objects;
create policy "subir archivos al espacio" on storage.objects for insert
  with check (
    bucket_id = 'adjuntos'
    and public.is_workspace_member(public.storage_path_workspace(name))
    and public.can_see_task(public.storage_path_task(name))
  );

-- ---------------------------------------------------------------------------
-- Historial: cada cambio importante de una tarea queda registrado.
-- ---------------------------------------------------------------------------

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_task_id_idx on public.task_activity (task_id);

alter table public.task_activity enable row level security;

drop policy if exists "ver historial" on public.task_activity;
create policy "ver historial" on public.task_activity for select
  using (public.can_see_task(task_id));

create or replace function public.log_task_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into task_activity (task_id, actor_id, action, new_value) values (new.id, actor, 'creada', new.title);
    if new.assignee_id is not null then
      insert into task_activity (task_id, actor_id, action, new_value) values (new.id, actor, 'responsable', new.assignee_id::text);
    end if;
    return new;
  end if;

  if new.title is distinct from old.title then
    insert into task_activity (task_id, actor_id, action, old_value, new_value) values (new.id, actor, 'titulo', old.title, new.title);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into task_activity (task_id, actor_id, action, old_value, new_value) values (new.id, actor, 'responsable', old.assignee_id::text, new.assignee_id::text);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into task_activity (task_id, actor_id, action, old_value, new_value) values (new.id, actor, 'fecha', old.due_date::text, new.due_date::text);
  end if;
  if new.completed is distinct from old.completed then
    insert into task_activity (task_id, actor_id, action) values (new.id, actor, case when new.completed then 'completada' else 'reabierta' end);
  end if;
  if new.priority is distinct from old.priority then
    insert into task_activity (task_id, actor_id, action, old_value, new_value) values (new.id, actor, 'prioridad', old.priority, new.priority);
  end if;
  if new.description is distinct from old.description then
    insert into task_activity (task_id, actor_id, action) values (new.id, actor, 'descripcion');
  end if;
  if new.section_id is distinct from old.section_id then
    insert into task_activity (task_id, actor_id, action, old_value, new_value)
    values (new.id, actor, 'seccion',
      (select name from sections where id = old.section_id),
      (select name from sections where id = new.section_id));
  end if;
  if new.color is distinct from old.color then
    insert into task_activity (task_id, actor_id, action, new_value) values (new.id, actor, 'color', new.color);
  end if;
  return new;
end;
$$;

drop trigger if exists on_task_activity on public.tasks;
create trigger on_task_activity
  after insert or update on public.tasks
  for each row execute function public.log_task_activity();
