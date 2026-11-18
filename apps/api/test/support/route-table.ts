// Route table of a booted Nest app (11-testing.md §4 p.1), built from the controllers Nest actually registered.
// Better Auth's /api/auth/* is middleware, not a controller, so it is not listed (auth-flow tests cover it);
// adapterRouteProblems() catches routes registered on Express directly, bypassing Nest controllers.
import { METHODS as NODE_HTTP_METHODS } from 'node:http';
import { type CanActivate, type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import {
  DiscoveryService,
  MetadataScanner,
  ModulesContainer,
  NestApplication,
  Reflector,
} from '@nestjs/core';
import { z } from 'zod';
import { AUTH_METADATA } from '../../src/modules/auth/index.js';
import { IDOR_EXEMPT_KEY } from '../../src/platform/http/index.js';
import { type HttpMethod, type Route, routeKey } from './idor-gate.js';

/** The part of Nest's ApplicationConfig the gate reads. */
export interface AppConfigView {
  getGlobalGuards(): CanActivate[];
  getGlobalPrefix(): string;
  getGlobalPrefixOptions(): { exclude?: unknown[] };
  getVersioning(): unknown;
}

const hasMethods = (value: unknown, names: readonly string[]): value is AppConfigView =>
  typeof value === 'object' &&
  value !== null &&
  names.every((name) => typeof Reflect.get(value, name) === 'function');

/**
 * Nest has no public accessor for the app's ApplicationConfig (global prefix, versioning, global guards) and does not
 * register it as a provider; `config` is a private field of NestApplication (Nest 11.2), read via element access and
 * checked by shape, so a Nest upgrade that moves it fails here with a clear message.
 */
export function applicationConfigOf(app: INestApplication): AppConfigView {
  if (!(app instanceof NestApplication)) throw new Error('expected a NestApplication');
  const config: unknown = app['config'];
  const needed = ['getGlobalGuards', 'getGlobalPrefix', 'getGlobalPrefixOptions', 'getVersioning'];
  if (!hasMethods(config, needed)) {
    throw new Error(
      `NestApplication.config no longer exposes ${needed.join('/')} (written against Nest 11.2) — update applicationConfigOf`,
    );
  }
  return config;
}

const METHODS: Partial<Record<RequestMethod, HttpMethod>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
  [RequestMethod.ALL]: 'ALL',
};

const paths = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [typeof value === 'string' ? value : ''];

const normalise = (...parts: string[]): string =>
  `/${parts.join('/')}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');

// What Nest stores per `setGlobalPrefix({ exclude })` entry (mapToExcludeRoute, Nest 11.2).
const PrefixExclude = z.object({
  path: z.string(),
  requestMethod: z.number(),
  pathRegex: z.instanceof(RegExp),
});

interface ModelledExclude {
  matches(method: unknown, unprefixedPath: string): boolean;
}

/**
 * Global-prefix excludes the table models: static paths (e.g. `/health/live`), matched like Nest's router does (its
 * compiled `pathRegex` + method). The thallesp Better Auth mount (`/api/auth`, `/api/auth/*path`) is middleware, not a
 * controller, so it never matches a row. Any other exclude (a `:param`/wildcard) would need path-pattern overlap
 * logic, so it throws instead of silently mis-prefixing rows.
 */
function prefixExcludes(config: AppConfigView): ModelledExclude[] {
  return (config.getGlobalPrefixOptions().exclude ?? []).flatMap((raw) => {
    const parsed = PrefixExclude.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `unexpected setGlobalPrefix exclude shape (written against Nest 11.2): update buildRouteTable`,
      );
    }
    const { path, requestMethod, pathRegex } = parsed.data;
    const normalised = normalise(path);
    if (ADAPTER_ROUTE_ALLOWLIST.includes(normalised)) return [];
    if (/[:*{(]/.test(path)) {
      throw new Error(
        `setGlobalPrefix exclude ${path} is not modelled: only static paths are (extend buildRouteTable)`,
      );
    }
    return [
      {
        matches: (method: unknown, unprefixedPath: string) =>
          // -1 is Nest's legacy "all" marker (isRequestMethodAll).
          (requestMethod === RequestMethod.ALL ||
            requestMethod === -1 ||
            requestMethod === method) &&
          pathRegex.test(unprefixedPath),
      },
    ];
  });
}

export function buildRouteTable(app: INestApplication): Route[] {
  const config = applicationConfigOf(app);
  if (config.getVersioning()) {
    throw new Error('URI versioning is enabled: extend buildRouteTable with VERSION_METADATA');
  }
  const excludes = prefixExcludes(config);
  const prefix = config.getGlobalPrefix();
  // Built from ModulesContainer (always provided) so apps without DiscoveryModule work too.
  const discovery = new DiscoveryService(app.get(ModulesContainer));
  const scanner = new MetadataScanner();
  const reflector = app.get(Reflector);

  const routes: Route[] = [];
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || typeof metatype !== 'function') {
      // e.g. a request-scoped controller: no static instance to scan — never silently skip a controller.
      throw new Error(
        `cannot scan controller ${String(wrapper.name)}: no static instance/metatype`,
      );
    }
    const proto: object = Object.getPrototypeOf(instance);
    const controllerPaths = paths(Reflect.getMetadata(PATH_METADATA, metatype));
    for (const handlerName of scanner.getAllMethodNames(proto)) {
      const handler: unknown = Reflect.get(proto, handlerName);
      if (typeof handler !== 'function') continue;
      const requestMethod: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
      if (requestMethod === undefined) continue;
      // METHOD_METADATA holds a RequestMethod value (Nest's @Get/@Post…); unknown numbers fail just below.
      const method = METHODS[requestMethod as RequestMethod];
      if (!method) throw new Error(`unsupported request method ${String(requestMethod)}`);
      const targets = [handler, metatype];
      const flags = {
        isPublic: reflector.getAllAndOverride<boolean>(AUTH_METADATA.public, targets) === true,
        isOptional: reflector.getAllAndOverride<boolean>(AUTH_METADATA.optional, targets) === true,
        roles:
          reflector.getAllAndOverride<string[] | undefined>(AUTH_METADATA.roles, targets) ?? [],
        // Handler only: @IdorExempt is a MethodDecorator, a class-level value is never honoured.
        idorExempt: reflector.get<string | undefined>(IDOR_EXEMPT_KEY, handler) ?? null,
      };
      for (const controllerPath of controllerPaths) {
        for (const handlerPath of paths(Reflect.getMetadata(PATH_METADATA, handler))) {
          const unprefixed = normalise(controllerPath, handlerPath);
          const excluded = excludes.some((e) => e.matches(requestMethod, unprefixed));
          routes.push({
            method,
            path: excluded ? unprefixed : normalise(prefix, controllerPath, handlerPath),
            ...flags,
            controller: metatype.name,
            handler: handlerName,
          });
        }
      }
    }
  }
  return routes;
}

/**
 * All-method route layers allowed on the Express router: Nest module middleware (`forRoutes('*')`) and the thallesp
 * Better Auth mount. Anything else must be a Nest controller route from the route table.
 */
export const ADAPTER_ROUTE_ALLOWLIST: readonly string[] = [
  '{/*splat}',
  '/api/auth',
  '/api/auth/*path',
];

// Express 5 / router 2.x: app.router.stack[] with `route: { path, methods }` on route layers (verified 2026-11-17).
// The app and its router are callable functions, so only the stack array is schema-checked.
const RouterStack = z.array(
  z.object({
    route: z
      .object({
        path: z.union([z.string(), z.array(z.string())]),
        methods: z.record(z.string(), z.boolean()),
        stack: z.array(z.object({ handle: z.unknown() })),
      })
      .optional(),
  }),
);

/**
 * Where Nest mounts module middleware (`forRoutes('*')`) under a global prefix (Nest 11.2, verified 2026-11-18): the
 * prefix itself, the prefix + splat, and every excluded static path.
 */
function middlewareMounts(app: INestApplication): { all: Set<string>; full: string[] } {
  const config = applicationConfigOf(app);
  const prefix = config.getGlobalPrefix();
  if (prefix === '') return { all: new Set(), full: [] };
  const excluded = (config.getGlobalPrefixOptions().exclude ?? []).map((e) =>
    normalise(String(Reflect.get(Object(e), 'path'))),
  );
  const full = [`${normalise(prefix)}{/*splat}`, ...excluded];
  return { all: new Set([normalise(prefix), ...full]), full };
}

type RouteLayer = NonNullable<z.infer<typeof RouterStack>[number]['route']>;

const isAllMethodLayer = (methods: Readonly<Record<string, boolean>>): boolean =>
  NODE_HTTP_METHODS.every((m) => methods[m.toLowerCase()] === true);

/**
 * Nest mounts each middleware binding on every mount path as an all-method route whose handle is its `handler` closure
 * (middleware-module.js `bindHandlerToRouter`, Nest 11.2; one closure per path, so identity cannot be compared). Hence
 * the mounts are trusted only when every excluded path carries exactly as many all-method layers as the prefix splat
 * (the bare prefix at most as many), all named `handler` — a raw `adapter.all('/health/live', fn)` breaks the count.
 */
function trustedMountPaths(
  layers: readonly RouteLayer[],
  mounts: { all: Set<string>; full: string[] },
): Set<string> {
  const atPath = (path: string) =>
    layers.filter((r) => isAllMethodLayer(r.methods) && paths(r.path).includes(path));
  const [splat] = mounts.full;
  if (splat === undefined) return new Set();
  const expected = atPath(splat).length;
  const trusted = new Set<string>();
  for (const path of mounts.all) {
    const found = atPath(path);
    const countOk = mounts.full.includes(path)
      ? found.length === expected
      : found.length <= expected;
    const namesOk = found.every((r) =>
      r.stack.every(({ handle }) => typeof handle === 'function' && handle.name === 'handler'),
    );
    if (countOk && namesOk) trusted.add(path);
  }
  return trusted;
}

/**
 * Walks the Express router: every route layer must be a route-table row (same method + path) or an allowlisted
 * all-method mount. Catches `getHttpAdapter().get(...)`-style routes that no guard or gate would see.
 */
export function adapterRouteProblems(app: INestApplication, routes: readonly Route[]): string[] {
  const router: unknown = Reflect.get(Object(app.getHttpAdapter().getInstance()), 'router');
  const parsed = RouterStack.safeParse(Reflect.get(Object(router), 'stack'));
  if (!parsed.success) {
    return [
      `Express router stack is not in the Express 5 shape: update adapterRouteProblems\n${z.prettifyError(parsed.error)}`,
    ];
  }
  const known = new Set(routes.map(routeKey));
  const mounts = middlewareMounts(app);
  const layers = parsed.data.flatMap(({ route }) => (route ? [route] : []));
  const trusted = trustedMountPaths(layers, mounts);
  const problems: string[] = [];
  for (const route of layers) {
    for (const path of paths(route.path)) {
      if (ADAPTER_ROUTE_ALLOWLIST.includes(path)) continue;
      if (trusted.has(path) && isAllMethodLayer(route.methods)) continue;
      for (const method of Object.keys(route.methods)) {
        const key = `${method.toUpperCase()} ${path}`;
        if (!known.has(key))
          problems.push(`${key} is registered on Express outside Nest controllers`);
      }
    }
  }
  return problems;
}
