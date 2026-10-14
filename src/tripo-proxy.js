// Allowlist for the Tripo proxy used by the browser forge. Tripo's API sends no CORS
// headers, so the browser goes through this site instead. The user's key travels with
// each request and is never stored. Shared by src/server.js and the Netlify edge function.

export const TRIPO_API = "https://openapi.tripo3d.ai/v3";

const ROUTES = [
  ["GET", /^\/account\/balance$/],
  ["GET", /^\/tasks\/[\w-]+$/],
  ["POST", /^\/generation\/text-to-model$/],
  ["POST", /^\/animations\/rig-check$/],
  ["POST", /^\/animations\/rig$/],
  ["POST", /^\/animations\/retarget$/],
];

// Maps /api/tripo/<route> to the Tripo URL, or null if the route isn't one the forge uses.
export function apiTarget(method, pathname) {
  const route = pathname.replace(/^\/api\/tripo/, "");
  return ROUTES.some(([m, re]) => m === method && re.test(route)) ? TRIPO_API + route : null;
}

// Generated files live on Tripo's storage; refuse to fetch anything else.
export function fileTarget(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname;
    const ok = u.protocol === "https:" && (/(^|\.)tripo3d\.(com|ai)$/.test(host) || host.startsWith("tripo-data."));
    return ok ? u.href : null;
  } catch {
    return null;
  }
}

export const validAuth = (h) => typeof h === "string" && /^Bearer tsk_[\w-]+$/.test(h);
