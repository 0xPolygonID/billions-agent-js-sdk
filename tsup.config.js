import { defineConfig } from 'tsup';
import packageJson from './package.json' with { type: 'json' };
import * as path from 'path';

const getDir = (filePath) => path.dirname(filePath);

// Base external dependencies (for Node.js builds)
const baseExternal = [
  ...Object.keys(packageJson.dependencies),
];

const config = {
  entry: ['src/index.ts'],
  platform: 'node',
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: baseExternal
};

export default defineConfig([
  {
    ...config,
    format: ['esm'],
    outDir: getDir(packageJson.exports['.'].node.import),
  },
  {
    ...config,
    format: ['cjs'],
    outDir: getDir(packageJson.exports['.'].node.require),
    outExtension: () => ({
      '.js': '.cjs',
    }),
  }
]);
