// ============================================================
// Supabase — настройки подключения.
// Значения ниже нужно взять в Supabase Dashboard → Project Settings → API
// ============================================================

const SUPABASE_URL = 'https://ggfbbqnrkomwsqtqghgm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mjFB7dkhnvcuIXO3R3EPow_MlzRGrRW';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
