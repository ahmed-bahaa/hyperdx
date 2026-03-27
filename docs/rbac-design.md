# RBAC Design — HyperDX Fork

## Overview

This document describes the role-based access control (RBAC) and project-scoped
access model implemented in this fork. The design is layered: application-level
role enforcement sits on top of ClickHouse-native row-level security (RLS),
ensuring that access boundaries are upheld even if a user bypasses the API.

---

## Concepts

### Team

The top-level organizational unit. Every user belongs to exactly one team. All
resources (connections, sources, dashboards, saved searches) are owned by a team.
This maps 1:1 to a HyperDX instance in the OSS deployment model.

### User Roles (team-level)

Each user has a single role within their team:

| Role     | Description |
|----------|-------------|
| `owner`  | Full control. Assigned automatically to the first user who creates the team or logs in via SSO for the first time. Cannot be changed via the API (future: transfer ownership). |
| `admin`  | Manages team settings, invites members, creates/deletes projects, rotates API keys. |
| `member` | Default role for invited users. Can create and edit dashboards, alerts, and saved searches within projects they belong to. |
| `viewer` | Read-only. Can view dashboards and data within their assigned projects but cannot modify anything. |

Role hierarchy (highest to lowest): `owner > admin > member > viewer`

The `requireRole(minRole)` middleware enforces this hierarchy on every protected
endpoint. A user with `admin` role satisfies `requireRole('member')`.

#### Role assignment

- **Registration (password):** first user gets `owner`.
- **Team invite:** invited role is stored on the `TeamInvite` document and
  applied when the user accepts. Defaults to `member` if not specified.
- **Entra ID SSO:** first SSO user provisioned gets `owner`; subsequent
  auto-provisioned users get `member`.
- **Runtime change:** `PATCH /team/member/:id/role` — `admin`+ only, cannot
  promote to `owner`.

---

## Projects

A **Project** is a named grouping of dashboards and data sources within a team.
Projects enable fine-grained access scoping: users only see resources that belong
to a project they are a member of. Resources with no project assigned are
**common** (visible to all team members).

```
Team
├── Common resources (no project — team-wide)
│   ├── Dashboards
│   └── Sources / Connections
└── Project A
│   ├── members: [alice(admin), bob(editor), carol(viewer)]
│   ├── Dashboards
│   └── Sources
└── Project B
    ├── members: [dave(admin), carol(viewer)]
    ├── Dashboards
    └── Sources
```

### Project roles

Each project has its own membership list with per-project roles:

| Role     | Permissions within the project |
|----------|-------------------------------|
| `admin`  | Full control over project resources; can add/remove project members. |
| `editor` | Can create and modify dashboards, saved searches, and alerts. |
| `viewer` | Read-only access to dashboards and data. |

Project roles are independent of team roles. A `member`-level team user can be
an `admin` of a specific project.

Team-level `admin` and `owner` can always see and modify all projects regardless
of project membership.

### Access scoping (Layer 1 — Application)

When a user requests their dashboards:

```
visible = (project IS NULL)                    -- common resources
        ∪ (project IN user's project IDs)      -- projects the user belongs to
```

This filtering happens in `getDashboards(teamId, userId)` and will be extended
to sources and saved searches.

---

## Data Model

### User

```typescript
{
  email: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'viewer'   // NEW
  team: ObjectId
  accessKey: string
}
```

### TeamInvite

```typescript
{
  teamId: ObjectId
  email: string
  token: string
  role: 'admin' | 'member' | 'viewer'   // NEW — default 'member'
}
```

### Project

```typescript
{
  _id: ObjectId
  name: string
  description?: string
  team: ObjectId
  members: Array<{
    userId: ObjectId
    role: 'admin' | 'editor' | 'viewer'
  }>
}
```

### Dashboard (updated)

```typescript
{
  // ... existing fields
  project?: ObjectId | null   // NEW — null = common resource
}
```

---

## API Reference

### Team role management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/team/members` | member+ | List members with roles |
| `POST` | `/team/invitation` | admin+ | Invite with specified role |
| `PATCH` | `/team/member/:id/role` | admin+ | Update a member's role |
| `DELETE` | `/team/member/:id` | admin+ | Remove a member |
| `PATCH` | `/team/name` | admin+ | Rename the team |
| `PATCH` | `/team/apiKey` | admin+ | Rotate the team API key |
| `PATCH` | `/team/auth-methods` | admin+ | Toggle allowed auth methods |

### Project management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/projects` | member+ | List all team projects |
| `POST` | `/projects` | admin+ | Create a project |
| `GET` | `/projects/:id` | member+ | Get a project |
| `PATCH` | `/projects/:id` | member+ | Update project name/description |
| `DELETE` | `/projects/:id` | admin+ | Delete a project |
| `POST` | `/projects/:id/members` | member+ | Add a member to a project |
| `PATCH` | `/projects/:id/members/:userId` | member+ | Change a member's project role |
| `DELETE` | `/projects/:id/members/:userId` | member+ | Remove a member from project |

---

## Layered Security Architecture

The application RBAC described above is **Layer 1**. For a production ClickStack
deployment, two additional layers are recommended.

### Layer 2 — ClickHouse Row-Level Security (recommended next step)

ClickHouse has native row policies enforced at query execution time, independent
of the application layer. Even a direct ClickHouse connection or a bypassed API
proxy cannot return rows outside the policy.

**Design:**

1. When a Project is created in HyperDX, create a corresponding ClickHouse role:
   ```sql
   CREATE ROLE project_{id}_viewer;
   CREATE ROLE project_{id}_editor;
   CREATE ROLE project_{id}_admin;
   ```

2. Attach row policies scoped to the project's allowed services/namespaces:
   ```sql
   CREATE ROW POLICY project_{id}_policy ON otel_logs
     FOR SELECT
     USING ServiceName IN ('payment-service', 'auth-service')
     TO project_{id}_viewer, project_{id}_editor, project_{id}_admin;
   ```

3. When a user is added to a project, grant the corresponding ClickHouse role:
   ```sql
   GRANT project_{id}_viewer TO 'user_alice@hyperdx';
   ```

4. The `Connection` model (which already stores `username`/`password`) is
   extended so each user gets their own ClickHouse credentials scoped to their
   granted roles. The API proxy uses per-user credentials rather than a shared
   service account.

**Outcome:** a `viewer` in Project A cannot query Project B's data even via raw
ClickHouse SQL, because the row policy denies it at the storage layer.

### Layer 3 — ClickHouse Column-Level Security (for PII/sensitive fields)

For environments where log attributes or resource attributes may contain
sensitive data (PII, secrets, tokens):

```sql
-- Viewers can only see selected columns, not full LogAttributes
GRANT SELECT(Timestamp, ServiceName, SeverityText, Body)
  ON otel_logs TO project_{id}_viewer;

-- Editors get full attribute access
GRANT SELECT ON otel_logs TO project_{id}_editor;
```

This prevents lower-privilege users from reading sensitive structured fields
even when they can view log messages.

### Summary

| Layer | Mechanism | Enforced by | Bypassed by direct CH access? |
|-------|-----------|-------------|-------------------------------|
| 1 | Application RBAC + project membership | HyperDX API | Yes (if CH proxy is bypassed) |
| 2 | ClickHouse row policies | ClickHouse engine | **No** |
| 3 | ClickHouse column grants | ClickHouse engine | **No** |

For a true zero-trust telemetry platform, Layer 2 is required. Layer 1 alone is
sufficient for single-tenant or low-sensitivity deployments where all users are
trusted to use the HyperDX interface.

---

## Frontend

### Team Settings — Members tab

- Role badge displayed next to each member (color-coded: violet=owner,
  blue=admin, green=member, gray=viewer).
- Inline role picker for non-owner members (admin+ only).
- Role selector in invite modal (default: member).

### Team Settings — Projects tab

- List of all projects with member count.
- Create project modal (admin+ only).
- Per-project member management modal: add/remove members, change project roles.

### Access control in UI

`hasAdminAccess` throughout the UI is now derived from `me.role` (fetched from
`/me`) rather than hardcoded to `true`. Components that perform write operations
check this flag before rendering action buttons.

---

## Migration

Existing users (before this change) have no `role` field. MongoDB returns
`undefined` for missing fields, so the middleware defaults to `'member'` when
the field is absent:

```typescript
const role = req.user?.role ?? 'member';
```

**Recommended post-deploy migration:**
```javascript
// Promote the oldest user in each team to owner
db.users.aggregate([
  { $sort: { createdAt: 1 } },
  { $group: { _id: '$team', firstUser: { $first: '$_id' } } }
]).forEach(({ firstUser }) => {
  db.users.updateOne({ _id: firstUser }, { $set: { role: 'owner' } });
});

// Set remaining users without a role to 'member'
db.users.updateMany({ role: { $exists: false } }, { $set: { role: 'member' } });
```
