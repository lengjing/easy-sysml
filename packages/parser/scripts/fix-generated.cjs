/**
 * Post-generation fix script for Langium-generated files.
 *
 * Fixes:
 * 1. Adds `// @ts-nocheck` to suppress TypeScript errors in generated code
 * 2. Patches SysMLAstReflection.isSubtype to handle cyclic superTypes
 *    (the SysML grammar produces union types that create mutual cycles,
 *     e.g. Element ↔ NonFeatureElement ↔ MemberElement)
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

  // Fix cyclic isSubtype in ast.ts — the generated superTypes graph has cycles
  // (e.g. Element → OwnedRelatedElement → NonFeatureElement → MemberElement → Element)
  // which cause AbstractAstReflection.isSubtype to overflow the call stack.
  if (file === 'ast.ts') {
    // Replace isSubtype with a cycle-safe BFS implementation
    const marker = 'export const reflection = new SysMLAstReflection();';
    if (content.includes(marker) && !content.includes('_cycleSafeIsSubtype')) {
      const override = `
// --- Cycle-safe isSubtype override (added by fix-generated.cjs) ---
// The SysML grammar generates a type hierarchy with cycles in superTypes.
// AbstractAstReflection.isSubtype recurses via Array.some without cycle
// detection, causing "Maximum call stack size exceeded".  This override
// replaces the recursive DFS with an iterative BFS that handles cycles.
{
    const _cycleSafeIsSubtype = true; // marker to prevent double-patching
    SysMLAstReflection.prototype.isSubtype = function(subtype, supertype) {
        if (subtype === supertype) return true;
        // Check cache
        let nested = this.subtypes[subtype];
        if (!nested) nested = this.subtypes[subtype] = {};
        const cached = nested[supertype];
        if (cached !== undefined) return cached;
        // Iterative BFS through the superTypes graph
        const visited = new Set([subtype]);
        const queue = this.types[subtype]?.superTypes?.slice() || [];
        let found = false;
        for (let i = 0; i < queue.length; i++) {
            const current = queue[i];
            if (current === supertype) { found = true; break; }
            if (visited.has(current)) continue;
            visited.add(current);
            const meta = this.types[current];
            if (meta?.superTypes) {
                for (const s of meta.superTypes) {
                    if (!visited.has(s)) queue.push(s);
                }
            }
        }
        nested[supertype] = found;
        return found;
    };
}
`;
      content = content.replace(marker, override + '\n' + marker);
    }
  }

  fs.writeFileSync(filePath, content);
  console.log(`[fix-generated] Fixed ${file}`);
}

console.log('[fix-generated] Done');
