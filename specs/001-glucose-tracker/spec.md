# Feature Specification: GlucoReg — Registro de Glucosa Personal

**Feature Branch**: `001-glucose-tracker`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "App con Hono para Cloudflare Worker con D1, registro de niveles de glucosa, identificación personal o login simple"

## User Scenarios & Testing

### User Story 1 - Registro de usuario (Priority: P1)

Un usuario nuevo crea su cuenta con nombre de usuario y contraseña,
y a partir de ese momento puede acceder al sistema.

**Why this priority**: Sin identidad no hay datos personales. Es la base.

**Independent Test**: Puede probarse creando un usuario y verificando
que se almacena correctamente con contraseña hasheada.

**Acceptance Scenarios**:

1. **Given** que soy un usuario nuevo, **When** envio usuario y contraseña,
   **Then** el sistema crea la cuenta y devuelve un token de sesión
2. **Given** que un usuario ya existe, **When** intento registrarme con
   el mismo nombre, **Then** el sistema rechaza con error 409

---

### User Story 2 - Inicio de sesión (Priority: P1)

Un usuario registrado inicia sesión con su nombre de usuario y contraseña,
y recibe un token para autenticar requests subsiguientes.

**Why this priority**: Sin login no se puede operar.

**Independent Test**: Login exitoso devuelve token; login fallido
devuelve error 401.

**Acceptance Scenarios**:

1. **Given** que estoy registrado con usuario "marco" y contraseña "1234",
   **When** envio credenciales correctas, **Then** recibo un token JWT
2. **Given** que envio contraseña incorrecta, **When** intento login,
   **Then** el sistema devuelve error 401

---

### User Story 3 - Registrar lectura de glucosa (Priority: P1)

Un usuario autenticado registra un nuevo valor de glucosa con fecha/hora
opcional (si no se provee, usa la actual).

**Why this priority**: Es la funcionalidad central de la app.

**Independent Test**: Usuario autenticado envía lectura y esta se
persiste asociada a su identidad.

**Acceptance Scenarios**:

1. **Given** que estoy autenticado, **When** envio un valor de glucosa,
   **Then** el sistema lo guarda y devuelve el registro creado con ID
2. **Given** que no estoy autenticado, **When** intento registrar,
   **Then** el sistema devuelve error 401
3. **Given** que envio un valor inválido (negativo, no numérico),
   **When** intento registrar, **Then** el sistema devuelve error 400

---

### User Story 4 - Consultar lecturas (Priority: P2)

Un usuario autenticado consulta sus lecturas de glucosa, con opción
de filtrar por fecha (desde/hasta) y paginación.

**Why this priority**: Ver los datos registrados es casi tan importante
como registrarlos.

**Independent Test**: Usuario obtiene lista de sus lecturas; no ve
lecturas de otros usuarios.

**Acceptance Scenarios**:

1. **Given** que tengo lecturas registradas, **When** consulto mis
   lecturas, **Then** el sistema devuelve la lista ordenada por fecha
2. **Given** que consulto con filtro de fechas, **When** especifico
   desde/hasta, **Then** el sistema devuelve solo las lecturas en ese rango
3. **Given** que consulto las lecturas de otro usuario, **When** intento
   acceder, **Then** el sistema devuelve solo mis datos

---

### User Story 5 - Eliminar lectura (Priority: P3)

Un usuario autenticado elimina una de sus lecturas de glucosa.

**Why this priority**: Útil para corregir errores, pero no crítico.

**Independent Test**: Usuario elimina lectura propia y desaparece de su lista.

**Acceptance Scenarios**:

1. **Given** que tengo una lectura, **When** la elimino, **Then** el
   sistema la borra y devuelve 200
2. **Given** que intento eliminar una lectura de otro usuario, **When**
   lo intento, **Then** el sistema devuelve 403 o 404

---

### Edge Cases

- ¿Qué pasa si el token expiró? → 401
- ¿Qué pasa si D1 está caído? → 503
- ¿Qué pasa si se envía un valor de glucosa extremadamente alto/bajo?
  → se registra igual (el sistema no valida rangos clínicos en v1)
- ¿Qué pasa si dos requests llegan al mismo tiempo? → D1 maneja
  concurrencia, cada uno obtiene su propio ID

## Requirements

### Functional Requirements

- **FR-001**: Sistema MUST permitir registro de usuarios con usuario y
  contraseña
- **FR-002**: Sistema MUST hashear contraseñas antes de almacenar
- **FR-003**: Sistema MUST rechazar registro de usuario duplicado
- **FR-004**: Sistema MUST emitir token JWT al registrarse o iniciar sesión
- **FR-005**: Sistema MUST validar token JWT en cada request autenticado
- **FR-006**: Sistema MUST permitir crear lectura de glucosa (valor
  numérico + timestamp opcional)
- **FR-007**: Sistema MUST asociar cada lectura al usuario autenticado
- **FR-008**: Sistema MUST permitir consultar lecturas del usuario
  autenticado con filtros de fecha y paginación
- **FR-009**: Sistema MUST permitir eliminar una lectura propia
- **FR-010**: Sistema MUST rechazar requests no autenticados con 401
- **FR-011**: Sistema MUST rechazar valores de glucosa inválidos con 400

### Key Entities

- **User**: Representa una persona que usa el sistema. Atributos: id,
  username (único), password_hash, created_at
- **Reading**: Representa una medición de glucosa. Atributos: id,
  user_id (FK), value (mg/dL), recorded_at (timestamp), created_at

## Success Criteria

### Measurable Outcomes

- **SC-001**: Un usuario puede registrar una lectura en menos de 1 segundo
- **SC-002**: El sistema soporta al menos 10 usuarios concurrentes sin
  degradación
- **SC-003**: Un usuario autenticado solo ve sus propios datos en toda
  consulta

## Assumptions

- Los usuarios tienen conexión a internet estable
- No hay interfaz gráfica en v1 — solo API REST; el frontend se
  construirá después
- Mobile support está fuera de scope para v1
- Los valores de glucosa se almacenan en mg/dL (estándar internacional)
- El token JWT expira en 24 horas
