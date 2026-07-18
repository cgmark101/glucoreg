<!--
  Sync Impact Report:
  - Version change: 0.0.0 → 1.0.0
  - Initial constitution created from template
  - All placeholder tokens resolved
  - Templates reviewed: spec-template.md, plan-template.md, tasks-template.md — no changes needed
-->
# GlucoReg Constitution

## Core Principles

### I. Stack Definido
Tecnologías: Hono + Cloudflare Workers + D1. Cualquier adición al stack
requiere justificación y aprobación explícita. No se agregan dependencias
sin necesidad comprobada.

### II. Identidad Simple
El sistema usa un login mínimo (nombre de usuario + PIN o contraseña).
Sin OAuth, sin proveedores externos, sin magia. La identidad existe
únicamente para aislar datos entre usuarios.

### III. Datos Personales
Cada usuario autenticado ve y opera solo sobre sus propios registros de
glucosa. No hay datos compartidos ni visibilidad cruzada. El user ID se
obtiene del contexto de autenticación en cada request.

### IV. API REST
Todo el backend expone una interfaz REST con JSON. Convenciones:
- Recursos en plural (`/api/readings`)
- Errores con código y mensaje (`{ error: string, code: number }`)
- Status codes HTTP estándar
- Autenticación vía header `Authorization: Bearer <token>`

### V. Despliegue Nativo
El proyecto debe estar listo para `wrangler deploy` desde el día uno.
La configuración de Cloudflare (wrangler.toml, D1 bindings, env vars)
se versiona en el repo.

## Seguridad

- Contraseñas hasheadas con bcrypt o hash similar (nunca texto plano)
- Tokens JWT simples para sesión
- Validación y sanitización de toda entrada del usuario
- Las D1 queries usan parámetros vinculados (nunca interpolación de strings)

## Flujo de Trabajo

Este proyecto sigue spec-kit estrictamente:
1. Constitution — principios rectores (este archivo)
2. Spec — especificación detallada
3. Plan — plan de implementación
4. Tasks — tareas accionables
5. Implement — código
6. Converge — verificación y cierre

Cada fase se completa antes de pasar a la siguiente.

## Governance

Esta constitución es el documento rector del proyecto. Cualquier
modificación requiere actualizar la versión y documentar el cambio.
Las decisiones técnicas deben poder trazarse a un principio acá definido.

**Version**: 1.0.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-07-12
