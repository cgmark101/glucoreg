# GlucoReg 🩸

**Registro de glucosa y presión arterial** — app web + API que corre en Cloudflare Workers con D1.

Hecha para diabéticos, prediabéticos, hipoglucémicos, o cualquiera que quiera trackear su glucosa y presión sin depender de una app de celular llena de anuncios y que vende tus datos.

Producción: [glucoreg.yeguez.workers.dev](https://glucoreg.yeguez.workers.dev)

---

## Features

- **Glucosa** — registro con valor, contexto (ayunas/antes/después/acostarse), fecha/hora, filtros y paginación
- **Presión arterial** — sistólica, diastólica, pulso, mismo sistema de contextos y filtros
- **Dashboard** — métricas, promedios por contexto, clasificación AHA de presión, rachas, horas pico, evolución semanal
- **Admin** — panel con dashboard de plataforma, gestión de usuarios (editar rol/contacto, eliminar), broadcast WhatsApp
- **Importación CSV** — bulk desde archivo con normalización Unicode y timezone offset
- **WhatsApp** — notificaciones vía WAHA (WhatsApp API), resumen semanal vía cron
- **Auth** — JWT + refresh tokens, con auto-refresh en frontend
- **PWA** — service worker con cache, manifest, iconos, instalable en mobile
- **Mobile-first con desktop responsive** — se ve bien en celular, tablet y desktop

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Runtime | Cloudflare Workers |
| Framework | Hono |
| Database | D1 (SQLite) |
| Language | TypeScript |
| Frontend | HTML + CSS + JS vanilla |
| Auth | JWT (custom) + refresh tokens |
| Password hashing | PBKDF2 (Web Crypto API) |
| WhatsApp | WAHA |
| Scheduling | Cron Triggers (lunes 10:00 UTC) |
| Testing | Vitest |

---

## Estructura del proyecto

```
glucoreg/
├── public/                  # Frontend (assets estáticos)
│   ├── index.html           # Login / registro
│   ├── glucose.html         # CRUD glucosa
│   ├── pressure.html        # CRUD presión arterial
│   ├── dashboard.html       # Métricas y estadísticas
│   ├── admin.html           # Panel admin (3 secciones)
│   ├── import.html          # Importación CSV
│   ├── profile.html         # Configuración WhatsApp / email
│   ├── shared.js            # Auth, fetch wrapper, helpers, menú
│   ├── style.css            # Tema oscuro, responsive, estilos admin
│   ├── sw.js                # Service Worker (cache network-first)
│   ├── manifest.json        # PWA manifest
│   ├── favicon.svg          # Icono favicon
│   └── icon.svg             # Icono PWA 512x512
├── src/                     # Backend
│   ├── index.ts             # Entry point (Hono router)
│   ├── db/
│   │   └── client.ts        # D1 client helper
│   ├── lib/
│   │   ├── hash.ts          # PBKDF2 password hashing
│   │   ├── jwt.ts           # JWT + refresh tokens
│   │   └── waha.ts          # WhatsApp API wrapper
│   ├── middleware/
│   │   └── auth.ts          # JWT auth middleware
│   └── routes/
│       ├── auth.ts          # /auth/* (login, register, refresh, logout)
│       ├── readings.ts      # /readings/* (CRUD + bulk)
│       ├── blood_pressure.ts# /blood-pressure/*
│       ├── metrics.ts       # /metrics, /blood-pressure/metrics
│       ├── profile.ts       # /auth/profile
│       └── admin.ts         # /admin/users, /admin/broadcast
├── migrations/              # D1 migrations versionadas
│   ├── 0001_initial.sql
│   ├── 0002_add_context.sql
│   ├── 0003_add_blood_pressure.sql
│   ├── 0004_add_role.sql
│   ├── 0005_add_contact.sql
│   └── 0006_add_refresh_tokens.sql
├── specs/                   # Especificaciones originales
├── wrangler.toml            # Configuración Workers
├── package.json
└── tsconfig.json
```

---

## APIs

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Registro de usuario |
| POST | `/auth/login` | — | Inicio de sesión |
| POST | `/auth/refresh` | — | Refrescar token |
| POST | `/auth/logout` | JWT | Invalidar refresh token |
| GET | `/readings` | JWT | Listar lecturas (filtros + paginación) |
| POST | `/readings` | JWT | Crear lectura |
| DELETE | `/readings/:id` | JWT | Eliminar lectura |
| POST | `/readings/bulk` | JWT | Importar CSV |
| GET | `/blood-pressure` | JWT | Listar presiones |
| POST | `/blood-pressure` | JWT | Crear medición |
| DELETE | `/blood-pressure/:id` | JWT | Eliminar medición |
| POST | `/blood-pressure/bulk` | JWT | Importar CSV presiones |
| GET | `/metrics` | JWT | Métricas de glucosa |
| GET | `/blood-pressure/metrics` | JWT | Métricas de presión |
| GET | `/auth/profile` | JWT | Obtener perfil |
| PATCH | `/auth/profile` | JWT | Actualizar perfil |
| GET | `/admin/users` | JWT+admin | Listar usuarios |
| PATCH | `/admin/users/:id` | JWT+admin | Editar usuario |
| DELETE | `/admin/users/:id` | JWT+admin | Eliminar usuario |
| POST | `/admin/broadcast` | JWT+admin | Broadcast WhatsApp |

---

## Deploy

Prerequisitos:
- Node.js ≥ 22
- Una cuenta de Cloudflare con Workers y D1
- Un token de API de Cloudflare con permisos de Workers y D1

```bash
# clonar
git clone https://github.com/cgmark101/glucoreg.git
cd glucoreg

# instalar dependencias
npm install

# crear la base de datos D1
npx wrangler d1 create glucoreg-db

# ejecutar migrations
npm run migrate

# deploy
npm run deploy

# (opcional) correr en dev local
npm run dev
```

Después del deploy, configurá las variables de entorno en Cloudflare Dashboard o via wrangler:

```bash
npx wrangler secret put WAHA_API_KEY     # Solo si usás WhatsApp
```

Las credenciales de la DB (`DB`) y `WAHA_BASE_URL` se configuran en `wrangler.toml`.

### Migrations

```bash
# aplicar a producción
npm run migrate

# aplicar a local
npm run migrate:local
```

### Cron

El cron semanal se despliega automáticamente con el worker. Envía un resumen de la semana a los usuarios con WhatsApp configurado cada lunes 10:00 UTC.

---

## Desarrollo

```bash
npm run dev          # wrangler dev con hot-reload
npm run typecheck    # TypeScript check
npm run test         # Vitest
```

---

## Licencia

MIT
