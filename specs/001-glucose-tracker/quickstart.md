# Quickstart: GlucoReg

## Prerequisitos

- Node.js >= 18
- npm
- Cuenta de Cloudflare (gratis)

## Setup

```bash
# Clonar e instalar
cd /root/yura
npm install

# Login en Cloudflare
npx wrangler login

# Crear D1 database
npx wrangler d1 create glucoreg-db
# → copiar el binding output a wrangler.toml

# Ejecutar migración
npx wrangler d1 migrations apply glucoreg-db --remote

# Desarrollo local
npm run dev
```

## Validación rápida

```bash
# 1. Registrar usuario
curl -X POST http://localhost:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'
# → 201 { "token": "...", "user": { "id": 1, "username": "test" } }

# Guardar token
TOKEN="eyJ..."

# 2. Crear lectura
curl -X POST http://localhost:8787/readings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": 95}'
# → 201 { "id": 1, "value": 95, ... }

# 3. Listar lecturas
curl http://localhost:8787/readings \
  -H "Authorization: Bearer $TOKEN"
# → 200 { "readings": [...], "total": 1 }

# 4. Login
curl -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'
# → 200 { "token": "...", "user": { "id": 1, "username": "test" } }

# 5. Eliminar lectura
curl -X DELETE http://localhost:8787/readings/1 \
  -H "Authorization: Bearer $TOKEN"
# → 200 { "message": "Reading deleted" }
```

## Scripts npm

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor local con miniflare |
| `npm run deploy` | Publica a Cloudflare Workers |
| `npm run test` | Ejecuta tests con vitest |
| `npm run migrate` | Aplica migraciones D1 |
