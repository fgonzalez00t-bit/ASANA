# Tareas

Herramienta de organización de tareas estilo Asana: espacios de trabajo, proyectos con secciones, tareas con subtareas, vista lista y tablero, "Mis tareas", comentarios e invitaciones con roles.

Hecha con Next.js, Tailwind y Supabase (base de datos, login, permisos y tiempo real).

## Puesta en marcha

### 1. Supabase (base de datos y login)

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo (plan gratuito).
2. En **SQL Editor**, pega y ejecuta, en orden y una sola vez cada uno, los archivos de `supabase/migrations/` (`0001_esquema_inicial.sql`, `0002_adjuntos.sql`, ...).
3. En **Authentication > URL Configuration**, pon en **Site URL** la dirección donde vivirá la app (por ejemplo `https://tareas.vercel.app`) y agrega `https://tareas.vercel.app/**` en **Redirect URLs**.
4. En **Project Settings > API** copia la **Project URL** y la clave **anon public**.

### 2. Vercel (publicar la app)

1. Crea una cuenta en [vercel.com](https://vercel.com) con tu usuario de GitHub.
2. **Add New > Project** y elige este repositorio.
3. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = la Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave anon
4. **Deploy**. Cada cambio que se suba a `main` se publica solo.

### 3. Primer uso

1. Abre la app, crea tu cuenta y confirma el email.
2. Crea tu espacio de trabajo y tu primer proyecto con el **+** del menú.
3. Para sumar a alguien: **Equipo > Invitar**, escribe su email y envíale el enlace que se copia.

## Roles

| Rol | Puede |
| --- | --- |
| Dueña | Todo, incluido renombrar el espacio |
| Administradora | Ver todas las tareas (Panel del equipo), asignarlas, crear y borrar proyectos y secciones, invitar y quitar miembros |
| Miembro | Ver solo los proyectos donde participa y sus tareas, pasarle tareas a otras participantes con un comentario, adjuntar archivos |

Los permisos los aplica la base de datos (Row Level Security), no solo la interfaz.

## Desarrollo local

```bash
cp .env.example .env.local   # completa con los datos de Supabase
npm install
npm run dev                  # http://localhost:3000
```
