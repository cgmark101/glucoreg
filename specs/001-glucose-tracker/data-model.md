# Data Model: GlucoReg

## Entidades

### User

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | ID único del usuario |
| username | TEXT | UNIQUE, NOT NULL, 3-30 chars | Nombre de usuario |
| password_hash | TEXT | NOT NULL | Hash de la contraseña (PBKDF2) |
| created_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Fecha de creación |

### Reading

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | ID único de la lectura |
| user_id | INTEGER | NOT NULL, FK -> User(id) | Usuario que registró |
| value | REAL | NOT NULL, > 0 | Nivel de glucosa en mg/dL |
| recorded_at | TEXT | NOT NULL | Cuándo se tomó la medición |
| created_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Cuándo se registró en el sistema |

## Relaciones

```
User 1───* Reading  (un usuario tiene muchas lecturas)
```

Cada `Reading` pertenece a exactamente un `User`. No hay borrado en
cascada — se maneja a nivel de aplicación.

## SQL DDL

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL CHECK(length(username) >= 3),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  value REAL NOT NULL CHECK(value > 0),
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_readings_user_id ON readings(user_id);
CREATE INDEX idx_readings_recorded_at ON readings(recorded_at);
CREATE INDEX idx_readings_user_recorded ON readings(user_id, recorded_at);
```

## Validaciones (aplicación)

- **username**: 3-30 caracteres, alfanumérico + guión bajo, único
- **password**: mínimo 6 caracteres
- **value**: número positivo (mg/dL), sin límite superior en v1
- **recorded_at**: ISO 8601, no puede ser futuro (máx 5 min de tolerancia)
