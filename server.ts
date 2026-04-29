import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDbHafas } from 'db-hafas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB HAFAS client
const dbClient = createDbHafas('db-commute-monitor');

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Diagnostic health check
  app.get('/api/health', async (req: any, res: any) => {
    try {
      const start = Date.now();
      const mirrorRes = await fetch('https://v6.db.transport.rest/locations?query=Berlin&results=1', {
        signal: AbortSignal.timeout(5000)
      } as any);
      
      if (mirrorRes.ok) {
        res.json({ healthy: true, source: 'v6-mirror', latency: Date.now() - start });
      } else {
        res.json({ healthy: false, status: mirrorRes.status, source: 'v6-mirror' });
      }
    } catch (e: any) {
      res.json({ healthy: false, error: e.message, source: 'v6-mirror' });
    }
  });

  // Native DB API implementation with Mirror Fallback
  app.get('/api/db/:path(*)', async (req: any, res: any) => {
    const dbPath = req.params.path;
    if (!dbPath) return res.status(400).json({ error: 'Missing path' });

    const UPSTREAM_MIRRORS = [
      'https://v6.db.transport.rest',
      'https://v5.db.transport.rest',
      'https://db.transport.rest',
      'https://v6.hvv.transport.rest',
      'https://v5.hvv.transport.rest',
      'https://transport.rest'
    ];

    let lastError: any = null;
    let success = false;

    for (const host of UPSTREAM_MIRRORS) {
      if (success) break;
      try {
        console.log(`[PROXY] Trying ${host} for ${dbPath}...`);
        const url = new URL(`${host}/${dbPath}`);
        Object.entries(req.query).forEach(([key, value]) => {
          if (typeof value === 'string') url.searchParams.set(key, value);
          else if (Array.isArray(value)) value.forEach(v => url.searchParams.append(key, String(v)));
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per mirror

        const response = await fetch(url.toString(), {
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'CommuteMonitor/1.4 (Node.js Fetch; +https://github.com/derhuerst/db-hafas)'
          },
          signal: controller.signal
        } as any);

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          console.log(`[PROXY] Success from ${host}`);
          success = true;
          return res.json(data);
        } else {
          const text = await response.text().catch(() => '');
          lastError = { status: response.status, host, text };
          console.warn(`[PROXY] ${host} failed with ${response.status}: ${text.substring(0, 50)}`);
          if (response.status === 404) break; // If resource really doesn't exist, stop.
        }
      } catch (err: any) {
        const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');
        console.error(`[PROXY] ${host} Error:`, isTimeout ? 'Timeout' : err.message);
        lastError = { message: err.message, host };
      }
    }

    // If mirrors fail, try native fallback as last resort (often direct HAFAS)
    try {
      if (dbPath === 'locations' || dbPath === 'journeys' || (dbPath.startsWith('stops/') && dbPath.endsWith('/departures'))) {
        console.log(`[NATIVE] Falling back to native client for ${dbPath}`);
        if (dbPath === 'locations') {
          const results = await dbClient.locations(req.query.query as string, { results: 5 });
          return res.json(results);
        }
        if (dbPath === 'journeys') {
          const results = await dbClient.journeys(req.query.from as string, req.query.to as string, { results: 3 });
          return res.json(results);
        }
        if (dbPath.startsWith('stops/') && dbPath.endsWith('/departures')) {
          const stationId = dbPath.split('/')[1];
          const results = await dbClient.departures(stationId, { duration: 120, results: 15 });
          return res.json(results);
        }
      }
    } catch (err: any) {
      console.warn(`[NATIVE] Fallback skipped or failed: ${err.message}`);
    }

    res.status(lastError?.status || 503).json({ 
      error: 'API mirror synchronization failed',
      details: lastError?.message || 'Upstream returned error'
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
