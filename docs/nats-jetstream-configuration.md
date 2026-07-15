# NATS JetStream Configuration

Guide for configuring NATS JetStream to work with events-toolkit. Covers server requirements, stream auto-creation, manual stream setup, and production best practices.

## Table of Contents

- [NATS Server Requirements](#nats-server-requirements)
- [JetStream Server Resource Limits](#jetstream-server-resource-limits)
- [Authentication & Security](#authentication--security)
- [JetStream Configuration for Events Toolkit](#jetstream-configuration-for-events-toolkit)
- [Stream Auto-Creation](#stream-auto-creation)
- [Manual Stream Setup](#manual-stream-setup)
- [Production Recommendations](#production-recommendations)
- [Clustering & Replication](#clustering--replication)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Backup & Restore](#backup--restore)
- [Docker Compose Example](#docker-compose-example)

## NATS Server Requirements

Events-toolkit requires NATS server **>= 2.10** with **JetStream enabled**.

### Enable JetStream

Start the NATS server with the `-js` flag or configure it in the server config file:

**CLI flag:**

```bash
nats-server -js
```

**Config file (`nats-server.conf`):**

```conf
jetstream {
  store_dir: /data/jetstream
  max_mem: 256MB
  max_file: 1GB
}
```

| Setting | Description | Recommended |
|---------|-------------|-------------|
| `store_dir` | Directory for JetStream persistent storage | Dedicated volume path |
| `max_mem` | Maximum memory-based stream storage | 256MB (dev), 1GB+ (prod) |
| `max_file` | Maximum file-based stream storage | 1GB (dev), 10GB+ (prod) |

## JetStream Server Resource Limits

`max_mem` and `max_file` are server-level caps that bound **all** streams combined. Per-account limits provide finer-grained control when running multi-tenant NATS deployments.

### Per-Account Resource Limits

Account-level limits are set in the `nats-server.conf` under the account's `jetstream` block:

```conf
accounts: {
  $SYS: { users: [ { user: sys, password: "sys-password" } ] },
  COBRANZA: {
    users: [ { user: app, password: "app-password" } ]
    jetstream: {
      max_streams: 50
      max_consumers: 200
      max_ack_pending: 1000
    }
  }
}
```

| Setting | Scope | Description | Recommended |
|---------|-------|-------------|-------------|
| `max_mem` | server | Memory storage cap across all streams | 256MB dev / 1GB prod |
| `max_file` | server | File storage cap across all streams | 10GB+ prod |
| `max_streams` | account | Max number of streams per account | 50 |
| `max_consumers` | account | Max consumers per account | 200 |
| `max_ack_pending` | account | Max unacknowledged messages per consumer | 1000 |

> **Note:** When auto-creation is enabled, monitor `max_streams` to prevent unbounded stream proliferation in production.

## Authentication & Security

### TLS

Enable TLS on the NATS server to encrypt all client-to-server traffic:

```conf
tls {
  cert_file: "/certs/server-cert.pem"
  key_file: "/certs/server-key.pem"
  ca_file: "/certs/ca.pem"
}
```

Client-side TLS configuration:

```typescript
import { connect } from 'nats';
import fs from 'fs';

const nc = await connect({
  servers: ['tls://nats:4222'],
  tls: {
    ca: fs.readFileSync('ca.pem'),
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
  },
});
```

### Credentials

**User/password authentication:**

```typescript
const nc = await connect({
  servers: ['nats://nats:4222'],
  user: 'app',
  pass: process.env.NATS_PASSWORD,
});
```

**NATS credentials file (JWT + NKey):**

```typescript
const nc = await connect({
  servers: ['nats://nats:4222'],
  userCredentials: '/secrets/nats.creds',
});
```

### Security Recommendations

| Concern | Recommendation |
|---------|---------------|
| TLS | Always terminate TLS in front of NATS in production |
| Auth | Use per-service accounts, not shared credentials |
| Secrets | Load creds from env vars or mounted secrets — never commit files |
| Network | Keep NATS port 4222 private; expose only monitoring port 8222 to ops subnet |

## JetStream Configuration for Events Toolkit

Events-toolkit uses three logical stream categories:

| Stream | Subject Pattern | Purpose |
|--------|----------------|---------|
| **Events** | `company.>` | All domain events following the naming convention |
| **DLQ** | `dlq.>` | Dead-letter queue for permanently failed messages |
| **Platform** | `platform.service.>` | Service discovery, heartbeats, and schema publishing |

When using stream auto-creation (see below), individual streams are created per subject pattern. For manual setup, you can use wildcard streams to cover all subjects.

## Stream Auto-Creation

Events-toolkit can automatically create JetStream streams when consumers subscribe to subjects. This eliminates the need for manual stream provisioning during development and simplifies deployment.

### Enable Auto-Creation

Set `autoCreateStreams: true` in the consumer options and provide the NATS `connection`:

```typescript
import { Module } from '@nestjs/common';
import { EventsToolkitModule } from '@cobranza-apps/events-toolkit';
import { connect } from 'nats';

const natsConnection = await connect({ servers: ['nats://localhost:4222'] });

@Module({
  imports: [
    EventsToolkitModule.forRoot({
      nats: { connection: natsConnection },
      consumer: {
        enable: true,
        autoCreateStreams: true,
      },
    }),
  ],
})
export class AppModule {}
```

### Affected Consumers

When `autoCreateStreams` is enabled, **both** `JetStreamConsumerService` (subject-based event handlers via `@OnEvent`) and `RequestReplyConsumerService` (response-pattern subscription via `@OnRequestReply`) auto-create streams before subscribing. The request-reply consumer uses its `responseSubjectPattern` (default `company.*.response.v1`) as the subject for auto-creation.

### How It Works

1. Before subscribing to a subject, the consumer calls `StreamAutoCreator.ensureStreamExists()`.
2. The creator checks if a stream already covers the subject via `jsm.streams.find(subject)`.
3. If no stream exists, a new stream is created with:
   - **Name**: Derived from the subject (e.g. `company.*.payment.proof.uploaded.v1` → `auto-company-payment-proof-uploaded-v1`)
   - **Storage**: File-based
   - **Retention**: Limits
   - **Replicas**: 1
   - **Max consumers/messages/bytes**: Unlimited (`-1`)

### When to Use Auto-Creation

| Scenario | Recommendation |
|----------|---------------|
| Development / local testing | Enable — zero manual setup |
| CI / integration tests | Enable — streams created on demand |
| Production (small scale) | Acceptable — review defaults |
| Production (large scale) | Disable — use manual streams with tuned limits |

> **Note:** Auto-created streams use unlimited limits. For production, prefer manual stream setup with explicit retention policies and size limits.

## Manual Stream Setup

For production environments, create streams manually with tuned configuration using the NATS CLI or programmatically.

### NATS CLI Examples

**Event stream:**

```bash
nats stream add EVENTS \
  --subjects "company.>" \
  --retention limits \
  --storage file \
  --max-age 7d \
  --max-msgs-per-subject 10000 \
  --dupe-window 2m \
  --replicas 1
```

**DLQ stream:**

```bash
nats stream add DLQ \
  --subjects "dlq.>" \
  --retention limits \
  --storage file \
  --max-age 30d \
  --max-msgs-per-subject 100000 \
  --dupe-window 2m \
  --replicas 1
```

**Platform events stream:**

```bash
nats stream add PLATFORM \
  --subjects "platform.service.>" \
  --retention limits \
  --storage file \
  --max-age 7d \
  --max-msgs-per-subject 1000 \
  --replicas 1
```

### Programmatic Setup

```typescript
const jsm = await natsConnection.jetStreamManager();

await jsm.streams.add({
  name: 'EVENTS',
  subjects: ['company.>'],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
  max_msgs_per_subject: 10_000,
  duplicate_window: 2 * 60 * 1_000_000_000,
  num_replicas: 1,
});

await jsm.streams.add({
  name: 'DLQ',
  subjects: ['dlq.>'],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
  max_msgs_per_subject: 100_000,
  duplicate_window: 2 * 60 * 1_000_000_000,
  num_replicas: 1,
});

await jsm.streams.add({
  name: 'PLATFORM',
  subjects: ['platform.service.>'],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
  max_msgs_per_subject: 1_000,
  num_replicas: 1,
});
```

## Production Recommendations

### Storage

- **Always use file storage** (`StorageType.File`) in production. Memory-only storage loses all data on server restart.
- Dedicate a fast SSD volume for `store_dir`.

### Retention

- **Events stream**: 7-day retention with `max_msgs_per_subject` limit. Balances replay capability with disk usage.
- **DLQ stream**: 30-day retention with higher message limits. Allows time for investigation and reprocessing.
- **Platform stream**: 7-day retention with low message limits. Discovery events are small and frequent.

### Replication

- Set `num_replicas` to **3** for production clusters (requires a 3-node NATS cluster).
- Replication ensures stream data survives single-node failures.
- For development and single-node deployments, `num_replicas: 1` is sufficient.

### Limits

| Setting | Events | DLQ | Platform |
|---------|--------|-----|----------|
| `max_age` | 7 days | 30 days | 7 days |
| `max_msgs_per_subject` | 10,000 | 100,000 | 1,000 |
| `max_bytes` | Set based on disk budget | Set based on disk budget | Low (10MB) |
| `duplicate_window` | 2 minutes | 2 minutes | 2 minutes |

## Clustering & Replication

Production deployments should use a NATS cluster with RAFT-based replication for fault tolerance.

### Cluster Requirements

- **Minimum 3 nodes** for quorum-based RAFT replication.
- All nodes share the same `--cluster_name`.
- `--routes` lists peer addresses for node discovery.
- Each stream with `num_replicas: 3` is replicated across all nodes.
- The `--jetstream` (or `-js`) flag is required on every node.

### Minimal Cluster Configuration

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

### Replication Trade-offs

| Replicas | Fault tolerance | Notes |
|----------|----------------|-------|
| 1 | None | Dev/test only |
| 3 | Survives 1 node loss | Production minimum |
| 5 | Survives 2 node loss | Large-scale HA |

## Monitoring & Health Checks

### NATS Monitoring Port

Enable the HTTP monitoring endpoint in `nats-server.conf`:

```conf
http_port: 8222
```

Key endpoints:

| Endpoint | Description |
|----------|-------------|
| `/jsz` | JetStream stats — streams, consumers, message counts |
| `/connz` | Active connections |
| `/healthz` | Server health status |
| `/varz` | Server variables and configuration |

### Per-Stream Monitoring

```bash
nats stream info EVENTS
nats consumer info EVENTS my-consumer
```

Alert on:
- `num_pending` — messages waiting to be delivered to consumers
- `num_ack_pending` — messages delivered but not yet acknowledged
- `store_dir` disk usage — alert when > 80%

### Events-Toolkit Health Checks

- **Liveness**: `GET /discovery/manifest` returns 200 when the discovery subsystem is active.
- **Heartbeat**: `platform.service.heartbeat.v1` events at the configured interval.
- **Disk**: Monitor `store_dir` volume usage; alert when > 80%.

## Backup & Restore

### Snapshot Streams via CLI

```bash
nats stream snapshot EVENTS --snapshot-dir /backup/events-$(date +%F)
```

### Restore Streams via CLI

```bash
nats stream restore EVENTS --snapshot-dir /backup/events-2026-05-30
```

### File-Level Backup

Stop the NATS node, copy the `store_dir` volume, then restart. This is only safe on a single-node cluster or a node drained from the cluster.

### Backup Strategies

| Strategy | Use case | RPO |
|----------|----------|-----|
| `nats stream snapshot` | Regular scheduled snapshots | Near-zero (point-in-time) |
| Volume snapshot (EBS/ZFS) | Infra-level | Last snapshot |
| File copy of `store_dir` | Disaster recovery | Cold |

> **Note:** RAFT replicas handle node-failure recovery automatically. Backups guard against full-cluster loss or accidental stream deletion.

## Docker Compose Example

```yaml
services:
  nats:
    image: nats:2.10-alpine
    command: ["-js", "-sd", "/data/jetstream"]
    ports:
      - "4222:4222"
      - "8222:8222"
    volumes:
      - nats-data:/data/jetstream
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  nats-data:
    driver: local
```

---

See also:

- [Deployment — JetStream Stream Configuration](../README.md#jetstream-stream-configuration) in README
- [Event & Messaging Convention](event-messaging-convention.md)
- [AI Agent Guidelines](ai-agent-guidelines.md)
