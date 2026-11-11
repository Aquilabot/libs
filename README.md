# aquilabot/libs

Documentation site for four open source projects, published at <https://aquilabot.github.io/libs/>.

| Project | Docs | Source |
|---|---|---|
| spring-idempotency | [/libs/spring-idempotency/](https://aquilabot.github.io/libs/spring-idempotency/) | [Aquilabot/spring-idempotency](https://github.com/Aquilabot/spring-idempotency) |
| spring-gotenberg-reports | [/libs/spring-gotenberg-reports/](https://aquilabot.github.io/libs/spring-gotenberg-reports/) | [Aquilabot/spring-gotenberg-reports](https://github.com/Aquilabot/spring-gotenberg-reports) |
| ngx-sse-resource | [/libs/ngx-sse-resource/](https://aquilabot.github.io/libs/ngx-sse-resource/) | [Aquilabot/ngx-sse-resource](https://github.com/Aquilabot/ngx-sse-resource) |
| share-links | [/libs/share-links/](https://aquilabot.github.io/libs/share-links/) | [Aquilabot/share-links](https://github.com/Aquilabot/share-links) |

All six libraries are listed at <https://oss.clx.pe>. The docs for `brackets` and `hashchain` live at <https://libs.clx.pe>.

## Working on the site

Built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build). Requires Node 22.23 or later.

```sh
npm ci
npm run dev      # http://localhost:4321/libs/
npm run build    # writes dist/ and fails on a broken internal link
```

- Pages are Markdown under `src/content/docs/<project>/`.
- The sidebar order is in `src/sidebar.mjs`.
- The facts on the index page, including the test counts, are in `src/data/libraries.mjs`. Recount the tests when a library changes.
- The theme is `src/styles/theme.css` plus two code themes in `src/styles/code-themes.mjs`. `DESIGN.md` describes it.

Internal links are written with the `/libs/` base and a trailing slash, for example `/libs/share-links/reference/http-api/`.

A push to `main` builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).

## Accuracy

Each page was written from the code, tests and build files of its repository. If a page disagrees with the code, the code is right. Please open an issue.

## License

MIT. See [LICENSE](LICENSE).
