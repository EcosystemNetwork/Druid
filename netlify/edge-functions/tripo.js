// Same-origin proxy so the in-browser forge can reach the Tripo API from the static site.
import { apiTarget, fileTarget, validAuth } from "../../src/tripo-proxy.js";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (request) => {
  const url = new URL(request.url);

  if (url.pathname === "/api/tripo-file") {
    const target = fileTarget(url.searchParams.get("url"));
    if (!target) return json(400, { code: -1, message: "Only Tripo file URLs can be fetched" });
    const res = await fetch(target);
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" },
    });
  }

  const target = apiTarget(request.method, url.pathname);
  if (!target) return json(404, { code: -1, message: "Unknown Tripo route" });
  const auth = request.headers.get("authorization");
  if (!validAuth(auth)) return json(401, { code: 2, message: "Missing or malformed Tripo API key (it starts with tsk_)" });

  const res = await fetch(target, {
    method: request.method,
    headers: { authorization: auth, "content-type": "application/json" },
    body: request.method === "POST" ? await request.text() : undefined,
  });
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  const reset = res.headers.get("x-ratelimit-reset");
  if (reset) headers["x-ratelimit-reset"] = reset;
  return new Response(res.body, { status: res.status, headers });
};

export const config = { path: ["/api/tripo/*", "/api/tripo-file"] };
