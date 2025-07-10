# Modular Monolith Conventions

> Applies to `apps/backend/src/*`

---

## 1. Application Structure

* Each module is located under `apps/backend/src/{module}`
* Shared modules and reusable code are placed in `apps/backend/src/common`

```text
apps/
  backend/
    src/
      common/
        auth/
        events/
        bigquery/
      projects/
      users/
      main.ts
      app.module.ts
```

---

## 2. Module Structure

Each module (e.g., `projects`) is organized as follows:

```text
projects/
  controllers/
    projects.controller.ts
  services/
    projects.service.ts
  use-cases/
    create-project.use-case.ts
  facades/
    projects.facade.impl.ts

  shared/
    facades/
      projects.facade.ts
    dtos/
      create-project.dto.ts
      project.dto.ts
    events/
      project-created.event.ts
```

### 📌 Directory Overview

| Folder            | Purpose                                                    |
| ----------------- |------------------------------------------------------------|
| `controllers/`    | HTTP entry points (controllers)                            |
| `services/`       | Business logic (general-purpose, not tied to use-cases)    |
| `use-cases/`      | Specialized use-case implementations, cross-entities logic |
| `facades/`        | Implementations of public interfaces used by other modules |
| `shared/`         | Contents available for reuse in other modules              |
| `shared/facades/` | Facade interfaces                                          |
| `shared/dtos/`    | DTOs for inputs and outputs                                |
| `shared/events/`  | Events published by the module                             |

---

## 3. Facade Rules and Constraints

* Facade interfaces are declared in `shared/facades/`
* Implementations are placed in `facades/`
* **One interface = one implementation class**
* **A module must not use its own facade internally**

### Example

```ts
// shared/facades/projects.facade.ts
export interface ProjectsFacade {
  getProjectById(id: string): Promise<ProjectDto>;
}
```

```ts
// facades/projects.facade.impl.ts
@Injectable()
export class ProjectsFacadeImpl implements ProjectsFacade {
  async getProjectById(id: string): Promise<ProjectDto> {
    // ...
  }
}
```

---

## 4. CI and Code Quality Requirements

* All **facade implementations** must be covered by unit tests
* Other internal services are optional to test (nice-to-have)

### CI Checks

* ✅ ESLint
* ✅ Prettier
* ✅ Unit tests

### 🔒 Not Allowed

* Merging into `main` is forbidden if:

  * There are lint or formatting errors
  * Facade implementations are not covered by unit tests

---

## 5. Example: Final `projects` Module Structure

```text
projects/
  controllers/
    projects.controller.ts
  services/
    projects.service.ts
  use-cases/
    create-project.use-case.ts
  facades/
    projects.facade.impl.ts

  shared/
    facades/
      projects.facade.ts
    dtos/
      create-project.dto.ts
      project.dto.ts
    events/
      project-created.event.ts
```
