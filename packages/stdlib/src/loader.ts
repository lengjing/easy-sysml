import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { getStdlibPath, STDLIB_DEPENDENCY_LAYERS } from './config.js';

/** Result of loading the standard library */
export interface StdlibLoadResult {
  success: boolean;
  filesLoaded: number;
  filesExpected: number;
  errors: string[];
  warnings: string[];
  loadTimeMs: number;
  files: StdlibFile[];
}

/** A loaded stdlib file */
export interface StdlibFile {
  name: string;
  path: string;
  content: string;
  language: 'sysml' | 'kerml';
  layer: number;
}

/** Load options */
export interface StdlibLoadOptions {
  stdlibPath?: string;
  verbose?: boolean;
  layers?: number; // load only first N layers (for testing)
}

/** Load the SysML v2 standard library files */
export async function loadStdlib(options: StdlibLoadOptions = {}): Promise<StdlibLoadResult> {
  const start = Date.now();
  const stdlibPath = options.stdlibPath ?? getStdlibPath();
  const files: StdlibFile[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  let totalExpected = 0;
  const layersToLoad = options.layers !== undefined
    ? STDLIB_DEPENDENCY_LAYERS.slice(0, options.layers)
    : STDLIB_DEPENDENCY_LAYERS;

  for (let layerIdx = 0; layerIdx < layersToLoad.length; layerIdx++) {
    const layer = layersToLoad[layerIdx];
    totalExpected += layer.length;

    // Load files in this layer (can be parallelized)
    await Promise.allSettled(
      layer.map(async (fileName) => {
        const filePath = join(stdlibPath, fileName);
        try {
          const content = await readFile(filePath, 'utf-8');
          const ext = extname(fileName).toLowerCase();
          const language: 'sysml' | 'kerml' = ext === '.kerml' ? 'kerml' : 'sysml';

          const file: StdlibFile = {
            name: fileName,
            path: filePath,
            content,
            language,
            layer: layerIdx,
          };

          files.push(file);
          if (options.verbose) {
            console.log(`  Loaded: ${fileName} (layer ${layerIdx})`);
          }
        } catch (err) {
          const msg = `Failed to load ${fileName}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
        }
      })
    );
  }

  // Also try to load any files not listed in layers
  try {
    const allFiles = await readdir(stdlibPath);
    const layeredFiles = new Set(STDLIB_DEPENDENCY_LAYERS.flat());

    for (const file of allFiles) {
      const ext = extname(file).toLowerCase();
      if ((ext === '.kerml' || ext === '.sysml') && !layeredFiles.has(file)) {
        warnings.push(`File '${file}' exists in stdlib but is not in any dependency layer`);
      }
    }
  } catch {
    // Ignore if directory listing fails
  }

  return {
    success: errors.length === 0,
    filesLoaded: files.length,
    filesExpected: totalExpected,
    errors,
    warnings,
    loadTimeMs: Date.now() - start,
    files,
  };
}

/** Get a list of all expected stdlib file names */
export function getStdlibFileList(): string[] {
  return STDLIB_DEPENDENCY_LAYERS.flat();
}
