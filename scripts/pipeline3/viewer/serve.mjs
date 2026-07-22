#!/usr/bin/env node
// Gen-3 graph viewer server: serves viewer.html + graph.json from one origin.
// Usage: node serve.mjs [path/to/graph.json]  (falls back to mock-graph.json)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const graphPath = resolve(
  process.argv[2] ?? join(root, '../../../_bmad-output/pipeline3/graph.json'),
);
const mockPath = join(root, 'mock-graph.json');
const port = Number(process.env.PORT ?? 8317);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  try {
    if (path === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    if (path === '/graph.json') {
      const body = await readFile(graphPath).catch(() => readFile(mockPath));
      res.writeHead(200, { 'content-type': 'application/json' }).end(body);
      return;
    }
    const file = path === '/' ? 'viewer.html' : decodeURIComponent(path.slice(1));
    if (file.includes('..')) throw new Error('traversal');
    const body = await readFile(join(root, file));
    res
      .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
      .end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => {
  console.log(`viewer: http://localhost:${port}/  (graph: ${graphPath}, mock fallback)`);
});
