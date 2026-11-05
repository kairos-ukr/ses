// supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://logxutaepqzmvgsvscle.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE";

// Посилання з листа Supabase «Скинути пароль» (#access_token=…&type=recovery) або
// протерміноване посилання (#error_code=otp_expired…). Читаємо до створення
// клієнта: він сам забирає ці дані з адреси. Посилання, яке створює адміністратор
// (#/reset-password?token_hash=…), обробляє сторінка ResetPasswordPage.
const START_HASH = typeof window !== 'undefined' ? window.location.hash : '';
export const RECOVERY_IN_URL = /access_token=/.test(START_HASH) && /(^|[#&])type=recovery(&|$)/.test(START_HASH);
export const AUTH_LINK_ERROR = (/(^|[#&])error_code=([^&]+)/.exec(START_HASH) || [])[2] || null;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
