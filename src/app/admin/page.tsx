"use client";

/*
  ── SUPABASE MIGRATION (run once in SQL editor) ──────────────────────────────
  alter table sparks add column if not exists target_country text default '';
  alter table sparks add column if not exists target_state   text default '';
  alter table sparks add column if not exists broadcast_freq_type text default '';
  alter table sparks add column if not exists broadcast_freq_value integer default 0;
  alter table sparks add column if not exists broadcast_max_per_day integer default 0;
  alter table sparks add column if not exists broadcast_expires_at timestamptz;

  -- Messages table (required for chat to work)
  create table if not exists messages (
    id bigserial primary key,
    from_username text not null,
    to_username   text not null,
    content       text not null,
    read          boolean default false,
    created_at    timestamptz default now()
  );
  alter table messages disable row level security;

  -- Storage bucket for media uploads (required for uploads to work)
  insert into storage.buckets (id, name, public)
    values ('spark-media', 'spark-media', true) on conflict do nothing;
  drop policy if exists "Public read" on storage.objects;
  create policy "Public read"  on storage.objects for select using (bucket_id = 'spark-media');
  drop policy if exists "Anon upload" on storage.objects;
  create policy "Anon upload"  on storage.objects for insert with check (bucket_id = 'spark-media');
  drop policy if exists "Anon update" on storage.objects;
  create policy "Anon update"  on storage.objects for update using (bucket_id = 'spark-media');
  drop policy if exists "Anon delete" on storage.objects;
  create policy "Anon delete"  on storage.objects for delete using (bucket_id = 'spark-media');

  create table if not exists analytics_events (
    id bigserial primary key,
    event_type text not null,
    user_id text default '', username text default '',
    country text default '', state text default '', city text default '',
    metadata jsonb default '{}',
    created_at timestamptz default now()
  );
  alter table analytics_events disable row level security;
  create index if not exists idx_analytics_created on analytics_events(created_at desc);

  create table if not exists reports (
    id bigserial primary key,
    from_username text not null,
    user_id text default '',
    subject text default '',
    body text not null,
    status text default 'open',
    admin_reply text default '',
    created_at timestamptz default now(),
    replied_at timestamptz
  );
  alter table reports disable row level security;
  ─────────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_PASSWORD = (process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "icreate2024admin").trim();
const ADMIN_USER_ID  = "icreate-admin";
const ADMIN_USERNAME = "icreate.africa";
const ADMIN_NAME     = "icreate.africa";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  id: string; name: string; username: string; country: string; state: string;
  city: string; gender: string; occupation: string; coins: number;
  profile_pic_url: string; bio: string; created_at: string;
}

interface Spark {
  id: number; user_id: string; name: string; username: string;
  caption: string; media_url: string; media_type: string;
  reach: string; spark_type: string; journey_id: string; linked_spark_id?: number | null;
  reactions: Record<string, number>;
  target_country: string; target_state: string;
  broadcast_freq_type?: string;
  broadcast_freq_value?: number;
  broadcast_max_per_day?: number;
  broadcast_expires_at?: string;
  created_at: string;
}

interface Message {
  id: number; from_username: string; to_username: string;
  content: string; read: boolean; created_at: string;
}

interface Report {
  id: number; from_username: string; user_id: string;
  subject: string; body: string; status: string;
  admin_reply: string; created_at: string; replied_at?: string;
}

interface AnalyticsEvent {
  id: number; event_type: string; user_id: string; username: string;
  country: string; state: string; city: string;
  metadata: Record<string, unknown>; created_at: string;
}

type Tab = "overview" | "analytics" | "broadcast" | "users" | "sparks" | "messages" | "reports";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function fmtShort(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
}
function totalReactions(reactions: Record<string, number>) {
  return Object.values(reactions ?? {}).reduce((a, b) => a + b, 0);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, onClick, active }: { label: string; value: string | number; sub?: string; color: string; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} style={{ background:"white", borderRadius:16, padding:"20px 24px", border:`3px solid ${active ? color : color}`, flex:1, minWidth:140, cursor: onClick ? "pointer" : "default", boxShadow: active ? `0 4px 20px ${color}33` : "none", transition:"box-shadow 0.2s", position:"relative" }}>
      <div style={{ fontSize:28, fontWeight:900, color }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div style={{ fontSize:13, fontWeight:700, color:"#333", marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{sub}</div>}
      {onClick && <div style={{ position:"absolute", top:10, right:12, fontSize:10, color:"#ccc", fontWeight:700 }}>▼</div>}
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed]         = useState(false);
  const [pw, setPw]                 = useState("");
  const [tab, setTab]               = useState<Tab>("overview");
  const [users, setUsers]           = useState<Profile[]>([]);
  const [sparks, setSparks]         = useState<Spark[]>([]);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [reports, setReports]       = useState<Report[]>([]);
  const [events, setEvents]         = useState<AnalyticsEvent[]>([]);
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(false);

  // Broadcast form state
  const [bcMode,          setBcMode]          = useState<"direct"|"scheduled">("direct");
  const [bcCaption,       setBcCaption]       = useState("");
  const [bcMediaUrl,      setBcMediaUrl]      = useState("");
  const [bcMediaType,     setBcMediaType]     = useState<"image"|"video">("image");
  const [bcReach,         setBcReach]         = useState<"share"|"beyond">("beyond");
  const [bcCountry,       setBcCountry]       = useState("");
  const [bcState,         setBcState]         = useState("");
  const [bcFreqType,      setBcFreqType]      = useState<"time"|"posts">("posts");
  const [bcFreqValue,     setBcFreqValue]     = useState(20);
  const [bcMaxPerDay,     setBcMaxPerDay]     = useState(3);
  const [bcDurationDays,  setBcDurationDays]  = useState(7);
  const [bcSparkType,     setBcSparkType]     = useState<"new"|"ongoing">("new");
  const [bcLinkedSparkId, setBcLinkedSparkId] = useState<number|null>(null);
  const [bcPosting,       setBcPosting]       = useState(false);
  const [bcUploading,     setBcUploading]     = useState(false);
  const [bcUploadPct,     setBcUploadPct]     = useState(0);
  const [bcMsg,           setBcMsg]           = useState("");
  const [boostMsg,        setBoostMsg]        = useState<Record<number,string>>({});
  const [boostSearch,     setBoostSearch]     = useState("");
  const fileInputRef                          = useRef<HTMLInputElement>(null);

  // Insight panel state
  const [insightPanel, setInsightPanel] = useState<"users"|"sparks"|"reactions"|"messages"|"countries"|null>(null);
  const togglePanel = (p: typeof insightPanel) => setInsightPanel(prev => prev === p ? null : p);

  // Coin economy state
  const [coinValueNGN,    setCoinValueNGN]    = useState<number>(() => {
    try { return Number(localStorage.getItem("ca_coin_ngn") ?? "10"); } catch { return 10; }
  });
  const [coinValueEdit,   setCoinValueEdit]   = useState<string>("");
  const [coinPanelOpen,   setCoinPanelOpen]   = useState(false);

  // Edit state
  const [editId,      setEditId]      = useState<number|null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editSaving,  setEditSaving]  = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number|null>(null);

  // Reports
  const [replyId,   setReplyId]   = useState<number|null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: u }, { data: s }, { data: m }, { data: e }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("sparks").select("*").order("created_at", { ascending: false }),
      supabase.from("messages").select("*").order("created_at", { ascending: false }),
      supabase.from("analytics_events").select("*").order("created_at", { ascending: false }).limit(5000),
      supabase.from("reports").select("*").order("created_at", { ascending: false }),
    ]);
    if (u) setUsers(u as Profile[]);
    if (s) setSparks(s as Spark[]);
    if (m) setMessages(m as Message[]);
    if (e) setEvents(e as AnalyticsEvent[]);
    if (r) setReports(r as Report[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadAll();
    const channel = supabase.channel("admin-rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, loadAll)
      .on("postgres_changes", { event:"*", schema:"public", table:"sparks" }, loadAll)
      .on("postgres_changes", { event:"*", schema:"public", table:"messages" }, loadAll)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"analytics_events" }, payload => {
        setEvents(prev => [payload.new as AnalyticsEvent, ...prev].slice(0, 2000));
      })
      .subscribe();
    // Poll every 15s as fallback (realtime requires Supabase Publications setup)
    const poll = setInterval(loadAll, 15000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [authed, loadAll]);

  // ── Login ────────────────────────────────────────────────────────────────────
  if (!authed) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#FFF8F0,#FFE4CC)" }}>
      <div style={{ background:"white", borderRadius:20, padding:40, width:340, boxShadow:"0 8px 40px rgba(0,0,0,0.12)", border:"2px solid #E86A2E" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:40 }}>🌍</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#2D1200" }}>icreate.africa</div>
          <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Admin Dashboard</div>
        </div>
        <input type="password" placeholder="Admin password" value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && pw === ADMIN_PASSWORD) setAuthed(true); }}
          style={{ width:"100%", padding:"12px 16px", borderRadius:12, border:"2px solid #FFD0B0", fontSize:15, outline:"none", boxSizing:"border-box" }}
        />
        <button onClick={() => { if (pw === ADMIN_PASSWORD) setAuthed(true); else alert("Wrong password"); }}
          style={{ width:"100%", marginTop:12, padding:"12px 0", borderRadius:12, background:"#E86A2E", color:"white", fontWeight:800, fontSize:15, border:"none", cursor:"pointer" }}>
          Enter Dashboard →
        </button>
      </div>
    </div>
  );

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalRx   = sparks.reduce((a, s) => a + totalReactions(s.reactions ?? {}), 0);
  const countries = [...new Set(users.map(u => u.country).filter(Boolean))].length;
  const todayStr  = new Date().toISOString().split("T")[0];
  const newToday  = users.filter(u => u.created_at?.startsWith(todayStr)).length;
  const adminSparks = sparks.filter(s => s.user_id === ADMIN_USER_ID);

  const q = search.toLowerCase();
  const filteredUsers    = users.filter(u => !q || u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.country?.toLowerCase().includes(q));
  const filteredSparks   = sparks.filter(s => !q || s.username?.toLowerCase().includes(q) || s.caption?.toLowerCase().includes(q));
  const filteredMessages = messages.filter(m => !q || m.from_username?.toLowerCase().includes(q) || m.to_username?.toLowerCase().includes(q) || m.content?.toLowerCase().includes(q));

  const allCountries = [...new Set(users.map(u => u.country).filter(Boolean))].sort();
  const allStates    = bcCountry
    ? [...new Set(users.filter(u => u.country === bcCountry).map(u => u.state).filter(Boolean))].sort()
    : [];

  // ── Analytics helpers ────────────────────────────────────────────────────────
  const todayISO = new Date().toISOString().split("T")[0];
  const visits        = events.filter(e => e.event_type === "visit");
  const visitsToday   = events.filter(e => e.event_type === "visit" && e.created_at?.startsWith(todayISO));
  const uniqueToday   = new Set(visitsToday.map(e => e.user_id)).size;
  const coinsToday    = events.filter(e => e.event_type === "coin_earned" && e.created_at?.startsWith(todayISO))
    .reduce((sum, e) => sum + ((e.metadata?.amount as number) ?? 0), 0);
  const sparksToday   = sparks.filter(s => s.created_at?.startsWith(todayISO) && s.user_id !== ADMIN_USER_ID).length;
  const msgsToday     = messages.filter(m => m.created_at?.startsWith(todayISO)).length;

  // ── Coin economy helpers ─────────────────────────────────────────────────────
  const totalPlatformCoins  = users.reduce((s, u) => s + (u.coins ?? 0), 0);
  const signupCoins         = users.length * 1000;
  const taskEarnedCoins     = events.filter(e => e.event_type === "coin_earned")
    .reduce((s, e) => s + ((e.metadata?.amount as number) ?? 0), 0);  // milestones / tasks
  const paidCoins           = 0; // payment system not yet live — reserved for future
  const totalNGN            = totalPlatformCoins * coinValueNGN;
  const USD_RATE = 1600; const GBP_RATE = 2050; const EUR_RATE = 1750; const KES_RATE = 12.5; const GHS_RATE = 0.045;
  const fmtCurrency = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const countryBreakdown = Object.entries(
    visits.reduce<Record<string,number>>((acc,e) => { if(e.country){ acc[e.country]=(acc[e.country]??0)+1; } return acc; }, {})
  ).sort((a,b)=>b[1]-a[1]).slice(0,10);

  const stateBreakdown = Object.entries(
    visits.reduce<Record<string,number>>((acc,e) => { if(e.state){ acc[e.state]=(acc[e.state]??0)+1; } return acc; }, {})
  ).sort((a,b)=>b[1]-a[1]).slice(0,8);

  const activityBreakdown = Object.entries(
    events.filter(e=>e.event_type==="view").reduce<Record<string,number>>((acc,e) => { const t=(e.metadata?.tab as string)||"?"; acc[t]=(acc[t]??0)+1; return acc; }, {})
  ).sort((a,b)=>b[1]-a[1]);

  const dailyVisits = Array.from({length:7},(_,i)=>{
    const d = new Date(Date.now()-i*86400000).toISOString().split("T")[0];
    return { date:d.slice(5), count: visits.filter(e=>e.created_at?.startsWith(d)).length };
  }).reverse();

  const maxVisits = Math.max(...dailyVisits.map(d=>d.count), 1);
  const maxCountry = Math.max(...countryBreakdown.map(([,c])=>c), 1);
  const maxState   = Math.max(...stateBreakdown.map(([,c])=>c), 1);
  const maxActivity = Math.max(...activityBreakdown.map(([,c])=>c), 1);
  const liveFeed   = events.slice(0, 20);

  // ── Image compression ────────────────────────────────────────────────────────
  const compressImage = (file: File): Promise<File> =>
    new Promise((resolve) => {
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

  // ── File upload ──────────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (file.type.startsWith("video/") && file.size > 150 * 1024 * 1024) {
      setBcMsg("⚠️ Video is over 80MB — upload may be slow. Consider compressing it first.");
    } else { setBcMsg(""); }
    setBcUploading(true); setBcUploadPct(0);
    const toUpload = file.type.startsWith("image/") ? await compressImage(file) : file;
    const ext  = (toUpload.name.split(".").pop() ?? "bin").toLowerCase();
    const path = `broadcasts/${Date.now()}.${ext}`;

    // Simulate progress
    let simPct = 0;
    const estMs = file.type.startsWith("video/") ? Math.max(3000, toUpload.size / 50000) : 1500;
    const ticker = setInterval(() => {
      simPct = Math.min(simPct + (90 / (estMs / 200)), 90);
      setBcUploadPct(Math.round(simPct));
    }, 200);

    try {
      const { error } = await supabase.storage.from("spark-media").upload(path, toUpload, {
        upsert: true,
        contentType: toUpload.type || "application/octet-stream",
      });
      if (error) throw new Error(error.message);
      const { data: pub } = supabase.storage.from("spark-media").getPublicUrl(path);
      setBcMediaUrl(pub.publicUrl);
      setBcMediaType(file.type.startsWith("video") ? "video" : "image");
      setBcUploadPct(100);
    } catch (e) {
      setBcMsg("Upload failed: " + String(e));
    } finally {
      clearInterval(ticker);
    }
    setBcUploading(false); setBcUploadPct(0);
  };

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id:"overview",   label:"Overview",                         emoji:"📊" },
    { id:"analytics",  label:"Control Room",                     emoji:"🎯" },
    { id:"broadcast",  label:`Broadcast (${adminSparks.length})`,emoji:"📢" },
    { id:"users",      label:`Users (${users.length})`,          emoji:"👥" },
    { id:"sparks",     label:`Sparks (${sparks.length})`,        emoji:"✨" },
    { id:"messages",   label:`Messages (${messages.length})`,    emoji:"💬" },
    { id:"reports",    label:`Reports (${reports.filter(r=>r.status==="open").length} open)`, emoji:"🚨" },
  ];

  // ── Broadcast: post ─────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!bcCaption.trim() || !bcMediaUrl.trim()) { setBcMsg("Caption and media are required."); return; }
    setBcPosting(true); setBcMsg("");
    const id = Date.now();
    const { error } = await supabase.from("sparks").insert({
      id,
      user_id:         ADMIN_USER_ID,
      name:            ADMIN_NAME,
      username:        ADMIN_USERNAME,
      profile_pic_url: "/images/logo.jpg",
      caption:         bcCaption.trim(),
      media_url:       bcMediaUrl.trim(),
      media_type:      bcMediaType,
      reach:           bcReach,
      spark_type:      bcSparkType,
      journey_id:      bcSparkType === "ongoing" && bcLinkedSparkId
        ? (adminSparks.find(s => s.id === bcLinkedSparkId)?.journey_id ?? `admin_${id}`)
        : `admin_${id}`,
      linked_spark_id: bcSparkType === "ongoing" ? bcLinkedSparkId : null,
      reactions:       { Encourage:0, "Say Hi":0, Applaud:0, "Keep Going":0 },
      reacted_by:      { Encourage:[], "Say Hi":[], Applaud:[], "Keep Going":[] },
      target_country:  bcReach === "beyond" ? "" : bcCountry,
      target_state:    bcReach === "beyond" ? "" : bcState,
      broadcast_freq_type:   bcMode === "direct" ? "pinned" : bcFreqType,
      broadcast_freq_value:  bcMode === "direct" ? 0 : bcFreqValue,
      broadcast_max_per_day: bcMode === "direct" ? 0 : bcMaxPerDay,
      broadcast_expires_at:  bcMode === "direct" ? null : (bcDurationDays > 0
        ? new Date(Date.now() + bcDurationDays * 86400000).toISOString()
        : null),
    });
    setBcPosting(false);
    if (error) { setBcMsg("Error: " + error.message); }
    else {
      setBcMsg("✅ Broadcast posted successfully!");
      setBcCaption(""); setBcMediaUrl(""); setBcCountry(""); setBcState("");
      setBcFreqType("posts"); setBcFreqValue(20); setBcMaxPerDay(3); setBcDurationDays(7);
      setBcReach("beyond"); setBcSparkType("new"); setBcLinkedSparkId(null);
      loadAll();
    }
  };

  // ── Boost existing spark ─────────────────────────────────────────────────────
  const handleBoost = async (sparkId: number) => {
    setBoostMsg(m => ({ ...m, [sparkId]: "boosting…" }));
    const { error } = await supabase.from("sparks").update({
      reach: "beyond",
      broadcast_freq_type: "pinned",
      broadcast_freq_value: 0,
      broadcast_max_per_day: 0,
      broadcast_expires_at: null,
    }).eq("id", sparkId);
    if (error) { setBoostMsg(m => ({ ...m, [sparkId]: "❌ " + error.message })); }
    else { setBoostMsg(m => ({ ...m, [sparkId]: "✅ Boosted to all feeds!" })); loadAll(); }
  };

  // ── Broadcast: edit caption ──────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editId || !editCaption.trim()) return;
    setEditSaving(true);
    await supabase.from("sparks").update({ caption: editCaption.trim() }).eq("id", editId);
    setEditSaving(false);
    setEditId(null); setEditCaption("");
    loadAll();
  };

  // ── Any spark: delete ────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    await supabase.from("sparks").delete().eq("id", id);
    setDeleteId(null);
    loadAll();
  };

  const inp = (overrides: CSSProperties = {}): CSSProperties => ({
    width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid #FFD0B0",
    fontSize:14, outline:"none", boxSizing:"border-box", background:"#FFFBF8", color:"#1a1a1a", ...overrides,
  });
  const btn = (bg = "#E86A2E", extra: CSSProperties = {}): CSSProperties => ({
    padding:"10px 20px", borderRadius:10, background:bg, color:"white", fontWeight:800,
    fontSize:13, border:"none", cursor:"pointer", ...extra,
  });

  return (
    <div style={{ minHeight:"100vh", background:"#F7F0EB", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      {/* Sticky Header + Nav */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:"linear-gradient(90deg,#2D1200,#7A2E00)", boxShadow:"0 2px 12px rgba(0,0,0,0.25)" }}>
        {/* Top bar */}
        <div style={{ padding:"0 24px", height:52, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>🌍</span>
            <span style={{ color:"white", fontWeight:900, fontSize:16 }}>icreate.africa</span>
            <span style={{ color:"rgba(255,255,255,0.4)", fontSize:12 }}>/ Admin</span>
            {tab !== "overview" && (
              <>
                <span style={{ color:"rgba(255,255,255,0.3)", fontSize:12 }}>/</span>
                <span style={{ color:"#FFC987", fontSize:12, fontWeight:700 }}>{TABS.find(t=>t.id===tab)?.emoji} {TABS.find(t=>t.id===tab)?.label}</span>
              </>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {loading && <span style={{ color:"rgba(255,255,255,0.5)", fontSize:11 }}>⟳ syncing…</span>}
            <span style={{ display:"inline-block", width:7, height:7, borderRadius:4, background:"#4ade80", boxShadow:"0 0 6px #4ade80" }} />
            <span style={{ color:"rgba(255,255,255,0.5)", fontSize:11 }}>Live</span>
            <button onClick={loadAll} style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", color:"white", borderRadius:7, padding:"3px 10px", fontSize:11, cursor:"pointer" }}>↺ Refresh</button>
            <button onClick={() => setAuthed(false)} style={{ background:"rgba(255,50,50,0.25)", border:"1px solid rgba(255,100,100,0.3)", color:"white", borderRadius:7, padding:"3px 10px", fontSize:11, cursor:"pointer" }}>Logout</button>
          </div>
        </div>
        {/* Tab nav */}
        <div style={{ display:"flex", gap:2, padding:"0 24px 0", overflowX:"auto", scrollbarWidth:"none" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setInsightPanel(null); setCoinPanelOpen(false); window.scrollTo({top:0,behavior:"smooth"}); }}
              style={{ padding:"8px 14px", borderRadius:"8px 8px 0 0", fontWeight:700, fontSize:12, border:"none", cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.15s",
                background: tab === t.id ? "white" : "transparent",
                color: tab === t.id ? "#2D1200" : "rgba(255,255,255,0.65)",
                borderBottom: tab === t.id ? "2px solid white" : "2px solid transparent",
              }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"24px 20px" }}>
        {/* Global Stats */}
        <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:24 }}>
          <StatCard label="Registered Users" value={users.length}    sub={`+${newToday} today`}    color="#E86A2E" onClick={()=>togglePanel("users")}     active={insightPanel==="users"} />
          <StatCard label="Total Sparks"    value={sparks.filter(s=>s.user_id!==ADMIN_USER_ID).length}   sub="posts shared" color="#D97706" onClick={()=>togglePanel("sparks")}    active={insightPanel==="sparks"} />
          <StatCard label="Total Reactions" value={totalRx}         sub="across all sparks"          color="#7C3AED" onClick={()=>togglePanel("reactions")} active={insightPanel==="reactions"} />
          <StatCard label="Messages Sent"   value={messages.length} sub="DM conversations"           color="#0284C7" onClick={()=>togglePanel("messages")}  active={insightPanel==="messages"} />
          <StatCard label="Countries"       value={countries}       sub="African nations"             color="#059669" onClick={()=>togglePanel("countries")} active={insightPanel==="countries"} />
          <div onClick={() => { setCoinPanelOpen(p => !p); setCoinValueEdit(String(coinValueNGN)); }}
            style={{ background:"white", borderRadius:16, padding:"20px 24px", border:"3px solid #F59E0B", flex:1, minWidth:140, cursor:"pointer", transition:"box-shadow 0.2s", boxShadow: coinPanelOpen ? "0 4px 20px rgba(245,158,11,0.25)" : "none" }}>
            <div style={{ fontSize:28, fontWeight:900, color:"#F59E0B" }}>{totalPlatformCoins.toLocaleString()}</div>
            <div style={{ fontWeight:800, color:"#2D1200", fontSize:13, marginTop:4 }}>Platform Coins</div>
            <div style={{ fontSize:11, color:"#888", marginTop:2 }}>≈ ₦{(totalNGN).toLocaleString()} · click to manage</div>
          </div>
        </div>

        {/* ── Insight Panels ── */}
        {insightPanel && (
          <div style={{ background:"white", borderRadius:16, padding:24, border:"2px solid #E0E7FF", marginBottom:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontWeight:900, fontSize:16, color:"#2D1200" }}>
                {insightPanel==="users"     && "👥 Registered Users — Full Breakdown"}
                {insightPanel==="sparks"    && "✨ Sparks — Full Breakdown"}
                {insightPanel==="reactions" && "💬 Reactions — Full Breakdown"}
                {insightPanel==="messages"  && "💌 Messages — Full Breakdown"}
                {insightPanel==="countries" && "🌍 Countries — User Distribution"}
              </div>
              <button onClick={()=>setInsightPanel(null)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#aaa" }}>✕</button>
            </div>

            {/* USERS */}
            {insightPanel==="users" && (() => {
              const byGender   = Object.entries(users.reduce<Record<string,number>>((a,u)=>{const g=u.gender||"Unknown";a[g]=(a[g]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]);
              const byCountry  = Object.entries(users.reduce<Record<string,number>>((a,u)=>{const c=u.country||"Unknown";a[c]=(a[c]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]);
              const byOccup    = Object.entries(users.reduce<Record<string,number>>((a,u)=>{const o=u.occupation||"Unknown";a[o]=(a[o]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
              return (
                <div>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
                    {[["Total Registered",users.length,"#E86A2E"],["Joined Today",newToday,"#059669"],["Countries",countries,"#0284C7"],["Avg Coins",users.length?Math.round(totalPlatformCoins/users.length):0,"#D97706"]].map(([l,v,c])=>(
                      <div key={l as string} style={{ background:"#FFFBF8", borderRadius:10, padding:"12px 16px", border:`1.5px solid ${c}`, flex:1, minWidth:120 }}>
                        <div style={{ fontSize:20, fontWeight:900, color:c as string }}>{(v as number).toLocaleString()}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#555", marginTop:2 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:20 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:8 }}>BY GENDER</div>
                      {byGender.map(([g,n])=>(
                        <div key={g} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f5f5f5" }}>
                          <span style={{ fontSize:12, color:"#333" }}>{g}</span>
                          <span style={{ fontWeight:800, fontSize:12, color:"#E86A2E" }}>{n} ({Math.round(n/users.length*100)}%)</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:8 }}>BY COUNTRY</div>
                      {byCountry.map(([c,n])=>(
                        <div key={c} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f5f5f5" }}>
                          <span style={{ fontSize:12, color:"#333" }}>{c}</span>
                          <span style={{ fontWeight:800, fontSize:12, color:"#0284C7" }}>{n}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:8 }}>BY OCCUPATION</div>
                      {byOccup.map(([o,n])=>(
                        <div key={o} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f5f5f5" }}>
                          <span style={{ fontSize:12, color:"#333", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:120 }}>{o}</span>
                          <span style={{ fontWeight:800, fontSize:12, color:"#7C3AED" }}>{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:10 }}>ALL USERS</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:320, overflowY:"auto" }}>
                    {users.map(u=>(
                      <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, background:"#FAFAFA", borderRadius:10, padding:"10px 14px" }}>
                        <div style={{ width:32, height:32, borderRadius:"50%", background:"#FFE0CC", overflow:"hidden", flexShrink:0 }}>
                          {u.profile_pic_url ? <img src={u.profile_pic_url} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#E86A2E",fontSize:13 }}>{u.name?.[0]}</div>}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:"#2D1200", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}</div>
                          <div style={{ fontSize:11, color:"#888" }}>@{u.username} · {u.country}{u.state?`, ${u.state}`:""}</div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontWeight:800, fontSize:12, color:"#D97706" }}>🪙 {(u.coins??0).toLocaleString()}</div>
                          <div style={{ fontSize:10, color:"#aaa" }}>{u.created_at?.slice(0,10)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* SPARKS */}
            {insightPanel==="sparks" && (() => {
              const userSparks  = sparks.filter(s=>s.user_id!==ADMIN_USER_ID);
              const newSparks   = userSparks.filter(s=>s.spark_type==="new").length;
              const ongoingSparks = userSparks.filter(s=>s.spark_type==="ongoing").length;
              const beyondSparks  = userSparks.filter(s=>s.reach==="beyond").length;
              const topCreators   = Object.entries(userSparks.reduce<Record<string,number>>((a,s)=>{a[s.username]=(a[s.username]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,10);
              const topReacted    = [...userSparks].sort((a,b)=>totalReactions(b.reactions??{})-totalReactions(a.reactions??{})).slice(0,5);
              const byMediaType   = Object.entries(userSparks.reduce<Record<string,number>>((a,s)=>{a[s.media_type]=(a[s.media_type]??0)+1;return a;},{}));
              return (
                <div>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
                    {[["Total Sparks",userSparks.length,"#D97706"],["New Sparks",newSparks,"#E86A2E"],["Ongoing",ongoingSparks,"#059669"],["Great Beyond",beyondSparks,"#7C3AED"],["Videos",userSparks.filter(s=>s.media_type==="video").length,"#0284C7"]].map(([l,v,c])=>(
                      <div key={l as string} style={{ background:"#FFFBF8", borderRadius:10, padding:"12px 16px", border:`1.5px solid ${c}`, flex:1, minWidth:100 }}>
                        <div style={{ fontSize:20, fontWeight:900, color:c as string }}>{(v as number).toLocaleString()}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#555", marginTop:2 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:8 }}>TOP CREATORS</div>
                      {topCreators.map(([u,n])=>(
                        <div key={u} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #f5f5f5" }}>
                          <span style={{ fontSize:12, color:"#333" }}>@{u}</span>
                          <span style={{ fontWeight:800, fontSize:12, color:"#D97706" }}>{n} spark{n!==1?"s":""}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:8 }}>TOP REACTED SPARKS</div>
                      {topReacted.map(s=>(
                        <div key={s.id} style={{ padding:"6px 0", borderBottom:"1px solid #f5f5f5" }}>
                          <div style={{ fontSize:11, color:"#333", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>@{s.username}: {(s.caption ?? "").slice(0,40)}…</div>
                          <div style={{ fontSize:11, fontWeight:800, color:"#7C3AED" }}>❤️ {totalReactions(s.reactions??{})} reactions</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:8 }}>MEDIA TYPES</div>
                  <div style={{ display:"flex", gap:12 }}>
                    {byMediaType.map(([t,n])=>(
                      <div key={t} style={{ background:"#F0F4FF", borderRadius:10, padding:"10px 16px", border:"1px solid #C7D2FE" }}>
                        <div style={{ fontWeight:900, fontSize:16, color:"#4338CA" }}>{n}</div>
                        <div style={{ fontSize:11, color:"#555", textTransform:"capitalize" }}>{t}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* REACTIONS */}
            {insightPanel==="reactions" && (() => {
              const rxTypes: Record<string,number> = {};
              sparks.filter(s=>s.user_id!==ADMIN_USER_ID).forEach(s=>{ Object.entries(s.reactions??{}).forEach(([k,v])=>{ rxTypes[k]=(rxTypes[k]??0)+(v as number); }); });
              const topReacted = [...sparks.filter(s=>s.user_id!==ADMIN_USER_ID)].sort((a,b)=>totalReactions(b.reactions??{})-totalReactions(a.reactions??{})).slice(0,10);
              const maxRx = Math.max(...Object.values(rxTypes), 1);
              return (
                <div>
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:12 }}>REACTIONS BY TYPE</div>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      {Object.entries(rxTypes).map(([k,v])=>(
                        <div key={k} style={{ background:"#F5F3FF", borderRadius:12, padding:"16px 20px", border:"1.5px solid #DDD6FE", flex:1, minWidth:120 }}>
                          <div style={{ fontSize:24, fontWeight:900, color:"#7C3AED" }}>{(v as number).toLocaleString()}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:"#555", marginTop:3 }}>{k}</div>
                          <div style={{ marginTop:8, background:"#E9E8FF", borderRadius:4, height:6, overflow:"hidden" }}>
                            <div style={{ background:"#7C3AED", height:"100%", width:`${Math.round((v as number)/maxRx*100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:10 }}>MOST REACTED SPARKS</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:300, overflowY:"auto" }}>
                    {topReacted.map((s,i)=>(
                      <div key={s.id} style={{ display:"flex", gap:12, background:"#FAFAFA", borderRadius:10, padding:"10px 14px", alignItems:"center" }}>
                        <div style={{ fontWeight:900, fontSize:16, color:"#ccc", width:24, flexShrink:0 }}>#{i+1}</div>
                        <div style={{ width:44, height:44, borderRadius:8, overflow:"hidden", background:"#f5f5f5", flexShrink:0 }}>
                          {s.media_type==="image" ? <img src={s.media_url} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>🎬</div>}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#2D1200", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>@{s.username}</div>
                          <div style={{ fontSize:11, color:"#888", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.caption}</div>
                        </div>
                        <div style={{ fontWeight:900, fontSize:13, color:"#7C3AED", flexShrink:0 }}>❤️ {totalReactions(s.reactions??{})}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* MESSAGES */}
            {insightPanel==="messages" && (() => {
              const pairs = Object.entries(messages.reduce<Record<string,number>>((a,m)=>{
                const pair = [m.from_username,m.to_username].sort().join("↔");
                a[pair]=(a[pair]??0)+1; return a;
              },{})).sort((a,b)=>b[1]-a[1]).slice(0,10);
              const topSenders = Object.entries(messages.reduce<Record<string,number>>((a,m)=>{a[m.from_username]=(a[m.from_username]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
              const recent = [...messages].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,15);
              return (
                <div>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
                    {[["Total Messages",messages.length,"#0284C7"],["Today",msgsToday,"#059669"],["Unique Conversations",new Set(messages.map(m=>[m.from_username,m.to_username].sort().join("↔"))).size,"#7C3AED"],["Active Users",new Set([...messages.map(m=>m.from_username),...messages.map(m=>m.to_username)]).size,"#E86A2E"]].map(([l,v,c])=>(
                      <div key={l as string} style={{ background:"#FFFBF8", borderRadius:10, padding:"12px 16px", border:`1.5px solid ${c}`, flex:1, minWidth:120 }}>
                        <div style={{ fontSize:20, fontWeight:900, color:c as string }}>{(v as number).toLocaleString()}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#555", marginTop:2 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:8 }}>TOP CONVERSATIONS</div>
                      {pairs.map(([p,n])=>(
                        <div key={p} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #f5f5f5" }}>
                          <span style={{ fontSize:11, color:"#333" }}>{p}</span>
                          <span style={{ fontWeight:800, fontSize:12, color:"#0284C7" }}>{n} msgs</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:8 }}>TOP SENDERS</div>
                      {topSenders.map(([u,n])=>(
                        <div key={u} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #f5f5f5" }}>
                          <span style={{ fontSize:12, color:"#333" }}>@{u}</span>
                          <span style={{ fontWeight:800, fontSize:12, color:"#0284C7" }}>{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:10 }}>RECENT MESSAGES</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
                    {recent.map(m=>(
                      <div key={m.id} style={{ background:"#F0F9FF", borderRadius:8, padding:"8px 12px", border:"1px solid #BAE6FD" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                          <span style={{ fontSize:11, fontWeight:800, color:"#0284C7" }}>@{m.from_username} → @{m.to_username}</span>
                          <span style={{ fontSize:10, color:"#aaa" }}>{m.created_at?.slice(0,16).replace("T"," ")}</span>
                        </div>
                        <div style={{ fontSize:11, color:"#555", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* COUNTRIES */}
            {insightPanel==="countries" && (() => {
              const usersByCountry = Object.entries(users.reduce<Record<string,number>>((a,u)=>{const c=u.country||"Unknown";a[c]=(a[c]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]);
              const visitsByCountry = countryBreakdown;
              const maxUsers = Math.max(...usersByCountry.map(([,n])=>n),1);
              const maxVisits = Math.max(...visitsByCountry.map(([,n])=>n),1);
              return (
                <div>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
                    {[["Countries Represented",usersByCountry.length,"#059669"],["Total Users",users.length,"#E86A2E"],["Total Visits",visits.length,"#0284C7"]].map(([l,v,c])=>(
                      <div key={l as string} style={{ background:"#FFFBF8", borderRadius:10, padding:"12px 16px", border:`1.5px solid ${c}`, flex:1, minWidth:120 }}>
                        <div style={{ fontSize:20, fontWeight:900, color:c as string }}>{(v as number).toLocaleString()}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#555", marginTop:2 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:10 }}>USERS BY COUNTRY</div>
                      {usersByCountry.map(([c,n])=>(
                        <div key={c} style={{ marginBottom:8 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
                            <span style={{ color:"#333", fontWeight:600 }}>{c}</span>
                            <span style={{ color:"#059669", fontWeight:800 }}>{n} user{n!==1?"s":""}</span>
                          </div>
                          <div style={{ background:"#D1FAE5", borderRadius:4, height:6, overflow:"hidden" }}>
                            <div style={{ background:"#059669", height:"100%", width:`${Math.round(n/maxUsers*100)}%`, transition:"width 0.5s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:12, color:"#555", marginBottom:10 }}>VISITS BY COUNTRY</div>
                      {visitsByCountry.map(([c,n])=>(
                        <div key={c} style={{ marginBottom:8 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
                            <span style={{ color:"#333", fontWeight:600 }}>{c}</span>
                            <span style={{ color:"#0284C7", fontWeight:800 }}>{n} visit{n!==1?"s":""}</span>
                          </div>
                          <div style={{ background:"#BAE6FD", borderRadius:4, height:6, overflow:"hidden" }}>
                            <div style={{ background:"#0284C7", height:"100%", width:`${Math.round(n/maxVisits*100)}%`, transition:"width 0.5s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Coin Economy Panel */}
        {coinPanelOpen && (
          <div style={{ background:"white", borderRadius:16, padding:24, border:"2px solid #F59E0B", marginBottom:24 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <div style={{ fontWeight:900, color:"#2D1200", fontSize:16 }}>🪙 Coin Economy</div>
                <div style={{ fontSize:12, color:"#888", marginTop:2 }}>Manage coin value and see platform-wide distribution</div>
              </div>
              <button onClick={() => setCoinPanelOpen(false)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#aaa" }}>✕</button>
            </div>

            {/* Breakdown cards */}
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
              <div style={{ background:"#FFFBEB", borderRadius:12, padding:"16px 20px", border:"1.5px solid #FDE68A", flex:1, minWidth:140 }}>
                <div style={{ fontSize:22, fontWeight:900, color:"#D97706" }}>{totalPlatformCoins.toLocaleString()}</div>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:12, marginTop:3 }}>Total Coins in Circulation</div>
                <div style={{ fontSize:11, color:"#888", marginTop:2 }}>Held across all {users.length} user wallets</div>
              </div>
              <div style={{ background:"#F0FFF8", borderRadius:12, padding:"16px 20px", border:"1.5px solid #A7F3D0", flex:1, minWidth:140 }}>
                <div style={{ fontSize:22, fontWeight:900, color:"#059669" }}>{signupCoins.toLocaleString()}</div>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:12, marginTop:3 }}>🎁 Signup Grants</div>
                <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{users.length} users × 1,000 welcome coins</div>
              </div>
              <div style={{ background:"#FFF7ED", borderRadius:12, padding:"16px 20px", border:"1.5px solid #FED7AA", flex:1, minWidth:140 }}>
                <div style={{ fontSize:22, fontWeight:900, color:"#EA580C" }}>{taskEarnedCoins.toLocaleString()}</div>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:12, marginTop:3 }}>🏆 Earned from Tasks</div>
                <div style={{ fontSize:11, color:"#888", marginTop:2 }}>Coins won via milestones & challenges</div>
              </div>
              <div style={{ background:"#F5F3FF", borderRadius:12, padding:"16px 20px", border:"1.5px solid #DDD6FE", flex:1, minWidth:140 }}>
                <div style={{ fontSize:22, fontWeight:900, color:"#7C3AED" }}>{paidCoins.toLocaleString()}</div>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:12, marginTop:3 }}>💳 Coins Paid (Purchased)</div>
                <div style={{ fontSize:11, color:"#7C3AED", marginTop:2, fontWeight:600 }}>Payment system coming soon</div>
              </div>
            </div>

            {/* Coin value editor */}
            <div style={{ background:"#FFFBF8", borderRadius:12, padding:"16px 20px", border:"1.5px solid #FFD0B0", marginBottom:20 }}>
              <div style={{ fontWeight:800, color:"#2D1200", fontSize:13, marginBottom:12 }}>⚙️ Set Coin Value</div>
              <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, background:"white", border:"1.5px solid #FFD0B0", borderRadius:10, padding:"8px 12px" }}>
                  <span style={{ fontWeight:800, color:"#555", fontSize:13 }}>₦</span>
                  <input type="number" min={0.01} step={0.01}
                    value={coinValueEdit !== "" ? coinValueEdit : coinValueNGN}
                    onChange={e => setCoinValueEdit(e.target.value)}
                    style={{ width:90, border:"none", outline:"none", fontSize:15, fontWeight:800, color:"#E86A2E", background:"transparent" }} />
                  <span style={{ fontSize:12, color:"#888" }}>per coin (NGN)</span>
                </div>
                <button
                  onClick={() => {
                    const v = parseFloat(coinValueEdit);
                    if (!isNaN(v) && v > 0) {
                      setCoinValueNGN(v);
                      localStorage.setItem("ca_coin_ngn", String(v));
                      setCoinValueEdit("");
                    }
                  }}
                  style={btn("#E86A2E", { padding:"10px 20px", fontSize:13 })}>
                  Save Value
                </button>
                <div style={{ fontSize:12, color:"#059669", fontWeight:700 }}>
                  Current: ₦{coinValueNGN} per coin
                </div>
              </div>
            </div>

            {/* Currency converter */}
            <div style={{ background:"#F8FAFF", borderRadius:12, padding:"16px 20px", border:"1.5px solid #C7D2FE" }}>
              <div style={{ fontWeight:800, color:"#2D1200", fontSize:13, marginBottom:14 }}>💱 Platform Coin Value — Currency Converter</div>
              <div style={{ fontSize:11, color:"#888", marginBottom:12 }}>
                {totalPlatformCoins.toLocaleString()} coins × ₦{coinValueNGN}/coin = <strong style={{ color:"#E86A2E" }}>₦{totalNGN.toLocaleString()}</strong>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:10 }}>
                {[
                  { flag:"🇳🇬", code:"NGN", symbol:"₦",  rate:1 },
                  { flag:"🇺🇸", code:"USD", symbol:"$",  rate:1/USD_RATE },
                  { flag:"🇬🇧", code:"GBP", symbol:"£",  rate:1/GBP_RATE },
                  { flag:"🇪🇺", code:"EUR", symbol:"€",  rate:1/EUR_RATE },
                  { flag:"🇰🇪", code:"KES", symbol:"KSh",rate:KES_RATE },
                  { flag:"🇬🇭", code:"GHS", symbol:"GH₵",rate:GHS_RATE },
                ].map(({ flag, code, symbol, rate }) => (
                  <div key={code} style={{ background:"white", borderRadius:10, padding:"12px 14px", border:"1px solid #E0E7FF" }}>
                    <div style={{ fontSize:11, color:"#888", marginBottom:2 }}>{flag} {code}</div>
                    <div style={{ fontWeight:900, fontSize:16, color:"#4338CA" }}>
                      {symbol}{fmtCurrency(totalNGN * rate)}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:10, color:"#aaa", marginTop:10 }}>
                * Exchange rates are indicative. USD≈₦{USD_RATE} · GBP≈₦{GBP_RATE} · EUR≈₦{EUR_RATE} · KES rate × NGN · GHS rate × NGN
              </div>
            </div>
          </div>
        )}

        {/* Back button + Search for non-overview tabs */}
        {tab !== "overview" && (
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
            <button onClick={() => { setTab("overview"); setInsightPanel(null); setCoinPanelOpen(false); window.scrollTo({top:0,behavior:"smooth"}); }}
              style={{ display:"flex", alignItems:"center", gap:6, background:"white", border:"1.5px solid #E86A2E", color:"#E86A2E", borderRadius:10, padding:"7px 16px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
              ← Back to Overview
            </button>
            {tab !== "broadcast" && tab !== "analytics" && (
              <input placeholder={`Search ${tab}…`} value={search} onChange={e => setSearch(e.target.value)}
                style={inp({ maxWidth:320, marginBottom:0 })} />
            )}
          </div>
        )}

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            <div style={{ background:"white", borderRadius:16, padding:20, border:"1px solid #f0e0d0" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:15 }}>👤 Recent Users</div>
                <button onClick={()=>{setTab("users");window.scrollTo({top:0,behavior:"smooth"});}} style={{ background:"none", border:"none", color:"#E86A2E", fontWeight:700, fontSize:12, cursor:"pointer" }}>View all →</button>
              </div>
              {users.slice(0, 8).map(u => (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f5f5f5" }}>
                  <div style={{ width:32, height:32, borderRadius:16, background:"#FFE4CC", overflow:"hidden", flexShrink:0 }}>
                    {u.profile_pic_url
                      ? <img src={u.profile_pic_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>👤</div>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, color:"#2D1200", fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}</div>
                    <div style={{ fontSize:11, color:"#888" }}>@{u.username} · {u.country}</div>
                  </div>
                  <div style={{ fontSize:11, color:"#888", flexShrink:0 }}>{fmt(u.created_at)}</div>
                </div>
              ))}
            </div>
            <div style={{ background:"white", borderRadius:16, padding:20, border:"1px solid #f0e0d0" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:15 }}>✨ Recent Sparks</div>
                <button onClick={()=>{setTab("sparks");window.scrollTo({top:0,behavior:"smooth"});}} style={{ background:"none", border:"none", color:"#E86A2E", fontWeight:700, fontSize:12, cursor:"pointer" }}>View all →</button>
              </div>
              {sparks.slice(0, 8).map(s => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f5f5f5" }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:"#FFF0E0", overflow:"hidden", flexShrink:0 }}>
                    {s.media_type === "image"
                      ? <img src={s.media_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      : <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:"100%", height:"100%", fontSize:14 }}>🎬</div>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, color:"#2D1200", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>@{s.username}</div>
                    <div style={{ fontSize:11, color:"#888", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.caption}</div>
                  </div>
                  <div style={{ fontSize:11, color:"#E86A2E", fontWeight:700, flexShrink:0 }}>{totalReactions(s.reactions ?? {})} rxn</div>
                </div>
              ))}
            </div>
            <div style={{ background:"white", borderRadius:16, padding:20, border:"1px solid #f0e0d0", gridColumn:"1 / -1" }}>
              <div style={{ fontWeight:800, color:"#2D1200", marginBottom:14, fontSize:15 }}>🌍 Users by Country</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.entries(users.reduce<Record<string,number>>((acc, u) => { const c = u.country||"Unknown"; acc[c]=(acc[c]??0)+1; return acc; }, {}))
                  .sort((a,b) => b[1]-a[1]).map(([country, count]) => (
                  <span key={country} style={{ padding:"4px 12px", background:"#FFF0E0", borderRadius:20, fontSize:12, fontWeight:700, color:"#7A2E00" }}>
                    {country} · {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 🎯 Control Room ──────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

            {/* Today stat cards */}
            <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
              <StatCard label="Visits Today"   value={visitsToday.length} sub="page loads"    color="#7C3AED" />
              <StatCard label="Unique Today"   value={uniqueToday}        sub="distinct users" color="#0284C7" />
              <StatCard label="Sparks Today"   value={sparksToday}        sub="new posts"      color="#E86A2E" />
              <StatCard label="Messages Today" value={msgsToday}          sub="DMs sent"       color="#D97706" />
              <StatCard label="Coins Earned"   value={coinsToday}         sub="tokens today"   color="#059669" />
            </div>

            {/* 7-day bar chart */}
            <div style={{ background:"white", borderRadius:16, padding:24, border:"1px solid #f0e0d0" }}>
              <div style={{ fontWeight:800, color:"#2D1200", fontSize:15, marginBottom:18 }}>📈 Daily Visits — Last 7 Days</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:12, height:120 }}>
                {dailyVisits.map((d, i) => (
                  <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#7C3AED" }}>{d.count}</div>
                    <div style={{
                      width:"100%",
                      height: d.count === 0 ? 4 : Math.max(8, Math.round((d.count / maxVisits) * 96)),
                      background: i === 6 ? "#7C3AED" : "linear-gradient(180deg,#C4A0F0,#9B59D8)",
                      borderRadius:"6px 6px 0 0",
                      transition:"height 0.3s ease",
                    }} />
                    <div style={{ fontSize:10, color:"#888", fontWeight:600 }}>{d.date}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Country + State charts side by side */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              {/* Top 10 Countries */}
              <div style={{ background:"white", borderRadius:16, padding:24, border:"1px solid #f0e0d0" }}>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:15, marginBottom:16 }}>🌍 Top 10 Countries</div>
                {countryBreakdown.length === 0 && <div style={{ color:"#aaa", fontSize:13 }}>No data yet.</div>}
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {countryBreakdown.map(([country, count]) => (
                    <div key={country}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:700, color:"#333", marginBottom:3 }}>
                        <span>{country}</span>
                        <span style={{ color:"#E86A2E" }}>{count}</span>
                      </div>
                      <div style={{ height:8, borderRadius:4, background:"#F7F0EB", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.round((count/maxCountry)*100)}%`, background:"linear-gradient(90deg,#E86A2E,#D97706)", borderRadius:4 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top 8 States */}
              <div style={{ background:"white", borderRadius:16, padding:24, border:"1px solid #f0e0d0" }}>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:15, marginBottom:16 }}>📍 Top 8 States / Regions</div>
                {stateBreakdown.length === 0 && <div style={{ color:"#aaa", fontSize:13 }}>No data yet.</div>}
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {stateBreakdown.map(([state, count]) => (
                    <div key={state}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:700, color:"#333", marginBottom:3 }}>
                        <span>{state}</span>
                        <span style={{ color:"#0284C7" }}>{count}</span>
                      </div>
                      <div style={{ height:8, borderRadius:4, background:"#F7F0EB", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.round((count/maxState)*100)}%`, background:"linear-gradient(90deg,#0284C7,#38BDF8)", borderRadius:4 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Activity breakdown + Live feed side by side */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              {/* Tab activity */}
              <div style={{ background:"white", borderRadius:16, padding:24, border:"1px solid #f0e0d0" }}>
                <div style={{ fontWeight:800, color:"#2D1200", fontSize:15, marginBottom:16 }}>📱 Tab Activity Breakdown</div>
                {activityBreakdown.length === 0 && <div style={{ color:"#aaa", fontSize:13 }}>No view events yet.</div>}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {activityBreakdown.map(([tab_name, count]) => (
                    <div key={tab_name}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:700, color:"#333", marginBottom:3 }}>
                        <span style={{ textTransform:"capitalize" }}>{tab_name === "?" ? "Unknown" : tab_name}</span>
                        <span style={{ color:"#059669", fontWeight:800 }}>{count.toLocaleString()}</span>
                      </div>
                      <div style={{ height:10, borderRadius:5, background:"#F7F0EB", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.round((count/maxActivity)*100)}%`, background:"linear-gradient(90deg,#059669,#34D399)", borderRadius:5 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live event feed */}
              <div style={{ background:"white", borderRadius:16, padding:24, border:"1px solid #f0e0d0" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                  <div style={{ fontWeight:800, color:"#2D1200", fontSize:15 }}>⚡ Live Event Feed</div>
                  <span style={{ display:"inline-block", width:7, height:7, borderRadius:4, background:"#4ade80", boxShadow:"0 0 5px #4ade80" }} />
                </div>
                <div style={{ overflowY:"auto", maxHeight:280, display:"flex", flexDirection:"column", gap:6 }}>
                  {liveFeed.length === 0 && <div style={{ color:"#aaa", fontSize:13 }}>No events yet.</div>}
                  {liveFeed.map(ev => (
                    <div key={ev.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 10px", borderRadius:8, background:"#F7F0EB" }}>
                      <span style={{ fontSize:10, padding:"2px 6px", borderRadius:6, background:"#2D1200", color:"white", fontWeight:700, flexShrink:0, marginTop:1 }}>
                        {ev.event_type}
                      </span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <span style={{ fontWeight:700, color:"#2D1200", fontSize:12 }}>@{ev.username || "anon"}</span>
                        {ev.country && <span style={{ fontSize:11, color:"#888", marginLeft:6 }}>{ev.city ? `${ev.city}, ` : ""}{ev.country}</span>}
                      </div>
                      <span style={{ fontSize:10, color:"#bbb", flexShrink:0 }}>{fmtShort(ev.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Broadcast ────────────────────────────────────────────────────── */}
        {tab === "broadcast" && (
          <div style={{ display:"grid", gridTemplateColumns:"420px 1fr", gap:24, alignItems:"start" }}>

            {/* Post form */}
            <div style={{ background:"white", borderRadius:16, padding:24, border:"2px solid #059669" }}>
              <div style={{ fontWeight:900, color:"#1a6641", fontSize:16, marginBottom:4 }}>📢 New Broadcast</div>
              <div style={{ fontSize:12, color:"#666", marginBottom:14 }}>Posts as <strong>@icreate.africa</strong> on the platform feed.</div>

              {/* Post mode toggle */}
              <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                <button onClick={() => setBcMode("direct")}
                  style={{ flex:1, padding:"11px 8px", borderRadius:12, fontWeight:800, fontSize:13, cursor:"pointer", border:"2px solid",
                    borderColor: bcMode === "direct" ? "#059669" : "#ccc",
                    background: bcMode === "direct" ? "#059669" : "white",
                    color: bcMode === "direct" ? "white" : "#888" }}>
                  ⚡ Post Directly Now
                </button>
                <button onClick={() => setBcMode("scheduled")}
                  style={{ flex:1, padding:"11px 8px", borderRadius:12, fontWeight:800, fontSize:13, cursor:"pointer", border:"2px solid",
                    borderColor: bcMode === "scheduled" ? "#4338CA" : "#ccc",
                    background: bcMode === "scheduled" ? "#EEF2FF" : "white",
                    color: bcMode === "scheduled" ? "#4338CA" : "#888" }}>
                  ⏰ Scheduled
                </button>
              </div>
              {bcMode === "direct" && (
                <div style={{ fontSize:12, color:"#059669", fontWeight:700, background:"#F0FFF8", borderRadius:8, padding:"8px 12px", border:"1px solid #A7F3D0", marginBottom:16 }}>
                  ⚡ Shows at the top of everyone's feed immediately. No expiry — stays until you delete it.
                </div>
              )}

              {/* Spark Type */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#555", display:"block", marginBottom:8 }}>Spark Type</label>
                <div style={{ display:"flex", gap:8, marginBottom: bcSparkType === "ongoing" ? 10 : 0 }}>
                  <button onClick={() => { setBcSparkType("new"); setBcLinkedSparkId(null); }}
                    style={{ flex:1, padding:"10px 8px", borderRadius:12, fontWeight:800, fontSize:13, cursor:"pointer", border:"2px solid",
                      borderColor: bcSparkType === "new" ? "#E05A1C" : "#FFD0B0",
                      background: bcSparkType === "new" ? "#FFF7F0" : "white",
                      color: bcSparkType === "new" ? "#E05A1C" : "#888" }}>
                    ✨ New Spark
                  </button>
                  <button onClick={() => setBcSparkType("ongoing")}
                    style={{ flex:1, padding:"10px 8px", borderRadius:12, fontWeight:800, fontSize:13, cursor:"pointer", border:"2px solid",
                      borderColor: bcSparkType === "ongoing" ? "#5C2D0E" : "#FFD0B0",
                      background: bcSparkType === "ongoing" ? "#FDF4EE" : "white",
                      color: bcSparkType === "ongoing" ? "#5C2D0E" : "#888" }}>
                    🔗 Ongoing Spark
                  </button>
                </div>
                {bcSparkType === "ongoing" && (
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#555", display:"block", marginBottom:4 }}>Link to a previous broadcast</label>
                    <select value={bcLinkedSparkId ?? ""} onChange={e => setBcLinkedSparkId(e.target.value ? Number(e.target.value) : null)} style={inp({ fontSize:12 })}>
                      <option value="">— Select previous broadcast —</option>
                      {adminSparks.map(s => (
                        <option key={s.id} value={s.id}>{(s.caption ?? "").slice(0, 60)}{(s.caption?.length ?? 0) > 60 ? "…" : ""}</option>
                      ))}
                    </select>
                    <div style={{ fontSize:11, color:"#888", marginTop:5 }}>
                      Users will see a "View previous spark" panel linking back to this broadcast.
                    </div>
                  </div>
                )}
              </div>

              {/* Caption */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#555", display:"block", marginBottom:4 }}>Caption *</label>
                <textarea value={bcCaption} onChange={e => setBcCaption(e.target.value)} placeholder="Write your broadcast message…" rows={4}
                  style={{ ...inp(), resize:"vertical" }} />
              </div>

              {/* Media upload */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#555", display:"block", marginBottom:6 }}>Media *</label>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display:"none" }}
                  onChange={e => { const f=e.target.files?.[0]; if(f) handleFileUpload(f); }} />

                {/* Dropzone */}
                <div
                  onClick={() => !bcUploading && fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation();
                    if (bcUploading) return;
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                  style={{
                    border:"2px dashed #FFD0B0", borderRadius:12, padding:"28px 16px",
                    textAlign:"center", cursor: bcUploading ? "not-allowed" : "pointer",
                    background: bcUploading ? "#FFF8F0" : "#FFFBF8",
                    transition:"background 0.2s",
                    marginBottom: bcMediaUrl ? 10 : 0,
                    opacity: bcUploading ? 0.7 : 1,
                  }}
                >
                  {bcUploading ? (
                    <div>
                      <div style={{ fontSize:22, marginBottom:6 }}>⏳</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#E86A2E", marginBottom:8 }}>
                        {bcUploadPct > 0 ? `Uploading… ${bcUploadPct}%` : "Compressing & uploading…"}
                      </div>
                      <div style={{ background:"#FFE0CC", borderRadius:8, height:8, overflow:"hidden" }}>
                        <div style={{ background:"#E86A2E", height:"100%", borderRadius:8, width:`${bcUploadPct}%`, transition:"width 0.3s" }} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize:28, marginBottom:6 }}>{bcMediaUrl ? "✅" : "📁"}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#555" }}>
                        {bcMediaUrl ? "Click or drag to replace file" : "Click or drag & drop image / video"}
                      </div>
                      <div style={{ fontSize:11, color:"#aaa", marginTop:3 }}>JPG, PNG, MP4, MOV supported</div>
                    </div>
                  )}
                </div>

                {/* Preview */}
                {bcMediaUrl && (
                  <div style={{ borderRadius:10, overflow:"hidden", maxHeight:160, position:"relative" }}>
                    {bcMediaType === "image"
                      ? <img src={bcMediaUrl} alt="preview" style={{ width:"100%", maxHeight:160, objectFit:"cover", borderRadius:10 }} />
                      : <video src={bcMediaUrl} style={{ width:"100%", maxHeight:160, borderRadius:10 }} muted controls />
                    }
                    <button onClick={() => { setBcMediaUrl(""); }}
                      style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.55)", border:"none", color:"white", borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer", fontWeight:700 }}>
                      ✕ Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Reach toggle */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#555", display:"block", marginBottom:8 }}>Reach</label>
                <div style={{ display:"flex", gap:8 }}>
                  <button
                    onClick={() => setBcReach("beyond")}
                    style={{
                      flex:1, padding:"12px 8px", borderRadius:12, fontWeight:800, fontSize:13, cursor:"pointer", border:"2px solid",
                      borderColor: bcReach === "beyond" ? "#D97706" : "#FFD0B0",
                      background: bcReach === "beyond" ? "#FFFBEB" : "white",
                      color: bcReach === "beyond" ? "#D97706" : "#888",
                    }}>
                    ✨ Great Beyond
                  </button>
                  <button
                    onClick={() => setBcReach("share")}
                    style={{
                      flex:1, padding:"12px 8px", borderRadius:12, fontWeight:800, fontSize:13, cursor:"pointer", border:"2px solid",
                      borderColor: bcReach === "share" ? "#059669" : "#FFD0B0",
                      background: bcReach === "share" ? "#F0FFF8" : "white",
                      color: bcReach === "share" ? "#059669" : "#888",
                    }}>
                    🌍 Community
                  </button>
                </div>
                {bcReach === "beyond" && (
                  <div style={{ marginTop:8, fontSize:12, color:"#D97706", fontWeight:700, background:"#FFFBEB", borderRadius:8, padding:"8px 12px", border:"1px solid #FDE68A" }}>
                    ✨ Reaches ALL users instantly — no location filter.
                  </div>
                )}
              </div>

              {/* Location targeting (only when reach === "share") */}
              {bcReach === "share" && (
                <div style={{ background:"#F0FFF8", borderRadius:12, padding:"14px 14px", marginBottom:16, border:"1px solid #A7F3D0" }}>
                  <div style={{ fontSize:12, fontWeight:800, color:"#059669", marginBottom:6 }}>📍 Location Targeting</div>
                  <div style={{ fontSize:11, color:"#555", marginBottom:10 }}>Leave blank to show to all Community users. Set country/state to target a region.</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <div style={{ flex:1 }}>
                      <label style={{ fontSize:11, fontWeight:700, color:"#555", display:"block", marginBottom:3 }}>Country</label>
                      <select value={bcCountry} onChange={e => { setBcCountry(e.target.value); setBcState(""); }} style={inp({ fontSize:12 })}>
                        <option value="">All countries</option>
                        {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {bcCountry && allStates.length > 0 && (
                      <div style={{ flex:1 }}>
                        <label style={{ fontSize:11, fontWeight:700, color:"#555", display:"block", marginBottom:3 }}>State / Region</label>
                        <select value={bcState} onChange={e => setBcState(e.target.value)} style={inp({ fontSize:12 })}>
                          <option value="">All states</option>
                          {allStates.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  {(bcCountry || bcState) && (
                    <div style={{ marginTop:8, fontSize:11, color:"#059669", fontWeight:700 }}>
                      📍 Targeting: {bcState ? `${bcState}, ` : ""}{bcCountry || "All"}
                      {" · "}{bcCountry ? users.filter(u => u.country === bcCountry && (!bcState || u.state === bcState)).length : users.length} users in range
                    </div>
                  )}
                </div>
              )}

              {/* Frequency section — only in scheduled mode */}
              {bcMode === "scheduled" && <div style={{ background:"#F0F4FF", borderRadius:12, padding:"14px 14px", marginBottom:16, border:"1px solid #C7D2FE" }}>
                <div style={{ fontSize:12, fontWeight:800, color:"#4338CA", marginBottom:10 }}>🔁 Frequency Settings</div>

                {/* Freq type toggle */}
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  <button
                    onClick={() => setBcFreqType("posts")}
                    style={{ flex:1, padding:"8px 6px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", border:"1.5px solid",
                      borderColor: bcFreqType === "posts" ? "#4338CA" : "#C7D2FE",
                      background: bcFreqType === "posts" ? "#EEF2FF" : "white",
                      color: bcFreqType === "posts" ? "#4338CA" : "#888" }}>
                    📜 By Post Count
                  </button>
                  <button
                    onClick={() => setBcFreqType("time")}
                    style={{ flex:1, padding:"8px 6px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", border:"1.5px solid",
                      borderColor: bcFreqType === "time" ? "#4338CA" : "#C7D2FE",
                      background: bcFreqType === "time" ? "#EEF2FF" : "white",
                      color: bcFreqType === "time" ? "#4338CA" : "#888" }}>
                    ⏱ By Time
                  </button>
                </div>

                {bcFreqType === "posts" ? (
                  <div style={{ marginBottom:10 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:"#555", display:"block", marginBottom:3 }}>Show every X posts</label>
                    <input type="number" min={5} value={bcFreqValue} onChange={e => setBcFreqValue(Math.max(5, Number(e.target.value)))}
                      style={inp({ fontSize:13 })} />
                  </div>
                ) : (
                  <div style={{ marginBottom:10 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:"#555", display:"block", marginBottom:3 }}>Show every X hours</label>
                    <input type="number" min={1} value={bcFreqValue} onChange={e => setBcFreqValue(Math.max(1, Number(e.target.value)))}
                      style={inp({ fontSize:13 })} />
                  </div>
                )}

                <div style={{ display:"flex", gap:8 }}>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:"#555", display:"block", marginBottom:3 }}>Max times per day</label>
                    <input type="number" min={1} value={bcMaxPerDay} onChange={e => setBcMaxPerDay(Math.max(1, Number(e.target.value)))}
                      style={inp({ fontSize:13 })} />
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:"#555", display:"block", marginBottom:3 }}>Expires after (days, 0=never)</label>
                    <input type="number" min={0} value={bcDurationDays} onChange={e => setBcDurationDays(Math.max(0, Number(e.target.value)))}
                      style={inp({ fontSize:13 })} />
                  </div>
                </div>

                <div style={{ marginTop:10, fontSize:11, color:"#4338CA", fontWeight:600, background:"#EEF2FF", borderRadius:6, padding:"6px 10px" }}>
                  {bcFreqType === "posts"
                    ? `Shown every ${bcFreqValue} posts · max ${bcMaxPerDay}×/day`
                    : `Shown every ${bcFreqValue} hrs · max ${bcMaxPerDay}×/day`}
                  {bcDurationDays > 0 ? ` · expires in ${bcDurationDays}d` : " · never expires"}
                </div>
              </div>}

              {bcMsg && (
                <div style={{ fontSize:13, fontWeight:700, color: bcMsg.startsWith("✅") ? "#059669" : "#dc2626", marginBottom:12, padding:"8px 12px", background: bcMsg.startsWith("✅") ? "#F0FFF8" : "#FFF0F0", borderRadius:8 }}>
                  {bcMsg}
                </div>
              )}

              <button onClick={handlePost} disabled={bcPosting || bcUploading}
                style={btn("#059669", { width:"100%", opacity: (bcPosting || bcUploading) ? 0.7 : 1, padding:"12px 0", fontSize:14 })}>
                {bcPosting ? "Posting…" : bcMode === "direct" ? "⚡ Post Directly Now" : "📢 Schedule Broadcast"}
              </button>
            </div>

            {/* Right column */}
            <div>

              {/* ── Boost Existing Spark ── */}
              <div style={{ background:"white", borderRadius:16, padding:20, border:"2px solid #F59E0B", marginBottom:20 }}>
                <div style={{ fontWeight:900, color:"#92400E", fontSize:15, marginBottom:4 }}>🚀 Boost an Existing Spark</div>
                <div style={{ fontSize:12, color:"#888", marginBottom:12 }}>Pick any user's spark and push it to everyone's feed instantly.</div>
                <input
                  placeholder="Search by username or caption…"
                  value={boostSearch}
                  onChange={e => setBoostSearch(e.target.value)}
                  style={{ ...inp(), fontSize:12, marginBottom:10 }}
                />
                <div style={{ maxHeight:320, overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
                  {sparks
                    .filter(s => s.user_id !== ADMIN_USER_ID && (
                      !boostSearch || s.username?.toLowerCase().includes(boostSearch.toLowerCase()) || s.caption?.toLowerCase().includes(boostSearch.toLowerCase())
                    ))
                    .slice(0, 20)
                    .map(s => (
                      <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, background:"#FFFBF0", border:"1px solid #FFD0B0" }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, color:"#2D1200", fontSize:12 }}>@{s.username}</div>
                          <div style={{ fontSize:11, color:"#888", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.caption?.slice(0, 60)}{(s.caption?.length ?? 0) > 60 ? "…" : ""}</div>
                          {boostMsg[s.id] && <div style={{ fontSize:11, color: boostMsg[s.id].startsWith("✅") ? "#059669" : "#dc2626", fontWeight:700, marginTop:2 }}>{boostMsg[s.id]}</div>}
                        </div>
                        <button
                          onClick={() => handleBoost(s.id)}
                          disabled={boostMsg[s.id] === "boosting…"}
                          style={{ padding:"6px 14px", borderRadius:8, background:"#F59E0B", color:"white", fontWeight:800, fontSize:12, border:"none", cursor:"pointer", flexShrink:0 }}>
                          🚀 Boost
                        </button>
                      </div>
                    ))
                  }
                  {sparks.filter(s => s.user_id !== ADMIN_USER_ID).length === 0 && (
                    <div style={{ color:"#aaa", fontSize:13, textAlign:"center", padding:16 }}>No user sparks yet.</div>
                  )}
                </div>
              </div>

              {/* Admin sparks list */}
              <div style={{ fontWeight:800, color:"#2D1200", fontSize:15, marginBottom:14 }}>
                📢 Posted Broadcasts ({adminSparks.length})
              </div>
              {adminSparks.length === 0 && (
                <div style={{ background:"white", borderRadius:12, padding:32, textAlign:"center", color:"#aaa", border:"1px solid #f0e0d0" }}>
                  No broadcasts yet.
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {adminSparks.map(s => {
                  const freqLabel = s.broadcast_freq_type === "time"
                    ? `Every ${s.broadcast_freq_value ?? 0} hrs`
                    : s.broadcast_freq_type === "posts"
                      ? `Every ${s.broadcast_freq_value ?? 0} posts`
                      : null;
                  const expiryLabel = s.broadcast_expires_at
                    ? `Expires ${new Date(s.broadcast_expires_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}`
                    : "Never expires";
                  const targetLabel = s.target_country
                    ? `📍 ${s.target_state ? `${s.target_state}, ` : ""}${s.target_country}`
                    : "🌍 All users";

                  return (
                    <div key={s.id} style={{ background:"white", borderRadius:14, padding:16, border:"1px solid #d1fae5", boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
                      <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                        {/* Thumbnail */}
                        <div style={{ width:72, height:72, borderRadius:12, background:"#F0FFF8", overflow:"hidden", flexShrink:0, border:"2px solid #A7F3D0" }}>
                          {s.media_type === "image"
                            ? <img src={s.media_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                            : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>🎬</div>
                          }
                        </div>

                        <div style={{ flex:1, minWidth:0 }}>
                          {/* Edit or view caption */}
                          {editId === s.id ? (
                            <div>
                              <textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} rows={3}
                                style={{ ...inp(), fontSize:13, marginBottom:8 }} />
                              <div style={{ display:"flex", gap:8 }}>
                                <button onClick={handleEditSave} disabled={editSaving}
                                  style={btn("#059669", { fontSize:12, padding:"6px 14px" })}>
                                  {editSaving ? "Saving…" : "✓ Save"}
                                </button>
                                <button onClick={() => { setEditId(null); setEditCaption(""); }}
                                  style={btn("#888", { fontSize:12, padding:"6px 14px" })}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize:13, color:"#333", lineHeight:1.5, marginBottom:8 }}>{s.caption}</div>
                          )}

                          {/* Badges */}
                          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                            <span style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background:"#d1fae5", color:"#059669", fontWeight:700 }}>📢 Official</span>
                            {freqLabel && (
                              <span style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background:"#EEF2FF", color:"#4338CA", fontWeight:700 }}>
                                🔁 {freqLabel}
                              </span>
                            )}
                            {s.broadcast_max_per_day != null && s.broadcast_max_per_day > 0 && (
                              <span style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background:"#F0F9FF", color:"#0284C7", fontWeight:700 }}>
                                Max {s.broadcast_max_per_day}×/day
                              </span>
                            )}
                            <span style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background:"#FFF8E0", color:"#D97706", fontWeight:700 }}>
                              {expiryLabel}
                            </span>
                            <span style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background: s.target_country ? "#EFF6FF" : "#f3f4f6", color: s.target_country ? "#1d4ed8" : "#6b7280", fontWeight:700 }}>
                              {targetLabel}
                            </span>
                            <span style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background:"#FFF0E0", color:"#E86A2E", fontWeight:700 }}>
                              {totalReactions(s.reactions ?? {})} reactions
                            </span>
                            <span style={{ fontSize:11, color:"#bbb" }}>{fmt(s.created_at)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        {editId !== s.id && (
                          <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                            <button onClick={() => { setEditId(s.id); setEditCaption(s.caption ?? ""); }}
                              style={{ padding:"6px 14px", borderRadius:8, background:"#EFF6FF", color:"#1d4ed8", fontWeight:700, fontSize:12, border:"none", cursor:"pointer" }}>
                              ✏️ Edit
                            </button>
                            <button onClick={() => setDeleteId(s.id)}
                              style={{ padding:"6px 14px", borderRadius:8, background:"#FFF0F0", color:"#dc2626", fontWeight:700, fontSize:12, border:"none", cursor:"pointer" }}>
                              🗑 Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Users Table ──────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div style={{ background:"white", borderRadius:16, overflow:"hidden", border:"1px solid #f0e0d0" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#FFF8F0" }}>
                  {["User","Username","Country","Gender","Coins","Joined"].map(h => (
                    <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontWeight:800, color:"#7A2E00", fontSize:12, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"1px solid #f0e0d0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom:"1px solid #faf0e8" }}>
                    <td style={{ padding:"10px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:14, background:"#FFE4CC", overflow:"hidden", flexShrink:0 }}>
                          {u.profile_pic_url
                            ? <img src={u.profile_pic_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                            : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>👤</div>}
                        </div>
                        <span style={{ fontWeight:700, color:"#2D1200" }}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{ padding:"10px 16px", color:"#555" }}>@{u.username}</td>
                    <td style={{ padding:"10px 16px", color:"#555" }}>{u.country}{u.city ? ` · ${u.city}` : ""}</td>
                    <td style={{ padding:"10px 16px", color:"#555" }}>{u.gender}</td>
                    <td style={{ padding:"10px 16px", fontWeight:700, color:"#D97706" }}>{(u.coins ?? 0).toLocaleString()}</td>
                    <td style={{ padding:"10px 16px", color:"#888", fontSize:11 }}>{fmt(u.created_at)}</td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && <tr><td colSpan={6} style={{ padding:32, textAlign:"center", color:"#aaa" }}>No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Sparks Table ─────────────────────────────────────────────────── */}
        {tab === "sparks" && (
          <div style={{ background:"white", borderRadius:16, overflow:"hidden", border:"1px solid #f0e0d0" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#FFF8F0" }}>
                  {["Media","Creator","Caption","Type","Reach","Frequency","Reactions","Actions","Posted"].map(h => (
                    <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontWeight:800, color:"#7A2E00", fontSize:12, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"1px solid #f0e0d0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSparks.map(s => {
                  const isAdmin = s.user_id === ADMIN_USER_ID;
                  const freqInfo = isAdmin && s.broadcast_freq_type
                    ? (s.broadcast_freq_type === "time"
                        ? `${s.broadcast_freq_value}h`
                        : `${s.broadcast_freq_value}p`)
                    : null;
                  return (
                    <tr key={s.id} style={{ borderBottom:"1px solid #faf0e8", background: isAdmin ? "#F0FFF8" : "white" }}>
                      <td style={{ padding:"10px 16px" }}>
                        <div style={{ width:40, height:40, borderRadius:8, background:"#FFF0E0", overflow:"hidden" }}>
                          {s.media_type === "image"
                            ? <img src={s.media_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                            : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🎬</div>}
                        </div>
                      </td>
                      <td style={{ padding:"10px 16px", fontWeight:700, color: isAdmin ? "#059669" : "#2D1200" }}>
                        {isAdmin ? "📢 " : ""}@{s.username}
                      </td>
                      <td style={{ padding:"10px 16px", color:"#555", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.caption}</td>
                      <td style={{ padding:"10px 16px" }}>
                        <span style={{ padding:"2px 10px", borderRadius:12, background: s.spark_type === "new" ? "#FFF0E0" : "#E8F0FF", color: s.spark_type === "new" ? "#E86A2E" : "#4B7BEC", fontWeight:700, fontSize:11 }}>
                          {s.spark_type === "new" ? "New" : "Ongoing"}
                        </span>
                      </td>
                      <td style={{ padding:"10px 16px" }}>
                        <span style={{ padding:"2px 10px", borderRadius:12, background: s.reach === "beyond" ? "#FFF8E0" : "#F0FFF0", color: s.reach === "beyond" ? "#D97706" : "#059669", fontWeight:700, fontSize:11 }}>
                          {s.reach === "beyond" ? "✨ Beyond" : "Community"}
                        </span>
                      </td>
                      <td style={{ padding:"10px 16px" }}>
                        {freqInfo ? (
                          <span style={{ padding:"2px 10px", borderRadius:12, background:"#EEF2FF", color:"#4338CA", fontWeight:700, fontSize:11 }}>
                            🔁 {freqInfo}
                          </span>
                        ) : (
                          <span style={{ color:"#ccc", fontSize:11 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding:"10px 16px", fontWeight:700, color:"#7C3AED" }}>{totalReactions(s.reactions ?? {})}</td>
                      <td style={{ padding:"10px 16px" }}>
                        <button onClick={() => setDeleteId(s.id)}
                          style={{ padding:"4px 10px", borderRadius:7, background:"#FFF0F0", color:"#dc2626", fontWeight:700, fontSize:11, border:"none", cursor:"pointer" }}>
                          🗑 Delete
                        </button>
                      </td>
                      <td style={{ padding:"10px 16px", color:"#888", fontSize:11 }}>{fmt(s.created_at)}</td>
                    </tr>
                  );
                })}
                {filteredSparks.length === 0 && <tr><td colSpan={9} style={{ padding:32, textAlign:"center", color:"#aaa" }}>No sparks found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Messages Table ───────────────────────────────────────────────── */}
        {tab === "messages" && (
          <div style={{ background:"white", borderRadius:16, overflow:"hidden", border:"1px solid #f0e0d0" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#FFF8F0" }}>
                  {["From","To","Message","Status","Sent"].map(h => (
                    <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontWeight:800, color:"#7A2E00", fontSize:12, textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"1px solid #f0e0d0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map(m => (
                  <tr key={m.id} style={{ borderBottom:"1px solid #faf0e8", background: m.read ? "white" : "#FFFBF0" }}>
                    <td style={{ padding:"10px 16px", fontWeight:700, color:"#2D1200" }}>@{m.from_username}</td>
                    <td style={{ padding:"10px 16px", color:"#555" }}>@{m.to_username}</td>
                    <td style={{ padding:"10px 16px", color:"#333", maxWidth:300, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.content}</td>
                    <td style={{ padding:"10px 16px" }}>
                      <span style={{ padding:"2px 10px", borderRadius:12, background: m.read ? "#F0FFF0" : "#FFF8E0", color: m.read ? "#059669" : "#D97706", fontWeight:700, fontSize:11 }}>
                        {m.read ? "Read" : "Unread"}
                      </span>
                    </td>
                    <td style={{ padding:"10px 16px", color:"#888", fontSize:11 }}>{fmt(m.created_at)}</td>
                  </tr>
                ))}
                {filteredMessages.length === 0 && <tr><td colSpan={5} style={{ padding:32, textAlign:"center", color:"#aaa" }}>No messages found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Reports Tab ──────────────────────────────────────────────────── */}
        {tab === "reports" && (
          <div>
            {/* Summary */}
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
              {[["Total Reports",reports.length,"#E86A2E"],["Open",reports.filter(r=>r.status==="open").length,"#dc2626"],["Replied",reports.filter(r=>r.status==="replied").length,"#059669"],["Closed",reports.filter(r=>r.status==="closed").length,"#888"]].map(([l,v,c])=>(
                <div key={l as string} style={{ background:"white", borderRadius:12, padding:"14px 20px", border:`2px solid ${c}`, flex:1, minWidth:120 }}>
                  <div style={{ fontSize:22, fontWeight:900, color:c as string }}>{v}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#555", marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>

            {reports.length === 0 && (
              <div style={{ background:"white", borderRadius:16, padding:48, textAlign:"center", color:"#aaa", border:"1px solid #f0e0d0" }}>
                No reports yet. Users can submit complaints from the app.
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {reports.map(rep => (
                <div key={rep.id} style={{ background:"white", borderRadius:16, padding:20, border:`2px solid ${rep.status==="open"?"#FCA5A5":rep.status==="replied"?"#A7F3D0":"#E5E7EB"}`, boxShadow:"0 1px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontWeight:800, color:"#2D1200", fontSize:14 }}>@{rep.from_username}</span>
                        <span style={{ background: rep.status==="open"?"#FEE2E2":rep.status==="replied"?"#D1FAE5":"#F3F4F6", color: rep.status==="open"?"#dc2626":rep.status==="replied"?"#059669":"#888", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:20, textTransform:"uppercase" }}>{rep.status}</span>
                      </div>
                      {rep.subject && <div style={{ fontSize:13, fontWeight:700, color:"#555", marginBottom:2 }}>{rep.subject}</div>}
                      <div style={{ fontSize:11, color:"#aaa" }}>{rep.created_at?.slice(0,16).replace("T"," ")}</div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      {rep.status !== "closed" && (
                        <button onClick={async()=>{ await supabase.from("reports").update({status:"closed"}).eq("id",rep.id); loadAll(); }}
                          style={{ background:"#F3F4F6", border:"none", color:"#555", borderRadius:8, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          Close
                        </button>
                      )}
                      <button onClick={()=>{ setReplyId(rep.id); setReplyText(rep.admin_reply||""); }}
                        style={{ background:"#E86A2E", border:"none", color:"white", borderRadius:8, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                        {rep.admin_reply ? "Edit Reply" : "Reply"}
                      </button>
                    </div>
                  </div>

                  {/* Report body */}
                  <div style={{ background:"#FFF8F5", borderRadius:10, padding:"12px 14px", fontSize:13, color:"#333", lineHeight:1.6, marginBottom: rep.admin_reply ? 12 : 0 }}>
                    {rep.body}
                  </div>

                  {/* Admin reply */}
                  {rep.admin_reply && (
                    <div style={{ background:"#F0FFF8", borderRadius:10, padding:"12px 14px", borderLeft:"3px solid #059669", marginTop:8 }}>
                      <div style={{ fontSize:10, fontWeight:800, color:"#059669", textTransform:"uppercase", marginBottom:4 }}>Admin Reply · {rep.replied_at?.slice(0,16).replace("T"," ")}</div>
                      <div style={{ fontSize:13, color:"#333", lineHeight:1.6 }}>{rep.admin_reply}</div>
                    </div>
                  )}

                  {/* Inline reply box */}
                  {replyId === rep.id && (
                    <div style={{ marginTop:12, display:"flex", gap:8 }}>
                      <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Type your reply to the user…" rows={3}
                        style={{ ...inp(), flex:1, resize:"vertical" }} />
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        <button disabled={replySaving || !replyText.trim()}
                          onClick={async()=>{
                            if(!replyText.trim()) return;
                            setReplySaving(true);
                            // Save reply to reports table
                            await supabase.from("reports").update({ admin_reply: replyText.trim(), status:"replied", replied_at: new Date().toISOString() }).eq("id", rep.id);
                            // Send reply as a message in the user's chat
                            await supabase.from("messages").insert({ from_username:"icreate.africa", to_username: rep.from_username, content:`📋 Re your report: ${replyText.trim()}`, read:false });
                            setReplyId(null); setReplyText(""); setReplySaving(false);
                            loadAll();
                          }}
                          style={{ ...btn("#059669",{ padding:"8px 14px", fontSize:12, opacity: replySaving||!replyText.trim()?0.6:1 }) }}>
                          {replySaving ? "Sending…" : "Send"}
                        </button>
                        <button onClick={()=>{setReplyId(null);setReplyText("");}} style={{ background:"#F3F4F6", border:"none", color:"#555", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating ↑ Back to Top */}
      <button
        onClick={() => window.scrollTo({ top:0, behavior:"smooth" })}
        title="Back to top"
        style={{ position:"fixed", bottom:24, right:24, zIndex:200, width:44, height:44, borderRadius:"50%", background:"#2D1200", color:"white", border:"none", fontSize:20, cursor:"pointer", boxShadow:"0 4px 16px rgba(0,0,0,0.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        ↑
      </button>

      {/* Delete confirm overlay */}
      {deleteId && (
        <div style={{ position:"fixed", inset:0, zIndex:99, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.5)" }}
          onClick={() => setDeleteId(null)}>
          <div style={{ background:"white", borderRadius:20, padding:32, maxWidth:320, width:"90%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:32, marginBottom:8 }}>🗑</div>
            <div style={{ fontWeight:900, color:"#2D1200", fontSize:17, marginBottom:8 }}>Delete this spark?</div>
            <div style={{ fontSize:13, color:"#666", marginBottom:24, lineHeight:1.5 }}>
              This will permanently remove the spark for all users. This action cannot be undone.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setDeleteId(null)}
                style={{ flex:1, padding:"10px 0", borderRadius:10, background:"#f3f4f6", color:"#555", fontWeight:700, fontSize:13, border:"none", cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)}
                style={{ flex:1, padding:"10px 0", borderRadius:10, background:"#dc2626", color:"white", fontWeight:800, fontSize:13, border:"none", cursor:"pointer" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
