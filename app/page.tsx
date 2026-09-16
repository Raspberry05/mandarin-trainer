'use client'
import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    import('@/lib/ui').then(m => m.init())
    /* home dashboard cursor ambience: soft glow follows the pointer, orbs parallax behind it */
    const glow = document.getElementById('cursor-glow')
    const home = document.getElementById('home-view')
    const onMove = (e: MouseEvent) => {
      if (glow) glow.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0) translate(-50%,-50%)`
      if (home) {
        home.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3))
        home.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3))
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  return (
    <>
      <div id="boot"><div className="spin"></div><div className="hint">loading libraries (sql.js, jszip, zstd)…</div></div>
      <div id="cursor-glow" aria-hidden="true"></div>
      <header>
        <h1><span className="logo-ic"><svg width="25" height="25" viewBox="0 0 24 24" fill="none"><rect x="3" y="4.5" width="18" height="13" rx="5.5" stroke="#00c2ff" strokeWidth="2.3"/><rect className="eq" x="8.4" y="9.4" width="2.1" height="4.2" rx="1" fill="#00e676"/><rect className="eq" x="11.6" y="7.8" width="2.1" height="7.4" rx="1" fill="#b249ff"/><rect className="eq" x="14.8" y="9.4" width="2.1" height="4.2" rx="1" fill="#ff4b8b"/></svg></span>Aya!</h1>
        <button id="back-btn" style={{display:'none'}}>‹ Home</button>
        <input type="file" id="file-in" accept=".apkg,.colpkg,.txt,.csv" multiple hidden />
        <button id="settings-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/></svg>Settings</button>
        <button id="reset-card-btn" title="Erase ALL progress for this deck and start over"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffb300" strokeWidth="2.4" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5" strokeLinejoin="round"/></svg>Reset deck</button>
        <button id="mode-btn" style={{display:'none'}}>mode</button>
        <button id="auth-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>Sign in / Sign up</button>
      </header>
      <main>
        <div id="home-view">
          <div className="orb orb1" aria-hidden="true"></div>
          <div className="orb orb2" aria-hidden="true"></div>
          <div className="orb orb3" aria-hidden="true"></div>
          <div id="diag" style={{fontSize:'11.5px',color:'var(--dim)',margin:'0 0 8px',fontFamily:'monospace'}}>booting…</div>
          <div className="hero">
            <h2><span className="hero-ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle className="ring" cx="12" cy="12" r="9" stroke="#00c2ff" strokeWidth="2.4"/><circle className="ring" cx="12" cy="12" r="4.5" stroke="#b249ff" strokeWidth="2.4" style={{animationDirection:'reverse'}}/><circle className="dot" cx="12" cy="12" r="1.8" fill="#ff4b8b"/></svg></span>Speak your way to fluency</h2>
            <p className="hint" style={{fontSize:'15px'}}>Sentence-first Anki-style lessons. Pick a curriculum below, or import your own deck.</p>
          </div>
          <div id="home-drop"><span className="drop-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#00c2ff" strokeWidth="2"><path d="M12 3 3.5 7.2v9.6L12 21l8.5-4.2V7.2z" fill="rgba(0,194,255,.08)"/><path d="M3.5 7.2 12 11.5l8.5-4.3M12 11.5v9.3"/></svg></span>drop .apkg / .txt here — or <button id="import-btn" className="primary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg>Import decks</button></div>
          <div id="import-status" className="hint"></div>
          <div id="deck-page" style={{ display: 'none' }}></div>
          <div id="deck-grid"></div>
        </div>
        <div id="study-view" style={{display:'none'}}>
          {/* mic-reactive background voice viz: ambient glow + vertical light columns */}
          <div id="viz-glow" aria-hidden="true"></div>
          <div id="viz-l" aria-hidden="true"></div>
          <div id="viz-r" aria-hidden="true"></div>
          <div id="study-top">
            <div id="cur-lesson-wrap"><span className="hint">CURRENTLY STUDYING:</span><b id="cur-lesson"></b></div>
            <div id="top-prog"><div id="top-fill-track"><div id="top-fill"></div></div><span id="top-pct"></span></div>
            <div id="top-chips"></div>
            <div id="mode-pills">
              <button id="mp-silent" className="pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00c2ff" strokeWidth="2.2"><rect x="3" y="6" width="13" height="13" rx="3"/><path d="M7.5 3h11a2.5 2.5 0 0 1 2.5 2.5v10.5" strokeLinecap="round"/></svg>Flashcard</button>
              <button id="mp-voice" className="pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00c2ff" strokeWidth="2.2" strokeLinecap="round"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="#00c2ff" stroke="none"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>Voice</button>
              <button id="mp-chat" className="pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b249ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4.5z"/></svg>Conversational</button>
            </div>
          </div>
          <div className="stats">
            <span>New today: <b id="st-new">0</b></span>
            <span>Reviews today: <b id="st-rev">0</b></span>
            <span>Queue: <b id="st-queue">0</b></span>
            <span>Leeched: <b id="st-leech">0</b></span>
          </div>
          <div id="deckbar"></div>
          <div id="study-wrap">
            <div id="curriculum-wrap">
              <div id="rail"><div id="rail-lbl"></div><div id="rail-bar"><div id="rail-fill"></div></div></div>
              <div id="curriculum"></div>
            </div>
            <div className="study-main">
              <div id="cardbox">
                <div className="stage" id="stage-lbl">no decks loaded</div>
                <div className="prompt" id="prompt"></div>
                <div className="btnrow" id="actions"></div>
                <div id="feedback"></div>
                <div id="timer"></div>
              </div>
            </div>
          </div>
          <div id="vbar">
            <div id="mic-state" className="hint">mic —</div>
            <div id="vbar-btns">
              <button id="v-pause">⏸ Pause</button>
              <button id="v-set">⚙</button>
              <button id="v-help" title="how voice mode works">?</button>
              <button id="v-exit">✕ Exit</button>
            </div>
          </div>
        </div>
      </main>
      <div id="drop-overlay">📦 drop .apkg / .txt / .csv here</div>
      <footer>
        <span id="build-info">checking build…</span>
        <span className="hint">Space = replay audio · Enter = next / &quot;I know it&quot; · flow: sentence → word → test → sentence practice</span>
      </footer>

      <div className="modal" id="settings-modal">
        <div className="mbox">
          <h2>⚙ Settings</h2>
          <div className="row"><label>New cards/day</label><input type="number" id="s-newday" min={0} max={9999} /></div>
          <div className="row"><label>Maximum reviews/day</label><input type="number" id="s-maxrev" min={0} max={9999} /></div>
          <div className="row"><label>Learning steps</label><input type="text" id="s-steps" placeholder="5s 50s 2m" /></div>
          <div className="row"><label>Relearning steps</label><input type="text" id="s-relearn" /></div>
          <div className="row"><label>Leech threshold</label><input type="number" id="s-leech" min={0} max={99} /></div>
          <div className="row"><label>Leech action</label><select id="s-leechact"><option>Suspend Card</option><option>Tag Only</option></select></div>
          <div className="row"><label>Don&apos;t play audio automatically</label><input type="checkbox" id="s-noautoplay" /></div>
          <div className="row"><label>Wait for audio (block reveal)</label><input type="checkbox" id="s-waitaudio" /></div>
          <div className="row"><label>Maximum answer seconds</label><input type="number" id="s-maxsec" min={0} max={600} /></div>
          <div className="row"><label>New card sort order</label><select id="s-newsrt"><option>Random</option><option>Sequential (oldest first)</option></select></div>
          <div className="row"><label>Review sort order</label><select id="s-revsrt"><option>Due date, then random</option><option>Random</option></select></div>
          <div className="row"><label>Show new after reviews</label><input type="checkbox" id="s-newafter" /></div>
          <div className="row"><label>Desired retention (% — scales interval growth)</label><input type="number" id="s-ret" min={80} max={99} /></div>
          <div className="row"><label>Maximum interval (days)</label><input type="number" id="s-maxivl" min={1} max={36500} /></div>
          <div className="row"><label>Study mode (Flashcard = cards with image & audio · Voice = mic answers · Conversational = chat with AI)</label><select id="s-mode"><option value="silent">Flashcard</option><option value="voice">Voice</option><option value="chat">Conversational</option></select></div>
          <div className="row"><label>Text-to-speech engine</label><select id="s-ttspref"><option value="auto">Auto (best available)</option><option value="local">Device voice</option><option value="google">Google TTS (AI voice)</option><option value="eleven">ElevenLabs (premium AI voice)</option><option value="openai">OpenAI (gpt-4o-mini-tts)</option></select></div>
          <div className="row"><label>Speech recognition engine (voice mode)</label><select id="s-asr"><option value="auto">Auto — browser first, ElevenLabs if it won't hear you</option><option value="browser">Browser only (Web Speech)</option><option value="eleven">ElevenLabs Scribe only (record → transcribe)</option></select></div>
          <div className="row"><label>Voice test — hear the current engine before saving</label><span style={{ display: 'flex', gap: '8px' }}><button id="tts-test-zh" type="button">🔊 Test 中文</button><button id="tts-test-en" type="button">🔊 Test English</button></span></div>
          <div className="row"><label>ElevenLabs API key (for ElevenLabs / all auto Mandarin)</label><input type="text" id="s-elevenKey" placeholder="xi-api-key"></input></div>
          <div className="row"><label>OpenAI API key (gpt-4o-mini-tts fallback engine)</label><input type="text" id="s-openaiKey" placeholder="sk-…"></input></div>
          <div className="row"><label>ElevenLabs voice ID — Mandarin answers (optional; default Alice Xb7hH8MSUJpSbSDYk0k2 · Jason Chen DowyQ68vDpgFYdWVGjc3 = native Beijing voice, requires a paid ElevenLabs plan — free tier returns 402)</label><input type="text" id="s-elevenVoice" placeholder="Xb7hH8MSUJpSbSDYk0k2"></input></div>
          <div className="row"><label>ElevenLabs voice ID — English questions (optional; default George)</label><input type="text" id="s-elevenVoiceEn" placeholder="JBFqnCBsd6RMkjVDRZzb"></input></div>
          <div className="row"><label>Preset</label><select id="s-preset"></select></div>
          <div className="row"><label>Preset name (save current)</label><input type="text" id="s-pname" placeholder="Default" /></div>
          <div className="btnrow" style={{marginTop:'14px'}}>
            <button id="preset-save">💾 Save preset</button>
            <button id="preset-del">🗑 Delete preset</button>
            <button className="primary" id="settings-close" style={{marginLeft:'auto'}}>Done</button>
          </div>
          <p className="hint" style={{marginTop:'10px'}}>Scheduler is simplified (interval-based, no FSRS matrices). Retention % scales interval growth; other mechanics mirror Anki behavior.</p>
        </div>
      </div>

      <div className="modal" id="deck-modal">
        <div className="mbox">
          <h2>📚 Loaded decks</h2>
          <div id="deck-list" style={{maxHeight:'300px',overflow:'auto'}}></div>
          <div className="btnrow" style={{marginTop:'14px'}}>
            <button className="primary" id="deck-close" style={{marginLeft:'auto'}}>Done</button>
          </div>
        </div>
      </div>

      <div className="modal" id="auth-modal">
        <div className="mbox">
          <h2>👤 Sign in / Sign up</h2>
          <p className="hint">sync your progress across devices (phone ↔ desktop). we email you a one-time code — no password. new email? you're signed up automatically.</p>
          <div className="row"><label>Email</label><input type="email" id="auth-email" placeholder="you@example.com" /></div>
          <div className="row" id="auth-code-wrap" style={{display:'none'}}><label>6-digit code</label><input type="text" id="auth-code" inputMode="numeric" maxLength={8} placeholder="123456" /></div>
          <div className="btnrow" style={{marginTop:'14px'}}>
            <button id="auth-send" className="primary">✉ Send code</button>
            <button id="auth-verify" style={{display:'none'}}>Verify &amp; sign in</button>
            <button id="auth-out" style={{display:'none'}}>Sign out</button>
            <button id="auth-cancel">Close</button>
          </div>
          <div id="auth-msg" className="hint" style={{marginTop:'10px'}}></div>
        </div>
      </div>
    </>
  )
}
