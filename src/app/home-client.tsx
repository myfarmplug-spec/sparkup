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
    created_at timestamptz default now()
  );

  alter table profiles disable row level security;
  alter table sparks disable row level security;

  insert into storage.buckets (id, name, public)
    values ('spark-media', 'spark-media', true) on conflict do nothing;

  create policy if not exists "Public read" on storage.objects
    for select using (bucket_id = 'spark-media');
  create policy if not exists "Anon upload" on storage.objects
    for insert with check (bucket_id = 'spark-media');
  create policy if not exists "Anon update" on storage.objects
    for update using (bucket_id = 'spark-media');
  ─────────────────────────────────────────────────────────────────────────── */

import {
  ChakraProvider, extendTheme, Box, Text, Button, VStack, Input, Textarea,
  HStack, useToast, Flex, Avatar, AspectRatio, Center, Heading,
  Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton,
  useDisclosure, Select, Divider, Badge, Grid, GridItem, Progress, Spinner,
} from "@chakra-ui/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";

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
type View      = "feed" | "mypark" | "chats";

const REACTIONS: { label: Reaction; emoji: string }[] = [
  { label: "Encourage", emoji: "💪" },
  { label: "Say Hi",    emoji: "👋" },
  { label: "Applaud",   emoji: "👏" },
  { label: "Keep Going",emoji: "🔥" },
];

// ─── Tasks ────────────────────────────────────────────────────────────────────
interface Tasks { daily_claimed: string; }
const DEFAULT_TASKS: Tasks = { daily_claimed: "" };
function today() { return new Date().toISOString().split("T")[0]; }
function loadTasks(): Tasks { try { const r = localStorage.getItem("ca_tasks"); return r ? JSON.parse(r) : { ...DEFAULT_TASKS }; } catch { return { ...DEFAULT_TASKS }; } }
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
const BIRTH_YEARS = Array.from({ length: CURRENT_YEAR - 1924 - 12 }, (_, i) => CURRENT_YEAR - 13 - i);

// ─── Types ────────────────────────────────────────────────────────────────────
interface User {
  id: string; name: string; username: string; email: string; password: string;
  country: string; state: string; city: string;
  birthYear: number; gender: string; occupation: string;
  profilePicUrl: string; showAge: boolean; bio: string; coins: number;
}
interface SparkPost {
  id: number; userId: string; name: string; username: string;
  profilePicUrl: string; caption: string; mediaUrl: string;
  mediaType: MediaType; reach: Reach;
  reactions: Record<Reaction, number>;
  reactedBy: Record<Reaction, string[]>;
  sparkType: SparkType; journeyId: string; linkedSparkId?: number;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function calcAge(y: number) { return CURRENT_YEAR - y; }
function getJourneyTotal(sparks: SparkPost[], journeyId: string) {
  return sparks.filter(s => s.journeyId === journeyId)
    .reduce((sum, s) => sum + Object.values(s.reactions).reduce((a, b) => a + b, 0), 0);
}
function buildBio(u: Pick<User,"name"|"occupation"|"city"|"state"|"country"|"birthYear"|"showAge">) {
  const age = u.showAge && u.birthYear ? `, ${calcAge(u.birthYear)}` : "";
  const loc = [u.city, u.state, u.country].filter(Boolean).join(", ");
  return `Hi! I am ${u.name}${age} — a ${u.occupation} from ${loc}. 🌍 Ready to show you my spark! ✨`;
}

async function uploadMedia(file: File, folder: string): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "bin";
  const path = `${folder}/${uid()}.${ext}`;
  const { error } = await supabase.storage.from("spark-media").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("spark-media").getPublicUrl(path);
  return data.publicUrl;
}

async function saveProfile(user: User) {
  await supabase.from("profiles").upsert({
    id: user.id, name: user.name, username: user.username, email: user.email,
    password: user.password,
    country: user.country, state: user.state, city: user.city,
    birth_year: user.birthYear, gender: user.gender, occupation: user.occupation,
    profile_pic_url: user.profilePicUrl, show_age: user.showAge,
    bio: user.bio, coins: user.coins,
  });
}

async function fetchProfileByUsername(username: string): Promise<User | null> {
  const { data } = await supabase.from("profiles").select("*").eq("username", username).single();
  if (!data) return null;
  return {
    id: data.id, name: data.name, username: data.username, email: data.email ?? "",
    password: data.password ?? "",
    country: data.country ?? "", state: data.state ?? "", city: data.city ?? "",
    birthYear: data.birth_year ?? 0, gender: data.gender ?? "",
    occupation: data.occupation ?? "", profilePicUrl: data.profile_pic_url ?? "",
    showAge: data.show_age ?? true, bio: data.bio ?? "", coins: data.coins ?? 1000,
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
  });
}

async function fetchSparks(): Promise<SparkPost[]> {
  const { data } = await supabase.from("sparks").select("*").order("created_at", { ascending: false });
  if (!data) return [];
  return data.map(r => ({
    id: r.id, userId: r.user_id, name: r.name, username: r.username,
    profilePicUrl: r.profile_pic_url ?? "", caption: r.caption,
    mediaUrl: r.media_url, mediaType: r.media_type as MediaType,
    reach: r.reach as Reach, reactions: r.reactions,
    reactedBy: r.reacted_by, sparkType: r.spark_type as SparkType,
    journeyId: r.journey_id, linkedSparkId: r.linked_spark_id ?? undefined,
  }));
}

async function updateReactions(sparkId: number, reactions: Record<Reaction,number>, reactedBy: Record<Reaction,string[]>) {
  await supabase.from("sparks").update({ reactions, reacted_by: reactedBy }).eq("id", sparkId);
}

async function updateCoins(userId: string, coins: number) {
  await supabase.from("profiles").update({ coins }).eq("id", userId);
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

// ─── Logo ──────────────────────────────────────────────────────────────────────
function CreateAfricaLogo({ size = 48 }: { size?: number }) {
  return <img src="/logotransparent.png" alt="create.africa" style={{ width: size, height: "auto", display: "inline-block" }} />;
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

// ─── SparkMedia ───────────────────────────────────────────────────────────────
function SparkMedia({ mediaUrl, mediaType, maxH = "500px" }: { mediaUrl: string; mediaType: MediaType; maxH?: string }) {
  if (mediaType === "image") {
    return (
      <Box w="full" overflow="hidden" style={{ maxHeight: maxH }}>
        <img src={mediaUrl} alt="spark" style={{ width:"100%", maxHeight: maxH, objectFit:"cover", display:"block" }} />
      </Box>
    );
  }
  return (
    <AspectRatio ratio={9/16} maxH={maxH}>
      <video src={mediaUrl} controls playsInline style={{ background:"#111", width:"100%", height:"100%", objectFit:"cover" }} />
    </AspectRatio>
  );
}

// ─── FieldLabel ───────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text fontSize="xs" fontWeight="700" color={BROWN} mb={1} textTransform="uppercase" letterSpacing="wide">{children}</Text>;
}

// ─── Great Spark Beyond Modal ─────────────────────────────────────────────────
function GreatBeyondModal({ isOpen, onClose, coins }: { isOpen: boolean; onClose: () => void; coins: number }) {
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
              {[["👋","Invite a friend","+50 tokens"],["🎬","Share your first spark","+20 tokens"],["💪","Encourage 5 sparks","+10 tokens"],["📅","Come back every day","+1 token"]].map(([e,l,r]) => (
                <Flex key={l} w="full" align="center" justify="space-between" px={3} py={2} bg="rgba(255,255,255,0.05)" rounded="xl">
                  <HStack spacing={2}><Text fontSize="sm">{e}</Text><Text fontSize="xs" color="rgba(255,255,255,0.8)" fontWeight="600">{l}</Text></HStack>
                  <Text fontSize="xs" fontWeight="800" color={GOLD}>{r}</Text>
                </Flex>
              ))}
            </VStack>
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

// ─── Sign Up Screen ───────────────────────────────────────────────────────────
type SignUpStep = "welcome" | "about" | "spark" | "preview" | "signin" | "forgotpw";

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
  const [birthYear,setBirthYear]=useState<number|"">("");
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
  const age            = birthYear ? calcAge(birthYear as number) : null;
  const introCaption   = name && effectiveOccup && country
    ? buildBio({ name, occupation: effectiveOccup, city, state: effectiveState, country, birthYear: birthYear as number, showAge: showAge && !!birthYear })
    : "";

  const handleAboutNext = () => {
    if (!name.trim()||!username.trim()||!email.trim()||!birthYear||!gender||!country) { toast({ title:"Please fill in all required fields", status:"warning", duration:2500, isClosable:true }); return; }
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
        birthYear: birthYear as number, gender, occupation: effectiveOccup,
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

  const stepProgress: Record<SignUpStep,number> = { welcome:0, about:33, spark:66, preview:90, signin:0, forgotpw:0 };

  const FormShell = ({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) => (
    <Box minH="100vh" bg={CREAM}>
      <Flex minH="100vh" direction={{ base:"column", lg:"row" }}>
        <Box display={{ base:"none", lg:"flex" }} flex={1} flexDirection="column" justifyContent="center" alignItems="center" px={12}
          style={{ background:`linear-gradient(160deg,${BROWN} 0%,#8B3A0F 60%,${ORANGE} 100%)` }}>
          <VStack spacing={5} maxW="320px" textAlign="center">
            <CreateAfricaLogo size={64} />
            <Heading color="white" fontSize="3xl" fontWeight="900" lineHeight={1.2}>Show your spark.</Heading>
            <Text color="rgba(255,255,255,0.75)" fontSize="md" lineHeight="tall">Africa&apos;s platform for creators. Share your gift, connect with your people.</Text>
            <HStack spacing={6} pt={2}>
              {[["🌍","54+","countries"],["✨","1,000","tokens"],["🔥","Free","forever"]].map(([e,v,l]) => (
                <VStack key={l} spacing={0}><Text fontSize="lg">{e}</Text><Text color="white" fontWeight="900" fontSize="md">{v}</Text><Text color="rgba(255,255,255,0.55)" fontSize="11px">{l}</Text></VStack>
              ))}
            </HStack>
          </VStack>
        </Box>
        <Flex flex={{ base:1, lg:"0 0 520px" }} direction="column" justify="flex-start" align="center" px={{ base:5, sm:10 }} py={8} bg="white" overflowY="auto">
          <Box w="full" maxW="420px">
            <Box display={{ base:"block", lg:"none" }} mb={5} textAlign="center"><CreateAfricaLogo size={52} /></Box>
            {step!=="welcome"&&step!=="signin" && (
              <Box mb={5}>
                <Progress value={stepProgress[step]} size="xs" colorScheme="orange" rounded="full" mb={3} />
                <Text fontSize="xs" color="gray.400" fontWeight="600">Step {step==="about"?1:step==="spark"?2:3} of 3</Text>
              </Box>
            )}
            <Heading size="lg" color={BROWN} fontWeight="900" mb={1}>{title}</Heading>
            {subtitle && <Text fontSize="sm" color="gray.400" mb={5}>{subtitle}</Text>}
            {children}
          </Box>
        </Flex>
      </Flex>
    </Box>
  );

  if (step==="welcome") return (
    <FormShell title="Karibu! Akwaaba!" subtitle="You belong here. Let Africa celebrate you. 🤍">
      <VStack spacing={3} mt={2}>
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={()=>setStep("about")}>Join &amp; Show My Spark</Button>
        <Button w="full" size="lg" variant="outline" borderColor={ORANGE} color={ORANGE} fontWeight="700" rounded="xl" _hover={{ bg:"orange.50" }} onClick={()=>setStep("signin")}>I already have an account</Button>
        <Text textAlign="center" fontSize="11px" color="gray.400" pt={2}>Free to join · Built with love for Africa</Text>
      </VStack>
    </FormShell>
  );

  if (step==="signin") return (
    <FormShell title="Welcome back" subtitle="Your spark never goes out.">
      <VStack spacing={4} mt={2}>
        <Button variant="ghost" color="gray.400" size="xs" alignSelf="flex-start" px={0} _hover={{ color:BROWN }} onClick={()=>setStep("welcome")}>← Back</Button>
        <Box w="full"><FieldLabel>Username</FieldLabel><Input placeholder="e.g. amaracreates" value={signinUsername} onChange={e=>setSigninUsername(e.target.value.toLowerCase().replace(/\s+/g,""))} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></Box>
        <Box w="full">
          <FieldLabel>Password</FieldLabel>
          <Box position="relative">
            <Input type={showSigninPw?"text":"password"} placeholder="Your password" value={signinPassword} onChange={e=>setSigninPassword(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" pr="48px" />
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
    <FormShell title="Reset your password" subtitle="Enter the email you signed up with.">
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
    <FormShell title="Tell us about you" subtitle="All required fields marked · takes under 2 minutes">
      <VStack spacing={4} mt={2}>
        <Button variant="ghost" color="gray.400" size="xs" alignSelf="flex-start" px={0} _hover={{ color:BROWN }} onClick={()=>setStep("welcome")}>← Back</Button>
        <Box w="full"><FieldLabel>Full name *</FieldLabel><Input placeholder="e.g. Amara Osei" value={name} onChange={e=>setName(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></Box>
        <Box w="full"><FieldLabel>Email address *</FieldLabel><Input type="email" placeholder="e.g. amara@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" /></Box>
        <Grid templateColumns="1fr 1fr" gap={3} w="full">
          <GridItem>
            <FieldLabel>Password *</FieldLabel>
            <Box position="relative">
              <Input type={showPw?"text":"password"} placeholder="Min. 6 characters" value={password} onChange={e=>setPassword(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" pr="48px" />
              <Button position="absolute" right={2} top="50%" transform="translateY(-50%)" variant="ghost" size="xs" color="gray.400" onClick={()=>setShowPw(p=>!p)} zIndex={1}>{showPw?"🙈":"👁️"}</Button>
            </Box>
          </GridItem>
          <GridItem>
            <FieldLabel>Confirm password *</FieldLabel>
            <Box position="relative">
              <Input type={showConfirmPw?"text":"password"} placeholder="Repeat password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} size="lg" border="2px solid" borderColor={confirmPw&&confirmPw!==password?"red.300":confirmPw&&confirmPw===password?"green.300":"orange.100"} _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" pr="48px" />
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
        <Grid templateColumns="1fr 1fr" gap={3} w="full">
          <GridItem>
            <FieldLabel>Birth year *</FieldLabel>
            <Select placeholder="Year" value={birthYear} onChange={e=>setBirthYear(e.target.value?Number(e.target.value):"")} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
              {BIRTH_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
            </Select>
            {age && <Text fontSize="xs" color={ORANGE} fontWeight="700" mt={1}>Age: {age}</Text>}
          </GridItem>
          <GridItem>
            <FieldLabel>Gender *</FieldLabel>
            <Select placeholder="Select" value={gender} onChange={e=>setGender(e.target.value)} size="lg" border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50">
              {GENDERS.map(g=><option key={g} value={g}>{g}</option>)}
            </Select>
          </GridItem>
        </Grid>
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
    <FormShell title="Your spark starts here" subtitle="Upload your profile photo — it becomes your first post!">
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
    <FormShell title="Here's your intro! 🎉" subtitle="This is how Africa will meet you. Tap the button below when you're ready!">
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
function UploadForm({ user, sparks, onPost }: {
  user: User; sparks: SparkPost[];
  onPost: (spark: SparkPost) => void;
}) {
  const [caption,      setCaption]      = useState("");
  const [sparkType,    setSparkType]    = useState<SparkType>("new");
  const [linkedSparkId,setLinkedSparkId]= useState<number|undefined>();
  const [mediaFile,    setMediaFile]    = useState<File|null>(null);
  const [mediaPreview, setMediaPreview] = useState<string|null>(null);
  const [mediaType,    setMediaType]    = useState<MediaType>("video");
  const [reach,        setReach]        = useState<Reach>("share");
  const [posting,      setPosting]      = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast   = useToast();
  const { isOpen:beyondOpen, onOpen:openBeyond, onClose:closeBeyond } = useDisclosure();
  const mySparks = sparks.filter(s => s.userId===user.id);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if(!f) return;
    if (!f.type.startsWith("video/")&&!f.type.startsWith("image/")) { toast({ title:"Please select a video or image", status:"warning", duration:3000, isClosable:true }); return; }
    setMediaFile(f); setMediaType(f.type.startsWith("image/")?"image":"video"); setMediaPreview(URL.createObjectURL(f));
  };

  const handleShare = async () => {
    if (!mediaFile) { toast({ title:"Upload a photo or video first!", status:"warning", duration:2500, isClosable:true }); return; }
    setPosting(true);
    try {
      const mediaUrl  = await uploadMedia(mediaFile, "sparks");
      const newId     = Date.now();
      const journeyId = sparkType==="ongoing"&&linkedSparkId ? sparks.find(s=>s.id===linkedSparkId)?.journeyId??String(newId) : String(newId);
      const spark: SparkPost = {
        id: newId, userId: user.id, name: user.name, username: user.username,
        profilePicUrl: user.profilePicUrl, caption: caption.trim()||"Showing my spark!",
        mediaUrl, mediaType, reach,
        reactions:  { Encourage:0, "Say Hi":0, Applaud:0, "Keep Going":0 },
        reactedBy:  { Encourage:[], "Say Hi":[], Applaud:[], "Keep Going":[] },
        sparkType, journeyId, linkedSparkId: sparkType==="ongoing"?linkedSparkId:undefined,
      };
      await saveSpark(spark);
      onPost(spark);
      sendEmail("spark_posted", user.email, user.name, user.username, {
        sparkType: spark.sparkType, reach: spark.reach, caption: spark.caption,
      });
      setMediaFile(null); setMediaPreview(null); setCaption(""); setSparkType("new"); setLinkedSparkId(undefined); setReach("share");
      if (fileRef.current) fileRef.current.value="";
      toast({ title:"Your spark is live! 🔥", description:"Your community can see your spark. Keep shining! 🌍", status:"success", duration:4000, isClosable:true });
    } catch(e) { toast({ title:"Post failed", description:String(e), status:"error", duration:4000, isClosable:true }); }
    setPosting(false);
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
        <Center w="full" minH="100px" border="2px dashed" borderColor="orange.200" rounded="2xl" bg="orange.50" cursor="pointer" _hover={{ bg:"orange.100", borderColor:ORANGE }} transition="all 0.2s" flexDirection="column" gap={2} onClick={()=>fileRef.current?.click()}>
          <UploadIcon />
          <Text fontWeight="700" color={ORANGE} fontSize="sm">Tap to upload a photo or video</Text>
          <Text fontSize="xs" color="gray.400">JPG · PNG · MP4 · MOV</Text>
          <input ref={fileRef} type="file" accept="video/*,image/*" style={{ display:"none" }} onChange={handleFile} />
        </Center>
      ) : (
        <Box w="full" rounded="2xl" overflow="hidden" position="relative">
          {mediaType==="image" ? <img src={mediaPreview} alt="preview" style={{ width:"100%",maxHeight:"260px",objectFit:"cover",borderRadius:"16px" }} /> : <AspectRatio ratio={9/16} maxH="260px"><video src={mediaPreview} controls style={{ borderRadius:"16px",background:"#000" }} /></AspectRatio>}
          <Button size="xs" position="absolute" top={2} right={2} rounded="full" bg="blackAlpha.700" color="white" _hover={{ bg:"red.500" }} onClick={()=>{ setMediaFile(null); setMediaPreview(null); if(fileRef.current) fileRef.current.value=""; }}>✕</Button>
        </Box>
      )}
      <Textarea placeholder="Add a note about this spark…" value={caption} onChange={e=>setCaption(e.target.value)} rows={2} border="2px solid" borderColor="orange.100" _focus={{ borderColor:ORANGE, boxShadow:"none" }} rounded="xl" bg="orange.50" resize="none" />
      <ReachSelector reach={reach} setReach={setReach} onOpenBeyond={openBeyond} />
      <Button w="full" size="lg" bg={reach==="beyond"?GOLD:ORANGE} color="white" fontWeight="900" rounded="xl" _hover={{ opacity:0.9 }} onClick={handleShare} isLoading={posting} loadingText="Sharing…">
        {reach==="beyond" ? "✨ Share to The Great Beyond" : "Share My Spark 🔥"}
      </Button>
      <GreatBeyondModal isOpen={beyondOpen} onClose={closeBeyond} coins={user.coins} />
    </VStack>
  );
}

// ─── Feed Screen ──────────────────────────────────────────────────────────────
function FeedScreen({ user, sparks, setSparks, onShowMySpark }: {
  user: User; sparks: SparkPost[];
  setSparks: React.Dispatch<React.SetStateAction<SparkPost[]>>;
  onShowMySpark: () => void;
}) {
  const [myReactions, setMyReactions] = useState<Record<number,Reaction|null>>({});
  const [prevOpen,    setPrevOpen]    = useState<Record<number,boolean>>({});

  const handleReact = async (sparkId: number, reaction: Reaction) => {
    const prev = myReactions[sparkId];
    if (prev===reaction) return;
    setMyReactions(r=>({ ...r, [sparkId]:reaction }));
    setSparks(posts => posts.map(s => {
      if (s.id!==sparkId) return s;
      const reactions  = { ...s.reactions  };
      const reactedBy  = { ...s.reactedBy  };
      if (prev) { reactions[prev] = Math.max(0,reactions[prev]-1); reactedBy[prev] = reactedBy[prev].filter(u=>u!==user.username); }
      reactions[reaction] += 1; reactedBy[reaction] = [...(reactedBy[reaction]||[]), user.username];
      updateReactions(sparkId, reactions, reactedBy);
      return { ...s, reactions, reactedBy };
    }));
  };

  return (
    <Box>
      <Box display={{ base:"block", xl:"none" }} px={4} pt={4} pb={2}>
        <Button w="full" size="lg" bg={ORANGE} color="white" fontWeight="900" rounded="2xl" _hover={{ bg:"#c44d16" }} shadow="md" onClick={onShowMySpark}>✨ Show Your Spark</Button>
      </Box>
      <Flex align="center" gap={3} px={5} mt={{ base:4, xl:6 }} mb={4}>
        <Box flex={1} h="1px" bg="orange.100" />
        <Text fontSize="10px" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="widest">Community Sparks</Text>
        <Box flex={1} h="1px" bg="orange.100" />
      </Flex>
      {sparks.length===0 && (
        <Center py={16} flexDirection="column" gap={3}>
          <Text fontSize="48px">🌍</Text>
          <Text fontWeight="800" color={BROWN} fontSize="lg">No sparks yet!</Text>
          <Text color="gray.400" fontSize="sm" textAlign="center" px={6}>Be the first to show your spark.</Text>
          <Button mt={2} bg={ORANGE} color="white" fontWeight="800" rounded="xl" _hover={{ bg:"#c44d16" }} onClick={onShowMySpark}>Share My Spark</Button>
        </Center>
      )}
      <VStack spacing={5} px={4} pb={8}>
        <AnimatePresence>
          {sparks.map(s => {
            const jt = getJourneyTotal(sparks, s.journeyId);
            const linked = s.linkedSparkId ? sparks.find(p=>p.id===s.linkedSparkId) : null;
            return (
              <MotionBox key={s.id} initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, scale:0.95 }} transition={{ duration:0.3 }} w="full" bg="white" rounded="2xl" shadow="md" overflow="hidden">
                <Box h="4px" bg={s.reach==="beyond"?GOLD:ORANGE} />
                <Flex px={4} pt={4} pb={2} align="center" gap={3}>
                  <UserAvatar user={{ name:s.name, profilePicUrl:s.profilePicUrl }} size="md" />
                  <Box flex={1}><Text fontWeight="900" color={BROWN}>{s.name}</Text><Text fontSize="11px" color="gray.400">@{s.username}</Text></Box>
                  <HStack spacing={2} flexWrap="wrap" justify="flex-end">
                    <Text fontSize="xs" fontWeight="700" color={s.sparkType==="new"?ORANGE:BROWN} bg={s.sparkType==="new"?"orange.50":"gray.100"} px={2} py={0.5} rounded="full">
                      {s.sparkType==="new"?"New Spark":"Ongoing Spark"}
                    </Text>
                    {s.reach==="beyond" && <Text fontSize="xs" fontWeight="800" color="white" bg={BROWN} px={2} py={0.5} rounded="full">✨ Great Beyond</Text>}
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
                <Flex px={4} pb={5} pt={3} gap={2} flexWrap="wrap">
                  {REACTIONS.map(({ label, emoji }) => {
                    const active = myReactions[s.id]===label;
                    return (
                      <Button key={label} size="sm" rounded="full" bg={active?ORANGE:"orange.50"} color={active?"white":BROWN} border="1.5px solid" borderColor={active?ORANGE:"orange.200"} fontWeight="700" fontSize="xs" px={3} _hover={{ bg:active?"#c44d16":"orange.100" }} transition="all 0.15s" onClick={()=>handleReact(s.id,label)}>
                        {emoji} {label}{s.reactions[label]>0 && <Text as="span" ml={1.5} fontWeight="900">{s.reactions[label]}</Text>}
                      </Button>
                    );
                  })}
                </Flex>
              </MotionBox>
            );
          })}
        </AnimatePresence>
      </VStack>
    </Box>
  );
}

// ─── My Spark Screen ──────────────────────────────────────────────────────────
function MySparkScreen({ user, sparks, onPost }: { user: User; sparks: SparkPost[]; onPost: (spark: SparkPost) => void }) {
  const mySparks = sparks.filter(s=>s.userId===user.id);
  return (
    <Box pb={8}>
      {mySparks.length===0 && (
        <Box mx={4} mt={5} bg={ORANGE} rounded="2xl" px={4} py={4}>
          <Text fontWeight="800" color="white" fontSize="sm" mb={1}>👋 Keep shining!</Text>
          <Text fontSize="xs" color="rgba(255,255,255,0.9)" lineHeight="tall">Share your next spark below. Keep videos under 15 seconds and let Africa see you! 🤍</Text>
        </Box>
      )}
      <Box mx={4} mt={4} bg="white" rounded="2xl" shadow="md" overflow="hidden">
        <Box h="4px" bg={ORANGE}/><Box p={5}><UploadForm user={user} sparks={sparks} onPost={onPost} /></Box>
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
              return (
                <Box key={s.id} w="full" bg="white" rounded="2xl" shadow="sm" overflow="hidden" border="1px solid" borderColor="orange.100">
                  <Box h="3px" bg={s.reach==="beyond"?GOLD:ORANGE}/>
                  <Box p={4}>
                    <Flex justify="space-between" align="center" mb={3}>
                      <HStack spacing={2}>
                        <Text fontSize="xs" fontWeight="700" color={s.sparkType==="new"?ORANGE:BROWN} bg={s.sparkType==="new"?"orange.50":"gray.100"} px={2} py={0.5} rounded="full">{s.sparkType==="new"?"New Spark":"Ongoing Spark"}</Text>
                        {s.reach==="beyond" && <Text fontSize="xs" fontWeight="800" color="white" bg={BROWN} px={2} py={0.5} rounded="full">✨ Great Beyond</Text>}
                      </HStack>
                      <Text fontSize="xs" color="gray.400">{jt>0?`${jt} reactions`:"0 reactions"}</Text>
                    </Flex>
                    <SparkMedia mediaUrl={s.mediaUrl} mediaType={s.mediaType} maxH="220px"/>
                    <Text fontSize="sm" color="gray.700" fontWeight="500" mt={3}>{s.caption}</Text>
                  </Box>
                </Box>
              );
            })}
          </VStack>
        </>
      )}
    </Box>
  );
}

// ─── Chats Screen ─────────────────────────────────────────────────────────────
function ChatsScreen({ user, sparks, onOpenTokens, onEdit, onLogout }: {
  user: User; sparks: SparkPost[];
  onOpenTokens: () => void; onEdit: () => void; onLogout: () => void;
}) {
  const mySparks   = sparks.filter(s=>s.userId===user.id);
  const totalReactions = mySparks.reduce((sum,s)=>sum+Object.values(s.reactions).reduce((a,b)=>a+b,0),0);
  const hiConnects = sparks
    .filter(s=>s.userId!==user.id && s.reactedBy["Say Hi"]?.includes(user.username))
    .map(s=>({ name:s.name, username:s.username, profilePicUrl:s.profilePicUrl }))
    .filter((v,i,arr)=>arr.findIndex(x=>x.username===v.username)===i);
  const age = user.birthYear ? calcAge(user.birthYear) : null;

  return (
    <Box pb={8}>
      {/* ── Spark Passport ── */}
      <Box mx={{ base:0, md:4 }} mt={{ base:0, md:4 }}>
        <Box rounded={{ base:0, md:"2xl" }} overflow="hidden" shadow={{ base:"none", md:"md" }}
          style={{ background:`linear-gradient(145deg,${BROWN} 0%,#8B3A0F 55%,${ORANGE} 100%)` }}>
          {/* Passport header */}
          <Flex px={{ base:5, md:6 }} pt={6} pb={4} align="flex-start" gap={4}>
            <Box position="relative">
              <Box w={{ base:"72px", md:"88px" }} h={{ base:"72px", md:"88px" }} rounded="2xl" overflow="hidden" border="3px solid rgba(255,255,255,0.4)" flexShrink={0}>
                {user.profilePicUrl ? <img src={user.profilePicUrl} alt={user.name} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : <Avatar name={user.name} size="xl" bg="white" color={ORANGE} fontWeight="900" w="100%" h="100%" rounded="none" />}
              </Box>
              <Box position="absolute" bottom={-1} right={-1} bg={GOLD} rounded="full" w="20px" h="20px" display="flex" alignItems="center" justifyContent="center">
                <Text fontSize="10px">✨</Text>
              </Box>
            </Box>
            <Box flex={1}>
              <HStack spacing={2} mb={1}>
                <Text fontSize="10px" fontWeight="800" color="rgba(255,255,255,0.5)" textTransform="uppercase" letterSpacing="widest">Spark Passport</Text>
              </HStack>
              <Text fontWeight="900" color="white" fontSize={{ base:"xl", md:"2xl" }} lineHeight={1.1}>{user.name}</Text>
              <Text color="rgba(255,255,255,0.7)" fontSize="sm">@{user.username}</Text>
              {user.bio && <Text fontSize="xs" color="rgba(255,255,255,0.8)" mt={1} lineHeight="tall" noOfLines={2}>{user.bio}</Text>}
            </Box>
          </Flex>

          {/* Passport details grid */}
          <Box px={{ base:5, md:6 }} pb={4}>
            <Grid templateColumns="1fr 1fr" gap={2}>
              {[
                ["🌍 Location", [user.city, user.state, user.country].filter(Boolean).join(", ") || "—"],
                ["💼 Occupation", user.occupation || "—"],
                ["🎂 Age", age ? `${age}${user.showAge ? "" : " (private)"}` : "—"],
                ["⚧ Gender", user.gender || "—"],
              ].map(([label, value]) => (
                <Box key={label} bg="rgba(255,255,255,0.1)" rounded="xl" px={3} py={2}>
                  <Text fontSize="10px" color="rgba(255,255,255,0.5)" fontWeight="700">{label}</Text>
                  <Text fontSize="xs" color="white" fontWeight="700" noOfLines={1}>{value}</Text>
                </Box>
              ))}
            </Grid>
          </Box>

          {/* Great Beyond badge */}
          <Box mx={{ base:5, md:6 }} mb={4} px={4} py={3} rounded="xl"
            style={{ background:"linear-gradient(135deg,#1A0800 0%,#3D1200 100%)", border:`1.5px solid ${GOLD}`, boxShadow:`0 0 12px ${GOLD}44` }}>
            <HStack spacing={2}>
              <Text fontSize="16px" style={{ filter:"drop-shadow(0 0 5px gold)" }}>✨</Text>
              <Box flex={1}><Text fontSize="xs" fontWeight="900" color={GOLD}>Member of the Great Spark Beyond</Text><Text fontSize="10px" color="rgba(255,255,255,0.6)">You are one of the true souls of Africa. 🤍</Text></Box>
            </HStack>
          </Box>

          {/* Stats row */}
          <HStack px={{ base:5, md:6 }} pb={5} spacing={2}>
            {[["Sparks",mySparks.length,"🎬"],["Reactions",totalReactions,"💪"],["Hi Connects",hiConnects.length,"👋"]].map(([l,v,e]) => (
              <Box key={l as string} textAlign="center" bg="rgba(255,255,255,0.12)" rounded="xl" px={3} py={2} flex={1}>
                <Text fontSize="14px">{e}</Text><Text fontWeight="900" color="white" fontSize="lg">{v}</Text><Text fontSize="9px" color="rgba(255,255,255,0.7)">{l}</Text>
              </Box>
            ))}
            <Box as="button" textAlign="center" bg="#FFFBF0" rounded="xl" px={3} py={2} flex={1} onClick={onOpenTokens}>
              <TokenIcon size={14} /><Text fontWeight="900" color={BROWN} fontSize="lg">{user.coins}</Text><Text fontSize="9px" color={BROWN}>Tokens</Text>
            </Box>
          </HStack>

          {/* Action buttons */}
          <Flex px={{ base:5, md:6 }} pb={5} gap={2}>
            <Button flex={1} size="sm" bg="rgba(255,255,255,0.15)" color="white" rounded="xl" fontWeight="700" border="1px solid rgba(255,255,255,0.25)" _hover={{ bg:"rgba(255,255,255,0.25)" }} onClick={onEdit}>✏️ Edit Profile</Button>
            <Button flex={1} size="sm" bg="rgba(255,0,0,0.15)" color="red.200" rounded="xl" fontWeight="700" border="1px solid rgba(255,100,100,0.3)" _hover={{ bg:"rgba(255,0,0,0.25)" }} onClick={onLogout}>🚪 Log Out</Button>
          </Flex>
        </Box>
      </Box>

      {/* Hi Connects */}
      <Box px={4} mt={6}>
        <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide" mb={3}>Hi Connects</Text>
        {hiConnects.length===0 ? (
          <Center py={10} flexDirection="column" gap={3}>
            <Text fontSize="40px">👋</Text>
            <Text fontWeight="800" color={BROWN}>No Hi Connects yet</Text>
            <Text fontSize="sm" color="gray.400" textAlign="center">When someone says hi to your spark, they appear here!</Text>
          </Center>
        ) : (
          <VStack spacing={3}>
            <Box w="full" bg="orange.50" rounded="xl" px={4} py={3} border="1px solid" borderColor="orange.100">
              <Text fontSize="xs" color={BROWN} fontWeight="700">👋 These people said hi to your sparks — connect with them!</Text>
            </Box>
            {hiConnects.map(c=>(
              <Flex key={c.username} w="full" align="center" gap={3} bg="white" rounded="xl" px={4} py={3} shadow="sm" border="1px solid" borderColor="orange.100">
                <UserAvatar user={c} size="md" />
                <Box flex={1}><Text fontWeight="800" color={BROWN}>{c.name}</Text><Text fontSize="xs" color="gray.400">@{c.username} · Said hi to your spark 👋</Text></Box>
                <Button size="sm" bg={ORANGE} color="white" rounded="full" fontWeight="700" _hover={{ bg:"#c44d16" }}>Say Hi Back</Button>
              </Flex>
            ))}
          </VStack>
        )}
      </Box>
    </Box>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function HomeClient() {
  const [user,   setUser]   = useState<User|null>(null);
  const [view,   setView]   = useState<View>("feed");
  const [sparks, setSparks] = useState<SparkPost[]>([]);
  const [loading,setLoading]= useState(true);
  const [tasks,  setTasks]  = useState<Tasks>(DEFAULT_TASKS);
  const { isOpen:tokensOpen,  onOpen:openTokens,  onClose:closeTokens  } = useDisclosure();
  const { isOpen:inviteOpen,  onOpen:openInvite,  onClose:closeInvite  } = useDisclosure();
  const { isOpen:editOpen,    onOpen:openEdit,    onClose:closeEdit    } = useDisclosure();
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
      if (raw) setUser(JSON.parse(raw));
      setTasks(loadTasks());
      await loadSparks();
      setLoading(false);
    })();
  }, [loadSparks]);

  // Realtime subscription for sparks
  useEffect(() => {
    const channel = supabase
      .channel("sparks-realtime")
      .on("postgres_changes", { event:"*", schema:"public", table:"sparks" }, () => { loadSparks(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSparks]);

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
      <Center minH="100vh" bg={CREAM} flexDirection="column" gap={4}>
        <CreateAfricaLogo size={64} />
        <Spinner color={ORANGE} size="lg" />
        <Text fontSize="sm" color="gray.400" fontWeight="600">Loading your sparks…</Text>
      </Center>
    </ChakraProvider>
  );

  if (!user) return (
    <ChakraProvider theme={theme}>
      <SignUpScreen onDone={handleSignUpDone} />
    </ChakraProvider>
  );

  const hiConnectCount = sparks.filter(s=>s.userId!==user.id && s.reactedBy["Say Hi"]?.includes(user.username)).length;
  const NAV_ITEMS: { id:View; emoji:string; label:string; badge?:number }[] = [
    { id:"feed",   emoji:"🏠", label:"Spark Feed" },
    { id:"mypark", emoji:"✨", label:"My Spark"   },
    { id:"chats",  emoji:"💬", label:"Hi & Chats", badge:hiConnectCount||undefined },
  ];

  const MainContent = () => (
    <>
      {view==="feed"   && <FeedScreen   user={user} sparks={sparks} setSparks={setSparks} onShowMySpark={()=>setView("mypark")} />}
      {view==="mypark" && <MySparkScreen user={user} sparks={sparks} onPost={handlePost} />}
      {view==="chats"  && <ChatsScreen  user={user} sparks={sparks} onOpenTokens={openTokens} onEdit={openEdit} onLogout={handleLogout} />}
    </>
  );

  return (
    <ChakraProvider theme={theme}>
      <Box bg={CREAM} minH="100vh">

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
                      fontWeight={view===item.id?"800":"600"} fontSize="sm" _hover={{ bg:"orange.50", color:ORANGE }} onClick={()=>setView(item.id)}>
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
                    {user.coins.toLocaleString()} tokens
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
              <Box maxW="640px" mx="auto"><MainContent /></Box>
            </GridItem>

            {/* Right sidebar */}
            <GridItem display={{ lg:"none", xl:"block" }}>
              <Box position="sticky" top={0} h="100vh" overflowY="auto" py={6} px={4} borderLeft="1px solid" borderColor="orange.100">
                {view==="feed" ? (
                  <VStack spacing={4} align="stretch">
                    <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide">Show Your Spark</Text>
                    <Box bg="white" rounded="2xl" shadow="sm" overflow="hidden" border="1px solid" borderColor="orange.100">
                      <Box h="3px" bg={ORANGE}/><Box p={4}><UploadForm user={user} sparks={sparks} onPost={handlePost} /></Box>
                    </Box>
                  </VStack>
                ) : view==="mypark" ? (
                  <VStack spacing={4} align="stretch">
                    <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide">Your Stats</Text>
                    <Box bg="white" rounded="2xl" p={4} shadow="sm" border="1px solid" borderColor="orange.100">
                      <VStack spacing={3}>
                        {[["Sparks", sparks.filter(s=>s.userId===user.id).length], ["Total reactions", sparks.filter(s=>s.userId===user.id).reduce((sum,s)=>sum+Object.values(s.reactions).reduce((a,b)=>a+b,0),0)], ["Hi Connects", hiConnectCount]].map(([l,v]) => (
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
              {user.coins} tokens
            </Button>
          </Flex>
          <Box pb={24}><MainContent />
            <Text fontSize="10px" color="gray.300" textAlign="center" pb={4}>Powered by DotXan Tech</Text>
          </Box>
          <Box position="fixed" bottom={0} left={0} right={0} bg="white" borderTop="1px solid" borderColor="orange.100" zIndex={20} shadow="0 -2px 10px rgba(0,0,0,0.06)">
            <HStack spacing={0} maxW="600px" mx="auto">
              {NAV_ITEMS.map(item=>(
                <Button key={item.id} flex={1} variant="ghost" rounded={0} py={5} flexDirection="column" gap={0.5}
                  color={view===item.id?ORANGE:"gray.400"} bg={view===item.id?"orange.50":"transparent"}
                  _hover={{ bg:"orange.50" }} onClick={()=>setView(item.id)} position="relative">
                  <Text fontSize="18px">{item.emoji}</Text>
                  <Text fontSize="9px" fontWeight={view===item.id?"800":"600"}>{item.label}</Text>
                  {item.badge ? <Badge position="absolute" top="6px" right="calc(50% - 20px)" bg={ORANGE} color="white" rounded="full" fontSize="9px" minW="16px" textAlign="center">{item.badge}</Badge> : null}
                </Button>
              ))}
            </HStack>
          </Box>
        </Box>

        <GreatBeyondModal isOpen={tokensOpen} onClose={closeTokens} coins={user.coins} />
        <InviteModal     isOpen={inviteOpen} onClose={closeInvite} user={user} />
        <EditProfileModal isOpen={editOpen} onClose={closeEdit} user={user} onSave={handleEditSave} />
      </Box>
    </ChakraProvider>
  );
}
