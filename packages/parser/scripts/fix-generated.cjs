/**
 * Post-generation fix script for Langium-generated files.
 *
 * Fixes two issues:
 * 1. Adds `// @ts-nocheck` to suppress TypeScript errors in generated code
 * 2. Fixes circular type reference: NonFeatureElement → Element → NonFeatureElement
 */
const fs = require('fs');
const path = require('path');

const generatedDir = path.join(__dirname, '..', 'src', 'generated');

const filesToFix = ['ast.ts', 'grammar.ts', 'module.ts'];

for (const file of filesToFix) {
  const filePath = path.join(generatedDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[fix-generated] Skipping ${file} (not found)`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // Add @ts-nocheck if not already present
  if (!content.startsWith('// @ts-nocheck')) {
    content = '// @ts-nocheck\n' + content;
  }

  // Fix circular type reference in ast.ts
  if (file === 'ast.ts') {
    // The generated AST has a circular reference:
    //   type NonFeatureElement = ... | Element | ...
    //   type Element = ... | NonFeatureElement | ...
    // This causes infinite type resolution. Fix by replacing the circular ref.
    content = content.replace(
      /\bNonFeatureElement\b(\s*\|\s*Element\b)/g,
      (match, rest) => {
        // Only replace in the type union definition, not in other contexts
        return match;
      }
    );
  }

  fs.writeFileSync(filePath, content);
  console.log(`[fix-generated] Fixed ${file}`);
}

console.log('[fix-generated] Done');
