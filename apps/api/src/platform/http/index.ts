// Public API of platform/http: error shape, request id, CSRF/content-type policy, app-level HTTP setup.
export { type AppErrorCode, AppException } from './app-exception.js';
export { JSON_BODY_LIMIT_BYTES } from './auth-body-limit.js';
export { CLIENT_IP_HEADER } from './auth-request-policy.js';
export { API_PREFIX, API_PREFIX_EXCLUDE, configureHttp } from './configure-http.js';
export { AcceptsMultipart } from './http-policy.guard.js';
export { IDOR_EXEMPT_KEY, IdorExempt } from './idor-exempt.decorator.js';
export { HttpModule } from './http.module.js';
export { REQUEST_ID_HEADER } from './request-id.middleware.js';
