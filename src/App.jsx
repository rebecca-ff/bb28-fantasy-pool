import { useState, useEffect } from "react";
import * as storage from "./storage.js";

// ——— Big Brother 28 "Time Trip" cast ———
const CAST = [
  { id: "angela", name: "Angela Murray", sub: "BB26 Returnee" },
  { id: "rick", name: "Rick Devens", sub: "Survivor Legend" },
  { id: "ashley", name: "Ashley Trail", sub: "24 · Newbie" },
  { id: "barrett", name: "Barrett Pfeiffer", sub: "Jumbotron Engineer" },
  { id: "chuk", name: "Chuk Anyanwu", sub: "27 · Newbie" },
  { id: "drew", name: "Drew Campbell", sub: "22 · Newbie" },
  { id: "haley", name: "Haley Thogmartin", sub: "Telemedicine Exec" },
  { id: "jason", name: "Jason De Puy", sub: "Drag Race All Star" },
  { id: "kamu", name: "Kamu Kirk", sub: "MMA Fighter" },
  { id: "latrice", name: "LaTrice Verrett", sub: "57 · Boutique Sales" },
  { id: "lyric", name: "Lyric Medeiros", sub: "25 · Newbie" },
  { id: "mallory", name: "Mallory Aurichio", sub: "Rocket Scientist" },
  { id: "melody", name: "Melody Morris", sub: "Game Show Host" },
  { id: "rome", name: "Rome Seymour", sub: "Pickleball Coach" },
  { id: "taylor", name: "Taylor Brown", sub: "27 · Newbie" },
  { id: "yash", name: "Yash Patel", sub: "Newbie" },
  { id: "dee", name: "Dee", sub: "New Houseguest" },
];
const byId = Object.fromEntries(CAST.map((p) => [p.id, p]));
// Bump this id for any new pool-wide announcement; it shows once per device.
const ANNOUNCE_ID = "dee-joined";
const NUM_WEEKS = 12;

// ——— Scoring (modeled on classic BB pool formats) ———
const PRE_CATS = [
  { id: "winner", label: "Season Winner", pts: 10 },
  { id: "runnerUp", label: "Runner-Up", pts: 5 },
  { id: "firstHoh", label: "First HOH", pts: 3 },
  { id: "firstEvicted", label: "First Evicted", pts: 3 },
  { id: "afp", label: "America's Favorite", pts: 3 },
  { id: "final4", label: "Final 4 (pick 4)", pts: 2, multi: 4 },
  { id: "showmance", label: "First Showmance (pick 2)", pts: 3, multi: 2, bonus: true },
  { id: "alliance", label: "Power Alliance (pick 3 members)", pts: 2, multi: 3, bonus: true },
  { id: "villain", label: "Biggest Villain", pts: 4, bonus: true },
  { id: "strategist", label: "Best Strategy", pts: 4, bonus: true },
  { id: "socialGame", label: "Worst Social Game", pts: 3, bonus: true },
];
const MAIN_CATS = PRE_CATS.filter((c) => !c.bonus);
const BONUS_CATS = PRE_CATS.filter((c) => c.bonus);
const WEEK_CATS = [
  { id: "hoh", label: "HOH Winner", pts: 2 },
  { id: "veto", label: "Veto Winner", pts: 2 },
  { id: "blockbuster", label: "Block Buster Winner", pts: 1 },
  { id: "evicted", label: "Evicted Houseguest", pts: 3 },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const emptySheet = () => ({ pre: {}, weeks: {} });

// Header live-status: is a BB episode airing right now, or are the 24/7 live
// feeds on? Based on the CBS broadcast schedule in US Eastern time. Episodes
// air Sun & Wed 8:00pm and the Thu 8:00pm live eviction; feeds run the rest of
// the time. Tweak EPISODE_WINDOWS (minutes-from-midnight ET) if it changes.
const EPISODE_WINDOWS = {
  Sun: [[20 * 60, 21 * 60]], // Sunday 8:00–9:00pm ET
  Wed: [[20 * 60, 21 * 60 + 30]], // Wednesday 8:00–9:30pm ET
  Thu: [[20 * 60, 21 * 60]], // Thursday live eviction 8:00–9:00pm ET
};

const getLinkStatus = () => {
  let wd, mins;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    wd = p.weekday;
    mins = (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10);
  } catch (e) {
    return { label: "LIVE FEEDS ON", color: "#5CE1B9" };
  }
  const live = (EPISODE_WINDOWS[wd] || []).some(([a, b]) => mins >= a && mins < b);
  return live
    ? { label: "EPISODE LIVE", color: "#FF5CA8" }
    : { label: "LIVE FEEDS ON", color: "#5CE1B9" };
};

const scoreOf = (sheet, results) => {
  let pre = 0, weekly = 0;
  const rp = results.pre || {}, sp = sheet.pre || {};
  for (const cat of PRE_CATS) {
    if (cat.multi) {
      const actual = rp[cat.id] || [];
      const mine = sp[cat.id] || [];
      pre += mine.filter((id) => actual.includes(id)).length * cat.pts;
    } else if (rp[cat.id] && sp[cat.id] === rp[cat.id]) pre += cat.pts;
  }
  for (let w = 1; w <= NUM_WEEKS; w++) {
    const rw = results.weeks?.[w] || {}, sw = sheet.weeks?.[w] || {};
    for (const cat of WEEK_CATS) {
      if (rw[cat.id] && sw[cat.id] === rw[cat.id]) weekly += cat.pts;
    }
  }
  return { pre, weekly, total: pre + weekly };
};

// evicted before week w, per official results
const evictedBefore = (results, w) => {
  const out = new Set();
  for (let i = 1; i < w; i++) {
    const e = results.weeks?.[i]?.evicted;
    if (e) out.add(e);
  }
  return out;
};

const S = {
  card: { background: "#15122F", border: "1px solid #2E2A5C", borderRadius: 14 },
  orb: { fontFamily: "'Orbitron', sans-serif" },
  pinkBtn: { background: "rgba(255,92,168,.14)", border: "1px solid #FF5CA8", color: "#FF5CA8", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Orbitron', sans-serif", letterSpacing: "0.1em" },
  ghostBtn: { background: "none", border: "1px solid #2E2A5C", color: "#7F7BA6", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
};

function Chip({ p, selected, correct, wrong, disabled, onClick, accent }) {
  return (
    <button
      className="slot"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${selected ? accent : "#26224E"}`,
        background: selected ? "rgba(255,194,75,.12)" : "#191542",
        boxShadow: selected ? `0 0 12px ${accent}40` : "none",
        color: selected ? accent : disabled ? "#4E4A78" : "#C9CEDA",
        fontSize: 13,
        fontWeight: selected ? 700 : 500,
        fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        textDecoration: disabled ? "line-through" : "none",
      }}
    >
      {p.name.split(" ")[1] ? `${p.name.split(" ")[0]} ${p.name.split(" ")[1][0]}.` : p.name.split(" ")[0]}
      {correct && <span style={{ marginLeft: 4 }}>✓</span>}
      {wrong && <span style={{ marginLeft: 4 }}>✗</span>}
    </button>
  );
}

function Category({ cat, value, onChange, excluded, actual, accent = "#FFC24B", showGrading }) {
  const isMulti = !!cat.multi;
  const selectedIds = isMulti ? value || [] : value ? [value] : [];
  const toggle = (id) => {
    if (isMulti) {
      const cur = value || [];
      if (cur.includes(id)) onChange(cur.filter((x) => x !== id));
      else if (cur.length < cat.multi) onChange([...cur, id]);
    } else {
      onChange(value === id ? undefined : id);
    }
  };
  return (
    <div style={{ ...S.card, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "#E4E6F0" }}>{cat.label}</span>
        <span style={{ ...S.orb, fontSize: 10, color: "#FF5CA8", letterSpacing: "0.1em" }}>
          {cat.pts} PT{cat.pts > 1 ? "S" : ""}{isMulti ? " EACH" : ""}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CAST.map((p) => {
          const selected = selectedIds.includes(p.id);
          const isActual = showGrading && (isMulti ? (actual || []).includes(p.id) : actual === p.id);
          return (
            <Chip
              key={p.id}
              p={p}
              selected={selected}
              correct={selected && isActual}
              wrong={showGrading && selected && actual && !isActual}
              disabled={excluded?.has(p.id) && !selected}
              onClick={() => toggle(p.id)}
              accent={accent}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [sheet, setSheet] = useState(emptySheet());
  const [results, setResults] = useState(emptySheet());
  const [players, setPlayers] = useState([]);
  const [view, setView] = useState("pre"); // pre | weekly | leaderboard | results
  const [week, setWeek] = useState(1);
  const [rSection, setRSection] = useState("weekly"); // in results view: weekly | season
  const [rWeek, setRWeek] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [pendingImg, setPendingImg] = useState(null); // File
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [, setTick] = useState(0); // ticks each minute to refresh live status
  const [showAnnounce, setShowAnnounce] = useState(false);

  const dismissAnnounce = () => {
    storage.setLocal("bb28-pool-announce-seen", ANNOUNCE_ID);
    setShowAnnounce(false);
  };

  const loadShared = async () => {
    try {
      const r = await storage.get("bb28-pool-results");
      if (r) setResults(r);
    } catch (e) {}
    try {
      const rows = await storage.listWithValues("bb28-pool-player:");
      setPlayers(rows.map((row) => row.value).filter(Boolean));
    } catch (e) {}
  };

  useEffect(() => {
    (async () => {
      const m = storage.getLocal("bb28-pool-me");
      if (m) {
        setMe(m);
        try {
          const rec = await storage.get(`bb28-pool-player:${m.id}`);
          if (rec) setSheet({ pre: rec.pre || {}, weeks: rec.weeks || {} });
        } catch (e) {}
        // Returning player who hasn't seen the new-houseguest notice yet.
        if (storage.getLocal("bb28-pool-announce-seen") !== ANNOUNCE_ID)
          setShowAnnounce(true);
      }
      await loadShared();
      setLoaded(true);
    })();
  }, []);

  // Keep the header live-status (episode live / feeds on) current.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const join = async () => {
    const name = nameInput.trim();
    if (!name) return;
    const id = slug(name) || `player-${Date.now()}`;
    const player = { id, name };
    setMe(player);
    storage.setLocal("bb28-pool-me", player);
    try {
      const rec = await storage.get(`bb28-pool-player:${id}`);
      if (rec) setSheet({ pre: rec.pre || {}, weeks: rec.weeks || {} });
      else await storage.set(`bb28-pool-player:${id}`, { id, name, ...emptySheet() });
    } catch (e) {}
    await loadShared();
  };

  const saveSheet = async (next) => {
    setSheet(next);
    if (!me) return;
    setSaving(true);
    try {
      await storage.set(`bb28-pool-player:${me.id}`, { id: me.id, name: me.name, ...next });
    } catch (e) {}
    setSaving(false);
  };

  const saveResults = async (next) => {
    setResults(next);
    try { await storage.set("bb28-pool-results", next); } catch (e) {}
  };

  const loadChat = async () => {
    try {
      const msgs = await storage.listChat();
      setChat(msgs);
    } catch (e) {}
  };

  // Poll the chat every 5s while the Chat tab is open so it stays in sync.
  useEffect(() => {
    if (view !== "chat") return;
    loadChat();
    const t = setInterval(loadChat, 5000);
    return () => clearInterval(t);
  }, [view]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if ((!text && !pendingImg) || chatBusy || !me) return;
    setChatBusy(true);
    setChatError(null);
    try {
      let imageUrl;
      if (pendingImg) imageUrl = await storage.uploadChatImage(pendingImg);
      await storage.postChat({ authorId: me.id, author: me.name, text, imageUrl });
      setChatInput("");
      setPendingImg(null);
      await loadChat();
    } catch (e) {
      setChatError(e?.message || "Couldn't send — try again.");
    } finally {
      setChatBusy(false);
    }
  };

  const setPre = (catId, val) => saveSheet({ ...sheet, pre: { ...sheet.pre, [catId]: val } });
  const setWeekPick = (w, catId, val) =>
    saveSheet({ ...sheet, weeks: { ...sheet.weeks, [w]: { ...(sheet.weeks[w] || {}), [catId]: val } } });
  const setResultPre = (catId, val) => saveResults({ ...results, pre: { ...results.pre, [catId]: val } });
  const setResultWeek = (w, catId, val) =>
    saveResults({ ...results, weeks: { ...results.weeks, [w]: { ...(results.weeks?.[w] || {}), [catId]: val } } });

  const resultsStarted =
    Object.keys(results.pre || {}).length > 0 ||
    Object.values(results.weeks || {}).some((w) => Object.keys(w).length > 0);

  const board = players
    .map((p) => ({ ...p, ...scoreOf(p, results) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const weekTabs = (current, setCurrent, accent) => (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
      {Array.from({ length: NUM_WEEKS }).map((_, i) => {
        const w = i + 1;
        const active = current === w;
        return (
          <button key={w} onClick={() => setCurrent(w)}
            style={{ flex: "0 0 auto", padding: "8px 12px", borderRadius: 10,
              border: `1px solid ${active ? accent : "#2E2A5C"}`,
              background: active ? "rgba(255,92,168,.14)" : "#15122F",
              color: active ? accent : "#7F7BA6", ...S.orb, fontSize: 10, letterSpacing: "0.1em", cursor: "pointer" }}>
            WK {w}
          </button>
        );
      })}
    </div>
  );

  if (!storage.configured)
    return (
      <div style={{ minHeight: "100vh", background: "#0E0C22", color: "#C9CEDA", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#FFC24B", marginBottom: 8 }}>Almost there — connect Supabase</div>
          <div style={{ fontSize: 13, color: "#7F7BA6", lineHeight: 1.6 }}>
            Set VITE_SUPABASE_ANON_KEY in your Vercel environment variables (or a local .env), run the SQL in supabase/schema.sql, and redeploy.
          </div>
        </div>
      </div>
    );

  if (!loaded) return <div style={{ background: "#0E0C22", minHeight: "100vh" }} />;

  return (
    <div style={{ minHeight: "100vh", background: "#0E0C22", color: "#C9CEDA", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Space+Grotesk:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        .slot { transition: transform .12s ease, border-color .12s ease, box-shadow .12s ease; }
        .slot:active { transform: scale(.96); }
        input::placeholder { color: #4E4A78; }
        ::-webkit-scrollbar { height: 4px; } ::-webkit-scrollbar-thumb { background: #2E2A5C; border-radius: 2px; }

        /* ——— Time Trip ambience (decorative only, behind all content) ——— */
        .bg-stars, .bg-grid, .bg-scanlines {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
        }
        .bg-stars {
          background-image:
            radial-gradient(1px 1px at 12% 22%, rgba(201,206,218,.5) 50%, transparent 51%),
            radial-gradient(1px 1px at 68% 12%, rgba(255,92,168,.45) 50%, transparent 51%),
            radial-gradient(1.5px 1.5px at 84% 44%, rgba(201,206,218,.35) 50%, transparent 51%),
            radial-gradient(1px 1px at 32% 64%, rgba(255,194,75,.4) 50%, transparent 51%),
            radial-gradient(1px 1px at 52% 86%, rgba(201,206,218,.4) 50%, transparent 51%),
            radial-gradient(1.5px 1.5px at 8% 78%, rgba(92,225,185,.35) 50%, transparent 51%);
          animation: starDrift 90s linear infinite;
        }
        .bg-grid {
          background-image:
            linear-gradient(rgba(255,92,168,.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,92,168,.05) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: linear-gradient(to bottom, transparent 30%, black 100%);
          -webkit-mask-image: linear-gradient(to bottom, transparent 30%, black 100%);
        }
        .bg-scanlines {
          background: repeating-linear-gradient(to bottom, transparent 0 3px, rgba(0,0,0,.09) 3px 4px);
          opacity: .5;
        }
        @keyframes starDrift { from { background-position: 0 0; } to { background-position: -220px 160px; } }

        .glow-amber { text-shadow: 0 0 18px rgba(255,194,75,.45), 0 0 42px rgba(255,194,75,.18); }
        .pulse-dot {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          background: #5CE1B9; box-shadow: 0 0 8px rgba(92,225,185,.8);
          animation: pulse 2.4s ease-in-out infinite; vertical-align: middle; margin-right: 6px;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        .rank-one { box-shadow: 0 0 16px rgba(255,194,75,.15), inset 0 0 20px rgba(255,194,75,.05); }

        @media (prefers-reduced-motion: reduce) {
          .slot { transition: none; }
          .bg-stars { animation: none; }
          .pulse-dot { animation: none; }
        }
      `}</style>
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-stars" aria-hidden="true" />
      <div className="bg-scanlines" aria-hidden="true" />

      {showAnnounce && (
        <div
          onClick={dismissAnnounce}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(8,7,22,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...S.card, maxWidth: 420, width: "100%", padding: 24, textAlign: "center", boxShadow: "0 0 44px rgba(255,92,168,.28)" }}
          >
            <div style={{ ...S.orb, fontSize: 11, letterSpacing: "0.3em", color: "#FF5CA8", marginBottom: 10 }}>◆ NEW HOUSEGUEST ◆</div>
            <div className="glow-amber" style={{ ...S.orb, fontSize: 20, color: "#FFC24B", marginBottom: 12, letterSpacing: "0.04em" }}>DEE HAS ENTERED THE HOUSE</div>
            <p style={{ fontSize: 14, color: "#C9CEDA", lineHeight: 1.6, marginTop: 0 }}>
              A new houseguest just joined Season 28 and she&rsquo;s now on the board. Head back to your{" "}
              <span style={{ color: "#FF5CA8", fontWeight: 700 }}>Pre-Season</span> and{" "}
              <span style={{ color: "#FF5CA8", fontWeight: 700 }}>Weekly</span> picks to update your selections.
            </p>
            <button
              onClick={() => { setView("pre"); dismissAnnounce(); }}
              style={{ ...S.pinkBtn, width: "100%", marginTop: 16, padding: 12 }}
            >
              UPDATE MY PICKS →
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 48px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ ...S.orb, fontSize: 11, letterSpacing: "0.35em", color: "#FF5CA8", marginBottom: 6 }}>
            SEASON 28 · TIME TRIP · FANTASY POOL
          </div>
          <h1 className="glow-amber" style={{ ...S.orb, fontWeight: 800, fontSize: 28, margin: 0, color: "#FFC24B", letterSpacing: "0.06em" }}>
            BIG BROTHER
          </h1>
          {(() => {
            const s = getLinkStatus();
            return (
              <div style={{ ...S.orb, fontSize: 9, letterSpacing: "0.25em", color: s.color, marginTop: 8 }}>
                <span
                  className="pulse-dot"
                  aria-hidden="true"
                  style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }}
                />
                {s.label}
              </div>
            );
          })()}
        </div>

        {!me ? (
          <div style={{ ...S.card, padding: 20 }}>
            <div style={{ ...S.orb, fontSize: 12, letterSpacing: "0.2em", color: "#FF5CA8", marginBottom: 10 }}>JOIN THE POOL</div>
            <p style={{ fontSize: 13, color: "#7F7BA6", marginTop: 0 }}>
              Enter your name to start. Your name and picks are visible to everyone in the pool.
            </p>
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()} placeholder="Your name"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #2E2A5C", background: "#191542", color: "#E4E6F0", fontSize: 15, fontFamily: "inherit", outline: "none" }} />
            <button onClick={join} style={{ ...S.pinkBtn, width: "100%", marginTop: 12, padding: "12px" }}>ENTER THE HOUSE →</button>
            {players.length > 0 && (
              <div style={{ marginTop: 16, fontSize: 12, color: "#7F7BA6" }}>
                Already playing: {players.map((p) => p.name).join(", ")}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 14 }}>
              {[
                { id: "pre", label: "PRE-SEASON" },
                { id: "weekly", label: "WEEKLY" },
                { id: "leaderboard", label: "STANDINGS" },
                { id: "results", label: "RESULTS" },
                { id: "chat", label: "CHAT" },
              ].map((t) => (
                <button key={t.id} onClick={() => { setView(t.id); if (t.id === "leaderboard") loadShared(); if (t.id === "chat") loadChat(); }}
                  style={{ padding: "10px 2px", borderRadius: 10, border: `1px solid ${view === t.id ? "#FFC24B" : "#2E2A5C"}`,
                    background: view === t.id ? "rgba(255,194,75,.12)" : "#15122F",
                    color: view === t.id ? "#FFC24B" : "#7F7BA6", ...S.orb, fontSize: 9, letterSpacing: "0.08em", cursor: "pointer" }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, color: "#7F7BA6", textAlign: "center", marginBottom: 14 }}>
              Playing as <span style={{ color: "#E4E6F0", fontWeight: 700 }}>{me.name}</span>{saving ? " · saving…" : ""}
            </div>

            {view === "pre" && (
              <>
                <p style={{ fontSize: 13, color: "#7F7BA6", textAlign: "center", marginTop: 0 }}>
                  Lock these in before the premiere. Big swings live here — the winner pick alone is worth 10.
                </p>
                {MAIN_CATS.map((cat) => (
                  <Category key={cat.id} cat={cat} value={sheet.pre[cat.id]}
                    onChange={(v) => setPre(cat.id, v)}
                    actual={results.pre?.[cat.id]} showGrading={!!results.pre?.[cat.id]} />
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 12px" }}>
                  <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #FF5CA8)" }} />
                  <span style={{ ...S.orb, fontSize: 10, letterSpacing: "0.25em", color: "#FF5CA8" }}>BONUS AWARDS</span>
                  <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #FF5CA8, transparent)" }} />
                </div>
                <p style={{ fontSize: 12, color: "#7F7BA6", textAlign: "center", marginTop: 0 }}>
                  Judged by the pool at season's end — argue it out, then log the verdicts in Season Results.
                </p>
                {BONUS_CATS.map((cat) => (
                  <Category key={cat.id} cat={cat} value={sheet.pre[cat.id]}
                    onChange={(v) => setPre(cat.id, v)}
                    actual={results.pre?.[cat.id]} showGrading={!!results.pre?.[cat.id]} />
                ))}
              </>
            )}

            {view === "weekly" && (
              <>
                {weekTabs(week, setWeek, "#FF5CA8")}
                <p style={{ fontSize: 13, color: "#7F7BA6", textAlign: "center", marginTop: 0 }}>
                  Week {week}: call the HOH, Veto, Block Buster, and who walks out the door. Evicted houseguests are crossed out.
                </p>
                {WEEK_CATS.map((cat) => (
                  <Category key={cat.id} cat={cat} value={sheet.weeks[week]?.[cat.id]}
                    onChange={(v) => setWeekPick(week, cat.id, v)}
                    excluded={evictedBefore(results, week)}
                    actual={results.weeks?.[week]?.[cat.id]}
                    showGrading={!!results.weeks?.[week]?.[cat.id]} />
                ))}
              </>
            )}

            {view === "leaderboard" && (
              <div>
                {!resultsStarted && (
                  <div style={{ fontSize: 13, color: "#7F7BA6", textAlign: "center", marginBottom: 14 }}>
                    Scores start once official results are entered in the Results tab.
                  </div>
                )}
                {board.length === 0 ? (
                  <div style={{ ...S.card, padding: 20, textAlign: "center", color: "#7F7BA6", fontSize: 14 }}>
                    No players yet. Share this artifact link so friends can join.
                  </div>
                ) : (
                  board.map((p, i) => (
                    <div key={p.id} className={i === 0 && resultsStarted ? "rank-one" : ""} style={{ ...S.card, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, borderColor: p.id === me.id ? "#FF5CA8" : i === 0 && resultsStarted ? "#FFC24B" : "#2E2A5C" }}>
                      <div style={{ ...S.orb, fontSize: 18, color: i === 0 && resultsStarted ? "#FFC24B" : "#4E4A78", width: 28, textAlign: "center" }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#E4E6F0" }}>
                          {p.name}{p.id === me.id ? " (you)" : ""}
                        </div>
                        <div style={{ fontSize: 12, color: "#7F7BA6", marginTop: 2 }}>
                          {p.pre?.winner ? `Winner pick: ${byId[p.pre.winner]?.name || "?"}` : "No winner pick yet"}
                          {" · "}Pre {p.pre != null ? scoreOf(p, results).pre : 0} · Weekly {scoreOf(p, results).weekly}
                        </div>
                      </div>
                      <div style={{ ...S.orb, fontSize: 20, color: "#FFC24B" }}>{p.total}</div>
                    </div>
                  ))
                )}
                <div style={{ ...S.card, padding: 12, marginTop: 14, fontSize: 12, color: "#7F7BA6", lineHeight: 1.7 }}>
                  <span style={{ ...S.orb, fontSize: 10, letterSpacing: "0.2em", color: "#FF5CA8" }}>SCORING</span><br />
                  Season winner 10 · Runner-up 5 · First HOH 3 · First evicted 3 · America's Favorite 3 · Final 4 picks 2 each<br />
                  Weekly: Eviction 3 · HOH 2 · Veto 2 · Block Buster 1<br />
                  Bonus: Biggest Villain 4 · Best Strategy 4 · Worst Social Game 3 · Showmance picks 3 each · Alliance picks 2 each
                </div>
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button onClick={loadShared} style={S.ghostBtn}>Refresh</button>
                </div>
              </div>
            )}

            {view === "results" && (
              <>
                <p style={{ fontSize: 13, color: "#7F7BA6", textAlign: "center", marginTop: 0 }}>
                  Official outcomes — update after each episode. Everyone's picks are scored against these. Marking an eviction crosses that houseguest out of later weeks.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                  {[{ id: "weekly", label: "WEEKLY RESULTS" }, { id: "season", label: "SEASON RESULTS" }].map((t) => (
                    <button key={t.id} onClick={() => setRSection(t.id)}
                      style={{ padding: "10px 2px", borderRadius: 10, border: `1px solid ${rSection === t.id ? "#5CE1B9" : "#2E2A5C"}`,
                        background: rSection === t.id ? "rgba(92,225,185,.1)" : "#15122F",
                        color: rSection === t.id ? "#5CE1B9" : "#7F7BA6", ...S.orb, fontSize: 9, letterSpacing: "0.08em", cursor: "pointer" }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {rSection === "weekly" ? (
                  <>
                    {weekTabs(rWeek, setRWeek, "#5CE1B9")}
                    {WEEK_CATS.map((cat) => (
                      <Category key={cat.id} cat={cat} value={results.weeks?.[rWeek]?.[cat.id]}
                        onChange={(v) => setResultWeek(rWeek, cat.id, v)}
                        excluded={evictedBefore(results, rWeek)} accent="#5CE1B9" />
                    ))}
                  </>
                ) : (
                  <>
                    {MAIN_CATS.map((cat) => (
                      <Category key={cat.id} cat={cat} value={results.pre?.[cat.id]}
                        onChange={(v) => setResultPre(cat.id, v)} accent="#5CE1B9" />
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 12px" }}>
                      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #5CE1B9)" }} />
                      <span style={{ ...S.orb, fontSize: 10, letterSpacing: "0.25em", color: "#5CE1B9" }}>BONUS VERDICTS</span>
                      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #5CE1B9, transparent)" }} />
                    </div>
                    {BONUS_CATS.map((cat) => (
                      <Category key={cat.id} cat={cat} value={results.pre?.[cat.id]}
                        onChange={(v) => setResultPre(cat.id, v)} accent="#5CE1B9" />
                    ))}
                  </>
                )}
              </>
            )}

            {view === "chat" && (
              <>
                <p style={{ fontSize: 13, color: "#7F7BA6", textAlign: "center", marginTop: 0 }}>
                  Talk trash, react to evictions, drop screenshots. Visible to everyone in the pool.
                </p>
                <div style={{ ...S.card, padding: 12, height: "48vh", minHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {chat.length === 0 ? (
                    <div style={{ margin: "auto", textAlign: "center", color: "#7F7BA6", fontSize: 13 }}>
                      No messages yet. Say something before the first HOH.
                    </div>
                  ) : (
                    chat.map((m) => {
                      const mine = m.authorId === me.id;
                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                          <div style={{ fontSize: 10, color: "#7F7BA6", marginBottom: 3, padding: "0 4px" }}>
                            <span style={{ color: mine ? "#FF5CA8" : "#5CE1B9", fontWeight: 700 }}>{mine ? "You" : m.author}</span>
                            {" · "}
                            {new Date(m.ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </div>
                          <div style={{ maxWidth: "80%", padding: m.imageUrl && !m.text ? 4 : "8px 12px", borderRadius: 12,
                            border: `1px solid ${mine ? "#FF5CA8" : "#2E2A5C"}`,
                            background: mine ? "rgba(255,92,168,.10)" : "#191542", color: "#E4E6F0", fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" }}>
                            {m.imageUrl && (
                              <a href={m.imageUrl} target="_blank" rel="noreferrer">
                                <img src={m.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8, display: "block", marginBottom: m.text ? 6 : 0 }} />
                              </a>
                            )}
                            {m.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {pendingImg && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <img src={URL.createObjectURL(pendingImg)} alt="" style={{ height: 44, width: 44, objectFit: "cover", borderRadius: 8, border: "1px solid #2E2A5C" }} />
                    <span style={{ fontSize: 12, color: "#7F7BA6", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingImg.name}</span>
                    <button onClick={() => setPendingImg(null)} style={S.ghostBtn}>Remove</button>
                  </div>
                )}
                {chatError && <div style={{ fontSize: 12, color: "#FF5CA8", marginTop: 8 }}>{chatError}</div>}

                <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                  <label style={{ ...S.ghostBtn, display: "flex", alignItems: "center", justifyContent: "center", cursor: chatBusy ? "default" : "pointer", opacity: chatBusy ? 0.5 : 1 }}>
                    📎
                    <input type="file" accept="image/*" disabled={chatBusy} style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPendingImg(f); setChatError(null); } e.target.value = ""; }} />
                  </label>
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
                    placeholder="Message the pool…" disabled={chatBusy}
                    style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid #2E2A5C", background: "#191542", color: "#E4E6F0", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
                  <button onClick={sendChat} disabled={chatBusy || (!chatInput.trim() && !pendingImg)}
                    style={{ ...S.pinkBtn, padding: "12px 16px", opacity: chatBusy || (!chatInput.trim() && !pendingImg) ? 0.5 : 1 }}>
                    {chatBusy ? "…" : "SEND"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
