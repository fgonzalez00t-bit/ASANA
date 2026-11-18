-- Etiquetas en los proyectos, para poder filtrar la lista de proyectos.
-- Cada proyecto guarda sus etiquetas como una lista de textos. Solo la dueña y
-- las administradoras las cambian (igual que el nombre y el color del
-- proyecto). Cada persona solo ve las etiquetas de los proyectos que ya ve.

alter table public.projects
  add column if not exists labels text[] not null default '{}';

create index if not exists projects_labels_idx on public.projects using gin (labels);
