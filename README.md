# Backstage — SaaS de gestión de bandas musicales

Multi-tenant (un tenant = un proyecto/banda), con roles, repertorio, setlists
versionados por evento, integración con Google Calendar, reparto de ganancias
privado, checklist de equipo, modo público y auditoría.

## Stack

- **Next.js 15 (App Router)** + TypeScript
- **PostgreSQL** + **Prisma**
- **TailwindCSS**
- **TanStack Query** (con optimistic updates)
- Auth: **Clerk** o **Auth0** (invitaciones de integrantes)
- **googleapis** (Google Calendar OAuth2)
- **@react-pdf/renderer** (exportar setlists a PDF)
- **Upstash Ratelimit** (rate limiting en rutas de API, con Redis serverless)
- **Sentry** (manejo de errores)
- Deploy: Vercel (app) + Neon o Supabase (Postgres) + Docker Compose (dev local)

## Estructura de carpetas

```
band-manager/
├── prisma/
│   └── schema.prisma          # Modelo de datos completo (ver más abajo)
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── sign-in/
│   │   │   └── sign-up/
│   │   │
│   │   ├── (dashboard)/
│   │   │   └── [projectSlug]/          # Todo lo privado vive bajo el slug del proyecto
│   │   │       ├── dashboard/          # Métricas: ingresos, shows, canción más tocada, etc.
│   │   │       ├── repertorio/         # CRUD de canciones (tonalidad, duración, intensidad, idioma, popurrí)
│   │   │       ├── setlists/           # Plantillas reutilizables (cumbia, rock, latinos...)
│   │   │       ├── eventos/
│   │   │       │   └── [eventId]/      # Detalle de evento: setlist snapshot, payouts, checklist de equipo
│   │   │       ├── integrantes/        # Gestión de membresías e invitaciones
│   │   │       └── configuracion/      # Conexión con Google Calendar, slug público, etc.
│   │   │
│   │   ├── b/
│   │   │   └── [slug]/                 # Página pública de la banda (SSG/ISR, sin datos privados)
│   │   │
│   │   └── api/
│   │       ├── google/callback/        # OAuth callback de Google Calendar
│   │       └── webhooks/               # Webhooks externos (ej: Clerk, Resend)
│   │
│   ├── components/
│   │   ├── ui/                         # Componentes base (botón, input, modal, etc.)
│   │   └── dashboard/                  # Gráficos, cards de métricas (Recharts)
│   │
│   ├── lib/
│   │   ├── prisma.ts                   # Cliente de Prisma (singleton)
│   │   ├── auth.ts                     # Helpers de sesión
│   │   ├── permissions.ts              # Chequeo de rol (ADMIN / EDITOR / VIEWER) por proyecto
│   │   ├── google-calendar.ts          # Crear / eliminar eventos en Calendar
│   │   ├── audit-log.ts                # Helper logAudit(userId, projectId, action, entityId, metadata)
│   │   └── rate-limit.ts               # Configuración de Upstash Ratelimit
│   │
│   ├── server/
│   │   ├── actions/                    # Server Actions (mutaciones: crear evento, invitar, etc.)
│   │   └── services/                   # Lógica de negocio pura (ej: copiar setlist a evento)
│   │
│   └── types/                          # Tipos compartidos (DTOs, enums espejo del schema)
│
├── .env.example
├── docker-compose.yml                  # Postgres local para desarrollo
└── package.json
```

## Dónde vive cada feature que definimos

| Feature                                              | Dónde                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Roles y permisos                                     | `Membership` (schema) + `lib/permissions.ts`                                      |
| Invitaciones                                         | `server/actions/invite-member.ts` + Resend                                        |
| Repertorio con popurrí                               | `Song.parentSongId` (auto-relación)                                               |
| Setlists editables por evento sin tocar la plantilla | `EventSetlistSong` (copia independiente de `SetlistSong`)                         |
| Google Calendar (crear/borrar al confirmar/cancelar) | `lib/google-calendar.ts`, disparado desde `server/actions/update-event-status.ts` |
| Reparto de ganancias privado                         | `EventPayout` + filtro de rol en el query (nunca solo en frontend)                |
| Checklist de equipo                                  | `EquipmentItem` (label libre + boolean)                                           |
| Modo público                                         | `Project.isPublic` + `Project.slug` + ruta `app/b/[slug]` con ISR                 |
| Historial de repertorio tocado                       | Query agregada sobre `EventSetlistSong` (`GROUP BY songId`)                       |
| Exportar PDF                                         | Endpoint que arma el PDF con `@react-pdf/renderer` a partir de `EventSetlistSong` |
| Audit log                                            | `AuditLog` + helper `logAudit(...)` llamado en cada mutación relevante            |
| Optimistic updates                                   | TanStack Query `onMutate` en reordenar setlist / marcar checklist                 |
| Rate limiting                                        | Middleware con `lib/rate-limit.ts` en rutas de API sensibles                      |

## Próximos pasos sugeridos

1. `npx create-next-app@latest` con TypeScript + Tailwind + App Router
2. Copiar `prisma/schema.prisma` de este scaffold
3. `npx prisma migrate dev --name init`
4. Configurar Auth (Clerk es lo más rápido para arrancar)
5. Implementar `lib/permissions.ts` antes que nada — todo lo demás depende de esto
