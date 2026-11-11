---
title: Operations, admin commands and backups
description: The admin command for stats, sweeps and purges, the daily SQLite backups, health checks and the log format.
---

## Data on disk

Everything lives under `DATA_DIR` (`./data` by default, `/data` in the container image):

| Path | Content |
| --- | --- |
| `links.sqlite` | Short links. WAL mode, `synchronous = NORMAL`. |
| `images.sqlite` | Images and the SHA-256 of their delete tokens. Same settings. |
| `backups/links-YYYY-MM-DD.sqlite` | Daily copies of the links database. |
| `backups/images-YYYY-MM-DD.sqlite` | Daily copies of the images database. |

Each store has its own file so images never weigh on the links' database or its backups.

## Backups and the expiry sweep

At start, and then every `BACKUP_INTERVAL_MS` (one hour by default), the server runs a maintenance step:

1. If `backups/links-<today>.sqlite` does not exist (today in UTC), it runs `VACUUM INTO` to a temporary file and renames it into place. It then keeps the newest `BACKUP_KEEP` (7) daily link backups and deletes older ones.
2. The same for images, keeping `IMAGE_BACKUP_KEEP` (2).
3. It deletes expired links.

A backup that is created or a file that is removed produces a log line, for example `{"event":"backup","file":"links-2026-10-24.sqlite","created":true,"removed":0}`. A failure is logged with `"level":"error"` and does not stop the service.

Backup files are ordinary SQLite databases. They sit inside the data volume, next to the live databases.

`BACKUP_INTERVAL_MS=0` stops the periodic run. The maintenance step at start still runs once.

## The admin command

`src/admin.mjs` works on the databases of a running service and prints one JSON line. It never prints payloads or image bytes. It reads `DATA_DIR` and the store caps from the environment, so run it with the same environment as the service.

```bash
node src/admin.mjs stats
node src/admin.mjs sweep
node src/admin.mjs purge --from 2026-10-01T00:00:00Z --to 2026-10-02T00:00:00Z --unopened [--yes]
node src/admin.mjs image-stats
node src/admin.mjs image-purge --id Jd83kQm0aZ [--yes]
node src/admin.mjs image-purge --from 2026-10-01T00:00:00Z --to 2026-10-02T00:00:00Z [--yes]
```

In the container:

```bash
docker compose exec share-links node --disable-warning=ExperimentalWarning src/admin.mjs stats
```

### Commands and output

| Command | Output fields |
| --- | --- |
| `stats` | `count`, `bytes`, `unopened`, `unopenedBytes`, `oldest`, `newest`, `level`, `maxLinks`, `maxLinkBytes` |
| `sweep` | `deleted`: expired links removed now |
| `purge --from --to [--unopened] [--yes]` | `from`, `to`, `unopened`, `dryRun`, `count`, `bytes`, `deleted` |
| `image-stats` | `count`, `bytes`, `oldest`, `newest`, `level`, `maxImages`, `maxImageBytes` |
| `image-purge --id <id> [--yes]` | `id`, `found`, `dryRun`, `deleted` |
| `image-purge --from --to [--yes]` | `from`, `to`, `dryRun`, `count`, `bytes`, `deleted` |

`oldest` and `newest` are creation times. `unopened` counts links whose `/s/` URL nobody has opened yet.

### Rules for arguments

- `purge` and `image-purge` only count until `--yes` is given. Without it, `dryRun` is `true` and `deleted` is `0`.
- `--from` and `--to` select rows created in `[from, to)`. Each takes a date (`2026-10-01`) or a UTC time (`2026-10-01T10:30:00Z`, seconds and milliseconds optional). `from` must be earlier than `to`.
- `purge` without `--unopened` deletes opened links in the window too.
- `image-purge --id` deletes an image whoever uploaded it, without its token. It takes either `--id` or a `--from`/`--to` pair, not both.
- Each command accepts only its own options. `stats --yes` or `image-purge --id ... --unopened` fails instead of ignoring the extra option.
- Invalid arguments print the usage line to stderr and exit with code 1.

Example: count and then delete links created during one day that nobody opened.

```bash
node src/admin.mjs purge --from 2026-10-01 --to 2026-10-02 --unopened
# {"from":"2026-10-01T00:00:00.000Z","to":"2026-10-02T00:00:00.000Z","unopened":true,"dryRun":true,"count":<n>,"bytes":<n>,"deleted":0}
node src/admin.mjs purge --from 2026-10-01 --to 2026-10-02 --unopened --yes
```

Links have no delete route in the HTTP API. `purge` and `sweep` are the only ways to remove them before they expire.

## Health checks

`GET /api/health` (or `HEAD`) answers `200 {"status":"ok","links":"<level>","images":"<level>"}` while both databases answer a ping. A ping with an unexpected result answers `503 {"error":"unavailable"}`. A database error answers `500 {"error":"internal"}`. The endpoint is not rate limited. The container's `HEALTHCHECK` calls it every 30 seconds.

A `high` or `full` level is not an error for the health check: it still answers `200`. Watch the level fields, or the `storage` log events, to see a store filling up.

## Logs

The service writes one JSON object per line to stdout, each with a `time` field.

| Kind | Fields |
| --- | --- |
| Request | `method`, `route`, `status`, `ms` |
| `listening` | `port` |
| `storage` | `store`, `usage` (`ok`, `high`, `full`), and `level: "warning"` unless `usage` is `ok` |
| `backup`, `image-backup` | `file`, `created`, `removed` |
| `expired` | `removed`: links deleted by the sweep |
| Error | `level: "error"`, then `route` and the error's class name for a request, or `event` and the message for maintenance |

Request lines never contain ids, payloads, addresses or tokens. The compose file rotates container logs at 10 MB with three files.

## Shutdown

`SIGTERM` and `SIGINT` stop the backup timer, close the HTTP server, close both databases and exit with code 0. If the server has not closed after 5 seconds, the process exits anyway.
