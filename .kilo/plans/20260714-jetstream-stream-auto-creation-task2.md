# Per-Task Plan: Task 2 — NATS + JetStream Server Configuration Documentation

**TODO**: `.agent/todos/20260714/20260714-todo-2.md` → Task "NATS + JetStream Server other configuration"
**Global Plan**: `.kilo/plans/20260714-jetstream-stream-auto-creation.md`
**Branch**: `feat/jetstream-stream-auto-creation`

## Pre-Analysis

`docs/nats-jetstream-configuration.md` already exists and was created during Task 1 (4.4 Documentation). It currently covers:

1. NATS Server Requirements (version >= 2.10, `-js` flag, `store_dir`, `max_mem`, `max_file`)
2. JetStream Configuration for Events Toolkit (3 stream categories: Events / DLQ / Platform)
3. Stream Auto-Creation (`autoCreateStreams` opt-in option, behavior, when-to-use table)
4. Manual Stream Setup (NATS CLI examples + programmatic examples for 3 streams)
5. Production Recommendations (Storage, Retention, Replication, Limits, Monitoring)
6. Docker Compose Example (single-node + 3-node cluster with replication)

Cross-references already in place:
- `README.md` line 959: link in "Related Documentation"
- `docs/ai-agent-guidelines.md` line 395 + line 449: links in Onboarding table + See Also

### Gap Analysis vs. Task 2 Scope

| Task 2 topic | Currently covered? |
|---|---|
| NATS server version requirements | ✅ Covered (>= 2.10) |
| JetStream resource limits (max streams, max consumers at server level) | ❌ Missing — only stream-level limits (`max_msgs`, `max_age`) are documented |
| Authentication / security (credentials, TLS) | ❌ Missing |
| Clustering / replication setup | ⚠️ Partial — cluster docker example + `num_replicas` mention, but no dedicated config section |
| Monitoring / health checks | ⚠️ Partial — 3 bullets under Production Recommendations, no server-side monitoring config |
| Backup and restore | ❌ Missing |

Additional gap found during cross-reference review:
- `README.md` Deployment → "JetStream Stream Configuration" (lines 889-927) duplicates the programmatic stream-add snippet from the standalone doc. To avoid drift, README should be slimmed to a short summary + link to the dedicated doc.

## High-Level Approach

1. **Extend** `docs/nats-jetstream-configuration.md` with missing sections (resource limits, auth/security, clustering, monitoring, backup/restore) — append before the closing "See also" block.
2. **Slim** `README.md` Deployment → JetStream Stream Configuration into a brief summary + link to the dedicated doc (remove duplicated long snippet).
3. **Verify** cross-references remain valid after edits (README Related Documentation, ai-agent-guidelines Onboarding + See Also).
4. No code changes — documentation-only task.

---

## Implementation Plan (tiny detailed steps)

### Step 1 — Add "JetStream Server Resource Limits" section

Target file: `docs/nats-jetstream-configuration.md`
Insert a new `## JetStream Server Resource Limits` section after the existing "NATS Server Requirements" section (after current line ~43, the `max_file` table).

Content:
- Explain `max_mem` / `max_file` are server-level caps that bound ALL streams on the server.
- Add subsection "Per-account resource limits": `max_streams`, `max_consumers`, `max_ack_pending` applied via account config.
- Provide `nats-server.conf` snippet showing account-level limits:

```conf
accounts: {
  $SYS: { users: [ { user: sys, password: "..." } ] },
  COBRANZA: {
    users: [ { user: app, password: "..." } ]
    jetstream: {
      max_streams: 50
      max_consumers: 200
      max_ack_pending: 1000
    }
  }
}
```

- Add a table:

| Setting | Scope | Description | Recommended |
|---|---|---|---|
| `max_mem` | server | Memory storage cap across all streams | 256MB dev / 1GB prod |
| `max_file` | server | File storage cap across all streams | 10GB+ prod |
| `max_streams` | account | Max number of streams per account | 50 |
| `max_consumers` | account | Max consumers per account | 200 |
| `max_ack_pending` | account | Max unacked messages per consumer | 1000 |

- Update Table of Contents at top of doc to include the new section anchor.

### Step 2 — Add "Authentication & Security" section

Target file: `docs/nats-jetstream-configuration.md`
Insert a new `## Authentication & Security` section after the new resource-limits section.

Content:
- Subsection "TLS": enable TLS on server (`tls` config block), client-side `tls` option in `connect()`:
  ```typescript
  await connect({
    servers: ['nats://nats:4222'],
    tls: { ca: fs.readFileSync('ca.pem'), key: fs.readFileSync('key.pem'), cert: fs.readFileSync('cert.pem') },
  });
  ```
- Subsection "NATS credentials (NKey / JWT auth)": recommend JWT-based accounts for production:
  ```typescript
  await connect({
    servers: ['nats://nats:4222'],
    user: 'app',
    pass: process.env.NATS_PASSWORD,
  });
  ```
  And creds-file variant:
  ```typescript
  await connect({
    servers: ['nats://nats:4222'],
    userCredentials: '/secrets/nats.creds',
  });
  ```
- Subsection "Security recommendations" table:

| Concern | Recommendation |
|---|---|
| TLS | Always terminate TLS in front of NATS in production |
| Auth | Use per-service accounts, not shared credentials |
| Secrets | Load creds from env vars / mounted secrets, never commit files |
| Network | Keep NATS port 4222 private; expose only monitoring port 8222 to ops subnet |

- Update Table of Contents.

### Step 3 — Expand "Clustering & Replication" into a dedicated section

Target file: `docs/nats-jetstream-configuration.md`
Insert a new `## Clustering & Replication` section after "Production Recommendations" (and before "Docker Compose Example"), reorganizing existing cluster content + adding configuration detail.

Content:
- Move the existing 3-node cluster docker compose (currently lines ~245-294) under this section as the cluster example.
- Add a configuration subsection explaining cluster requirements:
  - Min 3 nodes for quorum-based RAFT replication.
  - All nodes share `--cluster_name`.
  - `--routes` lists peer addresses.
  - Each stream with `num_replicas: 3` is replicated across all nodes.
  - `--jetstream` (or `-js`) flag required on every node.
- Provide a minimal `nats-server.conf` cluster snippet:

```conf
jetstream {
  store_dir: "/data/jetstream"
  max_file: 10GB
}
cluster {
  name: "events-cluster"
  routes: ["nats://nats-1:6222", "nats://nats-2:6222", "nats://nats-3:6222"]
}
```

- Add a "Replication trade-offs" table:

| Replicas | Fault tolerance | Notes |
|---|---|---|
| 1 | None | Dev/test only |
| 3 | Survives 1 node loss | Production minimum |
| 5 | Survives 2 node loss | Large-scale HA |

- Update Table of Contents.
- Remove the old standalone cluster compose block from "Docker Compose Example" (leave single-node example there).

### Step 4 — Expand "Monitoring & Health Checks" into a dedicated section

Target file: `docs/nats-jetstream-configuration.md`
Insert a new `## Monitoring & Health Checks` section after the new "Clustering & Replication" section (and before "Docker Compose Example"). Move the existing 3 monitoring bullets out of "Production Recommendations" into here.

Content:
- Subsection "NATS monitoring port": enable HTTP monitoring endpoint:
  ```conf
  http_port: 8222
  ```
  Endpoints: `/jsz` (JetStream stats), `/connz`, `/healthz`.
- Subsection "Per-stream monitoring": `nats stream info <STREAM>`, `nats consumer info <STREAM> <CONSUMER>`, alerting on `num_pending`, `num_ack_pending`.
- Subsection "events-toolkit health checks" (cross-link to README Deploy section):
  - Liveness: `GET /discovery/manifest` returns 200 when discovery subsystem active.
  - Heartbeat: `platform.service.heartbeat.v1` events at configured interval.
  - Disk: monitor `store_dir` volume usage; alerts when > 80%.
- Update Table of Contents.

### Step 5 — Add "Backup & Restore" section

Target file: `docs/nats-jetstream-configuration.md`
Insert a new `## Backup & Restore` section after "Monitoring & Health Checks".

Content:
- Subsection "Snapshot streams via CLI":
  ```bash
  nats stream snapshot EVENTS --snapshot-dir /backup/events-$(date +%F)
  ```
- Subsection "Restore streams via CLI":
  ```bash
  nats stream restore EVENTS --snapshot-dir /backup/events-2026-05-30
  ```
- Subsection "File-level backup": stop NATS node, copy `store_dir` volume, restart. Note this is only safe on a single-node cluster or a node drained from the cluster.
- Subsection "Recommendations" table:

| Strategy | Use case | RPO |
|---|---|---|
| `nats stream snapshot` | Regular scheduled snapshots | Near-zero (point-in-time) |
| Volume snapshot (EBS/ZFS) | Infra-level | Last snapshot |
| File copy of `store_dir` | Disaster recovery | Cold |

- Note that replicas (RAFT) handle node-failure recovery automatically; backups guard against full-cluster loss or accidental deletion.
- Update Table of Contents.

### Step 6 — Trim duplicated stream config in README.md

Target file: `README.md`
Replace the existing "JetStream Stream Configuration" subsection under "Deployment" (lines ~891-927) with a short summary + link to the dedicated doc:

```markdown
### JetStream Stream Configuration

Configure event, DLQ, and platform streams with JetStream. Streams can be created manually (CLI or programmatic) or auto-created by enabling `consumer.autoCreateStreams`.

For the full guide — server requirements, stream auto-creation, manual setup, resource limits, authentication, clustering, monitoring, and backup/restore — see [NATS JetStream Configuration](docs/nats-jetstream-configuration.md).
```

Keep "Environment Variables", "Health Checks" subsections under Deployment unchanged.

### Step 7 — Verify cross-references

After edits, verify these links all resolve:
- `README.md` line 959 (Related Documentation) → `docs/nats-jetstream-configuration.md` ✅ still valid
- `docs/ai-agent-guidelines.md` line 395 (Onboarding table, step 11) → `nats-jetstream-configuration.md` ✅ still valid
- `docs/ai-agent-guidelines.md` line 449 (See Also) → `nats-jetstream-configuration.md` ✅ still valid
- `docs/nats-jetstream-configuration.md` closing "See also" block → links to README `#jetstream-stream-configuration` anchor. **Update anchor**: since README section title stays the same, the anchor `#jetstream-stream-configuration` remains valid. No change needed.
- New section anchors all added to the doc's Table of Contents.

### Step 8 — No code or test changes

This is a documentation-only task. No `src/` changes, no `npm test`/`npm run typecheck`/`npm run lint` runs required for the docs themselves. (Optionally run `npm run lint` if markdown linting is configured — verify .kilo configs / package.json; if no markdown lint exists, skip.)

### Step 9 — Git actions

Commit all documentation changes on the feature branch `feat/jetstream-stream-auto-creation` with message:

```
docs(nats): add JetStream security, limits, clustering, monitoring, backup sections; trim README duplication
```

---

## Verification Checklist (for 4.5 Verification step)

- [ ] `docs/nats-jetstream-configuration.md` contains all 6 originally requested topics: version reqs, resource limits, auth/TLS, clustering/replication, monitoring/health checks, backup/restore.
- [ ] Table of Contents updated with all new section anchors.
- [ ] All anchors in ToC match actual `##` headings.
- [ ] `README.md` Deployment section no longer duplicates the long programmatic stream snippet; links to dedicated doc instead.
- [ ] All cross-references from README + ai-agent-guidelines resolve.
- [ ] No code files modified.
- [ ] Commit is on the feature branch.

## Out of Scope (handled by other workflow steps)

- Marking Task 2 `[DONE]` in TODO file (4.6 step).
- Branch merge / push to origin (Step 5 — TODO File Completion).
- Code changes to `src/` (Task 1 already done).

## Files Affected

- `docs/nats-jetstream-configuration.md` (extended — new sections + ToC updates)
- `README.md` (Deployment section trimmed)

## Files NOT Affected

- Any `src/**` file
- Any `*.spec.ts` file
- `package.json` (version already bumped in Step 3)
- `.agent/project-structure.md`