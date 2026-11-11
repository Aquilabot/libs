// Sidebar: one group per library, pages in reading order.

/**
 * @param {string} lib
 * @param {string[]} guides
 * @param {string[]} reference
 */
function library(lib, guides, reference) {
	return {
		label: lib,
		collapsed: true,
		items: [
			{ label: 'Overview', slug: lib },
			{ label: 'Installation', slug: `${lib}/installation` },
			{ label: 'Quick start', slug: `${lib}/quick-start` },
			{ label: 'Guides', items: guides.map((page) => `${lib}/guides/${page}`) },
			{ label: 'Reference', items: reference.map((page) => `${lib}/reference/${page}`) },
			{ label: 'Compatibility', slug: `${lib}/compatibility` },
		],
	};
}

export const sidebar = [
	{ label: 'All libraries', link: '/' },
	library(
		'spring-idempotency',
		['protecting-endpoints', 'choosing-a-store', 'scoping-keys', 'concurrent-requests', 'error-responses'],
		['configuration', 'api'],
	),
	library(
		'spring-gotenberg-reports',
		[
			'add-a-report-template',
			'charts',
			'headers-and-footers',
			'combined-reports',
			'errors-retries-and-observability',
			'benchmark',
		],
		['configuration', 'http-api', 'java-api'],
	),
	library(
		'ngx-sse-resource',
		['reactive-urls', 'events-and-parsing', 'connection-status', 'reconnection', 'lifecycle-and-ssr', 'testing'],
		['api'],
	),
	library(
		'share-links',
		['short-links', 'image-uploads', 'rate-limits', 'reverse-proxy', 'operations', 'threat-model', 'benchmark'],
		['configuration', 'http-api'],
	),
];
