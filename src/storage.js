import { createClient } from "@supabase/supabase-js";

// Project URL is baked in (it's public by design); override with env if needed.
const url = import.meta.env.VITE_SUPABASE_URL || "https://ejocfsuopcdaulgmskjs.supabase.co";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && anonKey);
const supabase = configured ? createClient(url, anonKey) : null;

const TABLE = "pool_state";

// Get a value by key. Returns the stored object, or null if missing.
export async function get(key) {
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLE).select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

// Upsert a value (any JSON-serializable object).
export async function set(key, value) {
  if (!supabase) return null;
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
  return { key, value };
}

// List all rows whose key starts with the prefix. Returns [{ key, value }].
export async function listWithValues(prefix) {
  if (!supabase) return [];
  const { data, error } = await supabase.from(TABLE).select("key, value").like("key", `${prefix}%`);
  if (error) throw error;
  return data || [];
}

// ——— House Chat ———
// Messages are one row each in pool_state, keyed bb28-pool-chat:<ts>-<rand>.
// Images upload straight from the browser to the public `chat-media` bucket
// (anon key, no server) and we keep the public URL on the message.
const CHAT_PREFIX = "bb28-pool-chat:";
const CHAT_BUCKET = "chat-media";
const rand = () => Math.random().toString(36).slice(2, 8);

// Load the whole conversation, oldest first.
export async function listChat() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("value")
    .like("key", `${CHAT_PREFIX}%`);
  if (error) throw error;
  return (data || [])
    .map((r) => r.value)
    .filter(Boolean)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

// Post a message. { authorId, author, text, imageUrl? } — ts/id are added here.
export async function postChat(msg) {
  if (!supabase) return null;
  const id = `${Date.now()}-${rand()}`;
  const value = { id, ts: Date.now(), ...msg };
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key: `${CHAT_PREFIX}${id}`, value, updated_at: new Date().toISOString() });
  if (error) throw error;
  return value;
}

// Upload an image to Supabase Storage; returns its public URL.
export async function uploadChatImage(file) {
  if (!supabase) return null;
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${Date.now()}-${rand()}.${ext}`;
  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from(CHAT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Device-local identity (which player *this phone* is) lives in localStorage.
export function getLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}
