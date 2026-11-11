// Facts on the index page. Each one comes from the repository named in `repo`:
// versions from pom.xml or package.json, requirements from the README and the build files.

// Counted with grep over the test sources (@Test, it(, test() on this date.
export const testsCountedOn = '11 November 2026';

export const libraries = [
	{
		name: 'spring-idempotency',
		tests: 58,
		testSource: 'JUnit, src/test. 15 of the 69 runs need Docker',
		entry: '@Idempotent',
		summary:
			'Idempotency-Key support for Spring Boot MVC. A client retries a POST or PATCH with the same key and the server replays the first response instead of running the handler again.',
		stack: 'Java 21, Spring Boot 4.1',
		version: '0.1.0-SNAPSHOT',
		kind: 'Library',
	},
	{
		name: 'spring-gotenberg-reports',
		tests: 24,
		testSource: 'JUnit, src/test. 6 need Docker',
		entry: 'GET /api/reports/{type}/{id}',
		summary:
			'PDF reports from Thymeleaf HTML templates, rendered by Gotenberg. Long reports are split into sections, rendered in parallel and merged, with progress over Server-Sent Events.',
		stack: 'Java 21, Spring Boot 4.1, Gotenberg 8',
		version: '0.1.0-SNAPSHOT',
		kind: 'Reference application',
	},
	{
		name: 'ngx-sse-resource',
		tests: 27,
		testSource: 'Vitest, one spec file',
		entry: 'sseResource()',
		summary:
			'Server-Sent Events as Angular signals. One function opens an EventSource, keeps the last event in a signal, reconnects with exponential backoff and closes with its component.',
		stack: 'Angular 22',
		version: '0.1.0',
		kind: 'Library',
	},
	{
		name: 'share-links',
		tests: 41,
		testSource: 'node --test, four files',
		entry: 'POST /api/links',
		summary:
			'A small HTTP service for short links to URL-fragment state and for image uploads with delete tokens. One Node process, standard library only.',
		stack: 'Node 24, no dependencies',
		version: '1.0.0',
		kind: 'Self-hosted service',
	},
];

export const related = [
	{
		name: 'brackets',
		href: 'https://libs.clx.pe',
		summary:
			'Tournament formats for Go: seeding, brackets, byes, Swiss pairings, round robins, group stages and multi-stage flows.',
		stack: 'Go',
	},
	{
		name: 'hashchain',
		href: 'https://libs.clx.pe',
		summary: 'An append-only, tamper-evident log for Go. Every entry commits to the hash of the entry before it.',
		stack: 'Go',
	},
];
