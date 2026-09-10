import app from '../app';

interface RouteInfo {
  method: string;
  path: string;
}

function getPrefix(layer: any): string {
  if (layer.matchers && layer.matchers.length > 0) {
    const auth = layer.matchers[0]('/api/auth/test');
    if (auth && auth.path === '/api/auth') return '/api/auth';

    const admin = layer.matchers[0]('/api/admin/test');
    if (admin && admin.path === '/api/admin') return '/api/admin';

    const api = layer.matchers[0]('/api/test');
    if (api && api.path === '/api') return '/api';
  }
  return '';
}

function extractRoutes(stack: any[], prefix = ''): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const layer of stack) {
    if (layer.route) {
      const rawPaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
      for (const method of methods) {
        for (const p of rawPaths) {
          const fullPath = (prefix + (p === '/' ? '' : p)).replace(/\/+/g, '/') || '/';
          routes.push({ method, path: fullPath });
        }
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const routerPrefix = getPrefix(layer);
      const combinedPrefix = (prefix + routerPrefix).replace(/\/+/g, '/');
      routes.push(...extractRoutes(layer.handle.stack, combinedPrefix));
    }
  }

  return routes;
}

const router = (app as any).router || (app as any)._router;
const stack = router?.stack || [];
console.log('Router found:', !!router, 'Stack length:', stack.length);
const routes = extractRoutes(stack);

console.log(`\n================ TOTAL ROUTES FOUND: ${routes.length} ================`);

// Sort routes alphabetically by path then method
routes.sort((a, b) => {
  if (a.path === b.path) return a.method.localeCompare(b.method);
  return a.path.localeCompare(b.path);
});

// Check collisions (same METHOD + exact PATH)
const seen = new Map<string, number>();
const collisions: { method: string; path: string; count: number }[] = [];

for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  const count = (seen.get(key) || 0) + 1;
  seen.set(key, count);
}

for (const [key, count] of seen.entries()) {
  if (count > 1) {
    const [method, path] = key.split(' ') as [string, string];
    collisions.push({ method, path, count });
  }
}

console.log('\n--- ALL REGISTERED ROUTES ---');
for (const r of routes) {
  console.log(`${r.method.padEnd(7)} ${r.path}`);
}

console.log('\n================ COLLISION CHECK RESULTS ================');
if (collisions.length === 0) {
  console.log('✅ ZERO COLLISIONS DETECTED! All METHOD + PATH pairs are completely unique.');
  console.log(`Total verified unique routes: ${routes.length}`);
} else {
  console.error(`❌ COLLISION DETECTED: Found ${collisions.length} duplicate route(s):`);
  for (const c of collisions) {
    console.error(`  - ${c.method} ${c.path} (registered ${c.count} times)`);
  }
  process.exit(1);
}
