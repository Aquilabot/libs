---
title: Compatibility
description: Supported Node versions, dependencies, storage model, license and known limitations.
---

## Node version

| Source | Version |
| --- | --- |
| `package.json` `engines` | `>=24` |
| `Dockerfile` base image | `node:24-alpine` |
| CI matrix (`.github/workflows/ci.yml`) | Node 24 and 26 on `ubuntu-latest` |
| README test and benchmark run | Node v26.12.1 |

The service uses `node:sqlite`. The npm scripts and the container command start Node with `--disable-warning=ExperimentalWarning`.

The code is ES modules (`"type": "module"`, `.mjs` files) and runs directly with `node`. There is no build or transpile step.

## Dependencies

None. `package.json` has no `dependencies` and no `devDependencies`. The service uses only Node's standard library: `node:http`, `node:sqlite`, `node:zlib`, `node:crypto`, plus `node:net`, `node:fs` and `node:path`. Tests use `node:test`.

## Distribution

The project is distributed as source on GitHub. `package.json` is `"private": true` at version `1.0.0`, so it is not published to npm. The container image is built locally from the `Dockerfile`. The compose file tags it `share-links:1`. No prebuilt image is published.

## Storage model

- Two SQLite files under `DATA_DIR`: `links.sqlite` and `images.sqlite`, each with `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000` and `STRICT` tables.
- Images are stored as blobs inside `images.sqlite`, not as files on disk.
- Daily backups with `VACUUM INTO` go to `DATA_DIR/backups`, inside the same volume.
- Rate-limit counters and the memory budget live in the memory of the one process. A restart clears them, and two processes would not share them.

## License

MIT. See [`LICENSE`](https://github.com/Aquilabot/share-links/blob/main/LICENSE).

## Known limitations

- Same origin only. There is no CORS, so an app on another origin cannot call the API from a browser.
- No uploader authentication. Abuse is bounded by rate limits and store caps, not by identity.
- No TLS. A reverse proxy must terminate it.
- Images are checked by their header bytes only. Pixels are never decoded, so a file with a valid header and broken data is stored. No malware scanning.
- Images never expire. They are removed only with their delete token or by `src/admin.mjs`.
- Links cannot be deleted or listed through the HTTP API. Operators use `src/admin.mjs` for that.
- The service checks the payload's container (prefix, base64url, gzip, JSON object), not the fields of the object.
- Per-image size (1.5 MiB), image dimensions (16 to 2048 px) and payload sizes (48 KiB compressed, 256 KiB of JSON) are fixed in code.
- One process with local SQLite files. The repository does not describe running several instances.
- Node's own socket timeouts (`headersTimeout`, `requestTimeout`) are set but not covered by tests.
- The quick-start shell command uses GNU `base64 -w0`.
