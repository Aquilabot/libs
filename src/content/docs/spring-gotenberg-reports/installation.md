---
title: Installation
description: Requirements and the two supported ways to run the application, Docker Compose or Maven with Gotenberg in Docker.
---

The project is distributed as source. There is no published artifact to add as a dependency, so installing it means cloning the repository and running the application.

## Requirements

| Path | You need |
|---|---|
| Docker Compose | Docker with the Compose plugin. Nothing else: the JDK and Maven run inside the build stage of the `Dockerfile`. |
| Maven | JDK 21 or newer, and Docker to run Gotenberg. Maven itself is not required, the repository ships the Maven Wrapper (`mvnw`, `mvnw.cmd`), which downloads Maven 3.9.16. |
| Tests | Same as the Maven path. Integration tests need a reachable Docker daemon. |

Ports used: `8080` for the application, `3000` for Gotenberg.

## Clone

```bash
git clone https://github.com/Aquilabot/spring-gotenberg-reports.git
cd spring-gotenberg-reports
```

## Run with Docker Compose

```bash
docker compose up --build
```

`docker-compose.yml` starts two services:

| Service | Image | Notes |
|---|---|---|
| `gotenberg` | `gotenberg/gotenberg:8` | Started with `--api-timeout=30s`, `--chromium-max-concurrency=6` and `--log-std-format=json`. A health check calls `http://localhost:3000/health` every 5 seconds. Port 3000 is not published to the host. |
| `app` | Built from the `Dockerfile` | Publishes port 8080. Sets `GOTENBERG_URL=http://gotenberg:3000` and `LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs`. Waits until `gotenberg` is healthy. |

The `Dockerfile` has two stages. The build stage (`eclipse-temurin:21-jdk`) runs `./mvnw -B -q package -DskipTests`. The runtime stage (`eclipse-temurin:21-jre`) runs the jar as a non-root system user with UID 10001 and `-XX:MaxRAMPercentage=75`.

To call Gotenberg from the host while working on templates, uncomment the `ports` block of the `gotenberg` service in `docker-compose.yml`.

## Run with Maven

Start Gotenberg in one terminal:

```bash
docker run --rm -p 3000:3000 gotenberg/gotenberg:8
```

Start the application in another:

```bash
./mvnw spring-boot:run
```

The default `gotenberg.url` is `http://localhost:3000`, so no configuration is needed. To point at another Gotenberg instance, set `GOTENBERG_URL` or the `gotenberg.url` property. See [Configuration](/libs/spring-gotenberg-reports/reference/configuration/).

## Build and test

```bash
./mvnw -B verify
```

`verify` runs the unit tests with Surefire, then the integration tests (classes ending in `IT`) with Failsafe. The integration tests start a real `gotenberg/gotenberg:8` container through Testcontainers. They are annotated `@Testcontainers(disabledWithoutDocker = true)`, so without a reachable Docker daemon they are reported as skipped and the build still passes.

CI runs the same command on GitHub Actions (`ubuntu-latest`, Temurin JDK 21) for pushes to `main` and for pull requests.

## Check that it runs

Open `http://localhost:8080`. The page starts a combined report and shows its progress. Then follow the [quick start](/libs/spring-gotenberg-reports/quick-start/).
