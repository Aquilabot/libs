// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { ledgerDark, ledgerLight } from './src/styles/code-themes.mjs';
import { sidebar } from './src/sidebar.mjs';

// Published at https://aquilabot.github.io/libs/
export default defineConfig({
	site: 'https://aquilabot.github.io',
	base: '/libs',
	trailingSlash: 'always',
	integrations: [
		starlight({
			title: 'aquilabot/libs',
			description:
				'Documentation for four open source projects by Jean Carlo Benites: spring-idempotency, spring-gotenberg-reports, ngx-sse-resource and share-links.',
			favicon: '/favicon.svg',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Aquilabot' }],
			editLink: { baseUrl: 'https://github.com/Aquilabot/libs/edit/main/' },
			credits: false,
			customCss: [
				'@fontsource-variable/schibsted-grotesk/index.css',
				'@fontsource-variable/jetbrains-mono/index.css',
				'./src/styles/theme.css',
			],
			components: {
				SocialIcons: './src/components/HeaderLinks.astro',
				Footer: './src/components/Footer.astro',
				SkipLink: './src/components/SkipLink.astro',
			},
			expressiveCode: {
				themes: [ledgerDark, ledgerLight],
				useStarlightUiThemeColors: true,
				styleOverrides: {
					borderRadius: '10px',
					borderWidth: '1px',
					borderColor: 'var(--line-strong)',
					codeFontFamily: 'var(--mono)',
					codeFontSize: '0.8125rem',
					codeLineHeight: '1.65',
					codePaddingBlock: '1rem',
					codePaddingInline: '1.15rem',
					uiFontFamily: 'var(--mono)',
					uiFontSize: '0.75rem',
					frames: {
						shadowColor: 'transparent',
						frameBoxShadowCssValue: 'none',
						editorTabBarBackground: 'var(--code-bg)',
						editorActiveTabBackground: 'var(--code-bg)',
						editorActiveTabIndicatorTopColor: 'transparent',
						editorActiveTabIndicatorBottomColor: 'transparent',
						editorTabBarBorderBottomColor: 'var(--line)',
						editorActiveTabForeground: 'var(--faint)',
						editorBackground: 'var(--code-bg)',
						terminalBackground: 'var(--code-bg)',
						terminalTitlebarBackground: 'var(--code-bg)',
						terminalTitlebarBorderBottomColor: 'var(--line)',
						terminalTitlebarForeground: 'var(--faint)',
						terminalTitlebarDotsForeground: 'var(--line-strong)',
						terminalTitlebarDotsOpacity: '1',
						inlineButtonBackground: 'var(--line-strong)',
						inlineButtonBorder: 'var(--line-strong)',
						inlineButtonForeground: 'var(--text)',
						tooltipSuccessBackground: 'var(--accent)',
						tooltipSuccessForeground: 'var(--accent-ink)',
					},
				},
			},
			sidebar,
			plugins: [starlightLinksValidator({ errorOnLocalLinks: false })],
		}),
	],
});
