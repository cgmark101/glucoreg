---

description: "Task list for GlucoReg implementation"

---

# Tasks: GlucoReg — Registro de Glucosa Personal

**Input**: Design documents from `/specs/001-glucose-tracker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/` at repository root
- Cloudflare Worker entry point: `src/index.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Inicializar proyecto npm, instalar dependencias (hono, @hono/jwt, wrangler, vitest, typescript)
- [ ] T002 Crear wrangler.toml con config de Cloudflare Workers (name, compatibility_date, d1 bindings)
- [ ] T003 Crear tsconfig.json para TypeScript
- [ ] T004 Crear migración inicial D1 en `migrations/0001_initial.sql` con schema de users y readings
- [ ] T005 [P] Crear estructura de directorios: `src/db/`, `src/routes/`, `src/middleware/`, `src/lib/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure que debe estar completo antes de cualquier user story

- [ ] T006 Implementar hashing de contraseñas con Web Crypto API en `src/lib/hash.ts`
- [ ] T007 [P] Configurar D1 client y helper queries en `src/db/client.ts`
- [ ] T008 [P] Implementar middleware JWT de autenticación en `src/middleware/auth.ts`
- [ ] T009 Crear router principal y setup de Hono app en `src/index.ts`

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Registro de usuario (Priority: P1) 🎯 MVP

**Goal**: Un usuario nuevo puede crear una cuenta con username + password

**Independent Test**: Curl a POST /auth/register con credenciales →
201 + token JWT

- [ ] T010 [US1] Implementar POST /auth/register en `src/routes/auth.ts` (validar input, hashear password, insertar user, devolver token)
- [ ] T011 [US1] Manejar error 409 para username duplicado en `src/routes/auth.ts`

**Checkpoint**: Registro funcional y testeable independientemente

---

## Phase 4: User Story 2 — Inicio de sesión (Priority: P1)

**Goal**: Un usuario registrado puede iniciar sesión y recibir un token JWT

**Independent Test**: Curl a POST /auth/login con credenciales correctas →
200 + token; con credenciales incorrectas → 401

- [ ] T012 [US2] Implementar POST /auth/login en `src/routes/auth.ts` (buscar user, verificar password, generar JWT)
- [ ] T013 [US2] Manejar error 401 para credenciales inválidas

**Checkpoint**: Login funcional y testeable independientemente

---

## Phase 5: User Story 3 — Registrar lectura de glucosa (Priority: P1)

**Goal**: Un usuario autenticado puede crear una nueva lectura de glucosa

**Independent Test**: Curl a POST /readings con token válido y
valor numérico → 201 + reading object

- [ ] T014 [US3] Implementar POST /readings en `src/routes/readings.ts` (validar value, insertar con user_id del token, devolver reading)
- [ ] T015 [US3] Manejar error 400 para value inválido
- [ ] T016 [US3] Manejar recorded_at opcional (default: now)

**Checkpoint**: Creación de lecturas funcional

---

## Phase 6: User Story 4 — Consultar lecturas (Priority: P2)

**Goal**: Un usuario autenticado puede listar sus lecturas con filtros
y paginación

**Independent Test**: Curl a GET /readings con token válido →
200 + array de readings (solo del usuario autenticado)

- [ ] T017 [US4] Implementar GET /readings en `src/routes/readings.ts` (query params: from, to, limit, offset, filtrar por user_id del token)
- [ ] T018 [US4] Agregar conteo total de resultados

**Checkpoint**: Consulta de lecturas funcional

---

## Phase 7: User Story 5 — Eliminar lectura (Priority: P3)

**Goal**: Un usuario autenticado puede eliminar una de sus lecturas

**Independent Test**: Curl a DELETE /readings/:id con token válido →
200; con id de otro usuario → 404

- [ ] T019 [US5] Implementar DELETE /readings/:id en `src/routes/readings.ts` (verificar ownership, borrar)
- [ ] T020 [US5] Manejar error 404 si no existe o no pertenece al usuario

**Checkpoint**: CRUD completo de lecturas funcional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Mejoras que afectan múltiples user stories

- [ ] T021 [P] Agregar validación de entrada con Zod o manual en todos los endpoints
- [ ] T022 Configurar CORS para permitir frontend futuro
- [ ] T023 Agregar manejo global de errores en `src/index.ts`
- [ ] T024 Ejecutar quickstart.md para validación end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on Foundational
- **US3 (Phase 5)**: Depends on Foundational + US2 (login necesario para token)
- **US4 (Phase 6)**: Depends on Foundational + US2 + US3 (datos para consultar)
- **US5 (Phase 7)**: Depends on Foundational + US2 + US3 (datos para eliminar)
- **Polish (Phase 8)**: Depends on all user stories

### Parallel Opportunities

- T005, T006, T007, T008 pueden correr en paralelo
- T010 y T012 son independientes entre sí (mismo archivo pero lógica separada)
- T014, T017, T19 son endpoints separados en el mismo archivo

### MVP Scope

MVP = Phase 1 + Phase 2 + Phase 3 (US1: Registro) + Phase 5 (US3: Crear lectura)
Con eso tenés: registro + creación de lecturas funcional.
