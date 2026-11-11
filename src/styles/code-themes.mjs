// Two Shiki themes for code blocks, drawn from the site palette: gray scale plus the one green.
// Strings and numbers are green, keywords step back, comments are the faintest readable gray.

/** @param {{ name: string, type: 'dark' | 'light', bg: string, fg: string, quiet: string, faint: string, green: string, type2: string, selection: string }} p */
function theme(p) {
	return {
		name: p.name,
		type: p.type,
		colors: {
			'editor.background': p.bg,
			'editor.foreground': p.fg,
			'editor.selectionBackground': p.selection,
			'editorLineNumber.foreground': p.faint,
		},
		tokenColors: [
			{ scope: ['comment', 'punctuation.definition.comment', 'string.comment'], settings: { foreground: p.faint } },
			{
				scope: [
					'keyword',
					'storage',
					'storage.type',
					'storage.modifier',
					'keyword.operator',
					'punctuation',
					'meta.brace',
					'meta.delimiter',
				],
				settings: { foreground: p.quiet },
			},
			{
				scope: ['string', 'string.quoted', 'string.template', 'constant.numeric', 'constant.language', 'constant.character', 'markup.inline.raw'],
				settings: { foreground: p.green },
			},
			{
				scope: [
					'entity.name.type',
					'entity.name.class',
					'support.type',
					'support.class',
					'entity.other.inherited-class',
					'storage.type.annotation',
					'punctuation.definition.annotation',
					'meta.declaration.annotation',
					'entity.name.tag',
					'support.type.property-name',
					'entity.name.tag.yaml',
					'meta.object-literal.key',
				],
				settings: { foreground: p.type2 },
			},
			{ scope: ['entity.name.function', 'support.function', 'variable', 'entity.other.attribute-name'], settings: { foreground: p.fg } },
			{ scope: ['markup.heading', 'markup.bold'], settings: { foreground: p.fg, fontStyle: 'bold' } },
			{ scope: ['markup.inserted'], settings: { foreground: p.green } },
			{ scope: ['markup.deleted'], settings: { foreground: p.quiet } },
		],
	};
}

export const ledgerDark = theme({
	name: 'ledger-dark',
	type: 'dark',
	bg: '#0a0c0b',
	fg: '#cfd6d1',
	quiet: '#98a19b',
	faint: '#7e8781',
	green: '#8fe3ad',
	type2: '#b3d6c1',
	selection: '#24392c',
});

export const ledgerLight = theme({
	name: 'ledger-light',
	type: 'light',
	bg: '#eff1ed',
	fg: '#1c211e',
	quiet: '#566059',
	faint: '#606963',
	green: '#17643a',
	type2: '#2f5b43',
	selection: '#cfe6d6',
});
