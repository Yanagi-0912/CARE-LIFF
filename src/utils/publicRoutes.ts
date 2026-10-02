const PUBLIC_ROUTE_PREFIXES = ['/legal/testing'];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_PREFIXES.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
