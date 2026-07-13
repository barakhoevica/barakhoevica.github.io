// ============================================================
// Edge Function: admin-action
// Единая точка входа для ВСЕХ административных изменений в базе.
// Проверяет JWT (выданный verify-admin), затем выполняет запрошенное
// действие через service_role ключ (обходит RLS).
// Браузер никогда не получает service_role ключ.
// ============================================================

import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Ограничения длины полей — защита от мусорных/чрезмерно длинных данных
const LIMITS = {
  name: 200,
  text: 500,
  desc: 5000,
  dosage: 2000,
  contra: 2000,
  link: 2000,
  img: 2000,
};
function clamp(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

const VALID_STATUSES = ["ok", "low", "out"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const JWT_SECRET = Deno.env.get("JWT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!JWT_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("Секреты не настроены (JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY)");
      return json({ success: false, error: "Server not configured" }, 500);
    }

    // ---- 1. Проверка JWT ----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ success: false, error: "Missing token" }, 401);

    let payload: Record<string, unknown>;
    try {
      const key = await hmacKey(JWT_SECRET);
      payload = await verify(token, key) as Record<string, unknown>;
    } catch {
      return json({ success: false, error: "Invalid or expired token" }, 401);
    }

    if (payload.role !== "admin") {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    // ---- 2. Разбор запроса ----
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const data = (body.payload ?? {}) as Record<string, unknown>;

    if (!action) return json({ success: false, error: "Missing action" }, 400);

    // ---- 3. Supabase клиент с service_role (обходит RLS) ----
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ---- 4. Выполнение действия ----
    switch (action) {
      case "products.create": {
        const name = clamp(data.name, LIMITS.name);
        const img = clamp(data.img, LIMITS.img);
        const link = clamp(data.link, LIMITS.link);
        if (!name || !img || !link) {
          return json({ success: false, error: "name, img and link are required" }, 400);
        }
        const id = "custom_" + Date.now();
        const { data: row, error } = await supabase
          .from("products")
          .insert({
            id,
            img,
            name,
            description: clamp(data.description, LIMITS.desc),
            dosage: clamp(data.dosage, LIMITS.dosage),
            contra: clamp(data.contra, LIMITS.contra),
            link,
            status: "ok",
          })
          .select()
          .single();
        if (error) throw error;
        return json({ success: true, result: row });
      }

      case "products.update": {
        const id = data.id as string;
        if (!id) return json({ success: false, error: "id is required" }, 400);
        const { error } = await supabase
          .from("products")
          .update({
            name: clamp(data.name, LIMITS.name),
            description: clamp(data.description, LIMITS.desc),
            dosage: clamp(data.dosage, LIMITS.dosage),
            contra: clamp(data.contra, LIMITS.contra),
            link: clamp(data.link, LIMITS.link),
          })
          .eq("id", id);
        if (error) throw error;
        return json({ success: true, result: { ok: true } });
      }

      case "products.setStatus": {
        const id = data.id as string;
        const status = data.status as string;
        if (!id || !VALID_STATUSES.includes(status)) {
          return json({ success: false, error: "Invalid id/status" }, 400);
        }
        const { error } = await supabase.from("products").update({ status }).eq("id", id);
        if (error) throw error;
        return json({ success: true, result: { ok: true } });
      }

      case "products.delete": {
        const id = data.id as string;
        if (!id) return json({ success: false, error: "id is required" }, 400);
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) throw error;
        return json({ success: true, result: { ok: true } });
      }

      case "reviews.create": {
        // Отзыв, добавленный самим администратором, считается уже проверенным
        const text = clamp(data.text, LIMITS.text);
        if (!text) return json({ success: false, error: "text is required" }, 400);
        const { data: row, error } = await supabase
          .from("reviews")
          .insert({ text, status: "approved" })
          .select()
          .single();
        if (error) throw error;
        return json({ success: true, result: row });
      }

      case "reviews.approve": {
        const id = data.id;
        if (id === undefined || id === null) {
          return json({ success: false, error: "id is required" }, 400);
        }
        const { error } = await supabase.from("reviews").update({ status: "approved" }).eq("id", id);
        if (error) throw error;
        return json({ success: true, result: { ok: true } });
      }

      case "reviews.listAll": {
        // Полный список отзывов (approved + pending) — только для админ-панели,
        // публичный SELECT ограничен RLS-политикой status = 'approved'.
        const { data: rows, error } = await supabase
          .from("reviews")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) throw error;
        return json({ success: true, result: rows });
      }

      case "reviews.delete": {
        const id = data.id;
        if (id === undefined || id === null) {
          return json({ success: false, error: "id is required" }, 400);
        }
        const { error } = await supabase.from("reviews").delete().eq("id", id);
        if (error) throw error;
        return json({ success: true, result: { ok: true } });
      }

      default:
        return json({ success: false, error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("admin-action error:", e);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
