"use client";
/*
  ── SUPABASE SETUP ──────────────────────────────────────────────────────────
  Run this SQL in your Supabase SQL editor before using the app:

  create table if not exists profiles (
    id text primary key,
    name text not null default '',
    username text unique not null,
    country text default '', state text default '', city text default '',
    birth_year integer, gender text default '', occupation text default '',
    profile_pic_url text default '', show_age boolean default true,
    bio text default '', coins integer default 1000,
    created_at timestamptz default now()
  );

  create table if not exists sparks (
    id bigint primary key,
    user_id text not null, name text not null default '',
    username text not null default '', profile_pic_url text default '',
    caption text default '', media_url text default '',
    media_type text default 'image', reach text default 'share',
    spark_type text default 'new', journey_id text not null default '',
    linked_spark_id bigint,
    reactions jsonb default '{"Encourage":0,"Say Hi":0,"Applaud":0,"Keep Going":0}'::jsonb,
    reacted_by jsonb default '{"Encourage":[],"Say Hi":[],"Applaud":[],"Keep Going":[]}'::jsonb,
    target_country text default '', target_state text default '',
    broadcast_freq_type text default '',
    broadcast_freq_value integer default 0,
    broadcast_max_per_day integer default 0,
    broadcast_expires_at timestamptz,
    created_at timestamptz default now()
  );
  -- If table already exists, add missing broadcast columns:
  alter table sparks add column if not exists target_country text default '';
  alter table sparks add column if not exists target_state text default '';
  alter table sparks add column if not exists broadcast_freq_type text default '';
  alter table sparks add column if not exists broadcast_freq_value integer default 0;
  alter table sparks add column if not exists broadcast_max_per_day integer default 0;
  alter table sparks add column if not exists broadcast_expires_at timestamptz;

  create table if not exists messages (
    id bigserial primary key,
    from_username text not null,
    to_username   text not null,
    content       text not null,
    read          boolean default false,
    created_at    timestamptz default now()
  );

  alter table profiles disable row level security;
  alter table sparks   disable row level security;
  alter table messages disable row level security;

  insert into storage.buckets (id, name, public)
    values ('spark-media', 'spark-media', true) on conflict do nothing;

  drop policy if exists "Public read" on storage.objects;
  create policy "Public read" on storage.objects for select using (bucket_id = 'spark-media');
  drop policy if exists "Anon upload" on storage.objects;
  create policy "Anon upload" on storage.objects for insert with check (bucket_id = 'spark-media');
  drop policy if exists "Anon update" on storage.objects;
  create policy "Anon update" on storage.objects for update using (bucket_id = 'spark-media');
  drop policy if exists "Anon delete" on storage.objects;
  create policy "Anon delete" on storage.objects for delete using (bucket_id = 'spark-media');
  ─────────────────────────────────────────────────────────────────────────── */

import {
  ChakraProvider, extendTheme, Box, Text, Button, VStack, Input, Textarea,
  HStack, useToast, Flex, Avatar, AspectRatio, Center, Heading,
  Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton,
  useDisclosure, Select, Divider, Badge, Grid, GridItem, Progress, Spinner,
  Switch, FormControl, FormLabel,
} from "@chakra-ui/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import IncidentReportModal from "@/components/IncidentReportModal";
import AdminDashboard from "@/components/AdminDashboard";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Theme ───────────────────────────────────────────────────────────────────
const theme = extendTheme({
  fonts: { heading: "var(--font-geist-sans), sans-serif", body: "var(--font-geist-sans), sans-serif" },
  styles: { global: { "html, body": { scrollBehavior: "smooth" } } },
});
const MotionBox = motion(Box);

const ORANGE = "#E05A1C";
const BROWN  = "#5C2D0E";
const CREAM  = "#FDF4EE";
const GOLD   = "#F5A623";
const CURRENT_YEAR = 2026;

type Reaction  = "Encourage" | "Say Hi" | "Applaud" | "Keep Going";
type Reach     = "share" | "beyond";
type SparkType = "new" | "ongoing";
type MediaType = "video" | "image";
type View      = "feed" | "mypark" | "chats" | "admin" | "beyond";

const REACTIONS: { label: Reaction; emoji: string }[] = [
  { label: "Encourage", emoji: "💪" },
  { label: "Say Hi",    emoji: "👋" },
  { label: "Applaud",   emoji: "👏" },
  { label: "Keep Going",emoji: "🔥" },
];

// ─── Tasks ────────────────────────────────────────────────────────────────────
interface Tasks {
  daily_claimed: string;
  first_spark_claimed: boolean;
  reactions_5_claimed: boolean;
  reactions_10_claimed: boolean;
  total_reactions_given: number;
}
const DEFAULT_TASKS: Tasks = {
  daily_claimed: "",
  first_spark_claimed: false,
  reactions_5_claimed: false,
  reactions_10_claimed: false,
  total_reactions_given: 0,
};
function today() { return new Date().toISOString().split("T")[0]; }
function loadTasks(): Tasks { try { const r = localStorage.getItem("ca_tasks"); return r ? { ...DEFAULT_TASKS, ...JSON.parse(r) } : { ...DEFAULT_TASKS }; } catch { return { ...DEFAULT_TASKS }; } }
function saveTasks(t: Tasks) { localStorage.setItem("ca_tasks", JSON.stringify(t)); }

// ─── Location data ────────────────────────────────────────────────────────────
const AFRICAN_COUNTRIES = [
  "Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cameroon","Cape Verde",
  "Central African Republic","Chad","Comoros","Congo","DR Congo","Djibouti","Egypt",
  "Equatorial Guinea","Eritrea","Eswatini","Ethiopia","Gabon","Gambia","Ghana","Guinea",
  "Guinea-Bissau","Ivory Coast","Kenya","Lesotho","Liberia","Libya","Madagascar","Malawi",
  "Mali","Mauritania","Mauritius","Morocco","Mozambique","Namibia","Niger","Nigeria",
  "Rwanda","São Tomé and Príncipe","Senegal","Seychelles","Sierra Leone","Somalia",
  "South Africa","South Sudan","Sudan","Tanzania","Togo","Tunisia","Uganda","Zambia","Zimbabwe",
];
const STATES_BY_COUNTRY: Record<string, string[]> = {
  Nigeria: ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT (Abuja)","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"],
  Ghana:   ["Ahafo","Ashanti","Bono","Bono East","Central","Eastern","Greater Accra","North East","Northern","Oti","Savannah","Upper East","Upper West","Volta","Western","Western North"],
  Kenya:   ["Baringo","Bomet","Bungoma","Busia","Embu","Garissa","Homa Bay","Kajiado","Kakamega","Kiambu","Kilifi","Kisumu","Kitui","Laikipia","Machakos","Meru","Mombasa","Nakuru","Nairobi","Nandi","Narok","Nyamira","Nyeri","Siaya","Uasin Gishu","West Pokot"],
  "South Africa": ["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","Northern Cape","North West","Western Cape"],
  Ethiopia: ["Addis Ababa","Afar","Amhara","Oromia","Somali","Tigray","SNNPR","Sidama","Dire Dawa"],
  Tanzania: ["Arusha","Dar es Salaam","Dodoma","Iringa","Kagera","Kilimanjaro","Mbeya","Mwanza","Tanga","Zanzibar"],
  Uganda:   ["Kampala","Wakiso","Mukono","Jinja","Mbarara","Gulu","Lira","Mbale","Arua"],
  Cameroon: ["Adamawa","Centre","East","Far North","Littoral","North","Northwest","South","Southwest","West"],
  Morocco:  ["Casablanca-Settat","Fès-Meknès","Marrakech-Safi","Rabat-Salé-Kénitra","Souss-Massa","Tanger-Tétouan-Al Hoceïma","Oriental"],
  Egypt:    ["Cairo","Alexandria","Giza","Luxor","Aswan","Port Said","Suez","Ismailia","Mansoura","Asyut","Sohag","Qena"],
  Senegal:  ["Dakar","Thiès","Saint-Louis","Kaolack","Ziguinchor","Tambacounda","Kolda","Louga","Fatick","Kaffrine"],
};
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  Nigeria: ["Abuja","Lagos","Port Harcourt","Kano","Ibadan","Benin City","Kaduna","Enugu","Calabar","Jos","Owerri","Warri","Uyo","Asaba","Akure","Abeokuta","Ado-Ekiti","Ilorin","Maiduguri","Zaria"],
  Ghana: ["Accra","Kumasi","Tamale","Sekondi-Takoradi","Cape Coast","Sunyani","Ho","Koforidua","Wa","Bolgatanga"],
  Kenya: ["Nairobi","Mombasa","Kisumu","Nakuru","Eldoret","Thika","Malindi","Kitale","Garissa","Nyeri"],
  "South Africa": ["Johannesburg","Cape Town","Durban","Pretoria","Port Elizabeth","Bloemfontein","East London","Polokwane","Nelspruit","Kimberley"],
  Ethiopia: ["Addis Ababa","Dire Dawa","Mekele","Gondar","Bahir Dar","Adama","Jimma","Jijiga","Hawassa","Shashamane"],
  Tanzania: ["Dar es Salaam","Dodoma","Mwanza","Zanzibar City","Arusha","Mbeya","Morogoro","Tanga","Kigoma","Tabora"],
  Uganda: ["Kampala","Gulu","Lira","Mbarara","Jinja","Mbale","Entebbe","Masaka","Kasese","Fort Portal"],
  Cameroon: ["Yaoundé","Douala","Bamenda","Bafoussam","Garoua","Maroua","Ngaoundéré","Bertoua","Edéa","Kumba"],
  Morocco: ["Casablanca","Rabat","Fes","Marrakech","Agadir","Tangier","Oujda","Kenitra","Tetouan","Safi"],
  Egypt: ["Cairo","Alexandria","Giza","Shubra El-Kheima","Port Said","Suez","Mansoura","Tanta","Asyut","Ismailia"],
  Senegal: ["Dakar","Touba","Thiès","Kaolack","Saint-Louis","Ziguinchor","Mbour","Rufisque","Diourbel","Louga"],
};
const OCCUPATIONS = [
  "Artist","Chef / Cook","Content Creator","Dancer","Designer (Fashion)","Designer (Graphic)",
  "Designer (Interior)","Doctor / Healthcare","Entrepreneur","Engineer","Farmer / Agriculture",
  "Filmmaker / Director","Journalist / Writer","Lawyer","Musician / Performer","Photographer",
  "Student","Teacher / Educator","Trader / Merchant","Other",
];
const GENDERS    = ["Male","Female","Non-binary","Prefer not to say"];
const BIRTH_YEARS  = Array.from({ length: CURRENT_YEAR - 1924 - 12 }, (_, i) => CURRENT_YEAR - 13 - i);
const BIRTH_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const BIRTH_DAYS   = Array.from({ length: 31 }, (_, i) => i + 1);

const GREETINGS = [
  { text: "Woku!", meaning: "Welcome", language: "Ikwerre", place: "Rivers State, Nigeria" },
  { text: "Nno!", meaning: "Welcome", language: "Igbo", place: "South-East Nigeria" },
  { text: "Ẹ káàbọ̀!", meaning: "Welcome", language: "Yoruba", place: "South-West Nigeria" },
  { text: "Sannu da zuwa!", meaning: "Welcome", language: "Hausa", place: "Northern Nigeria" },
  { text: "Akwaaba!", meaning: "Welcome", language: "Twi", place: "Ghana" },
  { text: "Woézọ!", meaning: "Welcome", language: "Ewe", place: "Ghana & Togo" },
  { text: "Karibu!", meaning: "Welcome", language: "Swahili", place: "East Africa" },
  { text: "Selam!", meaning: "Welcome", language: "Amharic", place: "Ethiopia" },
  { text: "Murakaza neza!", meaning: "Welcome", language: "Kinyarwanda", place: "Rwanda" },
  { text: "Boyei malamu!", meaning: "Welcome well", language: "Lingala", place: "DR Congo" },
  { text: "Dumela!", meaning: "Welcome", language: "Setswana", place: "Botswana / South Africa" },
  { text: "Sawubona!", meaning: "I see you — Welcome", language: "Zulu", place: "South Africa" },
  { text: "Dalal ak jamm!", meaning: "Welcome in peace", language: "Wolof", place: "Senegal & Gambia" },
  { text: "Mauya!", meaning: "Welcome", language: "Shona", place: "Zimbabwe" },
  { text: "Marhaba!", meaning: "Welcome", language: "Arabic", place: "North Africa" },
  { text: "Bienvenue!", meaning: "Welcome", language: "French", place: "West & Central Africa" },
  { text: "Bem-vindo!", meaning: "Welcome", language: "Portuguese", place: "Angola & Mozambique" },
  { text: "Ahlan!", meaning: "Welcome", language: "Darija", place: "Morocco & Algeria" },
  { text: "Mwaiseni!", meaning: "Welcome", language: "Nyanja", place: "Zambia & Malawi" },
  { text: "Ayikoo!", meaning: "Welcome, well done", language: "Luganda", place: "Uganda" },
  { text: "Nnọọ!", meaning: "You are welcome", language: "Igbo", place: "Enugu, Nigeria" },
  { text: "E wo!", meaning: "Welcome", language: "Ijaw", place: "Niger Delta, Nigeria" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface User {
  id: string; name: string; username: string; email: string; password: string;
  country: string; state: string; city: string;
  birthYear: number; birthMonth: number; birthDay: number;
  gender: string; occupation: string;
  profilePicUrl: string; showAge: boolean; bio: string; coins: number;
  isAdmin?: boolean;
}
interface SparkPost {
  id: number; userId: string; name: string; username: string;
  profilePicUrl: string; caption: string; mediaUrl: string;
  mediaType: MediaType; reach: Reach;
  reactions: Record<Reaction, number>;
  reactedBy: Record<Reaction, string[]>;
  sparkType: SparkType; journeyId: string; linkedSparkId?: number;
  isAdminPost?: boolean; pinned?: boolean; adminPostType?: string;
  targetCountry?: string; targetState?: string;
  broadcastFreqType?: string;
  broadcastFreqValue?: number;
  broadcastMaxPerDay?: number;
  broadcastExpiresAt?: string;
}
interface Message {
  id: number; fromUsername: string; toUsername: string;
  content: string; read: boolean; createdAt: string;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function calcAge(y: number, m = 0, d = 1) {
  const today = new Date();
  const age = today.getFullYear() - y;
  const hasBirthdayPassed = today.getMonth() > m || (today.getMonth() === m && today.getDate() >= d);
  return hasBirthdayPassed ? age : age - 1;
}
function getJourneyTotal(sparks: SparkPost[], journeyId: string) {
  return sparks.filter(s => s.journeyId === journeyId)
    .reduce((sum, s) => sum + Object.values(s.reactions ?? {}).reduce((a, b) => a + b, 0), 0);
}
function buildBio(u: Pick<User,"name"|"occupation"|"city"|"state"|"country"|"birthYear"|"showAge">) {
  const age = u.showAge && u.birthYear ? `, ${calcAge(u.birthYear)}` : "";
  const loc = [u.city, u.state, u.country].filter(Boolean).join(", ");
  return `Hi! I am ${u.name}${age} — a ${u.occupation} from ${loc}. 🌍 Ready to show you my spark! ✨`;
}

/** Compress an image file via canvas to max 1200px wide, quality 0.82 JPEG */
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type:"image/jpeg" }) : file),
        "image/jpeg", 0.82
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** Upload via Supabase SDK (reliable) with simulated progress ticker. */
async function uploadMedia(
  file: File,
  folder: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  // Compress images before upload
  const toUpload = file.type.startsWith("image/") ? await compressImage(file) : file;
  const ext  = (toUpload.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `${folder}/${uid()}.${ext}`;

  // Simulate progress: ramp to 90% over estimated time, then jump to 100% on finish
  let simPct = 0;
  const isVideo = toUpload.type.startsWith("video/");
  const estMs = isVideo ? Math.max(3000, toUpload.size / 50000) : 1500; // ~50KB/s estimate
  const interval = setInterval(() => {
    simPct = Math.min(simPct + (90 / (estMs / 200)), 90);
    onProgress?.(Math.round(simPct));
  }, 200);

  try {
    const { error } = await supabase.storage
      .from("spark-media")
      .upload(path, toUpload, {
        upsert: true,
        contentType: toUpload.type || "application/octet-stream",
      });
    if (error) throw new Error(error.message);
  } finally {
    clearInterval(interval);
  }

  onProgress?.(100);
  const { data } = supabase.storage.from("spark-media").getPublicUrl(path);
  return data.publicUrl;
}

async function saveProfile(user: User) {
  await supabase.from("profiles").upsert({
    id: user.id, name: user.name, username: user.username, email: user.email,
    password: user.password,
    country: user.country, state: user.state, city: user.city,
    birth_year: user.birthYear, birth_month: user.birthMonth, birth_day: user.birthDay,
    gender: user.gender, occupation: user.occupation,
    profile_pic_url: user.profilePicUrl, show_age: user.showAge,
    bio: user.bio, coins: user.coins,
    is_admin: user.isAdmin ?? false,
  });
}

async function fetchProfileByUsername(username: string): Promise<User | null> {
  const { data } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!data) return null;
  return {
    id: data.id, name: data.name, username: data.username, email: data.email ?? "",
    password: data.password ?? "",
    country: data.country ?? "", state: data.state ?? "", city: data.city ?? "",
    birthYear: data.birth_year ?? 0, birthMonth: data.birth_month ?? 0, birthDay: data.birth_day ?? 1,
    gender: data.gender ?? "",
    occupation: data.occupation ?? "", profilePicUrl: data.profile_pic_url ?? "",
    showAge: data.show_age ?? true, bio: data.bio ?? "", coins: data.coins ?? 1000,
    isAdmin: data.is_admin ?? false,
  };
}

async function saveSpark(spark: SparkPost) {
  await supabase.from("sparks").upsert({
    id: spark.id, user_id: spark.userId, name: spark.name,
    username: spark.username, profile_pic_url: spark.profilePicUrl,
    caption: spark.caption, media_url: spark.mediaUrl, media_type: spark.mediaType,
    reach: spark.reach, spark_type: spark.sparkType, journey_id: spark.journeyId,
    linked_spark_id: spark.linkedSparkId ?? null,
    reactions: spark.reactions, reacted_by: spark.reactedBy,
    is_admin_post: spark.isAdminPost ?? false,
    pinned: spark.pinned ?? false,
    admin_post_type: spark.adminPostType ?? 'regular',
  });
}

async function fetchSparks(): Promise<SparkPost[]> {
  const { data } = await supabase.from("sparks").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
  if (!data) return [];
  return data.map(r => ({
    id: r.id, userId: r.user_id, name: r.name, username: r.username,
    profilePicUrl: r.profile_pic_url ?? "", caption: r.caption,
    mediaUrl: r.media_url, mediaType: r.media_type as MediaType,
    reach: r.reach as Reach,
    reactions: (r.reactions as Record<Reaction,number>) ?? { Encourage:0, "Say Hi":0, Applaud:0, "Keep Going":0 },
    reactedBy: (r.reacted_by as Record<Reaction,string[]>) ?? { Encourage:[], "Say Hi":[], Applaud:[], "Keep Going":[] },
    sparkType: r.spark_type as SparkType,
    journeyId: r.journey_id, linkedSparkId: r.linked_spark_id ?? undefined,
    isAdminPost: r.is_admin_post ?? false,
    pinned: r.pinned ?? false,
    adminPostType: r.admin_post_type ?? 'regular',
    targetCountry: r.target_country ?? "", targetState: r.target_state ?? "",
    broadcastFreqType: r.broadcast_freq_type ?? "",
    broadcastFreqValue: r.broadcast_freq_value ?? 0,
    broadcastMaxPerDay: r.broadcast_max_per_day ?? 0,
    broadcastExpiresAt: r.broadcast_expires_at ?? "",
  }));
}

async function updateReactions(sparkId: number, reactions: Record<Reaction,number>, reactedBy: Record<Reaction,string[]>) {
  await supabase.from("sparks").update({ reactions, reacted_by: reactedBy }).eq("id", sparkId);
}

async function updateCoins(userId: string, coins: number) {
  await supabase.from("profiles").update({ coins }).eq("id", userId);
}

function trackEvent(eventType: string, user: User, metadata: Record<string, unknown> = {}) {
  supabase.from("analytics_events").insert({
    event_type: eventType, user_id: user.id, username: user.username,
    country: user.country, state: user.state, city: user.city, metadata,
  }).then(({ error }) => { if (error) console.warn("trackEvent failed:", error.message); });
}

/** Track every page visit — works even for logged-out / anonymous visitors */
async function trackVisit(user: User | null) {
  try {
    // Deduplicate: only track once per session
    const sessionKey = "ca_visit_tracked";
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");

    // Use profile location if available, otherwise geo-lookup via ipapi.co
    let country = user?.country ?? "";
    let state   = user?.state   ?? "";
    let city    = user?.city    ?? "";

    if (!country) {
      try {
        const geo = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
        if (geo.ok) {
          const d = await geo.json();
          country = d.country_name ?? "";
          state   = d.region       ?? "";
          city    = d.city         ?? "";
        }
      } catch { /* geo lookup failed — proceed without location */ }
    }

    const { error } = await supabase.from("analytics_events").insert({
      event_type: "visit",
      user_id:   user?.id       ?? "anonymous",
      username:  user?.username ?? "anonymous",
      country, state, city,
      metadata: { logged_in: !!user },
    });
    if (error) console.warn("trackVisit failed:", error.message);
  } catch (e) { console.warn("trackVisit error:", e); }
}

async function fetchMessages(username: string): Promise<Message[]> {
  const { data } = await supabase.from("messages").select("*")
    .or(`from_username.eq.${username},to_username.eq.${username}`)
    .order("created_at", { ascending: true });
  if (!data) return [];
  return data.map(r => ({
    id: r.id, fromUsername: r.from_username, toUsername: r.to_username,
    content: r.content, read: r.read, createdAt: r.created_at,
  }));
}

async function sendMessage(from: string, to: string, content: string): Promise<string | null> {
  const { error } = await supabase.from("messages").insert({ from_username: from, to_username: to, content, read: false });
  return error ? error.message : null;
}

async function markRead(from: string, to: string): Promise<void> {
  await supabase.from("messages").update({ read: true })
    .eq("from_username", from).eq("to_username", to).eq("read", false);
}

// ─── Email helper ─────────────────────────────────────────────────────────────
async function sendEmail(
  event: string,
  to: string,
  name: string,
  username: string,
  extra?: Record<string, string | number>
) {
  if (!to) return;
  try {
    await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, to, name, username, extra }),
    });
  } catch { /* fire-and-forget — never block the UI */ }
}

// ─── Welcome Splash ───────────────────────────────────────────────────────────
function WelcomeSplash({ user, onComplete }: { user: User; onComplete: () => void }) {
  // phase 0 = dark + bg patterns
  // phase 1 = portrait fades in
  // phase 2 = spark begins orbiting, SVG paths draw themselves
  // phase 3 = warm colour filter shifts onto portrait
  // phase 4 = "Welcome back, [name]." slides up
  // phase 5 = "Your spark is ready." slides up
  // phase 6 = spark expands outward → logo text appears
  // phase 7 = fade out everything
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase(1), 160),
      setTimeout(() => setPhase(2), 460),
      setTimeout(() => setPhase(3), 1000),
      setTimeout(() => setPhase(4), 1300),
      setTimeout(() => setPhase(5), 1620),
      setTimeout(() => setPhase(6), 2050),
      setTimeout(() => setPhase(7), 2380),
    ];
    const done = setTimeout(onComplete, 3100);
    return () => { ts.forEach(clearTimeout); clearTimeout(done); };
  }, [onComplete]);

  // SVG frame: 260×260, center (130,130). Portrait 104px, centered → SVG offset top/left = -(130-52) = -78px
  // Orbit radius 72px. Circle path starts at top: M130,58
  // Circumference ≈ 453px
  const CLAY = "#C13A1C";

  // Corner bracket paths (L-shapes, each arm 20px = total 40px = stroke-dasharray)
  const brackets = [
    "M 68,90 L 68,66 L 90,66",     // top-left
    "M 170,66 L 192,66 L 192,90",  // top-right
    "M 68,170 L 68,194 L 90,194",  // bottom-left
    "M 170,194 L 192,194 L 192,170", // bottom-right
  ];
  // Mid-side chevron ticks (V-shape, arm ~10px each = 20px total)
  const chevrons = [
    "M 121,57 L 130,49 L 139,57",   // top
    "M 121,203 L 130,211 L 139,203", // bottom
    "M 57,121 L 49,130 L 57,139",   // left
    "M 203,121 L 211,130 L 203,139", // right
  ];
  const bracketDelays  = ["0.05s","0.1s","0.08s","0.12s"];
  const chevronDelays  = ["0.18s","0.22s","0.2s","0.25s"];

  return (
    <>
      <style>{`
        @keyframes sa-ring-cw    { to { transform: rotate(360deg);  } }
        @keyframes sa-ring-ccw   { to { transform: rotate(-360deg); } }
        @keyframes sa-pat        { from{opacity:0}   to{opacity:1} }
        @keyframes sa-photo-in   { from{opacity:0;transform:scale(.84) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes sa-warm       { from{filter:sepia(0%) saturate(1) contrast(1) brightness(1)} to{filter:sepia(26%) saturate(1.75) contrast(1.14) brightness(1.06)} }
        @keyframes sa-text-up    { from{opacity:0;transform:translateY(11px)} to{opacity:1;transform:translateY(0)} }
        /* Spark orbits clockwise from top. rotate(-90→270deg) translateX(72px). */
        @keyframes sa-orbit      { from{transform:rotate(-90deg) translateX(72px)} to{transform:rotate(270deg) translateX(72px)} }
        /* Path draws itself in sync with spark orbit */
        @keyframes sa-draw-orbit { from{stroke-dashoffset:453} to{stroke-dashoffset:0} }
        /* Corner brackets draw in */
        @keyframes sa-draw-brk   { from{stroke-dashoffset:44} to{stroke-dashoffset:0} }
        /* Chevron ticks draw in */
        @keyframes sa-draw-chv   { from{stroke-dashoffset:22} to{stroke-dashoffset:0} }
        /* Ember glow pulse */
        @keyframes sa-glow       { 0%,100%{filter:drop-shadow(0 0 5px #F5A623);opacity:.65} 50%{filter:drop-shadow(0 0 18px #F5A623) drop-shadow(0 0 32px #E05A1C);opacity:1} }
        /* Ember box-shadow pulse (for the orbiting dot) */
        @keyframes sa-emb        { 0%,100%{box-shadow:0 0 6px 2px #E05A1C,0 0 14px 4px #F5A623aa} 50%{box-shadow:0 0 14px 5px #F5A623,0 0 26px 8px #E05A1Caa} }
        /* Spark explodes outward at phase 6 */
        @keyframes sa-expand     { 0%{transform:scale(1);opacity:1} 100%{transform:scale(22);opacity:0} }
        /* Logo text contracts in from wide spacing */
        @keyframes sa-logo-in    { from{opacity:0;letter-spacing:.55em} to{opacity:1;letter-spacing:.22em} }
        @keyframes sa-out        { from{opacity:1} to{opacity:0} }

        .sa-ring1 { animation: sa-ring-cw  11s linear infinite; transform-origin:50% 50%; }
        .sa-ring2 { animation: sa-ring-ccw  8s linear infinite; transform-origin:50% 50%; }
        .sa-ring3 { animation: sa-ring-cw  17s linear infinite; transform-origin:50% 50%; }
        .sa-ticks { animation: sa-glow 2.4s ease-in-out infinite; }
      `}</style>

      <Box
        position="fixed" inset={0} zIndex={2000}
        display="flex" alignItems="center" justifyContent="center" flexDirection="column"
        overflow="hidden"
        style={{
          background: "radial-gradient(ellipse at 50% 42%, #1E0700 0%, #0A0100 65%, #030000 100%)",
          animation: phase >= 7 ? "sa-out .72s ease forwards" : undefined,
        }}
      >
        {/* ── kente + mud-cloth background ── */}
        <Box position="absolute" inset={0} pointerEvents="none"
          style={{ animation:"sa-pat .8s ease .04s forwards", opacity:0 }}>
          <svg width="100%" height="100%">
            <defs>
              <pattern id="sp-k" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
                <polygon points="24,2 46,24 24,46 2,24"   fill="none" stroke="#F5A623" strokeWidth=".7"  opacity=".45"/>
                <polygon points="24,10 38,24 24,38 10,24" fill="none" stroke="#E05A1C" strokeWidth=".45" opacity=".28"/>
                <rect x="21" y="21" width="6" height="6" fill="#C8891A" opacity=".3" transform="rotate(45 24 24)"/>
              </pattern>
              <pattern id="sp-m" x="0" y="0" width="64" height="32" patternUnits="userSpaceOnUse">
                <polyline points="0,16 10,6 20,16 30,6 40,16 50,6 60,16 64,12" fill="none" stroke="#F5A623" strokeWidth="1"  opacity=".16"/>
                <polyline points="0,26 10,16 20,26 30,16 40,26 50,16 60,26 64,22" fill="none" stroke="#C13A1C" strokeWidth=".7" opacity=".13"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-k)"/>
            <rect width="100%" height="100%" fill="url(#sp-m)"/>
          </svg>
        </Box>

        {/* ── three rotating outer rings ── */}
        <Box position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center" pointerEvents="none">
          <svg width="390" height="390" viewBox="0 0 390 390" style={{ position:"absolute" }}>
            <g className="sa-ring1">
              <circle cx="195" cy="195" r="182" fill="none" stroke="#F5A623" strokeWidth="1"   strokeDasharray="10 7"   opacity=".2"/>
              <circle cx="195" cy="195" r="180" fill="none" stroke="#C13A1C" strokeWidth=".5"  strokeDasharray="4 14"   opacity=".14"/>
            </g>
            <g className="sa-ring2">
              <circle cx="195" cy="195" r="160" fill="none" stroke="#C8891A" strokeWidth="1.5" strokeDasharray="18 8 4 8" opacity=".26"/>
            </g>
            <g className="sa-ring3">
              <circle cx="195" cy="195" r="138" fill="none" stroke="#1A1464" strokeWidth=".8"  strokeDasharray="6 10"   opacity=".32"/>
              <circle cx="195" cy="195" r="136" fill="none" stroke="#F5A623" strokeWidth=".4"  strokeDasharray="2 18"   opacity=".18"/>
            </g>
          </svg>
          {/* 8 directional tick marks */}
          <svg width="290" height="290" viewBox="0 0 290 290" style={{ position:"absolute" }} className="sa-ticks">
            {[0,45,90,135,180,225,270,315].map(deg => {
              const rad = deg * Math.PI / 180;
              const x1 = 145 + 122*Math.sin(rad), y1 = 145 - 122*Math.cos(rad);
              const x2 = 145 + 133*Math.sin(rad), y2 = 145 - 133*Math.cos(rad);
              const xd = 145 + 137*Math.sin(rad), yd = 145 - 137*Math.cos(rad);
              return (
                <g key={deg}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#F5A623" strokeWidth={deg%90===0?2.5:1.2} strokeLinecap="round"/>
                  <circle cx={xd} cy={yd} r={deg%90===0?3:1.5} fill="#F5A623"/>
                </g>
              );
            })}
          </svg>
        </Box>

        {/* ── portrait ── */}
        {phase >= 1 && (
          <Box
            position="relative" mb={5}
            style={{ animation:"sa-photo-in .5s cubic-bezier(.22,1,.36,1) forwards", opacity:0 }}
          >
            {/* SVG frame overlay centered on 104px portrait */}
            <Box position="absolute" style={{ top:"-78px", left:"-78px", width:"260px", height:"260px", pointerEvents:"none", zIndex:2 }}>
              <svg width="260" height="260" viewBox="0 0 260 260" overflow="visible">
                {/* Orbit circle — draws itself as the spark travels (clockwise from top) */}
                {phase >= 2 && (
                  <path d="M 130,58 A 72,72 0 1,1 130.001,58"
                    fill="none" stroke="#F5A623" strokeWidth="1.2" opacity=".45"
                    strokeDasharray="453" strokeLinecap="round"
                    style={{ animation:"sa-draw-orbit 1.3s ease-out forwards", strokeDashoffset:453 }}/>
                )}
                {/* Corner brackets */}
                {phase >= 2 && brackets.map((d, i) => (
                  <path key={i} d={d} fill="none"
                    stroke={i%2===0?"#F5A623":CLAY} strokeWidth="2.2" strokeLinecap="round"
                    strokeDasharray="44"
                    style={{ animation:`sa-draw-brk .55s ease-out ${bracketDelays[i]} forwards`, strokeDashoffset:44 }}/>
                ))}
                {/* Mid-side chevrons */}
                {phase >= 2 && chevrons.map((d, i) => (
                  <path key={i} d={d} fill="none"
                    stroke="#C8891A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray="22"
                    style={{ animation:`sa-draw-chv .45s ease-out ${chevronDelays[i]} forwards`, strokeDashoffset:22 }}/>
                ))}
              </svg>
            </Box>

            {/* the portrait itself */}
            <Box
              w="104px" h="104px" rounded="full" overflow="hidden"
              border="2.5px solid" borderColor="#F5A623" position="relative" zIndex={1}
              style={{ animation: phase >= 3 ? "sa-warm .85s ease forwards" : undefined }}
            >
              {user.profilePicUrl
                ? <img src={user.profilePicUrl} alt={user.name} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                : <Box w="full" h="full" display="flex" alignItems="center" justifyContent="center"
                    style={{ background:`linear-gradient(145deg,${BROWN},#8B3A0F)` }}
                    fontSize="36px" fontWeight="900" color={GOLD}>
                    {user.name?.[0]?.toUpperCase()}
                  </Box>
              }
            </Box>

            {/* warm colour overlay — fades in at phase 3 */}
            {phase >= 3 && (
              <Box position="absolute" inset={0} rounded="full" zIndex={3} pointerEvents="none"
                style={{
                  background:"radial-gradient(circle at 62% 32%, rgba(245,166,35,.28), rgba(225,90,28,.18), transparent 62%)",
                  mixBlendMode:"overlay",
                  animation:"sa-pat .7s ease forwards", opacity:0,
                }}/>
            )}

            {/* ── orbiting spark (phase 2–5) ── */}
            {phase >= 2 && phase < 6 && (
              <Box
                position="absolute" zIndex={4}
                style={{
                  top:"46px", left:"46px",          // element center = portrait center (52,52) - half(6)
                  width:"12px", height:"12px",
                  borderRadius:"50%",
                  background:"radial-gradient(circle at 38% 32%, #FFE08A, #E05A1C)",
                  animation:"sa-orbit 1.3s ease-in-out forwards, sa-emb 1s ease-in-out infinite",
                  transformOrigin:"6px 6px",         // orbit pivot = element center = portrait center
                }}/>
            )}

            {/* ── spark explosion at phase 6 ── */}
            {phase === 6 && (
              <Box
                position="absolute" zIndex={4}
                style={{
                  top:"46px", left:"46px",
                  width:"12px", height:"12px",
                  borderRadius:"50%",
                  background:"radial-gradient(circle at 38% 32%, #FFE08A, #E05A1C)",
                  boxShadow:"0 0 10px 3px #F5A623",
                  animation:"sa-expand .55s ease-out forwards",
                  transformOrigin:"6px 6px",
                }}/>
            )}
          </Box>
        )}

        {/* ── ritual text ── */}
        <Box textAlign="center" minH="72px">
          {phase >= 4 && (
            <Text
              fontSize="sm" fontWeight="600" color="rgba(255,255,255,.72)"
              letterSpacing=".06em" mb={1}
              style={{ animation:"sa-text-up .44s ease forwards", opacity:0 }}
            >
              Welcome back, {user.name.split(" ")[0]}.
            </Text>
          )}
          {phase >= 5 && (
            <Text
              fontSize="9px" fontWeight="900" color="#F5A623"
              letterSpacing=".32em" textTransform="uppercase"
              style={{ animation:"sa-text-up .44s ease forwards", opacity:0, textShadow:"0 0 12px #F5A623bb" }}
            >
              Your spark is ready.
            </Text>
          )}
          {phase >= 6 && (
            <Text
              mt={3} fontSize="11px" fontWeight="900" color="white"
              textTransform="uppercase"
              style={{ animation:"sa-logo-in .45s ease forwards", opacity:0,
                textShadow:`0 0 20px ${ORANGE}88, 0 0 40px ${ORANGE}44` }}
            >
              icreate.africa
            </Text>
          )}
        </Box>
      </Box>
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function TokenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill={GOLD} />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fill={BROWN} fontWeight="bold">T</text>
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}
function VerifiedIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#3B82F6" />
      <path d="M8 12l3 3 5-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Logo ──────────────────────────────────────────────────────────────────────
function CreateAfricaLogo({ size = 48 }: { size?: number }) {
  return (
    <Box w={`${size}px`} h={`${size}px`} rounded="full" overflow="hidden" bg="white" border="2px solid" borderColor="orange.100" flexShrink={0} display="inline-block">
      <img src="/images/logo.jpg" alt="icreate.africa" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </Box>
  );
}

// ─── UserAvatar ───────────────────────────────────────────────────────────────
function UserAvatar({ user, size = "md" }: { user: Pick<User,"name"|"profilePicUrl">; size?: string }) {
  const sizeMap: Record<string,number> = { xs:24, sm:32, md:40, lg:48, xl:64, "2xl":80 };
  const px = sizeMap[size] ?? 40;
  if (user.profilePicUrl) {
    return (
      <Box w={`${px}px`} h={`${px}px`} rounded="full" overflow="hidden" flexShrink={0}>
        <img src={user.profilePicUrl} alt={user.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
      </Box>
    );
  }
  return <Avatar name={user.name} size={size as never} bg={ORANGE} color="white" fontWeight="800" />;
}

// ─── AutoPlayVideo — plays when scrolled into view, pauses when out ────────────
function AutoPlayVideo({ src, maxH }: { src: string; maxH: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true; // must set directly — React muted prop unreliable
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <AspectRatio ratio={9/16} maxH={maxH}>
      <Box position="relative" bg="#111">
        <video
          ref={videoRef}
          src={src}
          playsInline
          loop
          preload="metadata"
          style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
        />
        <Box
          position="absolute" bottom={2} right={2}
          bg="blackAlpha.700" rounded="full" w="34px" h="34px"
          display="flex" alignItems="center" justifyContent="center"
          cursor="pointer" zIndex={2}
          onClick={toggleMute}
        >
          <Text fontSize="15px" lineHeight={1}>{muted ? "🔇" : "🔊"}</Text>
        </Box>
      </Box>
    </AspectRatio>
  );
}

// ─── SparkMedia ───────────────────────────────────────────────────────────────
function SparkMedia({ mediaUrl, mediaType, maxH = "500px" }: { mediaUrl: string; mediaType: MediaType; maxH?: string }) {
  if (mediaType === "image") {
    return (
      <Box w="full" overflow="hidden" style={{ maxHeight: maxH }}>
        <img src={mediaUrl} alt="spark" loading="lazy" decoding="async" style={{ width:"100%", maxHeight: maxH, objectFit:"cover", display:"block" }} />
      </Box>
    );
  }
  return <AutoPlayVideo src={mediaUrl} maxH={maxH} />;
}

// ─── FieldLabel ───────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text fontSize="xs" fontWeight="700" color={BROWN} mb={1} textTransform="uppercase" letterSpacing="wide">{children}</Text>;
}

// ─── Great Spark Beyond Modal ─────────────────────────────────────────────────
function GreatBeyondModal({ isOpen, onClose, coins, tasks }: { isOpen: boolean; onClose: () => void; coins: number; tasks?: Tasks }) {
  const t = tasks ?? DEFAULT_TASKS;
  const taskList = [
    { e:"👋", l:"Invite a friend",        r:"+50 tokens", done: false },
    { e:"🎬", l:"Share your first spark",  r:"+20 tokens", done: t.first_spark_claimed },
    { e:"💪", l:"Encourage 5 sparks",      r:"+10 tokens", done: t.reactions_5_claimed },
    { e:"🔥", l:"Keep 10 sparks going",    r:"+10 tokens", done: t.reactions_10_claimed },
    { e:"📅", l:"Come back every day",     r:"+1 token",   done: t.daily_claimed === today() },
  ];
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(6px)" />
      <ModalContent mx={4} rounded="2xl" overflow="hidden" style={{ background:"linear-gradient(160deg,#1A0800 0%,#3D1200 60%,#1A0D00 100%)", border:`2px solid ${GOLD}` }}>
        <ModalCloseButton color="white" />
        <ModalBody py={8} px={6}>
          <VStack spacing={5} textAlign="center">
            <Text fontSize="40px" style={{ filter:"drop-shadow(0 0 12px gold)" }}>✨</Text>
            <Heading size="lg" color="white" lineHeight={1.2}>The Great Spark Beyond</Heading>
            <Text fontSize="sm" color={GOLD} fontWeight="700" fontStyle="italic">&ldquo;We are building something beautiful — together.&rdquo;</Text>
            <Box w="full" bg="rgba(245,166,35,0.12)" rounded="xl" px={4} py={4} border="1px solid" borderColor={GOLD}>
              <Text fontSize="xs" color="rgba(255,255,255,0.6)" mb={1}>Your tokens, saved just for you 🤍</Text>
              <HStack justify="center" spacing={2}><TokenIcon size={20} /><Text fontSize="3xl" fontWeight="900" color={GOLD}>{coins.toLocaleString()}</Text></HStack>
              <Text fontSize="xs" color="rgba(255,255,255,0.55)" mt={1}>A gift from us. Yours to keep, always.</Text>
            </Box>
            <Box w="full" bg="rgba(255,255,255,0.05)" rounded="xl" px={4} py={4} border="1px solid" borderColor="rgba(255,255,255,0.1)" textAlign="left">
              <Text fontSize="xs" fontWeight="800" color={GOLD} mb={2}>🌍 Something beautiful is coming</Text>
              <Text fontSize="xs" color="rgba(255,255,255,0.75)" lineHeight="tall">Every African voice heard, celebrated, and lifted up. Your tokens are safe. 💛</Text>
            </Box>
            <Divider borderColor="rgba(255,255,255,0.15)" />
            <VStack spacing={2} w="full" textAlign="left">
              {taskList.map(({ e, l, r, done }) => (
                <Flex key={l} w="full" align="center" justify="space-between" px={3} py={2} bg={done ? "rgba(245,166,35,0.18)" : "rgba(255,255,255,0.05)"} rounded="xl" border="1px solid" borderColor={done ? "rgba(245,166,35,0.4)" : "transparent"}>
                  <HStack spacing={2}>
                    <Text fontSize="sm">{e}</Text>
                    <Text fontSize="xs" color={done ? GOLD : "rgba(255,255,255,0.8)"} fontWeight="600" textDecoration={done ? "line-through" : "none"}>{l}</Text>
                  </HStack>
                  <HStack spacing={1}>
                    {done && <Text fontSize="xs" color={GOLD} fontWeight="900">✓</Text>}
                    <Text fontSize="xs" fontWeight="800" color={GOLD}>{r}</Text>
                  </HStack>
                </Flex>
              ))}
            </VStack>
            {/* Challenge — Coming Soon hero */}
            <Box w="full" rounded="2xl" overflow="hidden" border="2px solid" borderColor={GOLD} style={{ background:"linear-gradient(135deg,#2D0A00 0%,#5C1F00 100%)" }}>
              <Box px={4} py={4}>
                <Flex align="center" gap={2} mb={3}>
                  <Text fontSize="22px" style={{ filter:"drop-shadow(0 0 8px gold)" }}>🎁</Text>
                  <Box>
                    <Text fontSize="10px" fontWeight="900" color={GOLD} textTransform="uppercase" letterSpacing="widest">Coming April 1st</Text>
                    <Text fontSize="sm" fontWeight="900" color="white">The Language Challenge</Text>
                  </Box>
                  <Box ml="auto" bg={GOLD} rounded="full" px={2} py={0.5}>
                    <Text fontSize="9px" fontWeight="900" color="#2D0A00">SOON</Text>
                  </Box>
                </Flex>
                <Text fontSize="xs" fontWeight="900" color={GOLD} mb={2}>#WhatIsWelcomeInYourLanguage</Text>
                <Text fontSize="xs" color="rgba(255,255,255,0.75)" lineHeight="tall" mb={3}>
                  Say &ldquo;Welcome&rdquo; in any language — your spark, your voice, your Africa. Post it now and pile up tokens. The more tokens you hold when April 1st arrives, the stronger your standing in the competition. 🌍
                </Text>
                <Flex align="center" gap={2} bg="rgba(245,166,35,0.15)" rounded="xl" px={3} py={2} border="1px solid" borderColor="rgba(245,166,35,0.3)">
                  <Text fontSize="14px">💰</Text>
                  <Text fontSize="xs" color={GOLD} fontWeight="800">Start earning tokens now — every action counts towards April 1st</Text>
                </Flex>
              </Box>
            </Box>
            <Text fontSize="11px" color="rgba(255,255,255,0.3)">Your tokens never expire · we appreciate you 🤍</Text>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

// ─── Great Beyond Teaser ──────────────────────────────────────────────────────
function GreatBeyondTeaser({ onOpen }: { onOpen: () => void }) {
  return (
    <Box w="full" rounded="2xl" overflow="hidden" border="2px solid" borderColor={GOLD} cursor="pointer" onClick={onOpen}
      style={{ background:"linear-gradient(135deg,#3D1200 0%,#7A2E00 50%,#1A0D00 100%)", animation:"greatBeyondGlow 2.5s ease-in-out infinite" }}>
      <style>{`@keyframes greatBeyondGlow{0%,100%{box-shadow:0 0 20px ${GOLD}55,0 0 40px ${ORANGE}33}50%{box-shadow:0 0 35px ${GOLD}99,0 0 60px ${ORANGE}66}}`}</style>
      <Flex px={4} py={3} align="center" gap={3}>
        <Text fontSize="20px" style={{ filter:"drop-shadow(0 0 6px gold)" }}>✨</Text>
        <Box flex={1}>
          <Text fontSize="sm" fontWeight="900" color="white">The Great Spark Beyond</Text>
          <Text fontSize="10px" color="rgba(255,255,255,0.75)">Your 1,000 tokens are safe. Tap to see what&apos;s coming. 💛</Text>
        </Box>
        <Text fontSize="xs" color={GOLD} fontWeight="800">→</Text>
      </Flex>
    </Box>
  );
}

// ─── Great Spark Beyond helpers ───────────────────────────────────────────────
function getBeyondState(): { isOpen: boolean; endsIn: { h:number; m:number; s:number }; opensIn: { d:number; h:number; m:number; s:number } } {
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth();
  const openStart = new Date(y, mo, 5, 0, 0, 0);
  const openEnd   = new Date(y, mo, 5, 48, 0, 0); // 48 h window
  if (now >= openStart && now < openEnd) {
    const diff = openEnd.getTime() - now.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { isOpen: true, endsIn: { h, m, s }, opensIn: { d:0, h:0, m:0, s:0 } };
  }
  let next = new Date(y, mo, 5, 0, 0, 0);
  if (now >= openEnd) next = new Date(y, mo + 1, 5, 0, 0, 0);
  const diff = next.getTime() - now.getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { isOpen: false, endsIn: { h:0, m:0, s:0 }, opensIn: { d, h, m, s } };
}

// African geometric SVG pattern (kente-inspired diagonal diamonds)
const AFRICAN_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='none'/%3E%3Cpath d='M0 20 L20 0 L40 20 L20 40 Z' fill='none' stroke='%23F5A62322' stroke-width='1'/%3E%3Cpath d='M10 20 L20 10 L30 20 L20 30 Z' fill='%23F5A62311'/%3E%3C/svg%3E")`;

function BeyondScreen({ user, sparks, onNavigate }: { user: User; sparks: SparkPost[]; onNavigate: (v: View) => void }) {
  const [state, setState] = useState(() => getBeyondState());
  const [tab, setTab] = useState<"home" | "challenges" | "top" | "credits">("home");

  useEffect(() => {
    const t = setInterval(() => setState(getBeyondState()), 1000);
    return () => clearInterval(t);
  }, []);

  const userSparks  = sparks.filter(s => s.userId === user.id);
  const topSparks   = [...sparks]
    .filter(s => s.userId !== "icreate-admin")
    .sort((a, b) => Object.values(b.reactions ?? {}).reduce((x,y)=>x+y,0) - Object.values(a.reactions ?? {}).reduce((x,y)=>x+y,0))
    .slice(0, 10);
  const myReactionTotal = sparks.reduce((sum, s) => {
    const reacted = (Object.keys(s.reactedBy) as Reaction[]).some(r => s.reactedBy[r]?.includes(user.username));
    return sum + (reacted ? 1 : 0);
  }, 0);

  const pad = (n: number) => String(n).padStart(2, "0");

  const challenges = [
    { emoji:"🌍", title:"Show Africa Your Spark", desc:"Upload a spark that represents your culture, craft, or story. The most-applauded spark wins recognition across the platform.", credits: 50, tag:"Active" },
    { emoji:"💬", title:"Encourage 10 Creators", desc:"React to 10 different sparks this month. Every creator you encourage earns you Spark Credits.", credits: 30, tag:"Ongoing" },
    { emoji:"🤝", title:"Invite a Creator", desc:"Invite someone new to icreate.africa. When they share their first spark, you both earn bonus credits.", credits: 50, tag:"Always On" },
    { emoji:"📣", title:"Shout Out a Spark", desc:"Use the share button on any spark to spread it. Help another creator reach further.", credits: 20, tag:"Easy" },
  ];

  const howToEarn = [
    { icon:"🔥", action:"Share a Spark",          credits:"+20 credits" },
    { icon:"👏", action:"Applaud a creator",       credits:"+5 credits"  },
    { icon:"💬", action:"Encourage someone",       credits:"+5 credits"  },
    { icon:"📚", action:"Complete a challenge",    credits:"+30 credits" },
    { icon:"🤝", action:"Invite a friend",         credits:"+50 credits" },
    { icon:"📅", action:"Daily check-in",          credits:"+1 credit"   },
  ];

  const DARK = "#1A0800";
  const MID  = "#3D1200";

  return (
    <Box minH="100vh" bg={state.isOpen ? DARK : "#0F0800"} backgroundImage={AFRICAN_PATTERN} backgroundRepeat="repeat">
      <style>{`
        @keyframes beyondGlow { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes emberFloat { 0%{transform:translateY(0) rotate(0deg);opacity:.8} 100%{transform:translateY(-60px) rotate(20deg);opacity:0} }
        @keyframes beyondPulse { 0%,100%{box-shadow:0 0 20px #F5A62355} 50%{box-shadow:0 0 50px #F5A623aa,0 0 80px #E05A1C66} }
        .beyond-ember { position:absolute; width:6px; height:6px; background:${GOLD}; border-radius:50%; animation:emberFloat 3s ease-out infinite; }
      `}</style>

      {/* ── Header ── */}
      <Box px={5} pt={6} pb={4} position="relative" overflow="hidden">
        {state.isOpen && [0,1,2,3,4,5].map(i => (
          <div key={i} className="beyond-ember" style={{ left:`${15+i*15}%`, bottom:"10px", animationDelay:`${i*0.5}s`, animationDuration:`${2.5+i*0.3}s` }} />
        ))}
        <Flex align="center" gap={3} mb={4}>
          <Box flex={1}>
            <Text fontSize="10px" fontWeight="800" color={GOLD} textTransform="uppercase" letterSpacing="widest" mb={0.5}>
              {state.isOpen ? "🟢 Now Open" : "🔒 Coming Soon"}
            </Text>
            <Text fontSize={{ base:"22px", md:"28px" }} fontWeight="900" color="white" lineHeight="short">
              ✨ The Great Spark Beyond
            </Text>
          </Box>
          <Box textAlign="center" bg="rgba(245,166,35,0.15)" border="1.5px solid" borderColor={`${GOLD}66`} rounded="xl" px={3} py={2}>
            <Text fontSize="10px" color={GOLD} fontWeight="800" textTransform="uppercase">Spark Credits</Text>
            <Text fontSize="22px" fontWeight="900" color={GOLD}>{user.coins.toLocaleString()}</Text>
          </Box>
        </Flex>

        {state.isOpen ? (
          <Box bg="rgba(245,166,35,0.12)" border="1px solid" borderColor={`${GOLD}55`} rounded="xl" px={4} py={3} style={{ animation:"beyondPulse 2.5s ease-in-out infinite" }}>
            <Text fontSize="sm" fontWeight="800" color={GOLD} mb={0.5}>
              🎉 The Great Spark Beyond is now open!
            </Text>
            <Text fontSize="xs" color="rgba(255,255,255,0.7)" fontWeight="600">
              Closes in {pad(state.endsIn.h)}h {pad(state.endsIn.m)}m {pad(state.endsIn.s)}s — use your credits now
            </Text>
          </Box>
        ) : (
          <Box>
            <Text fontSize="xs" color="rgba(255,255,255,0.5)" fontWeight="700" textTransform="uppercase" letterSpacing="wide" mb={2}>
              Opens on the 5th — time remaining
            </Text>
            <Flex gap={2}>
              {[
                { v: state.opensIn.d, l:"Days"    },
                { v: state.opensIn.h, l:"Hours"   },
                { v: state.opensIn.m, l:"Minutes" },
                { v: state.opensIn.s, l:"Seconds" },
              ].map(({ v, l }) => (
                <Box key={l} flex={1} bg="rgba(245,166,35,0.1)" border="1px solid" borderColor={`${GOLD}44`} rounded="xl" py={2} textAlign="center">
                  <Text fontSize={{ base:"22px", md:"28px" }} fontWeight="900" color={GOLD} lineHeight={1}>{pad(v)}</Text>
                  <Text fontSize="9px" color="rgba(255,255,255,0.4)" fontWeight="700" textTransform="uppercase" letterSpacing="wide">{l}</Text>
                </Box>
              ))}
            </Flex>
          </Box>
        )}
      </Box>

      {/* ── Tabs ── */}
      <Flex px={5} gap={1} mb={4} overflowX="auto" css={{ scrollbarWidth:"none" }}>
        {([
          { id:"home",       label:"Overview"   },
          { id:"challenges", label:"Challenges" },
          { id:"top",        label:"Top Sparks" },
          { id:"credits",    label:"My Credits" },
        ] as const).map(t => (
          <Button key={t.id} size="sm" rounded="full" fontWeight="700" fontSize="xs" flexShrink={0}
            bg={tab===t.id ? GOLD : "rgba(255,255,255,0.08)"}
            color={tab===t.id ? DARK : "rgba(255,255,255,0.6)"}
            _hover={{ bg: tab===t.id ? GOLD : "rgba(255,255,255,0.15)" }}
            border="1px solid" borderColor={tab===t.id ? GOLD : "transparent"}
            onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </Flex>

      {/* ── Tab Content ── */}
      <Box px={5} pb={10}>

        {/* OVERVIEW */}
        {tab === "home" && (
          <VStack spacing={4} align="stretch">
            {!state.isOpen && (
              <Box bg={`linear-gradient(135deg, ${MID}, #5C1F00)`} border="1.5px solid" borderColor={`${GOLD}55`} rounded="2xl" px={5} py={5}>
                <Text fontSize="sm" fontWeight="900" color={GOLD} mb={1}>🌍 Prepare Your Spark</Text>
                <Text fontSize="sm" color="rgba(255,255,255,0.8)" lineHeight="tall" fontWeight="600">
                  The Great Spark Beyond opens on the 5th of every month for 48 hours.
                  African creators gather, showcase their sparks, and gain recognition from across the continent.
                  Upload more sparks now to earn credits — and be ready.
                </Text>
              </Box>
            )}

            {/* What happens inside */}
            <Text fontSize="11px" fontWeight="800" color="rgba(255,255,255,0.4)" textTransform="uppercase" letterSpacing="widest">Inside The Beyond</Text>
            <Grid templateColumns="1fr 1fr" gap={3}>
              {[
                { icon:"⚡", title:"Spark Challenges",   desc:"Compete in monthly creator challenges" },
                { icon:"🏆", title:"Top Sparks Africa",  desc:"Discover celebrated creators continent-wide" },
                { icon:"🎯", title:"Boost Your Reach",   desc:"Spend credits to reach more people" },
                { icon:"🤝", title:"Collaborate",        desc:"Connect with and lift up other creators" },
                { icon:"🎖️", title:"Recognition",        desc:"Earn badges and platform-wide spotlight" },
                { icon:"🔓", title:"Unlock Features",    desc:"Exclusive tools for credit holders" },
              ].map(({ icon, title, desc }) => (
                <Box key={title} bg="rgba(255,255,255,0.05)" border="1px solid" borderColor="rgba(255,255,255,0.1)" rounded="xl" p={3}>
                  <Text fontSize="20px" mb={1}>{icon}</Text>
                  <Text fontSize="xs" fontWeight="900" color="white" mb={0.5}>{title}</Text>
                  <Text fontSize="10px" color="rgba(255,255,255,0.5)" lineHeight="short">{desc}</Text>
                </Box>
              ))}
            </Grid>

            <Box bg="rgba(245,166,35,0.08)" border="1px solid" borderColor={`${GOLD}33`} rounded="xl" px={4} py={4}>
              <Text fontSize="xs" fontWeight="900" color={GOLD} mb={3} textTransform="uppercase" letterSpacing="wide">How to Earn Spark Credits</Text>
              <VStack spacing={2} align="stretch">
                {howToEarn.map(({ icon, action, credits }) => (
                  <Flex key={action} align="center" justify="space-between">
                    <Flex align="center" gap={2}>
                      <Text fontSize="14px">{icon}</Text>
                      <Text fontSize="xs" color="rgba(255,255,255,0.75)" fontWeight="600">{action}</Text>
                    </Flex>
                    <Text fontSize="xs" fontWeight="900" color={GOLD}>{credits}</Text>
                  </Flex>
                ))}
              </VStack>
            </Box>

            <Button size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={() => onNavigate("mypark")}>
              🔥 Upload More Sparks → Earn Credits
            </Button>
          </VStack>
        )}

        {/* CHALLENGES */}
        {tab === "challenges" && (
          <VStack spacing={4} align="stretch">
            <Box bg={MID} border="1px solid" borderColor={`${GOLD}44`} rounded="xl" px={4} py={3}>
              <Text fontSize="xs" color="rgba(255,255,255,0.7)" fontWeight="600" lineHeight="tall">
                Complete challenges to earn Spark Credits. Credits unlock special actions inside The Beyond when it opens on the 5th.
              </Text>
            </Box>
            {challenges.map(c => (
              <Box key={c.title} bg="rgba(255,255,255,0.05)" border="1px solid" borderColor="rgba(255,255,255,0.1)" rounded="2xl" overflow="hidden">
                <Box h="3px" bg={`linear-gradient(90deg, ${GOLD}, ${ORANGE})`} />
                <Box px={4} py={4}>
                  <Flex align="center" gap={3} mb={2}>
                    <Text fontSize="24px">{c.emoji}</Text>
                    <Box flex={1}>
                      <Text fontSize="sm" fontWeight="900" color="white">{c.title}</Text>
                      <Text fontSize="10px" fontWeight="700" color={GOLD} bg="rgba(245,166,35,0.15)" px={2} py={0.5} rounded="full" display="inline-block">{c.tag}</Text>
                    </Box>
                    <Box textAlign="right">
                      <Text fontSize="16px" fontWeight="900" color={GOLD}>+{c.credits}</Text>
                      <Text fontSize="9px" color="rgba(255,255,255,0.4)">credits</Text>
                    </Box>
                  </Flex>
                  <Text fontSize="xs" color="rgba(255,255,255,0.65)" lineHeight="tall">{c.desc}</Text>
                </Box>
              </Box>
            ))}
          </VStack>
        )}

        {/* TOP SPARKS */}
        {tab === "top" && (
          <VStack spacing={3} align="stretch">
            <Box bg={MID} border="1px solid" borderColor={`${GOLD}44`} rounded="xl" px={4} py={3}>
              <Text fontSize="xs" color="rgba(255,255,255,0.7)" fontWeight="600">
                🏆 The most celebrated sparks from across Africa — ranked by community reactions.
              </Text>
            </Box>
            {topSparks.length === 0 && (
              <Center py={10} flexDirection="column" gap={3}>
                <Text fontSize="36px">🌟</Text>
                <Text color="rgba(255,255,255,0.5)" fontWeight="700">No sparks yet — be the first!</Text>
                <Button bg={ORANGE} color="white" fontWeight="800" rounded="xl" onClick={() => onNavigate("mypark")}>Upload Your Spark</Button>
              </Center>
            )}
            {topSparks.map((s, i) => {
              const total = Object.values(s.reactions ?? {}).reduce((a, b) => a + b, 0);
              return (
                <Flex key={s.id} gap={3} align="center" bg="rgba(255,255,255,0.05)" border="1px solid" borderColor={i<3?"rgba(245,166,35,0.3)":"rgba(255,255,255,0.08)"} rounded="xl" px={4} py={3}>
                  <Text fontSize="18px" fontWeight="900" color={i===0?GOLD:i===1?"#C0C0C0":i===2?"#CD7F32":"rgba(255,255,255,0.3)"} w="24px" textAlign="center">
                    {i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}
                  </Text>
                  <Box w="36px" h="36px" rounded="full" overflow="hidden" flexShrink={0} border="1.5px solid" borderColor={i<3?GOLD:"rgba(255,255,255,0.2)"}>
                    {s.profilePicUrl ? <img src={s.profilePicUrl} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <Avatar name={s.name} size="sm" bg={ORANGE} />}
                  </Box>
                  <Box flex={1} minW={0}>
                    <Text fontSize="xs" fontWeight="900" color="white" noOfLines={1}>{s.name}</Text>
                    <Text fontSize="10px" color="rgba(255,255,255,0.45)" noOfLines={1}>@{s.username}</Text>
                  </Box>
                  <Flex align="center" gap={1}>
                    <Text fontSize="14px">🔥</Text>
                    <Text fontSize="sm" fontWeight="900" color={i<3?GOLD:"rgba(255,255,255,0.6)"}>{total}</Text>
                  </Flex>
                </Flex>
              );
            })}
          </VStack>
        )}

        {/* MY CREDITS */}
        {tab === "credits" && (
          <VStack spacing={4} align="stretch">
            <Box bg={`linear-gradient(135deg, ${MID}, #5C1F00)`} border="2px solid" borderColor={GOLD} rounded="2xl" px={5} py={5} textAlign="center" style={{ animation:"beyondPulse 3s ease-in-out infinite" }}>
              <Text fontSize="12px" fontWeight="800" color="rgba(255,255,255,0.5)" textTransform="uppercase" letterSpacing="widest" mb={1}>Your Spark Credits</Text>
              <Text fontSize="52px" fontWeight="900" color={GOLD} lineHeight={1}>{user.coins.toLocaleString()}</Text>
              <Text fontSize="xs" color="rgba(255,255,255,0.5)" mt={1}>Earned by sharing, encouraging &amp; participating</Text>
            </Box>
            <Box bg="rgba(255,255,255,0.05)" border="1px solid" borderColor="rgba(255,255,255,0.1)" rounded="2xl" px={4} py={4}>
              <Text fontSize="xs" fontWeight="900" color={GOLD} mb={3} textTransform="uppercase" letterSpacing="wide">Your Activity</Text>
              <VStack spacing={2} align="stretch">
                {[
                  { icon:"🔥", label:"Sparks shared",      value: userSparks.length },
                  { icon:"👏", label:"Creators encouraged", value: myReactionTotal   },
                  { icon:"✨", label:"Total credits",       value: user.coins        },
                ].map(({ icon, label, value }) => (
                  <Flex key={label} align="center" justify="space-between" py={1} borderBottom="1px solid" borderColor="rgba(255,255,255,0.07)" _last={{ border:"none" }}>
                    <Flex align="center" gap={2}>
                      <Text fontSize="14px">{icon}</Text>
                      <Text fontSize="xs" color="rgba(255,255,255,0.7)" fontWeight="600">{label}</Text>
                    </Flex>
                    <Text fontSize="sm" fontWeight="900" color={GOLD}>{value}</Text>
                  </Flex>
                ))}
              </VStack>
            </Box>
            <Box bg="rgba(245,166,35,0.08)" border="1px solid" borderColor={`${GOLD}33`} rounded="xl" px={4} py={4}>
              <Text fontSize="xs" fontWeight="900" color={GOLD} mb={2}>What you can do with credits on April 5th</Text>
              {[
                "🚀 Promote your spark to reach more people across Africa",
                "🎯 Enter premium Spark Challenges with bigger rewards",
                "🤝 Unlock collaboration requests with top creators",
                "🏆 Compete for the monthly spotlight badge",
              ].map(item => (
                <Flex key={item} align="flex-start" gap={2} mb={2}>
                  <Text fontSize="xs" color="rgba(255,255,255,0.65)" lineHeight="tall">{item}</Text>
                </Flex>
              ))}
            </Box>
            <Button size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={() => onNavigate("mypark")}>
              🔥 Upload More → Earn More Credits
            </Button>
          </VStack>
        )}
      </Box>
    </Box>
  );
}

// ─── Reach Selector ───────────────────────────────────────────────────────────
function ReachSelector({ reach, setReach, onOpenBeyond }: { reach: Reach; setReach: (r: Reach) => void; onOpenBeyond: () => void }) {
  return (
    <Box w="full">
      <FieldLabel>Who sees this spark?</FieldLabel>
      <VStack spacing={2}>
        <Flex w="full" align="center" gap={2} px={3} py={3} rounded="xl" border="2px solid" borderColor={reach==="share"?ORANGE:"orange.100"} bg={reach==="share"?"orange.50":"white"} cursor="pointer" onClick={() => setReach("share")} transition="all 0.15s">
          <Text fontSize="lg">🌐</Text>
          <Box flex={1}>
            <Text fontSize="xs" fontWeight="800" color={BROWN}>Share</Text>
            <Text fontSize="10px" color="green.500" fontWeight="700">Free · your community sees this</Text>
          </Box>
          {reach==="share" && <Box w="8px" h="8px" bg={ORANGE} rounded="full" />}
        </Flex>
        <GreatBeyondTeaser onOpen={onOpenBeyond} />
      </VStack>
    </Box>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────
function InviteModal({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user: User }) {
  const toast = useToast();
  const code = user.username.slice(0,4).toUpperCase() + String(user.username.split("").reduce((a,c) => a+c.charCodeAt(0),0)).slice(-3);
  const txt  = `Hey! I am on icreate.africa — Africa's platform for creators. Come join us! https://www.icreate.africa?ref=${code}`;
  const copy = () => navigator.clipboard.writeText(txt).then(() => toast({ title:"Invite copied!", status:"success", duration:2000, isClosable:true }));
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="sm">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent mx={4} rounded="2xl" overflow="hidden">
        <Box h="4px" bg={ORANGE}/><ModalCloseButton color={BROWN}/>
        <ModalBody py={7} px={6}>
          <VStack spacing={4} textAlign="center">
            <Heading size="md" color={BROWN}>Bring your people 🤍</Heading>
            <Box w="full" bg="orange.50" rounded="xl" p={4} border="1px solid" borderColor="orange.100">
              <Text fontSize="xs" color="gray.600" lineHeight="tall" textAlign="left">{txt}</Text>
            </Box>
            <Text fontSize="xs" color="gray.400">Referral code: <Text as="span" fontWeight="900" color={ORANGE}>{code}</Text></Text>
            <VStack spacing={2} w="full">
              <Button w="full" bg={ORANGE} color="white" fontWeight="800" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={() => navigator.share ? navigator.share({ title:"Join me on icreate.africa", text:txt }) : copy()}>Share Invite Link</Button>
              <Button w="full" variant="outline" borderColor={ORANGE} color={ORANGE} fontWeight="700" rounded="xl" _hover={{ bg:"orange.50" }} onClick={copy}>Copy Link</Button>
            </VStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ isOpen, onClose, user, onSave }: { isOpen: boolean; onClose: () => void; user: User; onSave: (u: User) => void }) {
  const [name,           setName]           = useState(user.name);
  const [username,       setUsername]       = useState(user.username);
  const [birthYear,      setBirthYear]      = useState<number|"">(user.birthYear||"");
  const [gender,         setGender]         = useState(user.gender||"");
  const [country,        setCountry]        = useState(user.country||"");
  const [state,          setState]          = useState(user.state||"");
  const [customState,    setCustomState]    = useState(user.state||"");
  const [city,           setCity]           = useState(user.city||"");
  const [occupation,     setOccupation]     = useState(OCCUPATIONS.includes(user.occupation) ? user.occupation : "Other");
  const [customOccupation,setCustomOccupation] = useState(OCCUPATIONS.includes(user.occupation) ? "" : user.occupation);
  const [showAge,        setShowAge]        = useState(user.showAge ?? true);
  const [picUrl,         setPicUrl]         = useState(user.profilePicUrl||"");
  const [picFile,        setPicFile]        = useState<File|null>(null);
  const [saving,         setSaving]         = useState(false);
  const picRef = useRef<HTMLInputElement>(null);
  const toast  = useToast();

  const stateOptions    = country ? STATES_BY_COUNTRY[country] ?? null : null;
  const effectiveState  = stateOptions ? state : customState;
  const effectiveOccup  = occupation==="Other" ? customOccupation.trim() : occupation;
  const age             = birthYear ? calcAge(birthYear as number) : null;

  const handleSave = async () => {
    if (!name.trim() || !username.trim()) { toast({ title:"Name and username required", status:"warning", duration:2500, isClosable:true }); return; }
    setSaving(true);
    try {
      let finalPicUrl = picUrl;
      if (picFile) finalPicUrl = await uploadMedia(picFile, "profiles");
      const bio = buildBio({ name: name.trim(), occupation: effectiveOccup, city: city.trim(), state: effectiveState, country, birthYear: birthYear as number, showAge });
      const updated: User = { ...user, name: name.trim(), username: username.trim().toLowerCase().replace(/\s+/g,""), birthYear: birthYear as number, gender, country, state: effectiveState, city: city.trim(), occupation: effectiveOccup, showAge, profilePicUrl: finalPicUrl, bio };
      await saveProfile(updated);
      localStorage.setItem("ca_user", JSON.stringify(updated));
      sendEmail("profile_updated", updated.email, updated.name, updated.username, {
        occupation: updated.occupation, country: updated.country,
        state: updated.state, city: updated.city,
      });
      onSave(updated);
      onClose();
      toast({ title:"Profile updated! ✨", status:"success", duration:2500, isClosable:true });
    } catch(e) { toast({ title:"Save failed", description: String(e), status:"error", duration:4000, isClosable:true }); }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent mx={4} rounded="2xl" overflow="hidden">
        <Box h="4px" bg={ORANGE}/><ModalCloseButton color={BROWN} mt={1}/>
        <ModalBody py={6} px={6}>
          <Heading size="md" color={BROWN} fontWeight="900" mb={5}>Edit Profile</Heading>
          <VStack spacing={4}>
            {/* Profile pic */}
            <Center w="96px" h="96px" rounded="full" overflow="hidden" border="3px solid" borderColor={ORANGE} mx="auto" cursor="pointer" position="relative" onClick={() => picRef.current?.click()}>
              {picUrl ? <img src={picUrl} alt="pic" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : <Avatar name={name} size="xl" bg={ORANGE} color="white" fontWeight="900" />}
              <Box position="absolute" bottom={0} left={0} right={0} bg="blackAlpha.600" py={1} textAlign="center">
                <Text color="white" fontSize="9px" fontWeight="700">CHANGE</Text>
              </Box>
            </Center>
            <input ref={picRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { const f=e.target.files?.[0]; if(f){ setPicFile(f); setPicUrl(URL.createObjectURL(f)); } }} />
            <Text fontSize="xs" color="gray.400" mt={-3}>Tap photo to change</Text>

            <Grid templateColumns="1fr 1fr" gap={3} w="full">
              <GridItem><FieldLabel>Full name</FieldLabel><Input value={name} onChange={e=>setName(e.target.value)} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></GridItem>
              <GridItem><FieldLabel>Username</FieldLabel><Input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/\s+/g,""))} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></GridItem>
            </Grid>
            <Grid templateColumns="1fr 1fr" gap={3} w="full">
              <GridItem>
                <FieldLabel>Birth year</FieldLabel>
                <Select placeholder="Year" value={birthYear} onChange={e=>setBirthYear(e.target.value?Number(e.target.value):"")} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
                  {BIRTH_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </Select>
                {age && <Text fontSize="xs" color={ORANGE} fontWeight="700" mt={1}>Age: {age}</Text>}
              </GridItem>
              <GridItem>
                <FieldLabel>Gender</FieldLabel>
                <Select placeholder="Select" value={gender} onChange={e=>setGender(e.target.value)} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
                  {GENDERS.map(g=><option key={g} value={g}>{g}</option>)}
                </Select>
              </GridItem>
            </Grid>
            <Box w="full">
              <FieldLabel>Country</FieldLabel>
              <Select placeholder="Select country" value={country} onChange={e=>{ setCountry(e.target.value); setState(""); setCustomState(""); }} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
                {AFRICAN_COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
                <option value="Other">Other</option>
              </Select>
            </Box>
            {country && (
              <Grid templateColumns="1fr 1fr" gap={3} w="full">
                <GridItem>
                  <FieldLabel>State / Region</FieldLabel>
                  {stateOptions ? <Select placeholder="Select state" value={state} onChange={e=>setState(e.target.value)} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">{stateOptions.map(s=><option key={s} value={s}>{s}</option>)}</Select>
                    : <Input placeholder="e.g. Nairobi" value={customState} onChange={e=>setCustomState(e.target.value)} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" />}
                </GridItem>
                <GridItem><FieldLabel>City / Town</FieldLabel><Input placeholder="e.g. Ikorodu" value={city} onChange={e=>setCity(e.target.value)} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></GridItem>
              </Grid>
            )}
            <Box w="full">
              <FieldLabel>Occupation</FieldLabel>
              <Select value={occupation} onChange={e=>setOccupation(e.target.value)} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
                {OCCUPATIONS.map(o=><option key={o} value={o}>{o}</option>)}
              </Select>
            </Box>
            {occupation==="Other" && <Box w="full"><FieldLabel>Enter occupation</FieldLabel><Input value={customOccupation} onChange={e=>setCustomOccupation(e.target.value)} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></Box>}
            {birthYear && (
              <Flex w="full" align="center" gap={3} px={3} py={3} rounded="xl" border="2px solid" borderColor={showAge?ORANGE:"orange.100"} bg={showAge?"orange.50":"white"} cursor="pointer" onClick={()=>setShowAge(!showAge)} transition="all 0.15s">
                <Text fontSize="xs" fontWeight="800" color={BROWN} flex={1}>Show my age ({age}) on profile</Text>
                <Box w="20px" h="20px" rounded="full" border="2px solid" borderColor={showAge?ORANGE:"gray.300"} bg={showAge?ORANGE:"transparent"} display="flex" alignItems="center" justifyContent="center">
                  {showAge && <Text color="white" fontSize="10px" fontWeight="900">✓</Text>}
                </Box>
              </Flex>
            )}
            <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={handleSave} isLoading={saving} loadingText="Saving…">Save Changes</Button>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

// ─── Profile Passport Modal ───────────────────────────────────────────────────
function ProfilePassportModal({ username, sparks, setSparks, currentUser, onClose }: {
  username: string|null;
  sparks: SparkPost[];
  setSparks: React.Dispatch<React.SetStateAction<SparkPost[]>>;
  currentUser: User;
  onClose: () => void;
}) {
  const [profile,    setProfile]    = useState<User|null>(null);
  const [loading,    setLoading]    = useState(false);
  const [myReactions,setMyReactions]= useState<Record<number, Reaction[]>>({});
  const [reactPeek,  setReactPeek]  = useState<{ sparkId:number; reaction:Reaction; names:string[] }|null>(null);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    fetchProfileByUsername(username).then(p => { setProfile(p); setLoading(false); });
  }, [username]);

  // Init reactions from DB state
  useEffect(() => {
    const initial: Record<number, Reaction[]> = {};
    sparks.forEach(s => {
      const mine = (Object.keys(s.reactedBy) as Reaction[]).filter(r => s.reactedBy[r]?.includes(currentUser.username));
      if (mine.length) initial[s.id] = mine;
    });
    setMyReactions(initial);
  }, [sparks, currentUser.username]);

  const handleReact = (sparkId: number, reaction: Reaction) => {
    const current = myReactions[sparkId] ?? [];
    const alreadyReacted = current.includes(reaction);
    setMyReactions(r => ({ ...r, [sparkId]: alreadyReacted ? current.filter(x=>x!==reaction) : [...current, reaction] }));
    setSparks(posts => posts.map(s => {
      if (s.id !== sparkId) return s;
      const reactions = { ...s.reactions };
      const reactedBy = { ...s.reactedBy };
      if (alreadyReacted) {
        reactions[reaction] = Math.max(0, reactions[reaction] - 1);
        reactedBy[reaction] = (reactedBy[reaction] || []).filter(u => u !== currentUser.username);
      } else {
        reactions[reaction] += 1;
        reactedBy[reaction] = [...(reactedBy[reaction] || []), currentUser.username];
      }
      updateReactions(sparkId, reactions, reactedBy);
      return { ...s, reactions, reactedBy };
    }));
  };

  if (!username) return null;

  const userSparks = sparks.filter(s => s.username === username);
  const totalReactions = userSparks.reduce((sum,s) => sum + Object.values(s.reactions ?? {}).reduce((a,b) => a+b, 0), 0);
  const age = profile?.birthYear ? calcAge(profile.birthYear, profile.birthMonth, profile.birthDay) : null;

  return (
    <Modal isOpen={!!username} onClose={onClose} size="md" scrollBehavior="inside" motionPreset="slideInBottom">
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(6px)" />
      <ModalContent mx={3} mb={0} mt={{ base:"auto", md:"auto" }} rounded="2xl" overflow="hidden" bg={CREAM} maxH="92vh">
        <ModalCloseButton color="white" zIndex={10} mt={2} mr={2} bg="rgba(0,0,0,0.3)" rounded="full" size="sm" />

        {loading ? (
          <Center py={20}><Spinner color={ORANGE} size="xl" /></Center>
        ) : profile ? (
          <Box overflowY="auto">
            {/* ── Passport header ── */}
            <Box bg={`linear-gradient(135deg,${BROWN} 0%,#8B3A0F 55%,${ORANGE} 100%)`} px={5} pt={10} pb={5} position="relative">
              <Text fontSize="9px" color="rgba(255,255,255,0.45)" textTransform="uppercase" letterSpacing="widest" fontWeight="700" mb={3}>icreate.africa · Spark Passport</Text>
              <Flex gap={4} align="flex-start">
                <Box w="80px" h="80px" rounded="2xl" overflow="hidden" border="3px solid rgba(255,255,255,0.4)" flexShrink={0}>
                  {profile.profilePicUrl
                    ? <img src={profile.profilePicUrl} alt={profile.name} loading="lazy" style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                    : <Avatar name={profile.name} size="xl" bg={ORANGE} color="white" fontWeight="900" borderRadius="2xl" w="100%" h="100%" />}
                </Box>
                <Box flex={1} pt={1}>
                  <Text color="white" fontWeight="900" fontSize="2xl" lineHeight={1.1}>{profile.name}</Text>
                  <Text color="rgba(255,255,255,0.65)" fontSize="sm">@{profile.username}</Text>
                  {profile.occupation && <Text color="rgba(255,255,255,0.85)" fontSize="xs" mt={1} fontWeight="700">{profile.occupation}</Text>}
                </Box>
              </Flex>
              <Flex mt={3} gap={2} flexWrap="wrap">
                {[profile.country, profile.state, profile.city].filter(Boolean).map((v,i) => (
                  <Text key={i} fontSize="10px" color="rgba(255,255,255,0.7)" bg="rgba(255,255,255,0.15)" px={2} py={0.5} rounded="full">{v}</Text>
                ))}
                {age !== null && profile.showAge && <Text fontSize="10px" color="rgba(255,255,255,0.7)" bg="rgba(255,255,255,0.15)" px={2} py={0.5} rounded="full">Age {age}</Text>}
                {profile.gender && <Text fontSize="10px" color="rgba(255,255,255,0.7)" bg="rgba(255,255,255,0.15)" px={2} py={0.5} rounded="full">{profile.gender}</Text>}
              </Flex>
            </Box>

            {/* ── Stats ── */}
            <Flex bg="white" px={5} py={3} justify="space-around" borderBottom="1px solid" borderColor="orange.100">
              {[["Sparks", userSparks.length], ["Reactions", totalReactions]].map(([l,v]) => (
                <VStack key={l as string} spacing={0}>
                  <Text fontWeight="900" color={BROWN} fontSize="xl">{v}</Text>
                  <Text fontSize="10px" color="gray.400" fontWeight="700" textTransform="uppercase" letterSpacing="wide">{l}</Text>
                </VStack>
              ))}
            </Flex>

            {/* ── Bio ── */}
            {profile.bio && (
              <Box px={5} py={3} bg="white" borderBottom="1px solid" borderColor="orange.100">
                <Text fontSize="sm" color="gray.600" lineHeight="tall">{profile.bio}</Text>
              </Box>
            )}

            {/* ── Sparks feed ── */}
            <Box px={4} py={4}>
              {userSparks.length === 0 ? (
                <Center py={10} flexDirection="column" gap={2}>
                  <Text fontSize="32px">✨</Text>
                  <Text fontSize="sm" color="gray.400" fontWeight="600">No sparks yet</Text>
                </Center>
              ) : (
                <VStack spacing={4}>
                  {userSparks.map(s => (
                    <Box key={s.id} w="full" bg="white" rounded="2xl" shadow="sm" overflow="hidden" border="1px solid" borderColor="orange.100">
                      <Box h="3px" bg={s.reach==="beyond"?GOLD:ORANGE} />
                      {/* Spark media */}
                      <SparkMedia mediaUrl={s.mediaUrl} mediaType={s.mediaType} maxH="380px" />
                      {/* Caption */}
                      <Box px={4} pt={3} pb={1}>
                        <Text fontSize="sm" color="gray.800" fontWeight="500" lineHeight="tall">{s.caption}</Text>
                      </Box>
                      {/* Reaction peek drawer */}
                      {reactPeek && reactPeek.sparkId===s.id && (
                        <Box mx={4} mb={2} bg="gray.50" rounded="xl" px={4} py={3} border="1px solid" borderColor="orange.100">
                          <Flex justify="space-between" align="center" mb={2}>
                            <Text fontWeight="800" color={BROWN} fontSize="xs">
                              {REACTIONS.find(r=>r.label===reactPeek.reaction)?.emoji} {reactPeek.reaction} · {reactPeek.names.length}
                            </Text>
                            <Button variant="ghost" size="xs" color="gray.400" onClick={()=>setReactPeek(null)}>✕</Button>
                          </Flex>
                          {reactPeek.names.length===0
                            ? <Text fontSize="xs" color="gray.400">No one yet.</Text>
                            : <Flex gap={2} flexWrap="wrap">{reactPeek.names.map(u => <Text key={u} fontSize="xs" bg="orange.50" px={2} py={0.5} rounded="full" color={BROWN} fontWeight="700">@{u}</Text>)}</Flex>}
                        </Box>
                      )}
                      {/* Reactions */}
                      {currentUser.username !== username && (
                        <Flex px={4} pb={4} pt={2} gap={2} flexWrap="wrap">
                          {REACTIONS.map(({ label, emoji }) => {
                            const active = myReactions[s.id]?.includes(label) ?? false;
                            return (
                              <Button key={label} size="sm" rounded="full"
                                bg={active?ORANGE:"orange.50"} color={active?"white":BROWN}
                                border="1.5px solid" borderColor={active?ORANGE:"orange.200"}
                                fontWeight="700" fontSize="xs" px={3}
                                _hover={{ bg:active?"#c44d16":"orange.100" }} transition="all 0.15s"
                                onClick={()=>handleReact(s.id, label)}>
                                {emoji} {label}
                                {s.reactions[label]>0 && (
                                  <Text as="span" ml={1.5} fontWeight="900" cursor="pointer"
                                    onClick={e=>{ e.stopPropagation(); setReactPeek({ sparkId:s.id, reaction:label, names:s.reactedBy[label]||[] }); }}>
                                    {s.reactions[label]}
                                  </Text>
                                )}
                              </Button>
                            );
                          })}
                        </Flex>
                      )}
                      {/* Own sparks — just show counts */}
                      {currentUser.username === username && (
                        <Flex px={4} pb={4} pt={2} gap={2} flexWrap="wrap">
                          {REACTIONS.filter(r=>s.reactions[r.label]>0).map(({ label, emoji }) => (
                            <Flex key={label} align="center" gap={1} bg="orange.50" px={3} py={1} rounded="full"
                              cursor="pointer" onClick={()=>setReactPeek({ sparkId:s.id, reaction:label, names:s.reactedBy[label]||[] })}>
                              <Text fontSize="xs">{emoji}</Text>
                              <Text fontSize="xs" fontWeight="800" color={BROWN}>{s.reactions[label]}</Text>
                            </Flex>
                          ))}
                          {Object.values(s.reactions ?? {}).every(v=>v===0) && <Text fontSize="xs" color="gray.400" px={1}>No reactions yet</Text>}
                        </Flex>
                      )}
                    </Box>
                  ))}
                </VStack>
              )}
            </Box>
            <Box h={6} />
          </Box>
        ) : (
          <Center py={16}><Text color="gray.400">Profile not found</Text></Center>
        )}
      </ModalContent>
    </Modal>
  );
}

// ─── Sign Up Screen ───────────────────────────────────────────────────────────
type SignUpStep = "welcome" | "about" | "spark" | "preview" | "signin" | "forgotpw";

const STEP_PROGRESS: Record<SignUpStep, number> = { welcome:0, about:33, spark:66, preview:90, signin:0, forgotpw:0 };

// objectPosition tuned per image so the model's face, arms, logo & banner all stay visible
const IMG_FOCUS: Record<string, string> = {
  "/images/icreate.africa1.png": "50% 18%",  // kneeling dancer — arms up, logo top-right
  "/images/icreate.africa2.png": "50% 10%",  // arms fully raised — extra headroom at top
  "/images/icreate.africa3.png": "50% 15%",  // standing — face & logo centred
};

function FormShell({ children, title, subtitle, step }: {
  children: React.ReactNode; title: string; subtitle?: string; step: SignUpStep;
}) {
  const stepImage =
    step === "about"                         ? "/images/icreate.africa2.png"
    : step === "spark" || step === "preview" ? "/images/icreate.africa3.png"
    :                                          "/images/icreate.africa1.png";
  const focus = IMG_FOCUS[stepImage];

  return (
    <Box minH="100vh" bg="white">
      <Flex minH="100vh" direction={{ base:"column", lg:"row" }}>

        {/* ── Desktop left panel: image fills edge-to-edge, no gaps ── */}
        <Box
          display={{ base:"none", lg:"block" }}
          flex={1}
          position="relative"
          overflow="hidden"
        >
          <img
            key={stepImage}
            src={stepImage}
            alt=""
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: focus,
              display: "block",
            }}
          />
        </Box>

        {/* ── Form panel ── */}
        <Flex
          flex={{ base:1, lg:"0 0 480px" }}
          direction="column"
          justify="center"
          align="center"
          px={{ base:6, sm:12 }}
          py={10}
          bg="white"
          overflowY="auto"
          minH={{ lg:"100vh" }}
          borderLeft={{ lg:"1px solid" }}
          borderColor={{ lg:"gray.100" }}
        >
          <Box w="full" maxW="380px">

            {/* Mobile: fixed-height image strip, cover-cropped */}
            {(step === "welcome" || step === "signin") && (
              <Box display={{ base:"block", lg:"none" }} mb={6} mx={-6} h="260px" overflow="hidden" position="relative">
                <img
                  src={stepImage}
                  alt=""
                  style={{
                    position: "absolute",
                    top: 0, left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: focus,
                    display: "block",
                  }}
                />
              </Box>
            )}

            {step!=="welcome" && step!=="signin" && step!=="forgotpw" && (
              <Box mb={5}>
                <Progress value={STEP_PROGRESS[step]} size="xs" colorScheme="orange" rounded="full" mb={3} />
                <Text fontSize="xs" color="gray.400" fontWeight="600">Step {step==="about"?1:step==="spark"?2:3} of 3</Text>
              </Box>
            )}

            <Heading size="lg" color={BROWN} fontWeight="900" mb={0.5}>{title}</Heading>
            {subtitle && <Text fontSize="sm" color="gray.400" mb={5}>{subtitle}</Text>}
            {children}
          </Box>
        </Flex>
      </Flex>
    </Box>
  );
}

function SignUpScreen({ onDone }: {
  onDone: (user: User, isNew: boolean, introPost: Omit<SparkPost,"id"|"reactions"|"reactedBy"|"journeyId">|null) => void
}) {
  const [step,   setStep]   = useState<SignUpStep>("welcome");
  const [name,   setName]   = useState("");
  const [username,setUsername]=useState("");
  const [email,  setEmail]  = useState("");
  const [password,       setPassword]       = useState("");
  const [confirmPw,      setConfirmPw]      = useState("");
  const [showPw,         setShowPw]         = useState(false);
  const [showConfirmPw,  setShowConfirmPw]  = useState(false);
  const [signinPassword, setSigninPassword] = useState("");
  const [showSigninPw,   setShowSigninPw]   = useState(false);
  const [rememberMe,     setRememberMe]     = useState(true);
  const [forgotEmail,    setForgotEmail]    = useState("");
  const [customCity,     setCustomCity]     = useState("");
  const [citySelect,     setCitySelect]     = useState("");
  const [birthYear, setBirthYear] = useState<number|"">("");
  const [birthMonth,setBirthMonth] = useState<number|"">("");
  const [birthDay,  setBirthDay]   = useState<number|"">("");
  const [gender, setGender] = useState("");
  const [country,setCountry]= useState("");
  const [state,  setState]  = useState("");
  const [customState,setCustomState]=useState("");
  const [city,   setCity]   = useState("");
  const [occupation,setOccupation]=useState("");
  const [customOccupation,setCustomOccupation]=useState("");
  const [showAge,setShowAge]=useState(true);
  const [picFile,setPicFile]=useState<File|null>(null);
  const [picUrl, setPicUrl] = useState("");
  const [signinUsername,setSigninUsername]=useState("");
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle"|"checking"|"available"|"taken">("idle");
  const picRef = useRef<HTMLInputElement>(null);
  const toast  = useToast();
  const [greetingIdx, setGreetingIdx] = useState(() => Math.floor(Math.random() * GREETINGS.length));
  useEffect(() => {
    const t = setInterval(() => setGreetingIdx(i => (i + 1) % GREETINGS.length), 3000);
    return () => clearInterval(t);
  }, []);
  const greeting = GREETINGS[greetingIdx];

  const AVAILABLE_MSGS = [
    "🔥 That's a fire username — it's all yours!",
    "✨ Yes! @{u} is free. Claim it!",
    "🎉 Nobody has @{u} yet — grab it now!",
    "🌍 @{u} is available. Africa is waiting for you!",
    "💥 That username slaps and it's yours for the taking!",
    "🚀 @{u} is unclaimed — let's gooo!",
  ];

  useEffect(() => {
    const raw = username.trim();
    if (raw.length < 3) { setUsernameStatus("idle"); return; }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id").eq("username", raw).maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 600);
    return () => clearTimeout(t);
  }, [username]);

  const stateOptions   = country ? STATES_BY_COUNTRY[country] ?? null : null;
  const effectiveState = stateOptions ? state : customState;
  const effectiveOccup = occupation==="Other" ? customOccupation : occupation;
  const age            = birthYear ? calcAge(birthYear as number, birthMonth as number, birthDay as number) : null;
  const introCaption   = name && effectiveOccup && country
    ? buildBio({ name, occupation: effectiveOccup, city, state: effectiveState, country, birthYear: birthYear as number, showAge: showAge && !!birthYear })
    : "";

  const handleAboutNext = () => {
    if (!name.trim()||!username.trim()||!email.trim()||!birthYear||!birthMonth&&birthMonth!==0||!birthDay||!gender||!country) { toast({ title:"Please fill in all required fields", status:"warning", duration:2500, isClosable:true }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast({ title:"Please enter a valid email address", status:"warning", duration:2500, isClosable:true }); return; }
    if (!password.trim() || password.length < 6) { toast({ title:"Password must be at least 6 characters", status:"warning", duration:2500, isClosable:true }); return; }
    if (password !== confirmPw) { toast({ title:"Passwords do not match", status:"error", duration:2500, isClosable:true }); return; }
    if (usernameStatus==="taken") { toast({ title:"That username is already taken", description:"Try a different one!", status:"error", duration:2500, isClosable:true }); return; }
    if (usernameStatus==="checking"||usernameStatus==="idle") { toast({ title:"Please wait while we check your username", status:"info", duration:2000, isClosable:true }); return; }
    setStep("spark");
  };
  const handleSparkNext = () => {
    if (!occupation) { toast({ title:"Please select your occupation", status:"warning", duration:2500, isClosable:true }); return; }
    if (occupation==="Other"&&!customOccupation.trim()) { toast({ title:"Please enter your occupation", status:"warning", duration:2500, isClosable:true }); return; }
    if (!picFile) { toast({ title:"Please upload your profile picture", status:"warning", duration:2500, isClosable:true }); return; }
    setStep("preview");
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const finalPicUrl = picFile ? await uploadMedia(picFile, "profiles") : "";
      const finalCity = CITIES_BY_COUNTRY[country] ? (citySelect === "Other" ? customCity : citySelect) : city;
      const bio = buildBio({ name: name.trim(), occupation: effectiveOccup, city: finalCity, state: effectiveState, country, birthYear: birthYear as number, showAge: showAge && !!birthYear });
      const user: User = {
        id: uid(), name: name.trim(), username: username.trim().toLowerCase().replace(/\s+/g,""),
        email: email.trim().toLowerCase(), password: password.trim(), country, state: effectiveState, city: finalCity,
        birthYear: birthYear as number, birthMonth: birthMonth as number, birthDay: birthDay as number,
        gender, occupation: effectiveOccup,
        profilePicUrl: finalPicUrl, showAge: showAge && !!birthYear, bio, coins: 1000,
      };
      await saveProfile(user);
      localStorage.setItem("ca_user", JSON.stringify(user));
      sendEmail("welcome", user.email, user.name, user.username, { coins: user.coins });
      const introPost: Omit<SparkPost,"id"|"reactions"|"reactedBy"|"journeyId"> = {
        userId: user.id, name: user.name, username: user.username, profilePicUrl: finalPicUrl,
        caption: bio, mediaUrl: finalPicUrl, mediaType: "image", reach: "share", sparkType: "new",
      };
      onDone(user, true, introPost);
    } catch(e) { toast({ title:"Sign up failed", description:String(e), status:"error", duration:4000, isClosable:true }); }
    setSaving(false);
  };

  const handleSignIn = async () => {
    if (!signinPassword.trim()) { toast({ title:"Please enter your password", status:"warning", duration:2500, isClosable:true }); return; }
    setSaving(true);
    try {
      const saved = await fetchProfileByUsername(signinUsername.trim().toLowerCase());
      if (!saved) {
        toast({ title:"Username not found", status:"error", duration:2500, isClosable:true }); setSaving(false); return;
      }
      if (saved.password && saved.password !== signinPassword.trim()) {
        toast({ title:"Incorrect password", description:"Check your password and try again.", status:"error", duration:3000, isClosable:true }); setSaving(false); return;
      }
      if (rememberMe) { localStorage.setItem("ca_user", JSON.stringify(saved)); }
      else { sessionStorage.setItem("ca_user", JSON.stringify(saved)); }
      sendEmail("signin", saved.email, saved.name, saved.username);
      onDone(saved, false, null);
    } catch { toast({ title:"Sign in failed", status:"error", duration:2500, isClosable:true }); }
    setSaving(false);
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) { toast({ title:"Please enter your email address", status:"warning", duration:2500, isClosable:true }); return; }
    setSaving(true);
    try {
      const { data } = await supabase.from("profiles").select("*").eq("email", forgotEmail.trim().toLowerCase()).single();
      if (!data) { toast({ title:"No account found with that email", status:"error", duration:3000, isClosable:true }); setSaving(false); return; }
      await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "password_reset",
          to: data.email,
          name: data.name,
          username: data.username,
          extra: { password: data.password },
        }),
      });
      toast({ title:"Password sent! 📧", description:"Check your email inbox.", status:"success", duration:4000, isClosable:true });
      setStep("signin");
    } catch { toast({ title:"Something went wrong", status:"error", duration:3000, isClosable:true }); }
    setSaving(false);
  };


  if (step==="welcome") return (
    <FormShell title="Show your spark." subtitle="Africa's home for creators. Join free today." step={step}>
      <VStack spacing={4} mt={2}>
        <Box w="full" bg={CREAM} rounded="2xl" px={5} py={4} border="1.5px solid" borderColor="orange.100" textAlign="center">
          <style>{`@keyframes fadeGreeting{0%{opacity:0;transform:translateY(6px)}30%{opacity:1;transform:translateY(0)}80%{opacity:1}100%{opacity:0}}`}</style>
          <Text key={greeting.text} fontSize="2xl" fontWeight="900" color={BROWN} style={{ animation:"fadeGreeting 3s ease forwards" }}>{greeting.text}</Text>
          <Text fontSize="xs" color="gray.500" mt={1}>
            <Text as="span" fontWeight="600" color={ORANGE}>{greeting.meaning}</Text>
            {" · "}{greeting.language} — {greeting.place}
          </Text>
        </Box>
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={()=>setStep("about")}>Join &amp; Show My Spark 🔥</Button>
        <Button w="full" size="lg" variant="outline" borderColor={ORANGE} color={ORANGE} fontWeight="700" rounded="xl" _hover={{ bg:"orange.50" }} onClick={()=>setStep("signin")}>I already have an account</Button>
        <Text textAlign="center" fontSize="11px" color="gray.400" pt={1}>Free to join · Built with love for Africa 🤍</Text>
      </VStack>
    </FormShell>
  );

  if (step==="signin") return (
    <FormShell title="Welcome back" subtitle="Your spark never goes out." step={step}>
      <VStack spacing={4} mt={2}>
        <Button variant="ghost" color="gray.400" size="xs" alignSelf="flex-start" px={0} _hover={{ color:BROWN }} onClick={()=>setStep("welcome")}>← Back</Button>
        <Box w="full"><FieldLabel>Username</FieldLabel><Input placeholder="e.g. amaracreates" value={signinUsername} onChange={e=>setSigninUsername(e.target.value.toLowerCase().replace(/\s+/g,""))} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></Box>
        <Box w="full">
          <FieldLabel>Password</FieldLabel>
          <Box position="relative">
            <Input type={showSigninPw?"text":"password"} placeholder="Your password" value={signinPassword} onChange={e=>setSigninPassword(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" pr="56px" />
            <Button position="absolute" right={2} top="50%" transform="translateY(-50%)" variant="ghost" size="xs" color="gray.400" onClick={()=>setShowSigninPw(p=>!p)} zIndex={1}>{showSigninPw?"🙈":"👁️"}</Button>
          </Box>
        </Box>
        <Flex w="full" justify="space-between" align="center">
          <Flex align="center" gap={2} cursor="pointer" onClick={()=>setRememberMe(r=>!r)}>
            <Box w="18px" h="18px" rounded="md" border="2px solid" borderColor={rememberMe?ORANGE:"gray.300"} bg={rememberMe?ORANGE:"transparent"} display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
              {rememberMe && <Text color="white" fontSize="9px" fontWeight="900">✓</Text>}
            </Box>
            <Text fontSize="sm" color="gray.600" fontWeight="600">Remember me</Text>
          </Flex>
          <Button variant="ghost" size="xs" color={ORANGE} fontWeight="700" px={0} _hover={{ color:"#c44d16" }} onClick={()=>setStep("forgotpw")}>Forgot password?</Button>
        </Flex>
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={handleSignIn} isLoading={saving} loadingText="Signing in…">Sign In</Button>
      </VStack>
    </FormShell>
  );

  if (step==="forgotpw") return (
    <FormShell title="Reset your password" subtitle="Enter the email you signed up with." step={step}>
      <VStack spacing={4} mt={2}>
        <Button variant="ghost" color="gray.400" size="xs" alignSelf="flex-start" px={0} _hover={{ color:BROWN }} onClick={()=>setStep("signin")}>← Back to Sign In</Button>
        <Box w="full">
          <FieldLabel>Email address</FieldLabel>
          <Input type="email" placeholder="e.g. amara@gmail.com" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" />
        </Box>
        <Text fontSize="xs" color="gray.400" textAlign="center">We'll send your password to your registered email address.</Text>
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={handleForgotPassword} isLoading={saving} loadingText="Sending…">📧 Send my password</Button>
      </VStack>
    </FormShell>
  );

  if (step==="about") return (
    <FormShell title="Tell us about you" subtitle="All required fields marked · takes under 2 minutes" step={step}>
      <VStack spacing={4} mt={2}>
        <Button variant="ghost" color="gray.400" size="xs" alignSelf="flex-start" px={0} _hover={{ color:BROWN }} onClick={()=>setStep("welcome")}>← Back</Button>
        <Box w="full"><FieldLabel>Full name *</FieldLabel><Input placeholder="e.g. Amara Osei" value={name} onChange={e=>setName(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></Box>
        <Box w="full"><FieldLabel>Email address *</FieldLabel><Input type="email" placeholder="e.g. amara@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></Box>
        <Grid templateColumns="1fr 1fr" gap={3} w="full">
          <GridItem>
            <FieldLabel>Password *</FieldLabel>
            <Box position="relative">
              <Input type={showPw?"text":"password"} placeholder="Min. 6 characters" value={password} onChange={e=>setPassword(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" pr="56px" />
              <Button position="absolute" right={2} top="50%" transform="translateY(-50%)" variant="ghost" size="xs" color="gray.400" onClick={()=>setShowPw(p=>!p)} zIndex={1}>{showPw?"🙈":"👁️"}</Button>
            </Box>
          </GridItem>
          <GridItem>
            <FieldLabel>Confirm password *</FieldLabel>
            <Box position="relative">
              <Input type={showConfirmPw?"text":"password"} placeholder="Repeat password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} size="lg" border="2px solid" borderColor={confirmPw&&confirmPw!==password?"red.300":confirmPw&&confirmPw===password?"green.300":"orange.100"} _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" pr="56px" />
              <Button position="absolute" right={2} top="50%" transform="translateY(-50%)" variant="ghost" size="xs" color="gray.400" onClick={()=>setShowConfirmPw(p=>!p)} zIndex={1}>{showConfirmPw?"🙈":"👁️"}</Button>
            </Box>
            {confirmPw && confirmPw===password && <Text fontSize="xs" color="green.500" fontWeight="700" mt={1}>✓ Passwords match</Text>}
            {confirmPw && confirmPw!==password && <Text fontSize="xs" color="red.400" fontWeight="700" mt={1}>✗ Passwords don't match</Text>}
          </GridItem>
        </Grid>
        <Box w="full">
          <FieldLabel>Username *</FieldLabel>
          <Input
            placeholder="e.g. amaracreates"
            value={username}
            onChange={e=>setUsername(e.target.value.toLowerCase().replace(/\s+/g,""))}
            size="lg"
            border="2px solid"
            borderColor={usernameStatus==="available"?"green.400":usernameStatus==="taken"?"red.400":"orange.100"}
            _focus={{ borderColor:usernameStatus==="available"?"green.400":usernameStatus==="taken"?"red.400":ORANGE, boxShadow:"none" }}
            rounded="xl"
            bg={usernameStatus==="available"?"green.50":usernameStatus==="taken"?"red.50":"orange.50"}
          />
          {usernameStatus==="checking" && <Text fontSize="xs" color="gray.400" mt={1}>🔍 Checking availability…</Text>}
          {usernameStatus==="available" && username.length>=3 && (
            <Text fontSize="xs" color="green.600" fontWeight="700" mt={1}>
              {AVAILABLE_MSGS[username.charCodeAt(0) % AVAILABLE_MSGS.length].replace("{u}", username)}
            </Text>
          )}
          {usernameStatus==="taken" && (
            <Text fontSize="xs" color="red.500" fontWeight="700" mt={1}>😔 @{username} is already taken — try something else!</Text>
          )}
        </Box>
        <Box w="full">
          <FieldLabel>Date of birth *</FieldLabel>
          <Grid templateColumns="1fr 2fr 1fr" gap={2}>
            <Select placeholder="Day" value={birthDay} onChange={e=>setBirthDay(e.target.value?Number(e.target.value):"")} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
              {BIRTH_DAYS.map(d=><option key={d} value={d}>{d}</option>)}
            </Select>
            <Select placeholder="Month" value={birthMonth} onChange={e=>setBirthMonth(e.target.value?Number(e.target.value)-1:"")} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
              {BIRTH_MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
            </Select>
            <Select placeholder="Year" value={birthYear} onChange={e=>setBirthYear(e.target.value?Number(e.target.value):"")} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
              {BIRTH_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
            </Select>
          </Grid>
          {age !== null && age >= 0 && <Text fontSize="xs" color={ORANGE} fontWeight="700" mt={1}>🎂 Age: {age}</Text>}
        </Box>
        <Box w="full">
          <FieldLabel>Gender *</FieldLabel>
          <Select placeholder="Select" value={gender} onChange={e=>setGender(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
            {GENDERS.map(g=><option key={g} value={g}>{g}</option>)}
          </Select>
        </Box>
        <Box w="full">
          <FieldLabel>Country *</FieldLabel>
          <Select placeholder="Select your country" value={country} onChange={e=>{ setCountry(e.target.value); setState(""); setCustomState(""); }} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
            {AFRICAN_COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
            <option value="Other">Other (outside Africa)</option>
          </Select>
        </Box>
        {country && (
          <Grid templateColumns="1fr 1fr" gap={3} w="full">
            <GridItem>
              <FieldLabel>State / Region</FieldLabel>
              {stateOptions ? <Select placeholder="Select state" value={state} onChange={e=>setState(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">{stateOptions.map(s=><option key={s} value={s}>{s}</option>)}</Select>
                : <Input placeholder="State or region" value={customState} onChange={e=>setCustomState(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" />}
            </GridItem>
            <GridItem>
              <FieldLabel>City / Town</FieldLabel>
              {CITIES_BY_COUNTRY[country] ? (
                <>
                  <Select placeholder="Select city" value={citySelect} onChange={e=>{ setCitySelect(e.target.value); if(e.target.value!=="Other") setCustomCity(""); }} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
                    {CITIES_BY_COUNTRY[country].map(c=><option key={c} value={c}>{c}</option>)}
                    <option value="Other">Other (type below)</option>
                  </Select>
                  {citySelect==="Other" && <Input mt={2} placeholder="Enter your city" value={customCity} onChange={e=>setCustomCity(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" />}
                </>
              ) : (
                <Input placeholder="e.g. Ikorodu" value={city} onChange={e=>setCity(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" />
              )}
            </GridItem>
          </Grid>
        )}
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={handleAboutNext}>Continue →</Button>
      </VStack>
    </FormShell>
  );

  if (step==="spark") return (
    <FormShell title="Your spark starts here" subtitle="Upload your profile photo — it becomes your first post!" step={step}>
      <VStack spacing={4} mt={2}>
        <Button variant="ghost" color="gray.400" size="xs" alignSelf="flex-start" px={0} _hover={{ color:BROWN }} onClick={()=>setStep("about")}>← Back</Button>
        <Box w="full">
          <FieldLabel>Profile picture * (becomes your intro post)</FieldLabel>
          <Center w="full" minH="160px" border="2px dashed" borderColor={picUrl?"orange.300":"orange.200"} rounded="2xl" bg="orange.50" cursor="pointer" _hover={{ bg:"orange.100", borderColor:ORANGE }} transition="all 0.2s" flexDirection="column" gap={2} position="relative" overflow="hidden" onClick={()=>picRef.current?.click()}>
            {picUrl ? (
              <><img src={picUrl} alt="profile" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} /><Box position="absolute" inset={0} bg="blackAlpha.400" display="flex" alignItems="center" justifyContent="center"><Text color="white" fontWeight="700" fontSize="sm">Tap to change</Text></Box></>
            ) : (
              <><PersonIcon /><Text fontWeight="700" color={ORANGE} fontSize="sm">Upload your photo</Text><Text fontSize="xs" color="gray.400">JPG · PNG · WEBP</Text></>
            )}
            <input ref={picRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ const f=e.target.files?.[0]; if(f){ setPicFile(f); setPicUrl(URL.createObjectURL(f)); } }} />
          </Center>
        </Box>
        <Box w="full">
          <FieldLabel>What do you do? *</FieldLabel>
          <Select placeholder="Select your occupation" value={occupation} onChange={e=>setOccupation(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
            {OCCUPATIONS.map(o=><option key={o} value={o}>{o}</option>)}
          </Select>
        </Box>
        {occupation==="Other" && <Box w="full"><FieldLabel>Enter your occupation</FieldLabel><Input placeholder="e.g. Bead Artist" value={customOccupation} onChange={e=>setCustomOccupation(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></Box>}
        {birthYear && (
          <Flex w="full" align="center" gap={3} px={3} py={3} rounded="xl" border="2px solid" borderColor={showAge?ORANGE:"orange.100"} bg={showAge?"orange.50":"white"} cursor="pointer" onClick={()=>setShowAge(!showAge)} transition="all 0.15s">
            <Box flex={1}><Text fontSize="xs" fontWeight="800" color={BROWN}>Show my age ({age}) in my intro</Text><Text fontSize="10px" color="gray.400">Optional — you can hide it if you prefer</Text></Box>
            <Box w="20px" h="20px" rounded="full" border="2px solid" borderColor={showAge?ORANGE:"gray.300"} bg={showAge?ORANGE:"transparent"} display="flex" alignItems="center" justifyContent="center">
              {showAge && <Text color="white" fontSize="10px" fontWeight="900">✓</Text>}
            </Box>
          </Flex>
        )}
        <Box w="full" bg="orange.50" rounded="xl" px={4} py={3} border="1px solid" borderColor="orange.100">
          <Text fontSize="xs" fontWeight="700" color={BROWN} mb={1}>📢 Your intro post will say:</Text>
          <Text fontSize="xs" color="gray.600" lineHeight="tall" fontStyle="italic">{introCaption || `"Hi! I am ${name||"[name]"}, a ${effectiveOccup||"[occupation]"} from ${[city,effectiveState,country].filter(Boolean).join(", ")||"[location]"}. 🌍"`}</Text>
        </Box>
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={handleSparkNext}>Preview My Intro →</Button>
      </VStack>
    </FormShell>
  );

  // Preview step
  return (
    <FormShell title="Here's your intro! 🎉" subtitle="This is how Africa will meet you. Tap the button below when you're ready!" step={step}>
      <VStack spacing={4} mt={2}>
        <Button variant="ghost" color="gray.400" size="xs" alignSelf="flex-start" px={0} _hover={{ color:BROWN }} onClick={()=>setStep("spark")}>← Back</Button>
        <Box w="full" bg="white" rounded="2xl" shadow="md" overflow="hidden" border="1px solid" borderColor="orange.100">
          <Box h="4px" bg={ORANGE} />
          <Flex px={4} pt={4} pb={2} align="center" gap={3}>
            {picUrl ? <Box w="40px" h="40px" rounded="full" overflow="hidden" flexShrink={0}><img src={picUrl} style={{ width:"100%",height:"100%",objectFit:"cover" }} alt="" /></Box> : <Avatar name={name} size="md" bg={ORANGE} color="white" fontWeight="800" />}
            <Box flex={1}><Text fontWeight="900" color={BROWN}>{name||"Your Name"}</Text><Text fontSize="11px" color="gray.400">@{username||"username"}</Text></Box>
            <Text fontSize="xs" fontWeight="700" color={ORANGE} bg="orange.50" px={2} py={0.5} rounded="full">New Spark</Text>
          </Flex>
          {picUrl && <Box maxH="280px" overflow="hidden"><img src={picUrl} alt="intro" style={{ width:"100%",maxHeight:"280px",objectFit:"cover",display:"block" }} /></Box>}
          <Box px={4} pt={3} pb={4}><Text color="gray.800" fontWeight="600" fontSize="sm" lineHeight="tall">{introCaption}</Text></Box>
        </Box>
        <Box w="full" bg="orange.50" rounded="xl" px={4} py={3} border="1px solid" borderColor="orange.100">
          <Text fontSize="xs" color={BROWN} fontWeight="700">🌍 Your profile photo becomes your first spark — Africa is about to meet you!</Text>
        </Box>
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={handleFinish} isLoading={saving} loadingText="Sharing…">🔥 Share Your First Spark!</Button>
      </VStack>
    </FormShell>
  );
}

// ─── Upload Form ──────────────────────────────────────────────────────────────
function UploadForm({ user, sparks, onPost, onMilestone, defaultCaption, onUploadStart, onProgress }: {
  user: User; sparks: SparkPost[];
  onPost: (spark: SparkPost) => void;
  onMilestone?: (type: "first_spark") => void;
  defaultCaption?: string;
  onUploadStart?: () => void;
  onProgress?: (pct: number) => void;
}) {
  const [caption,      setCaption]      = useState(defaultCaption ?? "");
  const [sparkType,    setSparkType]    = useState<SparkType>("new");
  const [linkedSparkId,setLinkedSparkId]= useState<number|undefined>();
  const [mediaFile,    setMediaFile]    = useState<File|null>(null);
  const [mediaPreview, setMediaPreview] = useState<string|null>(null);
  const [mediaType,    setMediaType]    = useState<MediaType>("video");
  const [reach,        setReach]        = useState<Reach>("share");
  const [posting,      setPosting]      = useState(false);
  const [adminMode,    setAdminMode]    = useState(false);
  const [pinPost,      setPinPost]      = useState(false);
  const [uploadPct,    setUploadPct]    = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast   = useToast();
  const { isOpen:beyondOpen, onOpen:openBeyond, onClose:closeBeyond } = useDisclosure();
  const mySparks = sparks.filter(s => s.userId===user.id);
  const isAdmin = (user as User & { isAdmin?: boolean }).isAdmin;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if(!f) return;
    if (!f.type.startsWith("video/")&&!f.type.startsWith("image/")) { toast({ title:"Please select a video or image", status:"warning", duration:3000, isClosable:true }); return; }
    if (f.type.startsWith("video/") && f.size > 150 * 1024 * 1024) {
      toast({ title:"Video is very large (>150MB)", description:"Upload may be slow. Try trimming or compressing the video first for a faster experience.", status:"warning", duration:6000, isClosable:true });
    }
    setMediaFile(f); setMediaType(f.type.startsWith("image/")?"image":"video"); setMediaPreview(URL.createObjectURL(f));
  };

  const handleShare = async () => {
    if (!mediaFile) { toast({ title:"Upload a photo or video first!", status:"warning", duration:2500, isClosable:true }); return; }
    setPosting(true); setUploadPct(0);
    // Close form immediately — upload continues in background
    onUploadStart?.();
    const reportProgress = (pct: number) => { setUploadPct(pct); onProgress?.(pct); };
    try {
      const mediaUrl  = await uploadMedia(mediaFile, "sparks", reportProgress);
      const newId     = Date.now();
      const journeyId = sparkType==="ongoing"&&linkedSparkId ? sparks.find(s=>s.id===linkedSparkId)?.journeyId??String(newId) : String(newId);
      const spark: SparkPost = {
        id: newId, userId: user.id, name: user.name, username: user.username,
        profilePicUrl: user.profilePicUrl, caption: caption.trim()||"Showing my spark!",
        mediaUrl, mediaType, reach,
        reactions:  { Encourage:0, "Say Hi":0, Applaud:0, "Keep Going":0 },
        reactedBy:  { Encourage:[], "Say Hi":[], Applaud:[], "Keep Going":[] },
        sparkType, journeyId, linkedSparkId: sparkType==="ongoing"?linkedSparkId:undefined,
        isAdminPost: isAdmin && adminMode,
        pinned: isAdmin && pinPost,
        adminPostType: isAdmin && adminMode ? 'official' : 'regular',
      };
      await saveSpark(spark);
      onPost(spark);
      onMilestone?.("first_spark");
      sendEmail("spark_posted", user.email, user.name, user.username, {
        sparkType: spark.sparkType, reach: spark.reach, caption: spark.caption,
      });
      setMediaFile(null); setMediaPreview(null); setCaption(""); setSparkType("new"); setLinkedSparkId(undefined); setReach("share"); setAdminMode(false); setPinPost(false);
      if (fileRef.current) fileRef.current.value="";
      toast({ title:"Your spark is live! 🔥", description:"Your community can see your spark. Keep shining! 🌍", status:"success", duration:4000, isClosable:true });
    } catch(e) { toast({ title:"Post failed", description:String(e), status:"error", duration:4000, isClosable:true }); }
    setPosting(false); setUploadPct(0);
  };

  return (
    <VStack spacing={4} w="full">
      <Flex w="full" align="center" gap={2}>
        <UserAvatar user={user} size="sm" />
        <Box><Text fontWeight="800" color={BROWN} fontSize="sm">{user.name}</Text><Text fontSize="10px" color="gray.400">@{user.username}</Text></Box>
      </Flex>
      <Box w="full">
        <FieldLabel>Show your spark</FieldLabel>
        <Select value={sparkType} onChange={e=>{ setSparkType(e.target.value as SparkType); setLinkedSparkId(undefined); }} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
          <option value="new">New Spark</option>
          <option value="ongoing">Ongoing Spark</option>
        </Select>
      </Box>
      {sparkType==="ongoing" && (
        <Box w="full">
          <FieldLabel>Link to a previous spark</FieldLabel>
          <Select placeholder="Select a previous spark" value={linkedSparkId??""} onChange={e=>setLinkedSparkId(e.target.value?Number(e.target.value):undefined)} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
            {mySparks.map(s=><option key={s.id} value={s.id}>{s.caption.slice(0,45)}{s.caption.length>45?"…":""}</option>)}
          </Select>
          {mySparks.length===0 && <Text fontSize="xs" color="gray.400" mt={1}>No previous sparks to link yet.</Text>}
        </Box>
      )}
      {!mediaPreview ? (
        <Center w="full" minH="100px" border="2px dashed" borderColor="orange.200" rounded="2xl" bg="orange.50" cursor="pointer" _hover={{ bg:"orange.100", borderColor:ORANGE }} transition="all 0.2s" flexDirection="column" gap={2}
          onClick={()=>fileRef.current?.click()}
          onDragOver={e=>{ e.preventDefault(); e.stopPropagation(); }}
          onDrop={e=>{
            e.preventDefault(); e.stopPropagation();
            const f = e.dataTransfer.files?.[0];
            if (!f) return;
            if (!f.type.startsWith("video/") && !f.type.startsWith("image/")) { toast({ title:"Please drop a video or image", status:"warning", duration:3000, isClosable:true }); return; }
            if (f.type.startsWith("video/") && f.size > 150 * 1024 * 1024) {
              toast({ title:"Video is very large (>150MB)", description:"Upload may be slow. Try trimming or compressing first.", status:"warning", duration:6000, isClosable:true });
            }
            setMediaFile(f); setMediaType(f.type.startsWith("image/")?"image":"video"); setMediaPreview(URL.createObjectURL(f));
          }}>
          <UploadIcon />
          <Text fontWeight="700" color={ORANGE} fontSize="sm">Tap or drag & drop a photo / video</Text>
          <Text fontSize="xs" color="gray.400">JPG · PNG · MP4 · MOV</Text>
          <input ref={fileRef} type="file" accept="video/*,image/*" style={{ display:"none" }} onChange={handleFile} />
        </Center>
      ) : (
        <Box w="full" rounded="2xl" overflow="hidden" position="relative">
          {mediaType==="image" ? <img src={mediaPreview} alt="preview" style={{ width:"100%",maxHeight:"260px",objectFit:"cover",borderRadius:"16px" }} /> : <AspectRatio ratio={9/16} maxH="260px"><video src={mediaPreview} controls style={{ borderRadius:"16px",background:"#000" }} /></AspectRatio>}
          <Button size="xs" position="absolute" top={2} right={2} rounded="full" bg="blackAlpha.700" color="white" _hover={{ bg:"red.500" }} onClick={()=>{ setMediaFile(null); setMediaPreview(null); if(fileRef.current) fileRef.current.value=""; }}>✕</Button>
        </Box>
      )}
      {defaultCaption && (
        <Flex align="center" gap={2} bg="orange.50" rounded="xl" px={3} py={2} border="1.5px solid" borderColor={ORANGE}>
          <Text fontSize="14px">🔥</Text>
          <Box flex={1}>
            <Text fontSize="10px" fontWeight="900" color={ORANGE} textTransform="uppercase" letterSpacing="wide">Challenge Mode</Text>
            <Text fontSize="10px" color={BROWN} fontWeight="600">{CHALLENGE_HASHTAG} — edit below if you like</Text>
          </Box>
        </Flex>
      )}
      <Textarea placeholder="Add a note about this spark…" value={caption} onChange={e=>setCaption(e.target.value)} rows={defaultCaption ? 3 : 2} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" resize="none" />
      <ReachSelector reach={reach} setReach={setReach} onOpenBeyond={openBeyond} />
      {isAdmin && (
        <Box w="full" bg="blue.50" rounded="xl" p={4} border="2px solid" borderColor="blue.200">
          <Text fontSize="xs" fontWeight="800" color="blue.700" mb={3} textTransform="uppercase" letterSpacing="wide">Admin Options</Text>
          <VStack spacing={3} align="stretch">
            <FormControl display="flex" alignItems="center">
              <FormLabel htmlFor="admin-mode" mb="0" fontSize="sm" fontWeight="700" color={BROWN} flex={1}>
                Post as Official Admin
              </FormLabel>
              <Switch id="admin-mode" isChecked={adminMode} onChange={e=>setAdminMode(e.target.checked)} colorScheme="blue" />
            </FormControl>
            <FormControl display="flex" alignItems="center">
              <FormLabel htmlFor="pin-post" mb="0" fontSize="sm" fontWeight="700" color={BROWN} flex={1}>
                Pin to Top of Feed
              </FormLabel>
              <Switch id="pin-post" isChecked={pinPost} onChange={e=>setPinPost(e.target.checked)} colorScheme="orange" />
            </FormControl>
            {adminMode && (
              <Box bg="blue.100" rounded="lg" p={2}>
                <Text fontSize="xs" color="blue.700">This post will show with a verified badge</Text>
              </Box>
            )}
          </VStack>
        </Box>
      )}
      {posting && (
        <Box w="full">
          <Flex justify="space-between" mb={1}>
            <Text fontSize="xs" fontWeight="700" color={ORANGE}>
              {uploadPct < 100 ? (mediaType === "image" ? "Compressing & uploading…" : "Uploading video…") : "Saving spark…"}
            </Text>
            {uploadPct > 0 && uploadPct < 100 && <Text fontSize="xs" fontWeight="800" color={ORANGE}>{uploadPct}%</Text>}
          </Flex>
          <Progress value={uploadPct < 100 ? uploadPct : 100} size="sm" colorScheme="orange" rounded="full" isIndeterminate={uploadPct === 100} />
        </Box>
      )}
      <Button w="full" size="lg" bg={reach==="beyond"?GOLD:ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ opacity:0.9 }} onClick={handleShare} isLoading={posting} loadingText={uploadPct < 100 ? `Uploading ${uploadPct}%…` : "Saving…"}>
        {reach==="beyond" ? "✨ Share to The Great Beyond" : "Share My Spark 🔥"}
      </Button>
      <GreatBeyondModal isOpen={beyondOpen} onClose={closeBeyond} coins={user.coins} />
    </VStack>
  );
}

// ─── Social Share Button ──────────────────────────────────────────────────────
const APP_URL = "https://www.icreate.africa";

function ShareButton({ text, imageUrl }: { text: string; imageUrl?: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const fullText = imageUrl ? `${text}\n${imageUrl}` : text;
  const encoded = encodeURIComponent(`${fullText}\n${APP_URL}`);
  const encodedUrl = encodeURIComponent(APP_URL);

  const handleMain = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ text: fullText, url: APP_URL }).catch(() => {});
    } else {
      setOpen(p => !p);
    }
  };

  const go = (url: string) => { window.open(url, "_blank", "noopener,noreferrer"); setOpen(false); };
  const copy = () => {
    navigator.clipboard.writeText(`${fullText}\n${APP_URL}`).then(() =>
      toast({ title:"Copied! 🔗", status:"success", duration:2000, isClosable:true })
    );
    setOpen(false);
  };

  const options = [
    { label:"WhatsApp",  icon:"💬", color:"#25D366", action: () => go(`https://wa.me/?text=${encoded}`) },
    { label:"X",         icon:"𝕏",  color:"#000",    action: () => go(`https://twitter.com/intent/tweet?text=${encoded}`) },
    { label:"Facebook",  icon:"f",  color:"#1877F2", action: () => go(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`) },
    { label:"Copy link", icon:"🔗", color:BROWN,     action: copy },
  ];

  return (
    <Box position="relative">
      <Button size="sm" variant="ghost" color="gray.400" fontWeight="700" rounded="full" px={3} fontSize="xs"
        _hover={{ bg:"orange.50", color:ORANGE }} onClick={handleMain}>
        📤 Share
      </Button>
      {open && (
        <>
          {/* backdrop */}
          <Box position="fixed" inset={0} zIndex={40} onClick={() => setOpen(false)} />
          {/* dropdown */}
          <Box position="absolute" bottom="calc(100% + 8px)" right={0} zIndex={50}
            bg="white" rounded="2xl" shadow="2xl" border="1px solid" borderColor="orange.100"
            overflow="hidden" minW="160px">
            <Box h="3px" bg={ORANGE} />
            {options.map(o => (
              <Flex key={o.label} align="center" gap={3} px={4} py={3} cursor="pointer"
                _hover={{ bg:"orange.50" }} onClick={o.action}
                borderBottom="1px solid" borderColor="gray.50">
                <Text fontSize="14px" w="20px" textAlign="center" color={o.color} fontWeight="900">{o.icon}</Text>
                <Text fontSize="sm" fontWeight="700" color={BROWN}>{o.label}</Text>
              </Flex>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

// ─── Learn & Spark Challenge Card ─────────────────────────────────────────────
const CHALLENGE_UNLOCK = new Date("2026-04-01T00:00:00");
const CHALLENGE_HASHTAG = "#WhatIsWelcomeInYourLanguage";
const CHALLENGE_CAPTION = `How do you say "Welcome" in your language? ✨ ${CHALLENGE_HASHTAG} #LearnAndSpark #icreateafrica`;

function LearnSparkCard({ onJoinChallenge, onOpenBeyond }: { onJoinChallenge: () => void; onOpenBeyond: () => void }) {
  const [exIdx, setExIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setExIdx(i => (i + 1) % GREETINGS.length), 2800);
    return () => clearInterval(t);
  }, []);
  const example = GREETINGS[exIdx];

  return (
    <Box mx={4} mb={2} rounded="2xl" overflow="hidden" border="1.5px solid" borderColor="orange.100" bg="#FFFBF5">
      <Box h="3px" style={{ background:`linear-gradient(90deg,${ORANGE},${GOLD},${ORANGE})` }} />
      <Box px={4} py={4}>
        <Flex align="center" gap={3} mb={3}>
          <Box w="36px" h="36px" rounded="lg" bg={ORANGE} display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
            <Text fontSize="18px">🌍</Text>
          </Box>
          <Box flex={1}>
            <Text fontSize="9px" fontWeight="900" color={ORANGE} textTransform="uppercase" letterSpacing="widest">Learn & Spark</Text>
            <Text fontWeight="900" color={BROWN} fontSize="sm" lineHeight={1.3}>{CHALLENGE_HASHTAG}</Text>
          </Box>
        </Flex>

        {/* Cycling language example */}
        <Box bg="white" rounded="xl" px={3} py={2.5} mb={3} border="1px solid" borderColor="orange.100">
          <Text fontSize="9px" fontWeight="700" color="gray.400" textTransform="uppercase" letterSpacing="wide" mb={0.5}>Did you know…</Text>
          <Text key={example.text} fontSize="lg" fontWeight="900" color={BROWN}>
            &ldquo;{example.text}&rdquo; — {example.language}
          </Text>
          <Text fontSize="10px" color="gray.400">{example.meaning} · {example.place}</Text>
        </Box>

        <Flex gap={2}>
          <Button flex={1} size="sm" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={onJoinChallenge}>
            🔥 Say It
          </Button>
          <Button flex={1} size="sm" variant="outline" borderColor={GOLD} color={BROWN} fontWeight="800" rounded="xl" _hover={{ bg:"orange.50" }}
            onClick={onOpenBeyond}>
            🎁 Great Beyond
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}

// ─── Feed Screen ──────────────────────────────────────────────────────────────
function FeedScreen({ user, sparks, setSparks, onShowMySpark, setViewProfile, tasks, onMilestone, onJoinChallenge, onOpenBeyond, hiddenSparks, onRefresh }: {
  user: User; sparks: SparkPost[];
  setSparks: React.Dispatch<React.SetStateAction<SparkPost[]>>;
  onShowMySpark: () => void;
  setViewProfile: (u:string)=>void;
  tasks: Tasks;
  onMilestone: (type: "reactions_5" | "reactions_10", total: number) => void;
  onJoinChallenge: () => void;
  onOpenBeyond: () => void;
  hiddenSparks: Set<number>;
  onRefresh: () => Promise<void>;
}) {
  const [myReactions,  setMyReactions]  = useState<Record<number, Reaction[]>>({});
  const [prevOpen,     setPrevOpen]     = useState<Record<number,boolean>>({});
  const [reactPeek,    setReactPeek]    = useState<{ sparkId:number; reaction:Reaction; names:string[] }|null>(null);
  const [refreshing,   setRefreshing]   = useState(false);
  const totalReactionsRef = useRef(tasks.total_reactions_given);

  // Initialise from DB — support multiple reactions per post
  useEffect(() => {
    const initial: Record<number, Reaction[]> = {};
    sparks.forEach(s => {
      const mine = (Object.keys(s.reactedBy) as Reaction[]).filter(r => s.reactedBy[r]?.includes(user.username));
      if (mine.length) initial[s.id] = mine;
    });
    setMyReactions(initial);
  }, [sparks, user.username]);

  const handleReact = async (sparkId: number, reaction: Reaction) => {
    const current = myReactions[sparkId] ?? [];
    const alreadyReacted = current.includes(reaction);
    setMyReactions(r => ({ ...r, [sparkId]: alreadyReacted ? current.filter(x => x !== reaction) : [...current, reaction] }));
    setSparks(posts => posts.map(s => {
      if (s.id !== sparkId) return s;
      const reactions = { ...s.reactions };
      const reactedBy = { ...s.reactedBy };
      if (alreadyReacted) {
        reactions[reaction] = Math.max(0, reactions[reaction] - 1);
        reactedBy[reaction] = (reactedBy[reaction] || []).filter(u => u !== user.username);
      }
      if (!alreadyReacted) {
        reactions[reaction] += 1;
        reactedBy[reaction] = [...(reactedBy[reaction] || []), user.username];
      }
      updateReactions(sparkId, reactions, reactedBy);
      return { ...s, reactions, reactedBy };
    }));
    if (!alreadyReacted) {
      totalReactionsRef.current += 1;
      const total = totalReactionsRef.current;
      if (total >= 10 && !tasks.reactions_10_claimed) {
        onMilestone("reactions_10", total);
      } else if (total >= 5 && !tasks.reactions_5_claimed) {
        onMilestone("reactions_5", total);
      }
    }
  };

  return (
    <Box>
      <Box display={{ base:"block", xl:"none" }} px={4} pt={4} pb={2}>
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="2xl" _hover={{ bg:"#c44d16" }} shadow="md" onClick={onShowMySpark}>🌍 Upload &amp; Show Yourself to the World</Button>
      </Box>

      {/* ── Great Spark Beyond Banner ─────────────────────────────────────── */}
      <Box px={4} mt={{ base:4, xl:6 }} mb={2}>
        <MotionBox
          initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}
          bg="linear-gradient(135deg, #1a0a00 0%, #3d1a00 50%, #5C2D0E 100%)"
          rounded="2xl" overflow="hidden" shadow="xl" border="2px solid" borderColor={GOLD}
        >
          <Box h="4px" bg={`linear-gradient(90deg, ${GOLD}, #fff8dc, ${GOLD})`} />
          <Box px={5} pt={4} pb={2}>
            <Flex align="center" gap={2} mb={1}>
              <Text fontSize="16px">🌍</Text>
              <Text fontSize="10px" fontWeight="800" color={GOLD} textTransform="uppercase" letterSpacing="widest">Get Ready · April 5th, 2026</Text>
            </Flex>
            <Text fontWeight="900" color="white" fontSize={{ base:"xl", md:"2xl" }} lineHeight="short" mb={1}>
              ✨ The Great Spark Beyond
            </Text>
            <Text color="rgba(255,255,255,0.75)" fontSize="sm" fontWeight="600" lineHeight="tall" mb={3}>
              Your moment to <Text as="span" color={GOLD} fontWeight="900">show yourself to the world</Text> is coming.
              Upload more sparks now — every upload earns you <Text as="span" color={GOLD} fontWeight="900">views &amp; coins</Text>.
              Use your coins on April 5th to{" "}
              <Text as="span" color={GOLD} fontWeight="900">reach more people</Text> and{" "}
              <Text as="span" color={GOLD} fontWeight="900">encourage someone</Text> across the globe.
            </Text>
          </Box>
          {/* How-it-works steps */}
          <Box px={5} pb={4}>
            <Grid templateColumns="1fr 1fr 1fr" gap={2}>
              {[
                { step:"1", icon:"🔥", title:"Upload Sparks", sub:"Show your story" },
                { step:"2", icon:"👁️", title:"Get Views", sub:"Earn coins per view" },
                { step:"3", icon:"🚀", title:"Use Coins", sub:"Reach the world" },
              ].map(({ step, icon, title, sub }) => (
                <Box key={step} bg="rgba(255,255,255,0.07)" rounded="xl" px={3} py={3} textAlign="center">
                  <Text fontSize="20px" mb={1}>{icon}</Text>
                  <Text fontSize="10px" fontWeight="900" color={GOLD} textTransform="uppercase" letterSpacing="wide">{title}</Text>
                  <Text fontSize="10px" color="rgba(255,255,255,0.55)" fontWeight="600">{sub}</Text>
                </Box>
              ))}
            </Grid>
          </Box>
        </MotionBox>
      </Box>

      {/* ── Coins balance nudge ───────────────────────────────────────────── */}
      <Box px={4} mb={4}>
        <Flex align="center" justify="space-between" bg="orange.50" rounded="xl" px={4} py={3} border="1.5px solid" borderColor="orange.200">
          <Flex align="center" gap={2}>
            <Text fontSize="18px">🪙</Text>
            <Box>
              <Text fontSize="xs" fontWeight="800" color={BROWN}>Your Coin Balance</Text>
              <Text fontSize="10px" color="gray.400" fontWeight="600">Grows with every spark you share</Text>
            </Box>
          </Flex>
          <Flex align="center" gap={1} bg={GOLD} px={3} py={1} rounded="full">
            <Text fontSize="sm" fontWeight="900" color="white">{user.coins.toLocaleString()}</Text>
            <Text fontSize="10px" color="white" fontWeight="700">coins</Text>
          </Flex>
        </Flex>
      </Box>

      <Flex align="center" gap={3} px={4} mb={4}>
        <Box flex={1} h="1px" bg="orange.100" />
        <Text fontSize="10px" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="widest">My Sparks</Text>
        <Box flex={1} h="1px" bg="orange.100" />
        <Button size="xs" variant="ghost" color={ORANGE} fontWeight="800" px={2} _hover={{ bg:"orange.50" }}
          isLoading={refreshing}
          onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }}>
          🔄
        </Button>
      </Flex>
      {sparks.filter(s => s.userId === user.id && s.userId !== "icreate-admin").length === 0 && (
        <Center py={10} flexDirection="column" gap={3} px={4}>
          <Text fontSize="52px">🌍</Text>
          <Text fontWeight="900" color={BROWN} fontSize="lg" textAlign="center">The world is waiting for you!</Text>
          <Text color="gray.500" fontSize="sm" textAlign="center" lineHeight="tall">
            Upload your first spark, get views, earn coins — and be ready to{" "}
            <Text as="span" fontWeight="800" color={ORANGE}>show yourself to the world</Text>{" "}
            when The Great Spark Beyond launches April 5th.
          </Text>
          <Button mt={1} bg={ORANGE} color="white" fontWeight="900" rounded="xl" size="lg" _hover={{ bg:"#c44d16" }} onClick={onShowMySpark}>🔥 Upload Your First Spark</Button>
        </Center>
      )}
      {reactPeek && (
        <Box position="fixed" inset={0} zIndex={50} display="flex" alignItems="flex-end" justifyContent="center" bg="blackAlpha.400" onClick={()=>setReactPeek(null)}>
          <Box bg="white" rounded="2xl" w="full" maxW="480px" mx={4} mb={6} overflow="hidden" onClick={e=>e.stopPropagation()}>
            <Box h="4px" bg={ORANGE} />
            <Box px={5} pt={4} pb={2}>
              <Flex justify="space-between" align="center" mb={3}>
                <Text fontWeight="900" color={BROWN} fontSize="md">
                  {REACTIONS.find(r=>r.label===reactPeek.reaction)?.emoji} {reactPeek.reaction} — {reactPeek.names.length} {reactPeek.names.length===1?"person":"people"}
                </Text>
                <Button variant="ghost" size="xs" color="gray.400" onClick={()=>setReactPeek(null)}>✕</Button>
              </Flex>
              {reactPeek.names.length===0 ? (
                <Text fontSize="sm" color="gray.400" pb={4}>No reactions yet.</Text>
              ) : (
                <VStack spacing={2} align="stretch" pb={4} maxH="260px" overflowY="auto">
                  {reactPeek.names.map(uname=>{
                    const poster = sparks.find(sp=>sp.username===uname);
                    return (
                      <Flex key={uname} align="center" gap={3} px={2} py={2} rounded="xl" bg="orange.50" cursor="pointer" onClick={()=>{ setViewProfile(uname); setReactPeek(null); }}>
                        <UserAvatar user={{ name: poster?.name??uname, profilePicUrl: poster?.profilePicUrl??""}} size="sm" />
                        <Box flex={1}><Text fontWeight="800" color={BROWN} fontSize="sm">{poster?.name??uname}</Text><Text fontSize="11px" color="gray.400">@{uname}</Text></Box>
                        <Text fontSize="xs" color={ORANGE} fontWeight="700">View →</Text>
                      </Flex>
                    );
                  })}
                </VStack>
              )}
            </Box>
          </Box>
        </Box>
      )}
      <VStack spacing={5} px={4} pb={8}>
          {(() => {
            const items: React.ReactElement[] = [];
            const now = Date.now();

            // Broadcasts: match by userId OR username
            const adminSparks = sparks.filter(s =>
              s.userId === "icreate-admin" || s.username === "icreate.africa"
            );
            const broadcasts = adminSparks.filter(s =>
              !hiddenSparks.has(s.id) &&
              (!s.broadcastExpiresAt || new Date(s.broadcastExpiresAt).getTime() > now) &&
              (!s.targetCountry || s.targetCountry === "" || s.targetCountry === user.country)
            );

            const visibleSparks = sparks.filter(s => {
              if (s.userId === "icreate-admin" || s.username === "icreate.africa") return false;
              if (hiddenSparks.has(s.id)) return false;
              // Feed is locked to the current user's own sparks only
              if (s.userId !== user.id) return false;
              return true;
            });

            // Pin all valid broadcasts at the top of the feed
            broadcasts.forEach(b => {
              items.push(
                <Box key={`bc-${b.id}`} w="full">
                  <MotionBox initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.3 }} w="full" bg="white" rounded="2xl" shadow="md" overflow="hidden" border="2px solid" borderColor="#059669">
                    <Box h="4px" bg="#059669" />
                    <Flex px={4} pt={3} pb={1} align="center" gap={2}>
                      <Box w="28px" h="28px" rounded="full" overflow="hidden" border="1.5px solid" borderColor="green.200" flexShrink={0}><img src="/images/logo.jpg" style={{ width:"100%", height:"100%", objectFit:"cover" }} /></Box>
                      <Box flex={1}><Text fontWeight="900" color="#059669" fontSize="sm">icreate.africa</Text><Text fontSize="10px" color="gray.400">@icreate.africa</Text></Box>
                      <Text fontSize="10px" fontWeight="800" color="white" bg="#059669" px={2} py={0.5} rounded="full">📢 Official</Text>
                    </Flex>
                    <SparkMedia mediaUrl={b.mediaUrl} mediaType={b.mediaType} maxH="500px" />
                    <Box px={4} pt={3} pb={4}><Text color="gray.800" fontWeight="600" fontSize="sm" lineHeight="tall">{b.caption}</Text></Box>
                  </MotionBox>
                </Box>
              );
            });

            // Only show the current user's own sparks
            const feedSparks = visibleSparks;
            feedSparks.forEach((s, idx) => {
              if (idx === 3 && feedSparks.length >= 4) {
                items.push(<Box key="challenge-card" w="full"><LearnSparkCard onJoinChallenge={onJoinChallenge} onOpenBeyond={onOpenBeyond} /></Box>);
              }
              const jt = getJourneyTotal(sparks, s.journeyId);
              const linked = s.linkedSparkId ? sparks.find(p=>p.id===s.linkedSparkId) : null;
              items.push(
                <Box key={`${s.id}`} w="full" bg="white" rounded="2xl" shadow="md" overflow="hidden">
                <Box h="4px" bg={s.reach==="beyond"?GOLD:s.pinned?"#3B82F6":ORANGE} />
                <Flex px={4} pt={4} pb={2} align="center" gap={3}>
                  <Box cursor="pointer" onClick={()=>setViewProfile(s.username)}><UserAvatar user={{ name:s.name, profilePicUrl:s.profilePicUrl }} size="md" /></Box>
                  <Box flex={1} cursor="pointer" onClick={()=>setViewProfile(s.username)}>
                    <Flex align="center" gap={1.5}>
                      <Text fontWeight="900" color={BROWN}>{s.name}</Text>
                      {s.isAdminPost && <VerifiedIcon size={16} />}
                    </Flex>
                    <Text fontSize="11px" color="gray.400">@{s.username}</Text>
                  </Box>
                  <HStack spacing={2} flexWrap="wrap" justify="flex-end">
                    {s.pinned && <Badge bg="blue.100" color="blue.600" fontSize="10px" fontWeight="700" px={2} py={0.5} rounded="full">📌 Pinned</Badge>}
                    <Text fontSize="xs" fontWeight="700" color={s.sparkType==="new"?ORANGE:BROWN} bg={s.sparkType==="new"?"orange.50":"gray.100"} px={2} py={0.5} rounded="full">
                      {s.sparkType==="new"?"New Spark":"Ongoing Spark"}
                    </Text>
                    {s.reach==="beyond" && <Text fontSize="xs" fontWeight="800" color="white" bg={BROWN} px={2} py={0.5} rounded="full">✨ Great Beyond</Text>}
                    {s.userId==="icreate-admin" && <Text fontSize="xs" fontWeight="800" color="white" bg="#059669" px={2} py={0.5} rounded="full">📢 Official</Text>}
                  </HStack>
                </Flex>
                {s.sparkType==="ongoing" && (
                  <Box px={4} pb={2}>
                    {jt>0 && <Text fontSize="xs" color={ORANGE} fontWeight="700" mb={1}>🔥 {jt} total reactions across this journey</Text>}
                    {linked ? (
                      <>
                        <Flex align="center" gap={2} bg="gray.50" rounded="lg" px={3} py={2} cursor="pointer" onClick={()=>setPrevOpen(p=>({ ...p,[s.id]:!p[s.id] }))}>
                          <Text fontSize="xs" color="gray.500" flex={1}>🔗 View previous spark in this series</Text>
                          <Text fontSize="xs" color="gray.400">{prevOpen[s.id]?"▲":"▾"}</Text>
                        </Flex>
                        {prevOpen[s.id] && (
                          <Box mt={2} borderLeft="3px solid" borderColor={ORANGE} pl={3} bg="gray.50" rounded="lg" overflow="hidden">
                            <Text fontSize="10px" color="gray.400" fontWeight="700" textTransform="uppercase" letterSpacing="wide" px={2} pt={2}>Previous spark · {linked.name}</Text>
                            <SparkMedia mediaUrl={linked.mediaUrl} mediaType={linked.mediaType} maxH="200px" />
                            <Text fontSize="xs" color="gray.600" fontWeight="500" px={2} py={2}>{linked.caption}</Text>
                          </Box>
                        )}
                      </>
                    ) : (
                      <Flex align="center" gap={2} bg="gray.50" rounded="lg" px={3} py={2}><Text fontSize="xs" color="gray.500">🔗 Part of a spark journey</Text></Flex>
                    )}
                  </Box>
                )}
                <SparkMedia mediaUrl={s.mediaUrl} mediaType={s.mediaType} maxH="500px" />
                <Box px={4} pt={3} pb={1}><Text color="gray.800" fontWeight="600" fontSize="sm" lineHeight="tall">{s.caption}</Text></Box>
                <Flex px={4} pb={4} pt={3} gap={2} flexWrap="wrap" align="center">
                  {REACTIONS.map(({ label, emoji }) => {
                    const active = myReactions[s.id]?.includes(label) ?? false;
                    return (
                      <Button key={label} size="sm" rounded="full" bg={active?ORANGE:"orange.50"} color={active?"white":BROWN} border="1.5px solid" borderColor={active?ORANGE:"orange.200"} fontWeight="700" fontSize="xs" px={3} _hover={{ bg:active?"#c44d16":"orange.100" }} transition="all 0.15s" onClick={()=>handleReact(s.id,label)}>
                        {emoji} {label}
                        {s.reactions[label]>0 && (
                          <Text as="span" ml={1.5} fontWeight="900" cursor="pointer"
                            onClick={e=>{ e.stopPropagation(); setReactPeek({ sparkId:s.id, reaction:label, names: s.reactedBy[label]||[] }); }}>
                            {s.reactions[label]}
                          </Text>
                        )}
                      </Button>
                    );
                  })}
                  <Box ml="auto">
                    <ShareButton
                      text={`✨ @${s.username} on icreate.africa — "${s.caption.slice(0,100)}${s.caption.length>100?"…":""}"\n#icreateafrica #ShowYourSpark`}
                      imageUrl={s.mediaType==="image" ? s.mediaUrl : s.profilePicUrl}
                    />
                  </Box>
                </Flex>
              </Box>
            );
            }); // end feedSparks.forEach
            return items;
          })()}
      </VStack>
    </Box>
  );
}

// ─── My Spark Screen ──────────────────────────────────────────────────────────
function MySparkScreen({ user, sparks, onPost, onMilestone, challengeMode, onClearChallenge, onDelete, onToggleHide, hiddenSparks, onUploadStart, onProgress }: {
  user: User; sparks: SparkPost[];
  onPost: (spark: SparkPost) => void;
  onMilestone?: (type: "first_spark") => void;
  challengeMode?: boolean;
  onClearChallenge?: () => void;
  onDelete: (id: number) => void;
  onToggleHide: (id: number) => void;
  hiddenSparks: Set<number>;
  onUploadStart?: () => void;
  onProgress?: (pct: number) => void;
}) {
  const [menuOpen,      setMenuOpen]      = useState<number|null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number|null>(null);
  const mySparks = sparks.filter(s=>s.userId===user.id);
  return (
    <Box pb={8}>
      {challengeMode ? (
        <Box mx={4} mt={5} rounded="2xl" overflow="hidden" border="2px solid" borderColor={ORANGE} bg="#FFFBF5">
          <Box h="3px" style={{ background:`linear-gradient(90deg,${ORANGE},${GOLD},${ORANGE})` }} />
          <Box px={4} py={4}>
            <Flex align="center" justify="space-between" mb={1}>
              <HStack spacing={2}>
                <Text fontSize="16px">🔥</Text>
                <Text fontWeight="900" color={BROWN} fontSize="sm">Learn & Spark Challenge</Text>
              </HStack>
              <Button variant="ghost" size="xs" color="gray.400" px={1} _hover={{ color:BROWN }} onClick={onClearChallenge}>✕</Button>
            </Flex>
            <Text fontSize="xs" color={ORANGE} fontWeight="800" mb={1}>{CHALLENGE_HASHTAG}</Text>
            <Text fontSize="xs" color="gray.600" lineHeight="tall">
              How do you say &ldquo;Welcome&rdquo; in your language? Say it, film it, share it — doesn&apos;t have to be your native tongue. <Text as="span" fontWeight="700" color={BROWN}>We&apos;re all Africans here. 🌍</Text>
            </Text>
          </Box>
        </Box>
      ) : mySparks.length === 0 ? (
        <Box mx={4} mt={5} bg={ORANGE} rounded="2xl" px={4} py={4}>
          <Text fontWeight="800" color="white" fontSize="sm" mb={1}>👋 Keep shining!</Text>
          <Text fontSize="xs" color="rgba(255,255,255,0.9)" lineHeight="tall">Share your next spark below. Keep videos under 15 seconds and let Africa see you! 🤍</Text>
        </Box>
      ) : null}
      <Box mx={4} mt={4} bg="white" rounded="2xl" shadow="md" overflow="hidden">
        <Box h="4px" bg={challengeMode ? GOLD : ORANGE}/>
        <Box p={5}><UploadForm user={user} sparks={sparks} onPost={onPost} onMilestone={onMilestone} defaultCaption={challengeMode ? CHALLENGE_CAPTION : undefined} onUploadStart={onUploadStart} onProgress={onProgress} /></Box>
      </Box>
      {mySparks.length>0 && (
        <>
          <Flex align="center" gap={3} px={5} mt={7} mb={4}>
            <Box flex={1} h="1px" bg="orange.100"/>
            <Text fontSize="10px" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="widest">My Sparks</Text>
            <Box flex={1} h="1px" bg="orange.100"/>
          </Flex>
          <VStack spacing={4} px={4}>
            {mySparks.map(s=>{
              const jt = getJourneyTotal(sparks,s.journeyId);
              const isHidden = hiddenSparks.has(s.id);
              return (
                <Box key={s.id} w="full" bg="white" rounded="2xl" shadow="sm" overflow="hidden" border="1px solid" borderColor={isHidden?"gray.200":"orange.100"} opacity={isHidden?0.65:1} position="relative">
                  <Box h="3px" bg={isHidden?"gray.300":s.reach==="beyond"?GOLD:ORANGE}/>
                  <Box p={4}>
                    <Flex justify="space-between" align="center" mb={3}>
                      <HStack spacing={2} flexWrap="wrap">
                        <Text fontSize="xs" fontWeight="700" color={s.sparkType==="new"?ORANGE:BROWN} bg={s.sparkType==="new"?"orange.50":"gray.100"} px={2} py={0.5} rounded="full">{s.sparkType==="new"?"New Spark":"Ongoing Spark"}</Text>
                        {s.reach==="beyond" && <Text fontSize="xs" fontWeight="800" color="white" bg={BROWN} px={2} py={0.5} rounded="full">✨ Great Beyond</Text>}
                        {isHidden && <Text fontSize="xs" fontWeight="800" color="gray.400" bg="gray.100" px={2} py={0.5} rounded="full">🙈 Hidden</Text>}
                      </HStack>
                      <Flex align="center" gap={2}>
                        <Text fontSize="xs" color="gray.400">{jt>0?`${jt} reactions`:"0 reactions"}</Text>
                        {/* ⋮ menu */}
                        <Box position="relative">
                          <Button size="xs" variant="ghost" color="gray.400" px={1} minW="24px" _hover={{ color:BROWN, bg:"orange.50" }} onClick={()=>setMenuOpen(menuOpen===s.id?null:s.id)}>⋮</Button>
                          {menuOpen===s.id && (
                            <>
                              <Box position="fixed" inset={0} zIndex={30} onClick={()=>setMenuOpen(null)} />
                              <Box position="absolute" right={0} top="calc(100% + 4px)" zIndex={40} bg="white" rounded="xl" shadow="xl" border="1px solid" borderColor="gray.100" overflow="hidden" minW="150px">
                                <Box px={4} py={3} cursor="pointer" _hover={{ bg:"orange.50" }} onClick={()=>{ setMenuOpen(null); onToggleHide(s.id); }}>
                                  <Text fontSize="sm" fontWeight="700" color={BROWN}>{isHidden?"👁 Unhide":"🙈 Hide from feed"}</Text>
                                </Box>
                                <Box h="1px" bg="gray.100" />
                                <Box px={4} py={3} cursor="pointer" _hover={{ bg:"red.50" }} onClick={()=>{ setMenuOpen(null); setConfirmDelete(s.id); }}>
                                  <Text fontSize="sm" fontWeight="700" color="red.500">🗑 Delete spark</Text>
                                </Box>
                              </Box>
                            </>
                          )}
                        </Box>
                      </Flex>
                    </Flex>
                    <SparkMedia mediaUrl={s.mediaUrl} mediaType={s.mediaType} maxH="220px"/>
                    <Text fontSize="sm" color="gray.700" fontWeight="500" mt={3}>{s.caption}</Text>
                  </Box>
                </Box>
              );
            })}
          </VStack>

          {/* Delete confirm */}
          {confirmDelete && (
            <Box position="fixed" inset={0} zIndex={60} display="flex" alignItems="center" justifyContent="center" bg="blackAlpha.500" onClick={()=>setConfirmDelete(null)}>
              <Box bg="white" rounded="2xl" px={6} py={6} mx={4} maxW="320px" w="full" shadow="2xl" onClick={e=>e.stopPropagation()}>
                <Text fontSize="18px" mb={1}>🗑</Text>
                <Text fontWeight="900" color={BROWN} fontSize="md" mb={2}>Delete this spark?</Text>
                <Text fontSize="sm" color="gray.500" mb={5} lineHeight="tall">This can&apos;t be undone. Your spark will be permanently removed for everyone.</Text>
                <Flex gap={3}>
                  <Button flex={1} variant="outline" borderColor="gray.200" color="gray.500" fontWeight="700" rounded="xl" onClick={()=>setConfirmDelete(null)}>Cancel</Button>
                  <Button flex={1} bg="red.500" color="white" fontWeight="900" rounded="xl" _hover={{ bg:"red.600" }} onClick={()=>{ onDelete(confirmDelete); setConfirmDelete(null); }}>Delete</Button>
                </Flex>
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

// ─── Chats Screen ─────────────────────────────────────────────────────────────
function ChatsScreen({ user, sparks, onOpenTokens, onEdit, onLogout, onReport, setViewProfile, openedHiConnects, markHiOpened }: {
  user: User; sparks: SparkPost[];
  onOpenTokens: () => void; onEdit: () => void; onLogout: () => void; onReport: () => void;
  setViewProfile: (u:string)=>void;
  openedHiConnects: Set<string>; markHiOpened: (u:string)=>void;
}) {
  const mySparks        = sparks.filter(s=>s.userId===user.id);
  const totalReactions  = mySparks.reduce((sum,s)=>sum+Object.values(s.reactions ?? {}).reduce((a,b)=>a+b,0),0);
  // People who said Hi to MY sparks (correct direction)
  const allHiers        = sparks
    .filter(s => s.userId === user.id)
    .flatMap(s => (s.reactedBy["Say Hi"] ?? []).map(uname => {
      const p = sparks.find(x => x.username === uname);
      return { name: p?.name ?? uname, username: uname, profilePicUrl: p?.profilePicUrl ?? "" };
    }))
    .filter((v, i, arr) => v.username !== user.username && arr.findIndex(x=>x.username===v.username)===i);
  const age             = user.birthYear ? calcAge(user.birthYear) : null;

  const [messages,    setMessages]    = useState<Message[]>([]);
  const [activeChat,  setActiveChat]  = useState<string|null>(null);
  const [msgText,     setMsgText]     = useState("");
  const [sending,     setSending]     = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const toast     = useToast();

  // Load all messages for this user
  useEffect(() => {
    fetchMessages(user.username).then(setMessages);
  }, [user.username]);

  // Realtime messages
  useEffect(() => {
    const ch = supabase.channel("messages-rt")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"messages" }, payload => {
        const r = payload.new as Record<string,unknown>;
        const m: Message = { id: r.id as number, fromUsername: r.from_username as string, toUsername: r.to_username as string, content: r.content as string, read: r.read as boolean, createdAt: r.created_at as string };
        if (m.fromUsername===user.username || m.toUsername===user.username) {
          setMessages(prev => prev.some(x=>x.id===m.id) ? prev : [...prev, m]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user.username]);

  // Scroll to latest message
  useEffect(() => {
    if (activeChat) bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, activeChat]);

  // Derive conversation list
  const conversations = (() => {
    const map = new Map<string, { partner:string; lastMsg:Message; unread:number }>();
    messages.forEach(m => {
      const partner = m.fromUsername===user.username ? m.toUsername : m.fromUsername;
      const ex = map.get(partner);
      const unread = messages.filter(x=>x.fromUsername===partner && x.toUsername===user.username && !x.read).length;
      if (!ex || m.id > ex.lastMsg.id) map.set(partner, { partner, lastMsg:m, unread });
    });
    return Array.from(map.values()).sort((a,b)=>b.lastMsg.id-a.lastMsg.id);
  })();

  // Hi Connects = people who said hi to my sparks, NOT yet in any conversation, NOT already opened
  const conversationPartners = new Set(conversations.map(c=>c.partner));
  const hiConnects = allHiers.filter(h => !conversationPartners.has(h.username) && !openedHiConnects.has(h.username));

  const totalUnread = messages.filter(m=>m.toUsername===user.username && !m.read).length;

  const chatMessages = activeChat
    ? messages.filter(m=>(m.fromUsername===user.username&&m.toUsername===activeChat)||(m.fromUsername===activeChat&&m.toUsername===user.username)).sort((a,b)=>a.id-b.id)
    : [];

  const openChat = (username: string, fromHiConnect = false) => {
    setActiveChat(username);
    // Mark messages as read
    setMessages(prev=>prev.map(m=>m.fromUsername===username&&m.toUsername===user.username ? {...m,read:true} : m));
    markRead(username, user.username);
    // Mark hi connect as opened so badge clears
    if (fromHiConnect || allHiers.some(h=>h.username===username)) markHiOpened(username);
    setTimeout(()=>inputRef.current?.focus(), 100);
  };

  const handleSend = async () => {
    const content = msgText.trim();
    if (!content || !activeChat) return;
    // Optimistic — show immediately so sender never wonders if it sent
    const optimistic: Message = {
      id: Date.now(), fromUsername: user.username, toUsername: activeChat,
      content, read: false, createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setMsgText(""); setSending(true);
    const sendErr = await sendMessage(user.username, activeChat, content);
    if (sendErr) {
      // Roll back optimistic message and show error
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setMsgText(content);
      setSending(false);
      toast({ title:"Message failed", description: sendErr.includes("messages") ? "Messages table not set up. Run the SQL setup in Supabase." : sendErr, status:"error", duration:5000, isClosable:true });
      return;
    }
    // Refetch to replace optimistic with real DB record
    const updated = await fetchMessages(user.username);
    setMessages(updated);
    setSending(false);
    inputRef.current?.focus();
    // Email notification when conversation hits 3 messages
    const sentCount = updated.filter(m => m.fromUsername===user.username && m.toUsername===activeChat).length;
    if (sentCount === 3) {
      const { data } = await supabase.from("profiles").select("email,name,username").eq("username", activeChat).single();
      if (data?.email) sendEmail("new_messages", data.email, data.name, data.username, { senderName: user.name, senderUsername: user.username, count: sentCount });
    }
  };

  // Partner info helper
  const partnerInfo = (username: string) => {
    const s = sparks.find(x=>x.username===username);
    return { name: s?.name ?? username, profilePicUrl: s?.profilePicUrl ?? "" };
  };

  // ── Active chat view ──────────────────────────────────────────────────────
  if (activeChat) {
    const partner = partnerInfo(activeChat);
    return (
      <Box display="flex" flexDirection="column" h={{ base:"calc(100vh - 120px)", lg:"calc(100vh - 40px)" }}>
        {/* Header */}
        <Flex bg="white" px={4} py={3} align="center" gap={2} borderBottom="1px solid" borderColor="orange.100" position="sticky" top={0} zIndex={10} flexShrink={0}>
          <Button variant="ghost" size="sm" color={BROWN} px={1} fontWeight="700" _hover={{ bg:"orange.50" }} onClick={()=>setActiveChat(null)}>← Back</Button>
          <Box cursor="pointer" onClick={()=>setViewProfile(activeChat)}>
            <UserAvatar user={partner} size="sm" />
          </Box>
          <Box flex={1} cursor="pointer" onClick={()=>setViewProfile(activeChat)}>
            <Text fontWeight="900" color={BROWN} fontSize="sm" lineHeight={1.2}>{partner.name}</Text>
            <Text fontSize="10px" color="gray.400">@{activeChat}</Text>
          </Box>
          <Button size="xs" variant="ghost" color="red.500" fontWeight="700" _hover={{ bg:"red.50" }} onClick={()=>setShowReportModal(true)} title="Report incident">⚠️</Button>
          <Button size="xs" variant="ghost" color={ORANGE} fontWeight="700" _hover={{ bg:"orange.50" }} onClick={()=>setViewProfile(activeChat)}>View →</Button>
        </Flex>
        <IncidentReportModal
          isOpen={showReportModal}
          onClose={()=>setShowReportModal(false)}
          reporterUsername={user.username}
          reportedUsername={activeChat}
          chatContext={chatMessages.slice(-5).map(m => `${m.fromUsername}: ${m.content}`).join("\n")}
        />

        {/* Messages list */}
        <Box flex={1} overflowY="auto" px={4} py={4} bg={CREAM}>
          {chatMessages.length===0 ? (
            <Center flexDirection="column" gap={3} py={16}>
              <Text fontSize="36px">👋</Text>
              <Text fontSize="sm" color="gray.500" textAlign="center" fontWeight="600">Start the conversation!</Text>
              <Text fontSize="xs" color="gray.400" textAlign="center">Say something to {partner.name}</Text>
            </Center>
          ) : (
            <VStack spacing={1} align="stretch">
              {chatMessages.map((m, i) => {
                const isMe = m.fromUsername===user.username;
                const nextSame = chatMessages[i+1]?.fromUsername===m.fromUsername;
                const prevSame = chatMessages[i-1]?.fromUsername===m.fromUsername;
                const roundedMe    = `${prevSame?"8px":"20px"} ${nextSame?"8px":"20px"} 4px 20px`;
                const roundedOther = `${prevSame?"8px":"20px"} ${nextSame?"8px":"20px"} 20px 4px`;
                return (
                  <Box key={m.id} display="flex" justifyContent={isMe?"flex-end":"flex-start"} mb={nextSame?0.5:3}>
                    {!isMe && !nextSame && (
                      <Box mr={2} alignSelf="flex-end" mb={0}>
                        <UserAvatar user={partner} size="xs" />
                      </Box>
                    )}
                    {!isMe && nextSame && <Box w="32px" mr={2} flexShrink={0} />}
                    <Box maxW="72%">
                      <Box
                        bg={isMe?ORANGE:"white"}
                        color={isMe?"white":"gray.800"}
                        px={4} py={2.5}
                        style={{ borderRadius: isMe?roundedMe:roundedOther }}
                        fontSize="sm" fontWeight="500" lineHeight="tall"
                        shadow={isMe?"none":"sm"}
                        border={isMe?"none":"1px solid"} borderColor="orange.50"
                      >
                        {m.content}
                      </Box>
                      {!nextSame && (
                        <Text fontSize="10px" color="gray.400" mt={0.5} textAlign={isMe?"right":"left"} px={1}>
                          {new Date(m.createdAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}
                        </Text>
                      )}
                    </Box>
                  </Box>
                );
              })}
              <div ref={bottomRef} />
            </VStack>
          )}
        </Box>

        {/* Input bar */}
        <Box bg="white" px={4} py={3} borderTop="1px solid" borderColor="orange.100" flexShrink={0}>
          <HStack spacing={2}>
            <Input
              ref={inputRef as never}
              placeholder={`Message ${partner.name}…`}
              value={msgText}
              onChange={e=>setMsgText(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();} }}
              border="2px solid" borderColor="orange.100"
              _focus={{ borderColor:ORANGE, boxShadow:"none" }}
              rounded="2xl" bg="orange.50" fontSize="sm"
            />
            <Button
              bg={msgText.trim()?ORANGE:"gray.100"} color={msgText.trim()?"white":"gray.400"}
              rounded="2xl" w="44px" h="40px" minW="44px" fontWeight="900" fontSize="lg"
              onClick={handleSend} isLoading={sending}
              isDisabled={!msgText.trim()} _hover={{ opacity:0.9 }} transition="all 0.15s"
            >→</Button>
          </HStack>
        </Box>
      </Box>
    );
  }

  // ── Conversation list + passport ──────────────────────────────────────────
  return (
    <Box pb={8}>
      {/* ── Report button — sticky, always visible ── */}
      <Box position="sticky" top="0" zIndex={20} px={4} pt={3} pb={3} bg={CREAM} borderBottom="1px solid" borderColor="orange.100" shadow="sm">
        <Button w="full" size="md" bg={ORANGE} color="white" rounded="xl" fontWeight="800" shadow="md" _hover={{ bg:BROWN }} onClick={onReport}>🚨 Report a Problem / Make a Recommendation</Button>
      </Box>
      {/* ── Spark Passport ── */}
      <Box mx={{ base:0, md:4 }} mt={{ base:0, md:4 }}>
        <Box rounded={{ base:0, md:"2xl" }} overflow="hidden" shadow={{ base:"none", md:"md" }}
          style={{ background:`linear-gradient(145deg,${BROWN} 0%,#8B3A0F 55%,${ORANGE} 100%)` }}>
          <Flex px={{ base:5, md:6 }} pt={6} pb={4} align="flex-start" gap={4}>
            <Box position="relative">
              <Box w={{ base:"72px", md:"88px" }} h={{ base:"72px", md:"88px" }} rounded="2xl" overflow="hidden" border="3px solid rgba(255,255,255,0.4)" flexShrink={0}>
                {user.profilePicUrl ? <img src={user.profilePicUrl} alt={user.name} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : <Avatar name={user.name} size="xl" bg="white" color={ORANGE} fontWeight="900" w="100%" h="100%" rounded="none" />}
              </Box>
              <Box position="absolute" bottom={-1} right={-1} bg={GOLD} rounded="full" w="20px" h="20px" display="flex" alignItems="center" justifyContent="center"><Text fontSize="10px">✨</Text></Box>
            </Box>
            <Box flex={1}>
              <Text fontSize="10px" fontWeight="800" color="rgba(255,255,255,0.5)" textTransform="uppercase" letterSpacing="widest" mb={1}>Spark Passport</Text>
              <Text fontWeight="900" color="white" fontSize={{ base:"xl", md:"2xl" }} lineHeight={1.1}>{user.name}</Text>
              <Text color="rgba(255,255,255,0.7)" fontSize="sm">@{user.username}</Text>
              {user.bio && <Text fontSize="xs" color="rgba(255,255,255,0.8)" mt={1} lineHeight="tall" noOfLines={2}>{user.bio}</Text>}
            </Box>
          </Flex>
          <Box px={{ base:5, md:6 }} pb={4}>
            <Grid templateColumns="1fr 1fr" gap={2}>
              {[["🌍 Location",[user.city,user.state,user.country].filter(Boolean).join(", ")||"—"],["💼 Occupation",user.occupation||"—"],["🎂 Age",age?`${age}${user.showAge?"":" (private)"}`:"—"],["⚧ Gender",user.gender||"—"]].map(([label,value])=>(
                <Box key={label} bg="rgba(255,255,255,0.1)" rounded="xl" px={3} py={2}>
                  <Text fontSize="10px" color="rgba(255,255,255,0.5)" fontWeight="700">{label}</Text>
                  <Text fontSize="xs" color="white" fontWeight="700" noOfLines={1}>{value}</Text>
                </Box>
              ))}
            </Grid>
          </Box>
          <Box mx={{ base:5, md:6 }} mb={4} px={4} py={3} rounded="xl" style={{ background:"linear-gradient(135deg,#1A0800 0%,#3D1200 100%)", border:`1.5px solid ${GOLD}`, boxShadow:`0 0 12px ${GOLD}44` }}>
            <HStack spacing={2}><Text fontSize="16px" style={{ filter:"drop-shadow(0 0 5px gold)" }}>✨</Text><Box flex={1}><Text fontSize="xs" fontWeight="900" color={GOLD}>Member of the Great Spark Beyond</Text><Text fontSize="10px" color="rgba(255,255,255,0.6)">You are one of the true souls of Africa. 🤍</Text></Box></HStack>
          </Box>
          <HStack px={{ base:5, md:6 }} pb={5} spacing={2}>
            {[["Sparks",mySparks.length,"🎬"],["Reactions",totalReactions,"💪"],["Connections",allHiers.length,"👋"]].map(([l,v,e])=>(
              <Box key={l as string} textAlign="center" bg="rgba(255,255,255,0.12)" rounded="xl" px={3} py={2} flex={1}>
                <Text fontSize="14px">{e}</Text><Text fontWeight="900" color="white" fontSize="lg">{v}</Text><Text fontSize="9px" color="rgba(255,255,255,0.7)">{l}</Text>
              </Box>
            ))}
            <Box as="button" textAlign="center" bg="#FFFBF0" rounded="xl" px={3} py={2} flex={1} onClick={onOpenTokens}>
              <TokenIcon size={14} /><Text fontWeight="900" color={BROWN} fontSize="lg">{user.coins}</Text><Text fontSize="9px" color={BROWN}>Tokens</Text>
            </Box>
          </HStack>
          <Flex px={{ base:5, md:6 }} pb={2} gap={2}>
            <Button flex={1} size="sm" bg="rgba(255,255,255,0.15)" color="white" rounded="xl" fontWeight="700" border="1px solid rgba(255,255,255,0.25)" _hover={{ bg:"rgba(255,255,255,0.25)" }} onClick={onEdit}>✏️ Edit Profile</Button>
            <Button flex={1} size="sm" bg="rgba(255,0,0,0.15)" color="red.200" rounded="xl" fontWeight="700" border="1px solid rgba(255,100,100,0.3)" _hover={{ bg:"rgba(255,0,0,0.25)" }} onClick={onLogout}>🚪 Log Out</Button>
          </Flex>
          <Box px={{ base:5, md:6 }} pb={5}>
            <Button w="full" size="sm" bg="rgba(255,255,255,0.18)" color="white" rounded="xl" fontWeight="800" border="1.5px solid rgba(255,255,255,0.35)" _hover={{ bg:"rgba(255,255,255,0.28)" }} onClick={onReport}>🚨 Report / Recommendation</Button>
          </Box>
        </Box>
      </Box>

      {/* ── Messages ── */}
      <Box px={4} mt={6}>
        <Flex align="center" justify="space-between" mb={3}>
          <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide">Messages</Text>
          {totalUnread>0 && <Badge bg={ORANGE} color="white" rounded="full" fontSize="10px" px={2}>{totalUnread} new</Badge>}
        </Flex>
        {conversations.length===0 ? (
          <Box bg="white" rounded="2xl" px={5} py={8} textAlign="center" border="1px solid" borderColor="orange.100">
            <Text fontSize="32px" mb={2}>💬</Text>
            <Text fontWeight="800" color={BROWN} mb={1}>No messages yet</Text>
            <Text fontSize="sm" color="gray.400">Say Hi to someone's spark — when they say Hi back, you can start chatting here.</Text>
          </Box>
        ) : (
          <VStack spacing={2}>
            {conversations.map(({ partner, lastMsg, unread }) => {
              const p = partnerInfo(partner);
              const isMe = lastMsg.fromUsername===user.username;
              const time = new Date(lastMsg.createdAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
              return (
                <Flex key={partner} align="center" gap={3} bg="white" rounded="2xl" px={4} py={3} shadow="sm" border="1px solid" borderColor={unread?"orange.200":"orange.50"} cursor="pointer" onClick={()=>openChat(partner)} w="full" transition="all 0.15s" _hover={{ bg:"orange.50", borderColor:ORANGE }}>
                  <Box position="relative" flexShrink={0}>
                    <UserAvatar user={p} size="md" />
                    {unread>0 && <Box position="absolute" top={-1} right={-1} w="10px" h="10px" bg={ORANGE} rounded="full" border="2px solid white" />}
                  </Box>
                  <Box flex={1} minW={0}>
                    <Flex justify="space-between" align="baseline">
                      <Text fontWeight={unread?"900":"700"} color={BROWN} fontSize="sm">{p.name}</Text>
                      <Text fontSize="10px" color="gray.400">{time}</Text>
                    </Flex>
                    <Text fontSize="xs" color={unread?"gray.700":"gray.400"} fontWeight={unread?"600":"400"} noOfLines={1}>
                      {isMe ? `You: ${lastMsg.content}` : lastMsg.content}
                    </Text>
                  </Box>
                  {unread>0 && <Box w="20px" h="20px" bg={ORANGE} rounded="full" display="flex" alignItems="center" justifyContent="center" flexShrink={0}><Text color="white" fontSize="9px" fontWeight="900">{unread}</Text></Box>}
                </Flex>
              );
            })}
          </VStack>
        )}
      </Box>

      {/* ── New Hi's ── */}
      {hiConnects.length > 0 && (
        <Box px={4} mt={6}>
          <Flex align="center" gap={2} mb={3}>
            <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide">New — Said Hi to Your Spark</Text>
            <Badge bg={ORANGE} color="white" rounded="full" fontSize="10px" px={2}>{hiConnects.length}</Badge>
          </Flex>
          <VStack spacing={2}>
            {hiConnects.map(c => {
              const isNew = !openedHiConnects.has(c.username);
              return (
                <Flex key={c.username} align="center" gap={3} rounded="2xl" px={4} py={3} shadow="sm"
                  border="1px solid" borderColor={isNew?"orange.300":"orange.100"}
                  bg={isNew?"orange.50":"white"} w="full">
                  <Box position="relative" cursor="pointer" onClick={()=>setViewProfile(c.username)}>
                    <UserAvatar user={c} size="md" />
                    {isNew && <Box position="absolute" top={-1} right={-1} w="10px" h="10px" bg={ORANGE} rounded="full" border="2px solid white" />}
                  </Box>
                  <Box flex={1} cursor="pointer" onClick={()=>setViewProfile(c.username)}>
                    <Text fontWeight="800" color={BROWN} fontSize="sm">{c.name}</Text>
                    <Text fontSize="xs" color="gray.400">@{c.username} · waved at your spark 👋</Text>
                  </Box>
                  <Button size="sm" bg={ORANGE} color="white" rounded="full" fontWeight="700" _hover={{ bg:"#c44d16" }}
                    onClick={()=>openChat(c.username, true)}>
                    Chat 💬
                  </Button>
                </Flex>
              );
            })}
          </VStack>
        </Box>
      )}
    </Box>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function HomeClient() {
  const [user,             setUser]            = useState<User|null>(null);
  const [view,             setView]            = useState<View>("feed");
  const [sparks,           setSparks]          = useState<SparkPost[]>([]);
  const [loading,          setLoading]         = useState(true);
  const [showSplash,       setShowSplash]      = useState(false);
  const [tasks,            setTasks]           = useState<Tasks>(DEFAULT_TASKS);
  const [viewProfile,      setViewProfile]     = useState<string|null>(null);
  const [challengeActive,  setChallengeActive] = useState(false);
  const [openedHiConnects, setOpenedHiConnects] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ca_openedHi") ?? "[]")); }
    catch { return new Set<string>(); }
  });
  const [globalUploadPct, setGlobalUploadPct] = useState<number>(0);
  const [hiddenSparks, setHiddenSparks] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ca_hidden") ?? "[]")); }
    catch { return new Set<number>(); }
  });
  const { isOpen:tokensOpen,  onOpen:openTokens,  onClose:closeTokens  } = useDisclosure();
  const { isOpen:inviteOpen,  onOpen:openInvite,  onClose:closeInvite  } = useDisclosure();
  const { isOpen:editOpen,    onOpen:openEdit,    onClose:closeEdit    } = useDisclosure();
  const { isOpen:reportOpen,  onOpen:openReport,  onClose:closeReport  } = useDisclosure();
  const [reportSubject, setReportSubject] = useState("");
  const [reportBody,    setReportBody]    = useState("");
  const [reportSending, setReportSending] = useState(false);
  const toast = useToast();

  // Load sparks from Supabase
  const loadSparks = useCallback(async () => {
    const data = await fetchSparks();
    setSparks(data);
  }, []);

  // Boot: load user + sparks
  useEffect(() => {
    (async () => {
      setLoading(true);
      const raw = localStorage.getItem("ca_user");
      const u = raw ? JSON.parse(raw) as User : null;
      if (u) {
        setUser(u);
        // Re-sync profile to Supabase — recovers profiles that were only in localStorage
        // (saveProfile previously failed silently when the password column was missing)
        saveProfile(u).catch(() => {});
        // Show welcome splash once per session
        if (!sessionStorage.getItem("ca_splashed")) {
          sessionStorage.setItem("ca_splashed", "1");
          setShowSplash(true);
        }
      }
      setTasks(loadTasks());
      await loadSparks();
      setLoading(false);
      // Track visit for everyone — logged in or not, with real geo-location
      trackVisit(u);
    })();
  }, [loadSparks]);

  // Realtime subscription — surgical updates to avoid full refetch lag
  useEffect(() => {
    function mapRow(r: Record<string, unknown>): SparkPost {
      return {
        id: r.id as number, userId: r.user_id as string, name: r.name as string,
        username: r.username as string, profilePicUrl: (r.profile_pic_url ?? "") as string,
        caption: r.caption as string, mediaUrl: r.media_url as string,
        mediaType: r.media_type as MediaType, reach: r.reach as Reach,
        reactions: (r.reactions as Record<Reaction,number>) ?? { Encourage:0, "Say Hi":0, Applaud:0, "Keep Going":0 },
        reactedBy: (r.reacted_by as Record<Reaction,string[]>) ?? { Encourage:[], "Say Hi":[], Applaud:[], "Keep Going":[] },
        sparkType: r.spark_type as SparkType, journeyId: r.journey_id as string,
        linkedSparkId: (r.linked_spark_id ?? undefined) as number|undefined,
        isAdminPost: (r.is_admin_post ?? false) as boolean,
        pinned: (r.pinned ?? false) as boolean,
        adminPostType: (r.admin_post_type ?? 'regular') as string,
        targetCountry: (r.target_country ?? "") as string, targetState: (r.target_state ?? "") as string,
        broadcastFreqType: (r.broadcast_freq_type ?? "") as string,
        broadcastFreqValue: (r.broadcast_freq_value ?? 0) as number,
        broadcastMaxPerDay: (r.broadcast_max_per_day ?? 0) as number,
        broadcastExpiresAt: (r.broadcast_expires_at ?? "") as string,
      };
    }
    const channel = supabase
      .channel("sparks-realtime")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"sparks" }, payload => {
        const spark = mapRow(payload.new as Record<string,unknown>);
        setSparks(prev => prev.some(s => s.id === spark.id) ? prev : [spark, ...prev]);
      })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"sparks" }, payload => {
        const updated = mapRow(payload.new as Record<string,unknown>);
        setSparks(prev => prev.map(s => s.id === updated.id ? { ...s, reactions: updated.reactions, reactedBy: updated.reactedBy } : s));
      })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"sparks" }, payload => {
        setSparks(prev => prev.filter(s => s.id !== (payload.old as {id:number}).id));
      })
      .subscribe();

    // Poll every 10s as fallback — merge so realtime-added items aren't wiped by a stale fetch
    const poll = setInterval(async () => {
      const fresh = await fetchSparks();
      setSparks(prev => {
        const freshMap = new Map(fresh.map(f => [f.id, f]));
        // Keep any realtime-only items (not yet in the fetch result) at the top
        const realtimeOnly = prev.filter(p => !freshMap.has(p.id));
        return [...realtimeOnly, ...fresh];
      });
    }, 10000);

    // Also refresh when user comes back to the tab
    const onVisible = () => { if (document.visibilityState === "visible") fetchSparks().then(setSparks); };
    document.addEventListener("visibilitychange", onVisible);

    return () => { supabase.removeChannel(channel); clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Daily token
  useEffect(() => {
    if (!user) return;
    if (tasks.daily_claimed===today()) return;
    const newTasks = { ...tasks, daily_claimed:today() };
    saveTasks(newTasks); setTasks(newTasks);
    const updated = { ...user, coins:user.coins+1 };
    setUser(updated); localStorage.setItem("ca_user",JSON.stringify(updated));
    updateCoins(user.id, updated.coins);
    toast({ title:"Daily token claimed!", description:"You got 1 free token for coming back today.", status:"success", duration:4000, isClosable:true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSignUpDone = async (newUser: User, isNew: boolean, introPost: Omit<SparkPost,"id"|"reactions"|"reactedBy"|"journeyId">|null) => {
    setUser(newUser);
    if (isNew && introPost) {
      const newId = Date.now();
      const spark: SparkPost = {
        ...introPost, id: newId, journeyId: String(newId),
        reactions:  { Encourage:0, "Say Hi":0, Applaud:0, "Keep Going":0 },
        reactedBy:  { Encourage:[], "Say Hi":[], Applaud:[], "Keep Going":[] },
      };
      await saveSpark(spark);
      setSparks(prev => [spark, ...prev]);
      setTimeout(() => {
        toast({ title:"🎉 Welcome to icreate.africa!", description:"You've received 1,000 free tokens — your gift from us. Your intro spark is live! 💛", status:"success", duration:6000, isClosable:true });
      }, 500);
    }
  };

  const handlePost = (spark: SparkPost) => {
    setSparks(prev => [spark, ...prev]);
    if (user) trackEvent("post_spark", user, { reach: spark.reach, spark_type: spark.sparkType });
  };

  const handleDeleteSpark = async (id: number) => {
    await supabase.from("sparks").delete().eq("id", id);
    setSparks(prev => prev.filter(s => s.id !== id));
    setHiddenSparks(prev => { const next = new Set(prev); next.delete(id); localStorage.setItem("ca_hidden", JSON.stringify([...next])); return next; });
    toast({ title: "Spark deleted", status: "info", duration: 3000, isClosable: true });
  };

  const handleToggleHide = (id: number) => {
    setHiddenSparks(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); toast({ title: "Spark visible again", status: "success", duration: 2500, isClosable: true }); }
      else { next.add(id); toast({ title: "Spark hidden from feed", status: "info", duration: 2500, isClosable: true }); }
      localStorage.setItem("ca_hidden", JSON.stringify([...next]));
      return next;
    });
  };

  const handleMilestone = (type: "first_spark" | "reactions_5" | "reactions_10", reactionTotal?: number) => {
    if (!user) return;
    let coinsToAdd = 0;
    const newTasks = { ...tasks };
    if (type === "first_spark" && !tasks.first_spark_claimed) {
      newTasks.first_spark_claimed = true;
      coinsToAdd = 20;
    } else if (type === "reactions_5" && !tasks.reactions_5_claimed) {
      newTasks.reactions_5_claimed = true;
      if (reactionTotal !== undefined) newTasks.total_reactions_given = reactionTotal;
      coinsToAdd = 10;
    } else if (type === "reactions_10" && !tasks.reactions_10_claimed) {
      newTasks.reactions_10_claimed = true;
      if (reactionTotal !== undefined) newTasks.total_reactions_given = reactionTotal;
      coinsToAdd = 10;
    }
    if (coinsToAdd > 0) {
      saveTasks(newTasks); setTasks(newTasks);
      const updated = { ...user, coins: user.coins + coinsToAdd };
      setUser(updated); localStorage.setItem("ca_user", JSON.stringify(updated));
      updateCoins(user.id, updated.coins);
      trackEvent("coin_earned", user, { amount: coinsToAdd, milestone: type });
      toast({ title:`+${coinsToAdd} tokens earned! 🎉`, description:"Keep up the amazing work! Your tokens are growing. 💛", status:"success", duration:4000, isClosable:true });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("ca_user");
    setUser(null); setSparks([]); setView("feed");
    toast({ title:"Logged out", status:"info", duration:2000, isClosable:true });
  };

  const handleEditSave = (updated: User) => {
    setUser(updated);
    setSparks(prev => prev.map(s => s.userId===updated.id ? { ...s, name:updated.name, username:updated.username, profilePicUrl:updated.profilePicUrl } : s));
  };

  if (loading) return (
    <ChakraProvider theme={theme}>
      <Center minH="100vh" bg={CREAM} flexDirection="column" gap={5}>
        <Box textAlign="center">
          <Text fontSize="3xl" fontWeight="900" color={BROWN} letterSpacing="-0.5px" lineHeight={1}>icreate</Text>
          <Text fontSize="xs" fontWeight="800" color={ORANGE} letterSpacing="widest" textTransform="uppercase">.africa</Text>
        </Box>
        <Spinner color={ORANGE} size="lg" thickness="3px" />
        <Text fontSize="xs" color="gray.400" fontWeight="600" letterSpacing="wide">Loading your sparks…</Text>
      </Center>
    </ChakraProvider>
  );

  if (!user) return (
    <ChakraProvider theme={theme}>
      <SignUpScreen onDone={handleSignUpDone} />
    </ChakraProvider>
  );

  // People who said Hi to MY sparks — not yet opened
  const hiConnectCount = (() => {
    const hiers = sparks
      .filter(s => s.userId === user.id)
      .flatMap(s => s.reactedBy["Say Hi"] ?? [])
      .filter((u, i, arr) => u !== user.username && arr.indexOf(u) === i);
    return hiers.filter(u => !openedHiConnects.has(u)).length;
  })();

  const markHiOpened = (username: string) => {
    setOpenedHiConnects(prev => {
      const next = new Set(prev); next.add(username);
      localStorage.setItem("ca_openedHi", JSON.stringify([...next]));
      return next;
    });
  };

  const beyondIsOpen = getBeyondState().isOpen;
  const NAV_ITEMS: { id:View; emoji:string; label:string; badge?:number }[] = [
    { id:"feed",   emoji:"🏠", label:"Spark Feed" },
    { id:"mypark", emoji:"✨", label:"My Spark"   },
    { id:"beyond", emoji:"🌍", label:"The Beyond", badge: beyondIsOpen ? 1 : undefined },
    { id:"chats",  emoji:"💬", label:"Hi & Chats", badge:hiConnectCount||undefined },
    ...(user.isAdmin ? [{ id:"admin" as View, emoji:"⚙️", label:"Admin Panel" }] : []),
  ];

  const handleUploadStart = () => {
    setView("feed");
    setGlobalUploadPct(1);
  };

  const mainContent = (
    <>
      {view==="feed"   && <FeedScreen   user={user} sparks={sparks} setSparks={setSparks} onShowMySpark={()=>setView("mypark")} setViewProfile={setViewProfile} tasks={tasks} onMilestone={(type, total) => handleMilestone(type, total)} onJoinChallenge={()=>{ setChallengeActive(true); setView("mypark"); }} onOpenBeyond={()=>setView("beyond")} hiddenSparks={hiddenSparks} onRefresh={loadSparks} />}
      {view==="mypark" && <MySparkScreen user={user} sparks={sparks} onPost={handlePost} onMilestone={(type) => handleMilestone(type)} challengeMode={challengeActive} onClearChallenge={()=>setChallengeActive(false)} onDelete={handleDeleteSpark} onToggleHide={handleToggleHide} hiddenSparks={hiddenSparks} onUploadStart={handleUploadStart} onProgress={(pct) => { setGlobalUploadPct(pct); if (pct >= 100) setTimeout(() => setGlobalUploadPct(0), 1400); }} />}
      {view==="beyond" && <BeyondScreen  user={user} sparks={sparks} onNavigate={setView} />}
      {view==="chats"  && <ChatsScreen  user={user} sparks={sparks} onOpenTokens={openTokens} onEdit={openEdit} onLogout={handleLogout} onReport={openReport} setViewProfile={setViewProfile} openedHiConnects={openedHiConnects} markHiOpened={markHiOpened} />}
    </>
  );

  return (
    <ChakraProvider theme={theme}>
      {/* ── Welcome Splash ── */}
      {showSplash && user && (
        <WelcomeSplash user={user} onComplete={() => setShowSplash(false)} />
      )}

      <Box bg={CREAM} minH="100vh">
        {/* ── Global upload progress bar ── */}
        {globalUploadPct > 0 && (
          <Box position="fixed" top={0} left={0} right={0} zIndex={9999} h="3px" bg="orange.100">
            <Box h="full" bg={ORANGE} transition="width 0.3s ease" style={{ width: globalUploadPct >= 100 ? "100%" : `${globalUploadPct}%` }} />
          </Box>
        )}

        {/* ── DESKTOP ───────────────────────────────────────────────────── */}
        <Box display={{ base:"none", lg:"block" }} maxW="1280px" mx="auto">
          <Grid templateColumns={{ lg:"220px 1fr", xl:"220px 1fr 300px" }} minH="100vh">

            {/* Left sidebar */}
            <GridItem>
              <Box position="sticky" top={0} h="100vh" overflowY="auto" py={6} px={4} borderRight="1px solid" borderColor="orange.100" bg="white" display="flex" flexDirection="column" gap={2}>
                <Box mb={4} px={2}><CreateAfricaLogo size={44} /></Box>
                <VStack spacing={1} align="stretch">
                  {NAV_ITEMS.map(item=>(
                    <Button key={item.id} variant="ghost" justifyContent="flex-start" gap={3} px={3} py={5} rounded="xl"
                      color={view===item.id?ORANGE:"gray.600"} bg={view===item.id?"orange.50":"transparent"}
                      fontWeight={view===item.id?"800":"600"} fontSize="sm" _hover={{ bg:"orange.50", color:ORANGE }} onClick={()=>{ setView(item.id); if(user) trackEvent("view", user, { tab: item.id }); }}>
                      <Text fontSize="18px">{item.emoji}</Text>
                      <Text flex={1}>{item.label}</Text>
                      {item.badge ? <Badge bg={ORANGE} color="white" rounded="full" fontSize="10px">{item.badge}</Badge> : null}
                    </Button>
                  ))}
                </VStack>
                <Divider my={2} borderColor="orange.100" />
                <Box px={2}>
                  <Flex align="center" gap={3} mb={3}>
                    <Box w="32px" h="32px" rounded="full" overflow="hidden" flexShrink={0}>
                      {user.profilePicUrl ? <img src={user.profilePicUrl} alt={user.name} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : <Avatar name={user.name} size="sm" bg={ORANGE} color="white" fontWeight="900" />}
                    </Box>
                    <Box flex={1} minW={0}><Text fontWeight="800" color={BROWN} fontSize="sm" noOfLines={1}>{user.name}</Text><Text fontSize="11px" color="gray.400">@{user.username}</Text></Box>
                  </Flex>
                  <Button w="full" size="sm" bg="#FFFBF0" border="1.5px solid" borderColor={GOLD} rounded="xl" fontWeight="700" color={BROWN} _hover={{ bg:"#FFF3D0" }} onClick={openTokens} leftIcon={<TokenIcon size={13} />}>
                    {user.coins.toLocaleString()} Spark Credits
                  </Button>
                </Box>
                <Box flex={1} />
                <VStack spacing={2} px={2}>
                  <Button w="full" size="sm" variant="outline" borderColor={ORANGE} color={ORANGE} rounded="xl" fontWeight="700" _hover={{ bg:"orange.50" }} onClick={openInvite}>🤝 Invite Friends</Button>
                  <Button w="full" size="sm" variant="ghost" color="gray.400" rounded="xl" fontWeight="700" _hover={{ bg:"red.50", color:"red.400" }} onClick={handleLogout}>🚪 Log Out</Button>
                </VStack>
                <Text fontSize="10px" color="gray.300" textAlign="center" mt={2}>Powered by DotXan Tech</Text>
              </Box>
            </GridItem>

            {/* Main */}
            <GridItem>
              <Box maxW="640px" mx="auto">{mainContent}</Box>
            </GridItem>

            {/* Right sidebar */}
            <GridItem display={{ lg:"none", xl:"block" }}>
              <Box position="sticky" top={0} h="100vh" overflowY="auto" py={6} px={4} borderLeft="1px solid" borderColor="orange.100">
                {view==="feed" ? (
                  <VStack spacing={4} align="stretch">
                    <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide">Show Your Spark</Text>
                    <Box bg="white" rounded="2xl" shadow="sm" overflow="hidden" border="1px solid" borderColor="orange.100">
                      <Box h="3px" bg={ORANGE}/><Box p={4}><UploadForm user={user} sparks={sparks} onPost={handlePost} onMilestone={(type) => handleMilestone(type)} /></Box>
                    </Box>
                  </VStack>
                ) : view==="mypark" ? (
                  <VStack spacing={4} align="stretch">
                    <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide">Your Stats</Text>
                    <Box bg="white" rounded="2xl" p={4} shadow="sm" border="1px solid" borderColor="orange.100">
                      <VStack spacing={3}>
                        {[["Sparks", sparks.filter(s=>s.userId===user.id).length], ["Total reactions", sparks.filter(s=>s.userId===user.id).reduce((sum,s)=>sum+Object.values(s.reactions ?? {}).reduce((a,b)=>a+b,0),0)], ["Hi Connects", hiConnectCount]].map(([l,v]) => (
                          <Flex key={l as string} w="full" justify="space-between" align="center">
                            <Text fontSize="sm" color="gray.500" fontWeight="600">{l}</Text>
                            <Text fontWeight="900" color={BROWN}>{v}</Text>
                          </Flex>
                        ))}
                      </VStack>
                    </Box>
                    <Button variant="outline" borderColor={ORANGE} color={ORANGE} rounded="xl" fontWeight="700" _hover={{ bg:"orange.50" }} onClick={openInvite}>🤝 Invite Friends</Button>
                  </VStack>
                ) : (
                  <VStack spacing={4} align="stretch">
                    <Box bg="white" rounded="2xl" p={4} shadow="sm" border="1px solid" borderColor="orange.100">
                      <Text fontSize="sm" fontWeight="800" color={BROWN} mb={1}>{user.occupation}</Text>
                      <Text fontSize="xs" color="gray.400">🌍 {[user.city,user.state,user.country].filter(Boolean).join(", ")}</Text>
                    </Box>
                    <Button size="sm" bg="rgba(255,0,0,0.08)" color="red.400" rounded="xl" fontWeight="700" _hover={{ bg:"red.50" }} onClick={handleLogout}>🚪 Log Out</Button>
                  </VStack>
                )}
              </Box>
            </GridItem>
          </Grid>
        </Box>

        {/* ── MOBILE ────────────────────────────────────────────────────── */}
        <Box display={{ base:"block", lg:"none" }}>
          <Flex bg="white" px={4} py={2.5} align="center" justify="space-between" borderBottom="1px solid" borderColor="orange.100" position="sticky" top={0} zIndex={20}>
            <CreateAfricaLogo size={40} />
            <Button size="sm" bg={user.coins>0?"#FFFBF0":"orange.50"} border="1.5px solid" borderColor={user.coins>0?GOLD:"orange.200"} rounded="full" px={3} fontWeight="700" color={BROWN} _hover={{ bg:"#FFF3D0" }} onClick={openTokens} leftIcon={<TokenIcon size={13} />}>
              {user.coins} Credits
            </Button>
          </Flex>
          <Box pb={24}>{mainContent}
            <Text fontSize="10px" color="gray.300" textAlign="center" pb={4}>Powered by DotXan Tech</Text>
          </Box>
          <Box position="fixed" bottom={0} left={0} right={0} bg="white" borderTop="1px solid" borderColor="orange.100" zIndex={20} shadow="0 -2px 10px rgba(0,0,0,0.06)">
            <HStack spacing={0} maxW="600px" mx="auto">
              {NAV_ITEMS.map(item=>(
                <Button key={item.id} flex={1} variant="ghost" rounded={0} py={5} flexDirection="column" gap={0.5}
                  color={view===item.id?ORANGE:"gray.400"} bg={view===item.id?"orange.50":"transparent"}
                  _hover={{ bg:"orange.50" }} onClick={()=>{ setView(item.id); trackEvent("view", user, { tab: item.id }); }} position="relative">
                  <Text fontSize="18px">{item.emoji}</Text>
                  <Text fontSize="9px" fontWeight={view===item.id?"800":"600"}>{item.label}</Text>
                  {item.badge ? <Badge position="absolute" top="6px" right="calc(50% - 20px)" bg={ORANGE} color="white" rounded="full" fontSize="9px" minW="16px" textAlign="center">{item.badge}</Badge> : null}
                </Button>
              ))}
            </HStack>
          </Box>
        </Box>

        <GreatBeyondModal isOpen={tokensOpen} onClose={closeTokens} coins={user.coins} tasks={tasks} />
        <InviteModal     isOpen={inviteOpen} onClose={closeInvite} user={user} />
        <EditProfileModal isOpen={editOpen} onClose={closeEdit} user={user} onSave={handleEditSave} />
        <ProfilePassportModal username={viewProfile} sparks={sparks} setSparks={setSparks} currentUser={user} onClose={()=>setViewProfile(null)} />

        {/* ── Report / Complaint Modal ── */}
        <Modal isOpen={reportOpen} onClose={closeReport} isCentered>
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
          <ModalContent rounded="2xl" mx={4} bg="white">
            <Box h="4px" bg={ORANGE} roundedTop="2xl" />
            <ModalCloseButton color={BROWN} mt={1} />
            <ModalBody p={6}>
              <Text fontWeight="900" color={BROWN} fontSize="lg" mb={1}>🚨 Report a Problem</Text>
              <Text fontSize="xs" color="gray.400" mb={4}>We take all reports seriously. Our team will respond in your messages.</Text>
              <VStack spacing={3}>
                <Input
                  placeholder="Subject (e.g. Bug, Abuse, Other)"
                  value={reportSubject}
                  onChange={e => setReportSubject(e.target.value)}
                  rounded="xl"
                  border="1.5px solid"
                  borderColor="orange.200"
                  _focus={{ borderColor: ORANGE, boxShadow: "none" }}
                  fontWeight="600"
                  color={BROWN}
                />
                <Textarea
                  placeholder="Describe your issue in detail..."
                  value={reportBody}
                  onChange={e => setReportBody(e.target.value)}
                  rows={5}
                  rounded="xl"
                  border="1.5px solid"
                  borderColor="orange.200"
                  _focus={{ borderColor: ORANGE, boxShadow: "none" }}
                  fontWeight="600"
                  color={BROWN}
                  resize="none"
                />
                <Button
                  w="full"
                  bg={ORANGE}
                  color="white"
                  rounded="xl"
                  fontWeight="800"
                  _hover={{ bg: BROWN }}
                  isLoading={reportSending}
                  isDisabled={!reportBody.trim()}
                  onClick={async () => {
                    if (!reportBody.trim()) return;
                    setReportSending(true);
                    await supabase.from("reports").insert({
                      from_username: user.username,
                      user_id: user.id,
                      subject: reportSubject.trim(),
                      body: reportBody.trim(),
                      status: "open",
                    });
                    setReportSending(false);
                    setReportSubject("");
                    setReportBody("");
                    closeReport();
                    toast({
                      title: "Report sent!",
                      description: "We'll get back to you in your messages.",
                      status: "success",
                      duration: 4000,
                      isClosable: true,
                    });
                  }}
                >
                  Send Report
                </Button>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>
      </Box>
    </ChakraProvider>
  );
}
