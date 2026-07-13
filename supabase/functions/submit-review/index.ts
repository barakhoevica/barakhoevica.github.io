// ============================================================
// Edge Function: submit-review
// Публичная функция (без JWT) — посетитель сайта отправляет отзыв.
// Отзыв сохраняется со статусом status = 'pending' и не виден на
// сайте, пока администратор не одобрит его в admin-action
// (действие reviews.approve).
//
// Прямой INSERT в reviews из браузера запрещён RLS-политикой,
// поэтому запись выполняется здесь через service_role.
// ============================================================

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

const MIN_LEN = 3;
const MAX_LEN = 500;

// Простая защита от спама по IP: не более 5 отзывов в час с одного адреса.
// В памяти инстанса — не абсолютная защита, но полезный первый рубеж.
const submissions = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("SUPABASE_SERVICE_ROLE_KEY не настроен");
      return json({ success: false, error: "Server not configured" }, 500);
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const now = Date.now();
    const rec = submissions.get(ip) || { count: 0, windowStart: now };
    if (now - rec.windowStart > WINDOW_MS) {
      rec.count = 0;
      rec.windowStart = now;
    }
    if (rec.count >= MAX_PER_WINDOW) {
      return json({ success: false, error: "Too many submissions, try later" }, 429);
    }

    const body = await req.json().catch(() => ({}));

    // honeypot: скрытое поле, которое видят только боты — если заполнено, тихо отклоняем
    if (typeof body.hp === "string" && body.hp.trim() !== "") {
      return json({ success: true }); // молча "успешно", чтобы не подсказывать боту
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < MIN_LEN || text.length > MAX_LEN) {
      return json({ success: false, error: `Text must be ${MIN_LEN}-${MAX_LEN} characters` }, 400);
    }

    rec.count += 1;
    submissions.set(ip, rec);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await supabase
      .from("reviews")
      .insert({ text, status: "pending" });

    if (error) throw error;

    return json({ success: true });
  } catch (e) {
    console.error("submit-review error:", e);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
