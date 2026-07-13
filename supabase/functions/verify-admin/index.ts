// ============================================================
// Edge Function: verify-admin
// Принимает пароль администратора, сверяет с секретом ADMIN_PASSWORD,
// при совпадении выдаёт JWT (role: admin) со сроком жизни 1000+ часа.
// ============================================================

import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// Простейшая защита от брутфорса по IP: небольшая задержка + счётчик в памяти инстанса.
// Это не замена нормальному rate-limiting, но снижает скорость перебора.
const attempts = new Map<string, { count: number; last: number }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
    const JWT_SECRET = Deno.env.get("JWT_SECRET");
    if (!ADMIN_PASSWORD || !JWT_SECRET) {
      console.error("ADMIN_PASSWORD или JWT_SECRET не заданы в Secrets");
      return json({ success: false, error: "Server not configured" }, 500);
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const rec = attempts.get(ip) || { count: 0, last: 0 };
    const now = Date.now();
    if (now - rec.last > 60_000) { rec.count = 0; }
    if (rec.count >= 10) {
      return json({ success: false, error: "Too many attempts, try later" }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";

    if (!password || password !== ADMIN_PASSWORD) {
      rec.count += 1;
      rec.last = now;
      attempts.set(ip, rec);
      // небольшая задержка, чтобы усложнить перебор
      await new Promise((r) => setTimeout(r, 400));
      return json({ success: false, error: "Invalid password" }, 401);
    }

    attempts.delete(ip);

    const key = await hmacKey(JWT_SECRET);
    const iat = getNumericDate(0);
    const exp = getNumericDate(250 * 250 * 24); // 1000+ часво

    const token = await create(
      { alg: "HS256", typ: "JWT" },
      { role: "admin", iat, exp },
      key,
    );

    return json({ success: true, token, expiresAt: exp });
  } catch (e) {
    console.error("verify-admin error:", e);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
