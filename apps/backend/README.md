# 🧭 Architecture Guidelines for Backend Application

These guidelines define how to structure and organize the backend architecture for the project using NestJS, TypeORM, and clean layering principles.

---

This document also includes the conventions for organizing the application structure, including module layout, naming rules, and folder hierarchy.

[modular monolith conventions](./MODULAR_CONVENTIONS.md).

---

## 🧱 Project Layers

### 1. **Entity Layer**

* Contains ORM entities (TypeORM `@Entity()` classes).
* Entities model the database structure.
* Only internal logic; **no external dependencies** like DTOs.

### 2. **DTO Layer**

#### a) **Domain DTOs**

* Used within use-cases and services.
* Belong to application/domain layer.
* **Must not depend on API/CLI DTOs**.
* **May depend on Entities**, but not on presentation-level DTOs.
* Mapping into Domain DTOs is done via **non-static mappers**, not `fromEntity()` inside DTO.

#### b) **API/CLI DTOs (Presentation DTOs)**

* Presentation-specific output format (API, CLI, etc).
* Belong to the presentation layer.
* Can be mapped via **presentation mappers** (non-static).
* Lower layers **may depend on upper layers**, but the domain layer must never depend on higher-level concerns.

### 3. **Entity Service Layer**

* Contains logic for a single entity (e.g., `UserService`).
* Should interact only with the **corresponding repository**.
* Can return both:

    * `Entity` — for use-case services
    * `Domain DTO` — for API/CLI usage (only if simple)
* **Must not depend on other services or use-cases**.

### 4. **Use-Case Service Layer**

* Represents a single business scenario (e.g., `CreateUserService`, `GetUserWithPostsService`).
* Should typically expose only one public method — usually named `run(...)`.
* In more complex cases where multiple related operations are needed, it is acceptable to define several clearly named public methods instead of using `run(...)`.
* Can depend on multiple entity services, repositories, or infrastructure services.
* Returns a **Domain DTO**.
* Does **not** return Entity directly.

### 5. **Presentation Layer (Controller, CLI)**

* Depends only on **use-case services** or entity services (for simple reads).
* Receives or returns **presentation-specific DTOs**.
* Must never operate on Entity directly.
* Performs mapping to and from presentation DTOs using **non-static mappers**.

### 6. **Infrastructure Layer**

* Services to interact with email, queues, external APIs, files, etc.
* Can be injected into use-case services.

---

## 📦 Mapping Conventions

| Source     | Target      | How                  |
| ---------- | ----------- | -------------------- |
| Entity     | Domain DTO  | via dedicated mapper |
| Domain DTO | API/CLI DTO | via dedicated mapper |

> 📌 **Do not place `fromEntity()` or `fromDomain()` inside DTOs**, and avoid doing mapping inside services as well.
> Use dedicated **mapper classes** to convert between layers.

> 🧩 Naming and grouping of mappers (e.g., one vs many) — left to the team's discretion.

---

## ✅ Best Practices

* Keep **Entity Services** focused per entity.
* Use **Use-Case Services** for all orchestrations across domains.
* Structure code to allow **reuse across API, CLI, cron, etc.**
* Prefer **explicit DTOs** at every boundary.
* Maintain **one scenario = one use-case service** with a single `.run()` method.
* Avoid returning Entity from any service that crosses layers.
* Domain DTOs may depend on Entity, but never on presentation DTOs.
* API/CLI DTOs may depend on Domain DTOs, but never the other way around.
* Entity Services **must not depend** on Use-Case Services or other Entity Services.
* Use-case services **can depend** on multiple Entity Services and Repositories.
* Controllers and CLI commands must **never see Entities**.
* Use **dedicated mapper classes** instead of placing logic inside DTOs.

---

## 📁 Suggested Folder Structure

```
src/
  users/
    entities/
      user.entity.ts
    services/
      user.service.ts
    use-cases/
      get-user.service.ts
    dto/
      domain/                # Domain DTOs (used in use-cases)
        user-domain.dto.ts
      presentation/          # API/CLI DTOs
        user-api-response.dto.ts
        user-cli-response.dto.ts
    mappers/
      user.mapper.ts         # Contains conversion logic between layers
    enums/
      user-role.enum.ts
    controllers/
      user.controller.ts
```

### 📌 Notes:

* Domain DTOs are stored under `dto/domain/` — they are part of the application layer.
* Presentation-layer DTOs are stored under `dto/presentation/` — used in API/CLI.
* Each module (e.g., `users/`) is a self-contained feature with clearly organized responsibilities.
* Mapping logic is implemented in `mappers/` folder per feature.

---

## 🔚 Summary

This architecture encourages:

* Separation of concerns
* Clear ownership of logic
* Readable, testable, and maintainable code

Following these guidelines will help create a codebase that is easy to extend, open to the community, and maintainable in the long term.