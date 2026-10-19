-- Cada colaboradora ve solo a la dueña y a las administradoras, nunca a las
-- otras colaboradoras (ni en Equipo ni al elegir responsable).

drop policy if exists "ver miembros" on public.workspace_members;
create policy "ver miembros" on public.workspace_members for select
  using (
    user_id = auth.uid()
    or public.is_workspace_admin(workspace_id)
    or (role in ('owner', 'admin') and public.is_workspace_member(workspace_id))
  );

-- ¿Puedo ver el perfil de esta persona? Sí si soy yo, si soy administradora
-- de un espacio donde está, o si ella es administradora de un espacio mío.
create or replace function public.can_see_profile(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select other = auth.uid() or exists (
    select 1 from workspace_members mine
    join workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid() and theirs.user_id = other
      and (mine.role in ('owner', 'admin') or theirs.role in ('owner', 'admin'))
  )
$$;

drop policy if exists "ver perfiles" on public.profiles;
create policy "ver perfiles" on public.profiles for select
  using (public.can_see_profile(id));
