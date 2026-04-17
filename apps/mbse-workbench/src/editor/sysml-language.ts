/**
 * SysML/KerML Language Definition for Monaco Editor
 *
 * Provides syntax highlighting via a Monarch tokenizer and
 * language configuration (brackets, comments, auto-closing pairs).
 */
import type * as monaco from 'monaco-editor';

export const SYSML_LANGUAGE_ID = 'sysml';

/** Language configuration (brackets, comments, auto-closing). */
export const sysmlLanguageConfiguration: monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: "'", close: "'", notIn: ['string'] },
    { open: '/*', close: ' */', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  folding: {
    markers: {
      start: /^\s*\/\/\s*#?region\b/,
      end: /^\s*\/\/\s*#?endregion\b/,
    },
  },
  indentationRules: {
    increaseIndentPattern: /\{[^}"']*$/,
    decreaseIndentPattern: /^\s*\}/,
  },
};

/** Monarch tokenizer for SysML v2 / KerML syntax highlighting. */
export const sysmlMonarchTokens: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.sysml',

  keywords: [
    // SysML v2 definition keywords
    'package', 'part', 'port', 'action', 'state', 'item', 'attribute',
    'connection', 'interface', 'allocation', 'requirement', 'constraint',
    'concern', 'case', 'analysis', 'verification', 'use', 'view',
    'viewpoint', 'rendering', 'metadata', 'occurrence', 'exhibit',
    'flow', 'succession', 'transition',
    // Definition/usage suffixes
    'def', 'usage',
    // KerML keywords
    'block', 'feature', 'type', 'class', 'datatype', 'struct',
    'assoc', 'connector', 'binding', 'step', 'expr', 'function',
    'predicate', 'interaction', 'behavior', 'calculation',
    // Modifiers
    'abstract', 'readonly', 'derived', 'end', 'ordered', 'nonunique',
    'in', 'out', 'inout', 'ref', 'composite', 'portion', 'variation',
    'variant', 'individual', 'snapshot', 'timeslice', 'private',
    'protected', 'public',
    // Relationships
    'specializes', 'conjugates', 'subsets', 'redefines', 'references',
    'chains', 'inverse', 'typing', 'featuring',
    // Body keywords
    'import', 'alias', 'comment', 'doc', 'about', 'rep', 'language',
    'assert', 'assume', 'require', 'satisfy', 'verify', 'expose',
    'subject', 'objective', 'frame', 'return',
    // Control
    'if', 'then', 'else', 'while', 'until', 'loop', 'for',
    'send', 'accept', 'via', 'to', 'from', 'do', 'entry', 'exit',
    'perform', 'assign', 'decide', 'merge', 'join', 'fork',
    'first', 'after', 'all',
    // Literals
    'true', 'false', 'null',
  ],

  typeKeywords: [
    'Boolean', 'Integer', 'Real', 'String', 'Natural', 'Positive',
    'UnlimitedNatural', 'Complex', 'ScalarValues',
  ],

  operators: [
    '=', '>', '<', '>=', '<=', '==', '!=',
    '+', '-', '*', '/', '%', '**',
    '->', ':>', '::>', ':>>', '~',
    '..', '..',
  ],

  symbols: /[=><!~?:&|+\-*/^%]+/,

  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Comments
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],

      // Documentation
      [/\bdoc\b/, 'keyword', '@docBlock'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string'],

      // Numbers
      [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],

      // Identifiers and keywords
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@typeKeywords': 'type.identifier',
          '@keywords': 'keyword',
          '@default': 'identifier',
        },
      }],

      // Delimiters and operators
      [/[{}()[\]]/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': '',
        },
      }],

      // Separators
      [/[;,.]/, 'delimiter'],

      // Whitespace
      [/\s+/, 'white'],
    ],

    comment: [
      [/[^/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],

    docBlock: [
      [/\/\*/, 'comment.doc', '@docComment'],
      [/\s+/, 'white'],
      [/./, '', '@pop'],
    ],

    docComment: [
      [/[^/*]+/, 'comment.doc'],
      [/\*\//, 'comment.doc', '@popall'],
      [/[/*]/, 'comment.doc'],
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
    ],
  },
};

/**
 * Register the SysML language with a Monaco editor instance.
 * Call once during application initialisation.
 */
export function registerSysMLLanguage(monacoInstance: typeof monaco): void {
  if (monacoInstance.languages.getLanguages().some(l => l.id === SYSML_LANGUAGE_ID)) {
    return;
  }

  monacoInstance.languages.register({
    id: SYSML_LANGUAGE_ID,
    extensions: ['.sysml', '.kerml'],
    aliases: ['SysML', 'KerML', 'sysml'],
    mimetypes: ['text/x-sysml'],
  });

  monacoInstance.languages.setMonarchTokensProvider(SYSML_LANGUAGE_ID, sysmlMonarchTokens);
  monacoInstance.languages.setLanguageConfiguration(SYSML_LANGUAGE_ID, sysmlLanguageConfiguration);
}
