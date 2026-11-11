---
title: Installation
description: Requirements, running the service with Node or Docker Compose, and running the test suite.
---

share-links is distributed as source. There is no package to install and no published container image: you clone the repository and run it with Node, or build the image locally with Docker Compose.

```bash
git clone https://github.com/Aquilabot/share-links.git
cd share-links
```

## Requirements

| Path | You need |
| --- | --- |
| Node | Node 24 or later (`"engines": { "node": ">=24" }`). No `npm install` step: the project has no dependencies. |
| Docker Compose | Docker with the Compose plugin. The image is built from `node:24-alpine`. |
| Tests | Node 24 or later. CI runs the suite on Node 24 and 26. |

The service listens on port `8080` by default.

## Run with Node

```bash
npm start
```

`npm start` runs `node --disable-warning=ExperimentalWarning src/main.mjs`. With no environment set, the service:

- listens on all interfaces, port `8080`;
- uses `http://localhost:8080` as `PUBLIC_ORIGIN`, the only accepted browser origin and the base of every returned URL;
- creates `./data` (relative to the working directory) with `links.sqlite`, `images.sqlite` and a `backups/` folder;
- writes one JSON line per event and per request to stdout.

The first line says it is listening:

```json
{"time":"2026-10-24T09:00:00.000Z","event":"listening","port":8080}
```

Configuration comes from environment variables. For example, to serve an app at `https://app.example.com` from a proxy on the same host:

```bash
PUBLIC_ORIGIN=https://app.example.com \
TRUSTED_PROXIES=127.0.0.1/32 \
HOST=127.0.0.1 \
DATA_DIR=/var/lib/share-links \
npm start
```

A malformed value stops the service at start with an error. Every variable is listed in the [configuration reference](/libs/share-links/reference/configuration/).

`SIGTERM` and `SIGINT` close the server and both databases, then exit. If open connections keep the server from closing, the process exits after 5 seconds anyway.

## Run with Docker Compose

```bash
docker compose up --build
```

Then check `http://localhost:8080/api/health`. The repository's `compose.yaml` builds the image and runs it with these settings:

```yaml title="compose.yaml"
services:
  share-links:
    build: .
    image: share-links:1
    restart: unless-stopped
    environment:
      PUBLIC_ORIGIN: http://localhost:8080
      LINK_TARGET_PATH: /
      LINK_MISSING_PATH: /link-not-found
      TRUSTED_PROXIES: ""
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - data:/data
    read_only: true
    tmpfs:
      - /tmp:size=8m
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    mem_limit: 128m
    cpus: 0.5
    pids_limit: 64
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: "3"

volumes:
  data:
```

What the image and the compose file do:

- The `Dockerfile` copies only `package.json` and `src/`. Tests, the benchmark, the README and `openapi.yaml` are excluded by `.dockerignore`.
- The process runs as the image's unprivileged `node` user (uid 1000), which owns only `/data`. `DATA_DIR=/data` and `PORT=8080` are set in the image.
- The root filesystem is read-only. The service writes only to the `data` volume mounted at `/data`.
- The port is published on `127.0.0.1` only. A reverse proxy on the host is expected in front of it.
- The image has a `HEALTHCHECK` that fetches `http://127.0.0.1:8080/api/health` every 30 seconds and fails on any non-2xx answer.

For a real deployment, set `PUBLIC_ORIGIN` to the app's origin and `TRUSTED_PROXIES` to the proxy's address range. See [running behind a reverse proxy](/libs/share-links/guides/reverse-proxy/).

## Run the tests

```bash
npm test
```

`npm test` runs `node --disable-warning=ExperimentalWarning --test`. CI runs `node --test` on Node 24 and 26 on every push to `main` and on pull requests.

The suite has 41 tests in four files under `tests/`: `http.test.mjs`, `links.test.mjs`, `images.test.mjs` and `units.test.mjs`. Each HTTP test starts its own server on a random port on `127.0.0.1` with temporary databases, so the suite needs no running service and no network. Every address in the tests is `127.0.0.1` or from the documentation ranges.

The tests are not part of the container image. Run them from a checkout.
