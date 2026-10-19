-- Arreglo: al crear un proyecto o una tarea, la regla de "quién la ve" buscaba
-- la fila recién creada en la tabla y todavía no la encontraba, así que
-- Supabase rechazaba la creación. Ahora la regla mira los datos de la fila.

-- ¿La tarea indicada es mía (asignada o creada por mí)?
create or replace function public.is_my_task(tid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from tasks
    where id = tid and (assignee_id = auth.uid() or created_by = auth.uid())
  )
$$;

drop policy if exists "ver tareas" on public.tasks;
create policy "ver tareas" on public.tasks for select
  using (
    public.is_workspace_admin(public.project_workspace(project_id))
    or (
      public.is_workspace_member(public.project_workspace(project_id))
      and (
        assignee_id = auth.uid()
        or created_by = auth.uid()
        or (parent_task_id is not null and public.is_my_task(parent_task_id))
      )
    )
  );

drop policy if exists "ver proyectos" on public.projects;
create policy "ver proyectos" on public.projects for select
  using (
    public.is_workspace_admin(workspace_id)
    or (
      public.is_workspace_member(workspace_id)
      and exists (
        select 1 from public.tasks t
        where t.project_id = projects.id
          and (t.assignee_id = auth.uid() or t.created_by = auth.uid())
      )
    )
  );
