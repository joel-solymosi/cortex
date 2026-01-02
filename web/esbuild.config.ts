import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.argv.includes('--watch');

const ctx = await esbuild.context({
    entryPoints: [path.join(__dirname, 'src/index.tsx')],
    bundle: true,
    outfile: path.join(__dirname, 'dist/bundle.js'),
    minify: !isDev,
    sourcemap: isDev,
    format: 'esm',
    target: ['es2020'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: {
        '.tsx': 'tsx',
        '.ts': 'ts',
        '.css': 'css',
    },
    define: {
        'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    },
});

if (isDev) {
    await ctx.watch();
    console.log('Watching for changes...');
} else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build complete');
}
