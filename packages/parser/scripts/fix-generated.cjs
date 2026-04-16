#!/usr/bin/env node
/**
 * Post-generation fix for Langium-generated files.
 * Adds @ts-nocheck and fixes circular references in computeIsSubtype.
 * Run after `langium generate`.
 */
const fs = require('fs');
const path = require('path');

const generatedDir = path.join(__dirname, '..', 'src', 'generated');
const files = ['ast.ts', 'grammar.ts', 'module.ts'];

for (const file of files) {
  const filePath = path.join(generatedDir, file);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');

  // Add @ts-nocheck if not already present
  if (!content.startsWith('// @ts-nocheck')) {
    content = '// @ts-nocheck\n' + content;
  }

  // Fix circular reference: NonFeatureElement -> Element -> NonFeatureElement
  if (file === 'ast.ts') {
    content = content.replace(
      /case NonFeatureElement: \{\s*\n\s*return this\.isSubtype\(Element, supertype\) \|\| this\.isSubtype\(MemberElement, supertype\);/,
      `case NonFeatureElement: {\n                return this.isSubtype(MemberElement, supertype);`,
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

console.log('Post-generation fixes applied.');
