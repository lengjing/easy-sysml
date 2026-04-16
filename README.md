# Easy SysML

A production-grade SysML v2 tooling project — parser, language server, and IDE support.

## Architecture

```
.
├── packages/
│   ├── parser/              # Langium grammar, AST, validation, scope
│   └── language-server/     # LSP server (diagnostics, completion, hover, go-to-def)
│
├── apps/
│   ├── vscode-extension/    # VSCode extension + AI chat panel
│   └── web/                 # Monaco editor + chat-based SysML generation
│
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Build everything
pnpm run build

# Or build individual packages
pnpm --filter @easy-sysml/parser run build
pnpm --filter @easy-sysml/language-server run build
```

## Packages

### `@easy-sysml/parser`

Langium-based parser for SysML v2 and KerML.

- **Grammar**: Full SysML v2 + KerML grammar (6,200+ lines)
- **AST**: Generated type-safe AST from Langium
- **Validation**: Extensible rule-based validation engine
- **Scope**: Custom scope computation for SysML's relationship-based AST
- **Standalone API**: `parseSysML(source)` — parse without LSP

```typescript
import { parseSysML } from '@easy-sysml/parser';

const result = parseSysML(`
  package Vehicle {
    part engine : Engine;
  }
`);
console.log(result.success); // true
```

### `@easy-sysml/language-server`

Full LSP implementation:

- **Diagnostics** — syntax errors + semantic validation with cascade filtering
- **Completion** — 21+ SysML snippet templates + keyword/cross-reference completion
- **Hover** — element type, visibility, multiplicity, container context
- **Go-to-definition** — via Langium's built-in cross-reference resolution
- **Find references** — via workspace indexing

### `apps/vscode-extension`

VSCode extension providing:
- Syntax highlighting for `.sysml` and `.kerml` files
- LSP client connecting to the language server
- AI chat panel (placeholder for LLM integration)

### `apps/web`

Browser-based editor:
- Monaco editor with SysML v2 support
- Chat-based SysML generation UI
- Dark-themed interface

## Design Decisions

1. **Langium v4** — Latest version with improved performance and API
2. **Dual grammar** — SysML and KerML as separate Langium grammars
3. **Separation of concerns** — Parser (no LSP deps) vs Language Server (LSP layer)
4. **Registry-based validation** — Rules registered by AST node type for extensibility
5. **Custom scope computation** — Handles SysML's `ownedRelationship` containment model
6. **Cascade error filtering** — Reduces noise from secondary parse errors

## Example Flows

### Parse → Validate → Diagnostics

```
1. User edits .sysml file
2. LSP textDocument/didChange → Langium re-parses document
3. SysMLScopeComputation indexes named elements
4. SysMLDiagnosticProvider runs validation:
   - Lexer/parser errors → simplified messages
   - Semantic rules → SysMLValidator checks
   - Cascade filter removes secondary errors
5. LSP publishDiagnostics → VS Code shows errors
```

### Prompt → AI → SysML

```
1. User types system description in chat panel
2. Chat UI sends prompt to LLM provider (configurable)
3. LLM generates SysML v2 code
4. Generated code inserted into editor
5. Parser validates the generated code
6. User reviews and iterates
```

## License

MIT
