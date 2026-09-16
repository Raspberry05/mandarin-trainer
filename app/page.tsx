'use client'
import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    import('@/lib/ui').then(m => m.init())
  }, [])
  return (
    <>
      <div id="boot"><div className="spin"></div><div className="hint">loading libraries (sql.js, jszip, zstd)…</div></div>
      <header>
        <h1>Language Trainer</h1>
        <button id="back-btn" style={{display:'none'}}>‹ Home</button>
        <input type="file" id="file-in" accept=".apkg,.colpkg,.txt,.csv" multiple hidden />
        <button id="settings-btn">⚙ Settings</button>
        <button id="reset-card-btn" title="Erase ALL progress for this deck and start over">♻ Reset deck</button>
        <button id="mode-btn" title="Flashcard = cards with image & audio · Voice = spoken question, answer with the mic">🎙 Voice mode</button>
        <button id="auth-btn">👤 Sign in / Sign up</button>
      </header>
      <main>
        <div id="home-view">
          <div id="diag" style={{fontSize:'11.5px',color:'var(--dim)',margin:'0 0 8px',fontFamily:'monospace'}}>booting…</div>
          <div className="hero"><p className="hint" style={{fontSize:'15px'}}>Sentence-first Anki-style lessons. Pick a curriculum below, or import your own deck.</p></div>
          <div id="home-drop">📦 drop .apkg / .txt here — or <button id="import-btn" className="primary">⬆ Import decks</button></div>
          <div id="import-status" className="hint"></div>
          <div id="deck-grid"></div>
        </div>
        <div id="study-view" style={{display:'none'}}>
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
          <div className="row"><label>ElevenLabs API key (for ElevenLabs / all auto Mandarin)</label><input type="text" id="s-elevenKey" placeholder="xi-api-key"></input></div>
          <div className="row"><label>OpenAI API key (gpt-4o-mini-tts fallback engine)</label><input type="text" id="s-openaiKey" placeholder="sk-…"></input></div>
          <div className="row"><label>ElevenLabs voice ID (optional)</label><input type="text" id="s-elevenVoice" placeholder="JBFqnCBsd6RMkjVDRZzb"></input></div>
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
