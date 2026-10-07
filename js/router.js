// Jednoduchý hash router: #/domu, #/nakup, ...
const routes = new Map();
let fallback = null;

export function addRoute(name, view) {
  routes.set(name, view);
  if (!fallback) fallback = name;
}

export function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const name = routes.has(parts[0]) ? parts[0] : fallback;
  return { name, params: routes.has(parts[0]) ? parts.slice(1) : [] };
}

export function navigate(path) {
  location.hash = `#/${path}`;
}

export function startRouter(onChange) {
  const handle = () => {
    const { name, params } = currentRoute();
    onChange(name, routes.get(name), params);
  };
  window.addEventListener('hashchange', handle);
  handle();
  // Vrací funkci, která aktuální pohled vykreslí znovu
  return handle;
}
