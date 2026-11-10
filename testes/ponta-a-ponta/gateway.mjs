// Gateway falso do Supabase para teste local: /rest/v1 -> PostgREST, /auth/v1 -> login simples.
import http from "node:http";
import crypto from "node:crypto";
const SEGREDO = process.env.JWT_SECRET;
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
export const assinar = (claims) => {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
  return `${h}.${p}.${crypto.createHmac("sha256", SEGREDO).update(`${h}.${p}`).digest("base64url")}`;
};
const verificar = (t) => {
  const [h, p, s] = (t || "").split(".");
  if (!s || crypto.createHmac("sha256", SEGREDO).update(`${h}.${p}`).digest("base64url") !== s) return null;
  return JSON.parse(Buffer.from(p, "base64url").toString());
};
const USUARIOS = {
  "ana@lz7.com.br": { id: "11111111-1111-1111-1111-111111111111", senha: "senha-teste-123" },
  "estranho@lz7.com.br": { id: "22222222-2222-2222-2222-222222222222", senha: "senha-teste-123" },
};
const userObj = (email, id) => ({ id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const corpo = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (st, o) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (url.pathname.startsWith("/rest/v1")) {
    const alvo = url.pathname.replace("/rest/v1", "") + url.search;
    const headers = { ...req.headers }; delete headers.host;
    const p = http.request({ host: "127.0.0.1", port: 3001, path: alvo || "/", method: req.method, headers }, (r2) => {
      res.writeHead(r2.statusCode, r2.headers); r2.pipe(res);
    });
    req.pipe(p); return;
  }
  if (url.pathname === "/auth/v1/token") {
    const b = JSON.parse((await corpo(req)) || "{}");
    const u = USUARIOS[b.email];
    if (!u || u.senha !== b.password) return json(400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials" });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return json(200, { access_token: assinar({ sub: u.id, role: "authenticated", aud: "authenticated", email: b.email, exp }), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r-" + u.id, user: userObj(b.email, u.id) });
  }
  if (url.pathname === "/auth/v1/user") {
    const c = verificar((req.headers.authorization || "").replace("Bearer ", ""));
    if (!c?.sub) return json(401, { msg: "invalid token" });
    return json(200, userObj(c.email, c.sub));
  }
  if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
  json(404, { msg: "não simulado: " + url.pathname });
}).listen(54321, () => console.log("gateway ok"));
