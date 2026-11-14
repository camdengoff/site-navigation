/* ==========================================================================
   Page Navigation - settings storage (Cloudflare Worker)
   --------------------------------------------------------------------------
   Squarespace gives scripts no way to save anything into the site itself, so
   the Save button on the settings page saves here instead, and every page of
   the site reads its bar settings from here.

     GET  /config   Anyone. Returns { "version": n, "config": { ... } }.
                    The settings are public anyway - they're the links in
                    the bar on the live site.
     PUT  /config   Saving. Needs the admin password, and only from the
                    site's own address(es). Body:
                    { "baseVersion": n, "config": { ... }, "force": false }
                    Refused with 409 if someone else saved since n was read,
                    unless "force" is true.

   Set up in the Cloudflare dashboard (see docs/SAVE-BUTTON-SETUP.md):
     - a KV namespace bound as SITE_NAV
     - ADMIN_PASSWORD   secret: the password typed on the settings page
     - ALLOWED_ORIGINS  variable: the site's address(es), comma separated,
                        e.g. https://www.example.org,https://example.org

   One file, no imports, so it can be pasted straight into the dashboard's
   editor.
   ========================================================================== */

const KEY = "config";
const MAX_BYTES = 200 * 1024;
const EMPTY = { version: 0, config: { bars: {}, pages: {} } };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    const originOk = allowed.includes(origin);

    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin"
    };

    const reply = (status, body, extra) =>
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, cors, extra || {})
      });

    if (request.method === "OPTIONS") return reply(204, null);
    if (url.pathname.replace(/\/+$/, "") !== "/config") return reply(404, { error: "not found" });

    if (request.method === "GET") {
      const stored = await env.SITE_NAV.get(KEY);
      return new Response(stored || JSON.stringify(EMPTY), {
        status: 200,
        headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-cache" }, cors)
      });
    }

    if (request.method !== "PUT") return reply(405, { error: "method not allowed" });

    // Saving only works from the site itself, and only with the password.
    if (!originOk) return reply(403, { error: "This address isn't allowed to save. Add it to ALLOWED_ORIGINS." });
    if (!env.ADMIN_PASSWORD) return reply(500, { error: "ADMIN_PASSWORD isn't set on the worker." });

    const auth = request.headers.get("Authorization") || "";
    const given = auth.replace(/^Bearer\s+/i, "");
    if (!(await sameText(given, env.ADMIN_PASSWORD))) return reply(401, { error: "Wrong password." });

    const text = await request.text();
    if (text.length > MAX_BYTES) return reply(413, { error: "Settings are too large." });

    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      return reply(400, { error: "Not valid JSON." });
    }
    const config = body && body.config;
    if (!isObject(config) || !isObject(config.bars) || !isObject(config.pages)) {
      return reply(400, { error: "Settings need \"bars\" and \"pages\"." });
    }

    const current = JSON.parse((await env.SITE_NAV.get(KEY)) || JSON.stringify(EMPTY));
    if (!body.force && body.baseVersion !== current.version) {
      return reply(409, { error: "Someone else saved changes since you opened the settings.", current });
    }

    const saved = {
      version: (Number(current.version) || 0) + 1,
      savedAt: new Date().toISOString(),
      config: { bars: config.bars, pages: config.pages, settings: isObject(config.settings) ? config.settings : undefined }
    };
    await env.SITE_NAV.put(KEY, JSON.stringify(saved));
    return reply(200, saved);
  }
};

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/* Compares by hash so the time taken doesn't hint at how much of a guess
   was right. */
async function sameText(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b)))
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0 && String(a).length > 0;
}
