-- Adjuntos en tareas: fotos y archivos guardados en Supabase Storage.
-- Los archivos van en el bucket privado "adjuntos" con la ruta
-- <workspace_id>/<task_id>/<archivo>, y solo las miembros del espacio
-- pueden verlos.

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  file_name text not null,
  path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index on public.attachments (task_id);

alter table public.attachments enable row level security;

create policy "ver adjuntos" on public.attachments for select
  using (public.is_workspace_member(public.task_workspace(task_id)));
create policy "subir adjunto" on public.attachments for insert
  with check (
    uploaded_by = auth.uid()
    and public.is_workspace_member(public.task_workspace(task_id))
  );
create policy "borrar adjunto" on public.attachments for delete
  using (
    uploaded_by = auth.uid()
    or public.is_workspace_admin(public.task_workspace(task_id))
  );

-- Bucket privado, hasta 10 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos', 'adjuntos', false, 10485760)
on conflict (id) do nothing;

-- El primer tramo de la ruta es el espacio de trabajo.
create or replace function public.storage_path_workspace(object_name text)
returns uuid
language sql immutable
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f-]{36}$'
    then split_part(object_name, '/', 1)::uuid
  end
$$;

create policy "ver archivos del espacio" on storage.objects for select
  using (
    bucket_id = 'adjuntos'
    and public.is_workspace_member(public.storage_path_workspace(name))
  );
create policy "subir archivos al espacio" on storage.objects for insert
  with check (
    bucket_id = 'adjuntos'
    and public.is_workspace_member(public.storage_path_workspace(name))
  );
create policy "borrar archivos propios" on storage.objects for delete
  using (
    bucket_id = 'adjuntos'
    and (
      owner_id = auth.uid()::text
      or public.is_workspace_admin(public.storage_path_workspace(name))
    )
  );
