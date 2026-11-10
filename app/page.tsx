"use client";

import { useEffect, useRef, useState } from "react";
import { sitePath } from "../lib/site-path";
import { BarChart3, BellRing, Camera, Check, ChevronLeft, ChevronRight, Code2, LockKeyhole, MessageCircle, Mic, Plus, Signal, Video, Volume2, VolumeX, Wifi, X } from "lucide-react";

const features = [
  { label: "Snap or Text", icon: Camera },
  { label: "Smart Reminders", icon: BellRing },
  { label: "Daily Summaries", icon: BarChart3 },
];
const faqs = [
  ["How does Calorietext track my calories?", "The idea is simple: text what you ate or send a meal photo, and get an estimate of calories and macros in the same conversation. This website shows an interactive preview. Live food analysis and messaging are the next step."],
  ["What do I need to get started?", "You can explore the demo right here. The planned service will have its own phone number, so you can message it from iMessage on iPhone or your messaging app on Android. No separate app to download."],
  ["Do I need to weigh my food?", "You’ll be able to describe portions naturally, like ‘a bowl of pasta’ or ‘two slices of pizza.’ Photos and descriptions provide estimates. Weighed portions and package labels help improve accuracy."],
  ["How does the free trial work?", "This website demo is free to explore and does not require a credit card. Live messaging, trial terms, and pricing will be announced before launch. Nothing on this page starts a subscription."],
  ["What languages are supported?", "The first version is being designed for English. More languages are planned as we build and test the service."],
];

function Logo({ small = false }: { small?: boolean }) {
  return <span className={`app-logo ${small ? "small" : ""}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="8.7" stroke="currentColor" strokeWidth="2.3" strokeDasharray="2.3 4.6" strokeLinecap="round"/><circle cx="16" cy="16" r="2.1" fill="currentColor"/></svg></span>;
}
function MessageIcon() { return <span className="message-icon" aria-hidden="true"><MessageCircle size={20} fill="white" strokeWidth={0}/></span>; }
function StartButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) { return <button className={`start-button ${compact ? "compact" : ""}`} onClick={onClick}>{!compact && <MessageIcon/>}<span>Get Started</span></button>; }

function StatusBar({ time }: { time: string }) { return <div className="status-bar"><b>{time}</b><div className="dynamic-island"/><span><Signal size={13} fill="currentColor"/><Wifi size={12}/><i className="battery"/></span></div>; }
function Summary() { return <div className="bubble incoming summary"><p>Here’s your day, at a glance ✨</p><div className="meal-row"><span>☀️ Protein oats</span><span>320 kcal</span></div><div className="meal-row"><span>🥗 Chicken bowl</span><span>410 kcal</span></div><div className="meal-row"><span>🍫 Afternoon snack</span><span>180 kcal</span></div><div className="meal-row"><span>🥘 Dinner</span><span>510 kcal</span></div><div className="summary-total"><b>1,420</b><span> / 2,100 kcal</span></div><div className="progress-bar"><i/></div><div className="macro-row"><span><b>112g</b> protein</span><span><b>148g</b> carbs</span><span><b>42g</b> fat</span></div><p>You’ve got 680 kcal left. A little room for something good. 🙌</p></div>; }
function Phone({ active, locked, time, date, interactive = false, onSummary }: { active: number; locked: boolean; time: string; date: string; interactive?: boolean; onSummary?: () => void }) {
  return <div className={`phone ${locked || active === 1 ? "lock-phone" : "chat-phone"}`} aria-label="Calorietext messaging demonstration"><i className="side-button side-left-one"/><i className="side-button side-left-two"/><i className="side-button side-right"/><div className="phone-screen"><StatusBar time={time}/>
    {locked || active === 1 ? <div className="lock-screen"><div className="lock-date">{date}</div><div className="lock-time">{time.replace(/\s?[AP]M$/, "")}</div>{active === 1 && <div className="notification animate-in"><div className="notification-title"><Logo small/><b>Calorietext</b><span>now</span></div><p>🥗 Lunch time! Snap a photo and I’ll handle the rest.</p></div>}<div className="lock-bottom"><span><Camera size={18}/></span><span>Swipe up to open</span></div></div> : <><div className="chat-header"><ChevronLeft className="back-icon" size={22}/><div className="contact-avatar"><Logo/></div><Video className="video-icon" size={18}/><b>Calorietext <ChevronRight size={10}/></b><span>iMessage</span><small><LockKeyhole size={8}/> Encrypted</small></div><div className="phone-conversation" key={active}><div className="message-date">Today {time}</div>{active === 0 ? <><div className="photo-message animate-in"><img src={sitePath("/images/salad.jpg")} alt="A colorful vegetable salad in a bowl"/></div><div className="bubble outgoing animate-in">My lunch today 🥗</div><div className="delivered">Delivered</div><div className="bubble incoming animate-in delayed"><p>Looks delicious! Here’s an estimate for your salad bowl:</p><div className="calorie-total">🥗 <b>410 calories</b></div><div className="nutrition-list"><span>Protein <b>18g</b></span><span>Carbs <b>42g</b></span><span>Fat <b>19g</b></span></div><p>Logged for lunch. You’re doing great ✨</p></div></> : <><div className="bubble outgoing animate-in">How am I doing today?</div><div className="delivered">Delivered</div><div className="animate-in delayed"><Summary/></div></>}</div><div className="composer"><span className="composer-plus"><Plus size={17}/></span><button aria-label={interactive ? "Show a sample daily summary" : "Try the messaging demo"} onClick={onSummary} tabIndex={interactive ? 0 : -1}>iMessage <Mic size={14}/></button></div></>}
    <div className="home-indicator"/></div></div>;
}

export default function Home() {
  const [active, setActive] = useState(0);
  const [locked, setLocked] = useState(true);
  const [showTabs, setShowTabs] = useState(true);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState("9:41");
  const [date, setDate] = useState("Monday, November 9");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [demoTab, setDemoTab] = useState(0);
  const [demoOpen, setDemoOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const manualSelection = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const updateTime = () => { const now = new Date(); setTime(now.toLocaleTimeString("en-US", {hour:"numeric", minute:"2-digit"})); setDate(now.toLocaleDateString("en-US", {weekday:"long", month:"long",day:"numeric"})); };
    updateTime(); const timer = setInterval(updateTime, 60000);
    const scroll = () => { if (!sectionRef.current) return; const rect = sectionRef.current.getBoundingClientRect(); const top = rect.top; setShowTabs(rect.bottom > window.innerHeight - 70); setLocked(top > 260 && !manualSelection.current); if (!manualSelection.current) setActive(top < -1100 ? 2 : top < -500 ? 1 : 0); };
    scroll(); window.addEventListener("scroll", scroll, {passive:true});
    return () => { clearInterval(timer); window.removeEventListener("scroll", scroll); };
  }, []);
  useEffect(() => { document.body.style.overflow = demoOpen ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [demoOpen]);
  const chime = () => { if (muted) return; try { const ctx = audioRef.current ?? new AudioContext(); audioRef.current = ctx; void ctx.resume(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.setValueAtTime(660, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + .09); gain.gain.setValueAtTime(.06,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.25); osc.start(); osc.stop(ctx.currentTime+.25); } catch { /* Audio is optional. */ } };
  const selectFeature = (i: number) => { manualSelection.current = true; setActive(i); setLocked(false); chime(); };
  const openDemo = () => { setDemoTab(0); setDemoOpen(true); dialogRef.current?.showModal(); };
  const closeDemo = () => { dialogRef.current?.close(); setDemoOpen(false); };

  return <><a className="skip-link" href="#main">Skip to content</a><header className="header"><nav className="nav-shell" aria-label="Main navigation"><a href="#" className="brand" aria-label="Calorietext home"><Logo/><span>calorietext</span></a><div className="nav-links"><a href="#features">Features</a><a href="#faqs">FAQs</a></div><StartButton compact onClick={openDemo}/></nav></header>
  <main id="main"><section className="hero"><div className="eyebrow"><span className="tiny-avatars" aria-hidden="true"><span>🥑</span><span>🥗</span><span>🍊</span></span><span>Calorie tracking, made simple</span></div><h1>Track calories from<br className="desktop-break"/> your texts.</h1><p className="hero-description">Send a photo or describe your meal. AI handles the rest —<br className="desktop-break"/> calories, macros, streaks, all in your messages.</p><StartButton onClick={openDemo}/><p className="fine-print">Try the demo · No app required</p></section>
  <section id="features" className="feature-section" ref={sectionRef} aria-label="Explore Calorietext features"><div className="phone-stage"><div className="phone-wrap"><Phone active={active} locked={locked} time={time} date={date}/></div><button className="sound-toggle" onClick={()=>setMuted(!muted)} aria-label={muted ? "Unmute sounds" : "Mute sounds"} aria-pressed={!muted}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button><div className="feature-tabs" style={{visibility:showTabs ? "visible" : "hidden"}} role="tablist" aria-label="Demo features">{features.map((f,i)=><button key={f.label} role="tab" aria-selected={active===i} aria-controls="feature-caption" tabIndex={active===i ? 0 : -1} className={active===i ? "active" : ""} onClick={()=>selectFeature(i)} onKeyDown={e=>{if(e.key === "ArrowRight" || e.key === "ArrowLeft") {e.preventDefault();const next = (i+(e.key==="ArrowRight"?1:2))%3;selectFeature(next);(e.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();}}}><f.icon size={16}/><span>{f.label}</span></button>)}</div><p id="feature-caption" role="tabpanel" className="demo-caption">{active===0 ? "A photo. A text. A little more clarity." : active===1 ? "A gentle nudge, right when you need it." : "Your whole day, in one simple message."}<span>Illustrative demo</span></p></div></section>
  <section id="faqs" className="faq-section"><h2>FAQs</h2><div className="faq-list">{faqs.map(([question,answer],i)=><div className={`faq-item ${openFaq===i ? "is-open" : ""}`} key={question}><h3><button id={`faq-question-${i}`} aria-expanded={openFaq===i} aria-controls={`faq-answer-${i}`} onClick={()=>setOpenFaq(openFaq===i ? null : i)}>{question}<Plus size={18}/></button></h3><div className="faq-answer" id={`faq-answer-${i}`} role="region" aria-labelledby={`faq-question-${i}`} hidden={openFaq!==i}><p>{answer}</p></div></div>)}</div></section>
  <section id="get-started" className="get-started-section"><div className="get-started-card"><h2>Start tracking today</h2><p>A little less logging. A little more living.<br/>See how simple tracking through a text can be.</p><div className="start-options"><div><StartButton onClick={openDemo}/><span className="fine-print">Explore the interactive demo</span></div><span className="option-divider"/><div><button className="qr-button" onClick={openDemo} aria-label="Open the Calorietext demo"><img src={sitePath("/qr.svg")} alt="QR code linking to the Calorietext website preview" width="126" height="126"/></button><span className="fine-print">Scan to open this preview</span></div></div></div></section></main>
  <footer><a className="footer-brand" href="#">calorietext</a><p>Calorie tracking that lives in your texts.</p><a className="social-link" href="https://github.com/kennethokereke100/Calorietext" target="_blank" rel="noreferrer" aria-label="Calorietext on GitHub"><Code2 size={17}/></a><div className="legal-links"><a href={sitePath("/privacy/")}>Privacy</a><a href={sitePath("/terms/")}>Terms</a></div><small>© {new Date().getFullYear()} Calorietext</small></footer>
  <dialog ref={dialogRef} className="demo-dialog" onCancel={()=>setDemoOpen(false)} onClose={()=>setDemoOpen(false)} onClick={e=>{if(e.target===e.currentTarget)closeDemo();}}><button className="dialog-close" onClick={closeDemo} aria-label="Close demo"><X size={20}/></button><div className="demo-copy"><span className="preview-label"><span/> INTERACTIVE PREVIEW</span><h2>Your next healthy<br/>habit starts with a text.</h2><p>Take a look inside Calorietext. Try the sample conversations to see how it will feel.</p><div className="demo-actions">{features.map((f,i)=><button key={f.label} onClick={()=>setDemoTab(i)} className={demoTab===i ? "selected" : ""}><f.icon size={20}/><span>{i===0 ? "Log a sample meal" : i===1 ? "See a meal reminder" : "Get a daily summary"}</span>{demoTab===i ? <Check size={16}/> : <ChevronRight size={16}/>}</button>)}</div><p className="preview-disclosure">This is a sample experience. No messages are sent, and live food analysis isn’t connected yet.</p></div><div className="modal-phone"><Phone active={demoTab} locked={false} time={time} date={date} interactive onSummary={()=>setDemoTab(demoTab===2 ? 0 : 2)}/></div></dialog></>;
}
