# Research: GlucoReg

## Decisiones técnicas

### Hono + Cloudflare Workers
- **Decisión**: Hono v4 sobre Cloudflare Workers
- **Razón**: Framework minimalista, específico para Workers, soporte
  nativo de D1, rendimiento edge
- **Alternativas**: Itty Router (más limitado), Express (no corre en Workers)

### D1 (SQLite serverless)
- **Decisión**: Cloudflare D1 como base de datos
- **Razón**: Sin servidor que administrar, integración nativa con Workers,
  gratis en el tier free
- **Alternativas**: Neon (Postgres serverless, más complejo), KV (solo
  clave-valor, no soporta queries relacionales)

### Autenticación con JWT
- **Decisión**: JWT via `@hono/jwt` + password hashing con Web Crypto API
- **Razón**: JWT es stateless (no requiere sesión en DB), `@hono/jwt` es
  el middleware oficial de Hono
- **Alternativas**: Session cookies (requiere almacenamiento), OAuth
  (sobreingeniería para uso personal/familiar)

### Hashing con Web Crypto API
- **Decisión**: `crypto.subtle` (PBKDF2 + SHA-256) en lugar de bcryptjs
- **Razón**: Web Crypto viene con el runtime de Workers, cero
  dependencias, nativo y rápido
- **Alternativas**: bcryptjs (dependencia externa, más pesada)

### Testing con Vitest + Miniflare
- **Decisión**: Vitest con `@cloudflare/vitest-pool-workers`
- **Razón**: Miniflare emula el runtime de Workers localmente, Vitest
  es rápido y moderno
- **Alternativas**: Jest (más lento, configuración más verbosa)
