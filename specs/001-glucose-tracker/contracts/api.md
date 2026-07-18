# API Contracts: GlucoReg

Base URL: `https://glucoreg.<your-worker>.workers.dev`

## Autenticación

Todas las rutas protegidas requieren header:
```
Authorization: Bearer <token>
```

El token JWT contiene: `{ sub: userId, username: string, iat, exp }`
Expiración: 24 horas.

---

## POST /auth/register

Registra un nuevo usuario.

**Request Body:**
```json
{
  "username": "marco",
  "password": "secreta123"
}
```

**Response 201:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "username": "marco" }
}
```

**Errors:**
- `400` — username/password inválidos
- `409` — username ya registrado

---

## POST /auth/login

Inicia sesión con credenciales existentes.

**Request Body:**
```json
{
  "username": "marco",
  "password": "secreta123"
}
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "username": "marco" }
}
```

**Errors:**
- `400` — credenciales inválidas
- `401` — username o password incorrectos

---

## GET /readings

Lista lecturas del usuario autenticado.

**Query Parameters** (opcionales):
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| from | ISO date | — | Fecha inicio (incluyente) |
| to | ISO date | — | Fecha fin (incluyente) |
| limit | int | 50 | Máx resultados (1-100) |
| offset | int | 0 | Paginación |

**Response 200:**
```json
{
  "readings": [
    {
      "id": 1,
      "value": 95,
      "recorded_at": "2026-07-12T08:30:00.000Z",
      "created_at": "2026-07-12T08:30:01.000Z"
    }
  ],
  "total": 1
}
```

---

## POST /readings

Crea una nueva lectura de glucosa.

**Request Body:**
```json
{
  "value": 95,
  "recorded_at": "2026-07-12T08:30:00.000Z"
}
```
`recorded_at` es opcional — si no se envía, usa la fecha/hora actual.

**Response 201:**
```json
{
  "id": 1,
  "value": 95,
  "recorded_at": "2026-07-12T08:30:00.000Z",
  "created_at": "2026-07-12T08:30:01.000Z"
}
```

**Errors:**
- `400` — value inválido (no numérico, <= 0)
- `401` — no autenticado

---

## DELETE /readings/:id

Elimina una lectura propia.

**Response 200:**
```json
{
  "message": "Reading deleted"
}
```

**Errors:**
- `401` — no autenticado
- `404` — lectura no encontrada (o no pertenece al usuario)
