/* ============================================================
   METRUM-CHALLENGE: Klassenspiel zur Stunde "Metrum, Puls, Tempo".
   Ohne Parameter = Lehrkraft (Beamer), ?raum=CODE = Schueler (QR-Code).
   Drei Teile, aus der Praesentation der Stunde:
     tempo  Folie 16 - der Beamer spielt einen Song, alle tippen auf dem
            Handy im Metrum, das Handy rechnet die bpm aus und gibt ab.
     quiz   Folie 17 - die sechs Fragen aus dem LearningApps-Spiel
            "Metronom-Millionaer" (learningapps.org/watch?v=pdatcfv2j21).
     nach   Folie 21 - der Beamer klatscht einen Takt zum Metronom vor
            (80 bzw. 100 bpm), danach tippen alle den Rhythmus nach.

   Live-Daten im Firebase-Projekt greenboys-scoreboard unter rooms/mt-<CODE>
   (die Regeln geben rooms/$roomCode frei, ohne .validate - deshalb nur
   kleine, flache Daten; das Scoreboard nutzt dort Klassennamen ohne "mt-"):
     lehrer          nur die Lehrkraft schreibt: phase ('lobby' | 'teil' |
                     'frage' | 'aufl' | 'ende'), nr, anzahl, art, spiel,
                     aufgabe (was die Kinder sehen duerfen), start
                     (Serverzeit), dauer (s), spieltBis (nach: Serverzeit,
                     bis dahin klatscht der Beamer vor), loesung (erst in
                     'aufl'), wertung {id: {p, b, x, g, pl}}, entfernt {id}
     spieler/<id>    {name, emoji, seit}
     antw/<spiel>_<nr>/<id>
                     {w, t}: w = bpm (tempo), Antwort-Index (quiz) oder
                     Tipp-Zeiten in ms ab dem ersten Tipp (nach);
                     t = Serverzeit der Abgabe (fuer die Reihenfolge).
   Download pro Stunde: wenige KB je Geraet - jeder liest nur 'lehrer',
   die Lehrkraft zusaetzlich 'spieler' und die Antworten der laufenden Runde.

   Punkte (rechnet nur die Lehrkraft): je Runde 0-100 Grundpunkte fuer die
   Genauigkeit, dazu ein Platzbonus 50/40/30/20/10 fuer die ersten fuenf
   Abgaben mit mindestens 60 Grundpunkten. Siehe PUNKTE_* und *_Basis().
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getDatabase, ref, set, update, get, onValue, remove, serverTimestamp, onDisconnect } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

const firebaseConfig = {
    apiKey: 'AIzaSyA8aYVFa8XbIwviC4iJDA46gK0rMfF97Ac',
    authDomain: 'greenboys-scoreboard.firebaseapp.com',
    databaseURL: 'https://greenboys-scoreboard-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'greenboys-scoreboard',
    storageBucket: 'greenboys-scoreboard.firebasestorage.app',
    messagingSenderId: '1059492482424',
    appId: '1:1059492482424:web:9b4ad8c62ba51a83f8cc8d'
};
const db = getDatabase(initializeApp(firebaseConfig));
const pfad = (code, rest) => `rooms/mt-${code}${rest ? '/' + rest : ''}`;

/* ---------- Inhalte der Stunde ---------- */
const TEMPO = [
    { hb: 1, titel: 'Charlie Puth: Boy', bpm: 93 },
    { hb: 2, titel: 'The Fearless Flyers: Ace of Aces', bpm: 106 },
    { hb: 3, titel: 'Louis La Roche: Crusaders', bpm: 120 },
    { hb: 4, titel: 'Digimon: Eine Vision', bpm: 152 },
    { hb: 5, titel: 'ABBA: Voulez-Vous', bpm: 116 }
];
// Erste Antwort ist jeweils die richtige (wie in LearningApps), gemischt wird beim Raum oeffnen
const QUIZ = [
    { stufe: '500 €', frage: 'Welche Aussage ist richtig?', antworten: ['Das Metrum ist ein gleichmäßiges Wiederkehren eines Schlages (Puls).', 'Das Metrum ist ein Gerät zur Angabe des Tempos.', 'Das Metrum kann nie schneller als 120 bpm sein.', 'Das Metrum ist ein Einkaufscenter.'] },
    { stufe: '1.000 €', frage: 'Was gibt das Metronom an?', antworten: ['Das Tempo.', 'Den Wetterbericht.', 'Die Lottozahlen.', '120 bpm.'] },
    { stufe: '5.000 €', frage: 'Kann das Tempo in einem Werk verändert werden?', antworten: ['Ja.', 'Nein.'] },
    { stufe: '50.000 €', frage: 'Auf welches Instrument höre ich, um das Metrum leichter herauszufinden?', antworten: ['Auf das Drumset.', 'Auf die Gitarre.', 'Auf das Klavier.', 'Auf den E-Bass.'] },
    { stufe: '250.000 €', frage: 'Was ist die englische Übersetzung für „Schläge pro Minute“?', antworten: ['beats per minute', 'pulse per minute', 'drag and drop', '120 per minute'] },
    { stufe: '1 Million €', frage: 'Bei 120 bpm erklingen …', antworten: ['2 Schläge pro Sekunde.', '3 Schläge pro Sekunde.', '4 Schläge pro Sekunde.', '1 Schlag pro Sekunde.'] }
];
const LEITER = ['500 €', '1.000 €', '5.000 €', '50.000 €', '250.000 €', '1 Million €'];
// Ein 4/4-Takt je Runde, Kuerzel wie in der Rhythmus-Werkstatt (noten.js)
const NACH = [
    { bpm: 80, r: 'V-V-H' },
    { bpm: 80, r: 'AA-V-AA-V' },
    { bpm: 80, r: 'V-AA-V-Vp' },
    { bpm: 100, r: 'AA-AA-V-V' },
    { bpm: 100, r: 'V-Vp-AA-V' },
    { bpm: 100, r: 'AA-V-AA-AA' }
];
const SILBEN = { V: 'ta', AA: 'ti-ti', H: 'ta-a', Vp: 'pst' };
const TEIL_INFO = {
    tempo: { name: 'Tempo tippen', icon: 'fa-gauge-high', folie: 'Folie 16', text: 'Hört den Song und tippt auf eurem Gerät gleichmäßig im Metrum. Das Gerät misst eure bpm. Wer am genauesten ist und schnell abgibt, holt die meisten Punkte.' },
    quiz: { name: 'Metronom-Millionär', icon: 'fa-sack-dollar', folie: 'Folie 17', text: 'Sechs Fragen von 500 € bis zur Million. Tippt die richtige Antwort – je schneller, desto mehr Punkte.' },
    nach: { name: 'Vor- & Nachmachen', icon: 'fa-hands-clapping', folie: 'Folie 21', text: 'Der Beamer klatscht einen Rhythmus zum Metronom vor. Erst zuhören – dann tippt ihr ihn auf eurem Gerät nach.' }
};
const ZEIT_STANDARD = { tempo: 60, quiz: 20, nach: 30 };

/* ---------- Punkte ---------- */
const PUNKTE_PLATZ = [50, 40, 30, 20, 10];   // Bonus fuer die ersten Abgaben ...
const PUNKTE_BONUS_AB = 60;                    // ... mit mindestens so vielen Grundpunkten
const TEMPO_STUFEN = [[3, 100], [6, 80], [10, 60], [15, 40], [20, 20]];   // Abweichung bis x % -> Punkte

function tempoBasis(ziel, bpm) {
    if (!(bpm > 0)) return { b: 0, abw: null, halb: false };
    const stufe = (d) => (TEMPO_STUFEN.find(([g]) => d <= g) || [0, 0])[1];
    const d = Math.abs(bpm - ziel) / ziel * 100;
    // Es zaehlt nur das angegebene Tempo (Toms Entscheidung). Halbes oder doppeltes
    // Tempo gibt 0 Punkte - wird aber erkannt, damit die Aufloesung es benennen kann.
    const halb = stufe(d) === 0 && stufe(Math.abs(bpm * 2 - ziel) / ziel * 100) > 0 ? 'halb'
        : stufe(d) === 0 && stufe(Math.abs(bpm / 2 - ziel) / ziel * 100) > 0 ? 'doppelt' : false;
    return { b: stufe(d), abw: d, halb };
}
function quizBasis(richtig, w) { return { b: w === richtig ? 100 : 0 }; }

// Einsaetze eines Rhythmus in Schlaegen (Viertel) ab 0, plus Laenge
function einsaetze(kuerzel) {
    const liste = rhythmusLesen(kuerzel);
    const o = [];
    let pos = 0;
    liste.forEach(b => b.teile.forEach(t => { if (!t.p) o.push(Math.round(pos * 1000) / 1000); pos += t.d; }));
    return { o, laenge: pos };
}
/* Nachgetippter Rhythmus: Tipps (ms ab dem ersten) gegen die Einsaetze.
   Das Tempo darf um bis zu 20 % abweichen (bester Faktor k gewinnt), jeder
   Einsatz zaehlt mit dem Abstand zum naechsten freien Tipp (ohne passenden
   Tipp: 1/2 Schlag). Mittlerer Fehler <= 0,08 Schlaege = 100, >= 0,4 = 0,
   dazwischen linear - mal Anzahl-Faktor (kleinere durch groessere Zahl von
   Tipps und Einsaetzen: 4 statt 3 Tipps = 75 %). */
function nachBasis(o, taps, bpm) {
    if (!Array.isArray(taps) || !taps.length) return { b: 0, f: null, k: 1 };
    const schlag = 60000 / bpm;
    let best = null;
    for (let k = 0.8; k <= 1.2501; k += 0.01) {
        const t = taps.map(ms => ms / (schlag * k));
        const frei = t.map(() => true);
        let summe = 0, treffer = 0;
        o.forEach(e => {
            let bi = -1, bd = 1e9;
            t.forEach((x, i) => { const d = Math.abs(x - e); if (frei[i] && d < bd) { bd = d; bi = i; } });
            if (bi >= 0 && bd < 0.5) { frei[bi] = false; summe += bd; treffer++; } else summe += 0.5;
        });
        const f = summe / o.length;
        if (!best || f < best.f) best = { f, k };
    }
    const zeit = best.f <= 0.08 ? 1 : best.f >= 0.4 ? 0 : (0.4 - best.f) / 0.32;
    const anzahl = Math.min(o.length, taps.length) / Math.max(o.length, taps.length);
    return { b: Math.round(100 * zeit * anzahl / 5) * 5, f: best.f, k: best.k };
}

/* ---------- Kleinkram ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } };
const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const zufall = (n, z) => Array.from({ length: n }, () => z[Math.floor(Math.random() * z.length)]).join('');
const EMOJIS = ['🥁', '🎸', '🎹', '🎺', '🎷', '🎻', '🪇', '🎤', '🦊', '🐼', '🐸', '🦄', '🐙', '🚀', '⚡', '🌈'];
const ABCD = ['A', 'B', 'C', 'D'];
function zeigen(id, an) { $(id).classList.toggle('hidden', !an); }
function toast(text, art) {
    const el = document.createElement('div');
    el.className = 'toast' + (art ? ' ' + art : '');
    el.textContent = text;
    $('toast-bereich').appendChild(el);
    setTimeout(() => el.remove(), 3200);
}
function mischen(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
const rund1 = (x) => Math.round(x * 10) / 10;

let zeitVersatz = 0;   // Serverzeit - Geraetezeit
onValue(ref(db, '.info/serverTimeOffset'), s => { zeitVersatz = s.val() || 0; });
const jetzt = () => Date.now() + zeitVersatz;
onValue(ref(db, '.info/connected'), s => {
    const el = $('verbindung');
    el.classList.toggle('an', !!s.val());
    el.title = s.val() ? 'Verbunden' : 'Keine Verbindung';
    // Kind war kurz weg (WLAN, Sperrbildschirm): wieder als verbunden melden
    if (s.val() && sDrin) sPraesenz();   // Callback kommt erst nach dem Laden des Moduls
});

/* ---------- Audio (Metronom, Klatschen) ----------
   Safari bleibt stumm, solange der Kontext nicht aus einem Klick heraus
   gestartet wurde - deshalb holt jeder Knopf, der spielt, audio() zuerst. */
let ctx = null, rauschen = null;
function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}
function klick(zeit, betont) {
    const c = audio(), o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.value = betont ? 1760 : 1100;
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(betont ? 0.6 : 0.4, zeit + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.06);
    o.connect(g).connect(c.destination);
    o.start(zeit); o.stop(zeit + 0.08);
}
function klatsch(zeit) {
    const c = audio();
    if (!rauschen) {
        rauschen = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
        const d = rauschen.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.9;
    const g = c.createGain();
    // drei kurze Stoesse + Nachklang = Klatschen
    g.gain.setValueAtTime(0.0001, zeit);
    [0, 0.011, 0.022].forEach(v => {
        g.gain.setValueAtTime(1.4, zeit + v);
        g.gain.exponentialRampToValueAtTime(0.25, zeit + v + 0.009);
    });
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.2);
    const q = c.createBufferSource();
    q.buffer = rauschen;
    q.connect(f).connect(g).connect(c.destination);
    q.start(zeit); q.stop(zeit + 0.25);
}
/* Ein Takt Vorzaehler, dann der Rhythmus zum Metronom. onSchlag(i, art)
   meldet jeden Schlag fuer die Anzeige ('vor' = Vorzaehler, 'rh' = Rhythmus).
   Gibt die Dauer in ms zurueck. */
let vorspielTimer = [];
function vorspielen(bpm, kuerzel, onSchlag) {
    vorspielStopp();
    const c = audio(), s = 60 / bpm, { o, laenge } = einsaetze(kuerzel);
    const t0 = c.currentTime + 0.2;
    for (let b = 0; b < 4; b++) klick(t0 + b * s, b === 0);
    const r0 = t0 + 4 * s;
    for (let b = 0; b < laenge; b++) klick(r0 + b * s, b === 0);
    o.forEach(e => klatsch(r0 + e * s));
    const versatz = (t0 - c.currentTime) * 1000;
    for (let b = 0; b < 4 + laenge; b++) {
        vorspielTimer.push(setTimeout(() => onSchlag && onSchlag(b < 4 ? b : b - 4, b < 4 ? 'vor' : 'rh'), versatz + b * s * 1000));
    }
    const dauer = versatz + (4 + laenge) * s * 1000;
    vorspielTimer.push(setTimeout(() => onSchlag && onSchlag(-1, 'ende'), dauer));
    return dauer;
}
function vorspielStopp() { vorspielTimer.forEach(clearTimeout); vorspielTimer = []; }

/* ---------- Hoerbeispiele (nur lokal, IndexedDB) ---------- */
function idb() {
    return new Promise((res, rej) => {
        const r = indexedDB.open('metrum-challenge', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('hb');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function hbSpeichern(nr, datei) {
    const d = await idb();
    await new Promise((res, rej) => {
        const tx = d.transaction('hb', 'readwrite');
        tx.objectStore('hb').put({ blob: datei, name: datei.name }, nr);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
}
async function hbAlle() {
    try {
        const d = await idb();
        return await new Promise((res) => {
            const aus = {}, st = d.transaction('hb').objectStore('hb');
            const r = st.openCursor();
            r.onsuccess = () => { const c = r.result; if (c) { aus[c.key] = c.value; c.continue(); } else res(aus); };
            r.onerror = () => res(aus);
        });
    } catch (e) { return {}; }
}
/* Eigene Songs liegen im selben Speicher unter Schluesseln "e-xxxxxx"
   (die fuenf Songs von Folie 16 unter 1-5): {blob, name, titel, bpm}. */
async function hbAendern(key, felder) {
    const d = await idb();
    await new Promise((res, rej) => {
        const tx = d.transaction('hb', 'readwrite'), st = tx.objectStore('hb');
        const r = st.get(key);
        r.onsuccess = () => { if (r.result) st.put(Object.assign(r.result, felder), key); };
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
}
async function hbLoeschen(key) {
    const d = await idb();
    await new Promise((res, rej) => {
        const tx = d.transaction('hb', 'readwrite');
        tx.objectStore('hb').delete(key);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
}
// Abgewaehlte Songs (Schluessel als Text), lokal gemerkt
const hbAus = () => new Set(lesen('mt-hb-aus', []));
function hbAusSetzen(key, aus) {
    const s = hbAus();
    if (aus) s.add(String(key)); else s.delete(String(key));
    schreiben('mt-hb-aus', [...s]);
}

/* Tempo-Vorschlag fuer eigene Songs, wie mit Python an Toms Songs geeicht:
   45 s ab Sekunde 30 auf 11025 Hz umrechnen, Spektralfluss (FFT 1024, Schritt
   128) fuer den ganzen Klang und nur fuer den Bass unter 150 Hz (Bassdrum),
   Autokorrelation 70-180 bpm mit doppeltem Schlag und Vorliebe um 115 bpm.
   Bass und Gesamtklang widersprechen sich bei Halftime-, Triolen- oder
   punktierten Grooves - dann nennt die Seite beide Werte. */
async function bpmMessen(blob) {
    const roh = await audio().decodeAudioData(await blob.arrayBuffer());
    const SR = 11025, start = roh.duration > 80 ? 30 : 0, dauer = Math.min(45, roh.duration - start);
    const off = new OfflineAudioContext(1, Math.ceil(dauer * SR), SR);
    const q = off.createBufferSource();
    q.buffer = roh; q.connect(off.destination); q.start(0, start, dauer);
    const x = (await off.startRendering()).getChannelData(0);
    const N = 1024, HOP = 128, frames = Math.floor((x.length - N) / HOP);
    if (frames < 200) throw new Error('zu kurz');
    // FFT-Vorarbeit: Fenster, Bit-Umkehr, Drehfaktoren
    const fenster = new Float64Array(N), umk = new Uint32Array(N), cos = new Float64Array(N / 2), sin = new Float64Array(N / 2);
    for (let i = 0; i < N; i++) { fenster[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); let r = 0; for (let b = 0, v = i; b < 10; b++, v >>= 1) r = (r << 1) | (v & 1); umk[i] = r; }
    for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = -Math.sin(2 * Math.PI * i / N); }
    const re = new Float64Array(N), im = new Float64Array(N), B = N / 2 + 1, bassBis = Math.ceil(150 / (SR / N));
    let alt = new Float64Array(B), neu = new Float64Array(B);
    const fv = new Float64Array(frames), fb = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
        for (let i = 0; i < N; i++) { re[umk[i]] = x[f * HOP + i] * fenster[i]; im[umk[i]] = 0; }
        for (let len = 2; len <= N; len <<= 1) {
            const halb = len >> 1, schritt = N / len;
            for (let i = 0; i < N; i += len) for (let j = 0; j < halb; j++) {
                const k = j * schritt, a = i + j, b = a + halb;
                const tr = re[b] * cos[k] - im[b] * sin[k], ti = re[b] * sin[k] + im[b] * cos[k];
                re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
            }
        }
        let sv = 0, sb = 0;
        for (let k = 0; k < B; k++) {
            neu[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
            if (f) { const d = Math.max(0, neu[k] - alt[k]); sv += d; if (k > 0 && k < bassBis) sb += d; }
        }
        fv[f] = sv; fb[f] = sb;
        [alt, neu] = [neu, alt];
    }
    const fps = SR / HOP;
    const tempoAus = (fl) => {
        const g = new Float64Array(frames);
        let s = 0;
        for (let i = 0; i < frames; i++) { s += fl[i] - (i >= 16 ? fl[i - 16] : 0); g[i] = Math.max(0, fl[i] - s / 16); }
        const ac = (lag) => {
            const l0 = Math.floor(lag), t = lag - l0;
            let s0 = 0, s1 = 0;
            for (let i = 0; i + l0 + 1 < frames; i++) { s0 += g[i] * g[i + l0]; s1 += g[i] * g[i + l0 + 1]; }
            return s0 * (1 - t) + s1 * t;
        };
        const wert = (bpm) => { const lag = fps * 60 / bpm; return (ac(lag) + 0.5 * ac(lag * 2)) * Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.8) ** 2); };
        let best = 0, bestBpm = 0;
        for (let bpm = 70; bpm <= 180; bpm += 0.25) { const w = wert(bpm); if (w > best) { best = w; bestBpm = bpm; } }
        // Typische Verwechslungen (3:2, 4:3 bei Triolen/Punktierungen): fast gleich stark? Dann als zweite Moeglichkeit nennen
        let alt = null, altWert = 0;
        for (const f of [1.5, 2 / 3, 4 / 3, 3 / 4]) {
            const z = bestBpm * f;
            if (z < 70 || z > 200) continue;
            let w = 0, zb = z;
            for (let d = -2; d <= 2; d += 0.25) { const ww = wert(z + d); if (ww > w) { w = ww; zb = z + d; } }
            if (w > altWert) { altWert = w; alt = zb; }
        }
        return { bpm: bestBpm, alt: alt && altWert >= 0.8 * best ? Math.round(alt) : null };
    };
    const v = tempoAus(fv), b = tempoAus(fb);
    const einig = Math.abs(v.bpm - b.bpm) / b.bpm < 0.03;
    return { voll: Math.round(v.bpm), bass: Math.round(b.bpm), einig, alt: einig ? (b.alt || v.alt) : null };
}

/* ============================================================
   LEHRKRAFT
   ============================================================ */
const L = {
    code: null, spiel: null, plan: [], pos: -1, phase: 'lobby',
    gesamt: {}, spieler: {}, antw: {}, entfernt: {},
    zeiten: Object.assign({}, ZEIT_STANDARD, lesen('mt-zeiten', {})),
    start: 0, dauer: 0, letzte: null, hb: {}, hbUrl: {}
};
let lSpielerAbo = null, lAntwAbo = null, lTimer = null, lEndeGeplant = null;
const song = new Audio();
song.preload = 'auto';

function lSichern() {
    schreiben('mt-lehrer', { code: L.code, spiel: L.spiel, plan: L.plan, pos: L.pos, phase: L.phase, gesamt: L.gesamt, entfernt: L.entfernt, letzte: L.letzte, start: L.start, dauer: L.dauer, zeit: Date.now() });
}

function planBauen() {
    const an = [...document.querySelectorAll('[data-block]')].filter(c => c.checked).map(c => c.dataset.block);
    schreiben('mt-bloecke', an);
    const plan = [];
    if (an.includes('tempo')) {
        // Feste Songs (Folie 16) zuerst, dann zufaellig gezogene aus dem Pool - bei jedem Raum neu
        const { fest, pool, n } = songAuswahl();
        const songs = fest.concat(mischen(pool.length).slice(0, Math.min(n, pool.length)).map(i => pool[i]));
        if (songs.length) {
            plan.push({ art: 'teil', teil: 'tempo' });
            songs.forEach((t, i) => plan.push(Object.assign({ art: 'tempo', i, k: i + 1, n: songs.length }, t)));
        }
    }
    if (an.includes('quiz')) {
        plan.push({ art: 'teil', teil: 'quiz' });
        QUIZ.forEach((q, i) => {
            const ord = mischen(q.antworten.length);
            plan.push({ art: 'quiz', i, stufe: q.stufe, frage: q.frage, antworten: ord.map(k => q.antworten[k]), richtig: ord.indexOf(0) });
        });
    }
    if (an.includes('nach')) {
        plan.push({ art: 'teil', teil: 'nach' });
        NACH.forEach((n, i) => plan.push({ art: 'nach', i, bpm: n.bpm, r: n.r }));
    }
    return plan;
}
/* Songwahl: {folie16: Songs von Folie 16 immer spielen, n: so viele zufaellig
   aus dem Pool}. Pool = angehakte eigene Songs mit BPM, ohne Folie-16-Schalter
   auch die angehakten Folie-16-Songs. n = 99 heisst "alle". */
const ZUFALL_STUFEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 99];
const songwahl = () => Object.assign({ folie16: true, n: 5 }, lesen('mt-songwahl', {}));
function songAuswahl() {
    const w = songwahl(), aus = hbAus();
    const standard = TEMPO.filter(t => !aus.has(String(t.hb))).map(t => ({ hb: t.hb, titel: t.titel, bpm: t.bpm }));
    const eigene = eigeneSongs().filter(([k, v]) => !aus.has(k) && v.bpm >= 40 && v.bpm <= 240)
        .map(([k, v]) => ({ hb: k, titel: v.titel || v.name, bpm: Number(v.bpm) }));
    return w.folie16 ? { fest: standard, pool: eigene, n: w.n } : { fest: [], pool: standard.concat(eigene), n: w.n };
}
function lSongwahlZeigen() {
    const w = songwahl(), { fest, pool } = songAuswahl();
    const zug = Math.min(w.n, pool.length);
    $('l-folie16').checked = w.folie16;
    $('l-zufall-name').textContent = w.folie16 ? '+ zufällig' : 'Songs zufällig';
    $('l-zufall-wert').textContent = w.n >= 99 ? 'alle' : w.n;
    $('l-songwahl-info').textContent = `= ${fest.length + zug} Songs pro Spiel` +
        (w.folie16 ? ` (${fest.length} von Folie 16 + ${zug} aus ${pool.length} im Pool)` : ` (aus ${pool.length} im Pool)`) +
        (w.n < 99 && pool.length < w.n ? ' – Pool kleiner als gewünscht' : '');
}
const spielRunden = () => L.plan.filter(r => r.art !== 'teil');
function rundenNr(pos) { return L.plan.slice(0, pos + 1).filter(r => r.art !== 'teil').length; }

function regelnHtml() {
    return `<ul class="regel-liste">
        <li><b>Tempo tippen:</b> Abweichung bis 3 % = 100 · bis 6 % = 80 · bis 10 % = 60 · bis 15 % = 40 · bis 20 % = 20 Punkte. Es zählt nur das angegebene Tempo – halbes oder doppeltes Tempo gibt keine Punkte.</li>
        <li><b>Millionär:</b> richtige Antwort = 100 Punkte.</li>
        <li><b>Nachmachen:</b> 100 Punkte für einen genauen Rhythmus, weniger, je weiter die Tipps danebenliegen oder wenn Schläge fehlen bzw. zu viel sind.</li>
        <li><b>Platzbonus:</b> Die ersten fünf, die mit mindestens 60 Punkten abgeben, bekommen +50 / +40 / +30 / +20 / +10.</li>
    </ul>`;
}

const eigeneSongs = () => Object.entries(L.hb).filter(([k]) => String(k).startsWith('e-'))
    .sort((a, b) => (a[1].seit || 0) - (b[1].seit || 0));
async function lHbAnzeigen() {
    L.hb = await hbAlle();
    Object.values(L.hbUrl).forEach(u => URL.revokeObjectURL(u));
    L.hbUrl = {};
    Object.entries(L.hb).forEach(([k, v]) => { L.hbUrl[k] = URL.createObjectURL(v.blob); });
    const aus = hbAus();
    $('l-hb-liste').innerHTML = TEMPO.map(t => {
        const da = !!L.hb[t.hb];
        return `<label class="hb ${da ? 'da' : ''}" title="${da ? 'geladen' : 'nicht geladen – dann über Folie 16 abspielen'}">
            <input type="checkbox" data-hb-an="${t.hb}" ${aus.has(String(t.hb)) ? '' : 'checked'}>
            <i class="fa-solid ${da ? 'fa-circle-check' : 'fa-circle'}"></i> HB${t.hb} ${esc(t.titel)} <small>${t.bpm} bpm</small></label>`;
    }).join('');
    lEigeneZeigen();
}
function lEigeneZeigen() {
    const aus = hbAus(), liste = eigeneSongs();
    $('l-eigene-liste').innerHTML = liste.length ? liste.map(([k, v]) => `<div class="eigene-zeile" data-eigen="${esc(k)}">
            <input type="checkbox" data-hb-an="${esc(k)}" ${aus.has(k) ? '' : 'checked'} title="Kommt im Spiel vor">
            <button type="button" class="btn klein" data-hoeren="${esc(k)}" title="Vorhören"><i class="fa-solid ${song.dataset.key === k && !song.paused ? 'fa-pause' : 'fa-play'}"></i></button>
            <input type="text" class="feld titel" data-feld="titel" value="${esc(v.titel || '')}" placeholder="Interpret: Titel" maxlength="60">
            <input type="number" class="feld bpm" data-feld="bpm" value="${v.bpm || ''}" placeholder="bpm" min="40" max="240" step="1">
            <button type="button" class="btn klein" data-messen="${esc(k)}" title="Tempo aus der Datei schätzen"><i class="fa-solid fa-wave-square"></i> Messen</button>
            <button type="button" class="btn klein" data-tippen="${esc(k)}" title="Song läuft – im Takt hier tippen"><i class="fa-solid fa-hand-pointer"></i> Tippen</button>
            <button type="button" class="btn klein" data-loeschen="${esc(k)}" title="Song entfernen"><i class="fa-solid fa-trash"></i></button>
            <span class="eigene-info" data-info="${esc(k)}">${!(v.bpm >= 40) ? '<span class="warnung">BPM fehlt – kommt sonst nicht ins Spiel</span>' : ''}</span>
        </div>`).join('') : '<p class="hinweis klein" style="margin:.4rem 0 0;">Noch keine eigenen Songs.</p>';
    lSongwahlZeigen();   // Pool-Groesse haengt an Haekchen und BPM
}
async function lEigeneHinzufuegen(dateien) {
    let n = 0;
    for (const d of dateien) {
        const key = 'e-' + zufall(8, 'abcdefghijkmnpqrstuvwxyz23456789');
        // Titel aus dem Dateinamen: Endung, "(Lyrics)", "[Official ...]" und "c+" weg, Bindestrich -> Doppelpunkt
        // Den Titel sehen die Kinder - Tempo und Nummer aus dem Dateinamen duerfen nicht drinstehen
        const titel = d.name.replace(/\.[a-z0-9]+$/i, '').replace(/[\(\[][^\)\]]*[\)\]]/g, '').replace(/\bc\+/g, '')
            .replace(/_.*bpm_\d+$/i, '').replace(/[\s_-]*\d{2,3}\s*bpm\b/gi, '').replace(/^\d{1,2}[\s._-]+/, '')
            .replace(/[\s-]+$/, '').replace(/\s+-\s+/, ': ').replace(/\s+/g, ' ').trim().slice(0, 60);
        const bpm = Number((d.name.match(/(\d{2,3})\s*bpm|bpm[_\s]*(\d{2,3})/i) || []).slice(1).find(Boolean)) || null;
        const dbx = await idb();
        await new Promise((res, rej) => {
            const tx = dbx.transaction('hb', 'readwrite');
            tx.objectStore('hb').put({ blob: d, name: d.name, titel, bpm, seit: Date.now() }, key);
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        n++;
    }
    await lHbAnzeigen();
    toast(`${n} Song${n === 1 ? '' : 's'} hinzugefügt – BPM prüfen!`);
}
let tippZeiten = [], tippKey = null;
function lEigeneEreignis(e) {
    const zeile = e.target.closest('[data-eigen]');
    const hoeren = e.target.closest('[data-hoeren]');
    if (hoeren) {
        const k = hoeren.dataset.hoeren;
        if (song.dataset.key === k && !song.paused) song.pause();
        else { songLaden(k, L.hbUrl[k]); song.play().catch(() => { }); }
        setTimeout(lEigeneZeigen, 50);
        return;
    }
    const messen = e.target.closest('[data-messen]');
    if (messen) {
        const k = messen.dataset.messen, info = document.querySelector(`[data-info="${k}"]`);
        info.textContent = 'messe …';
        bpmMessen(L.hb[k].blob).then(m => {
            info.innerHTML = !m.einig ? `Unklar: Bass <b>${m.bass}</b>, gesamt <b>${m.voll}</b> – gegenhören oder „Tippen“!`
                : m.alt ? `Vorschlag: <b>${m.bass}</b> bpm, vielleicht auch <b>${m.alt}</b> – gegenhören oder „Tippen“!`
                    : `Vorschlag: <b>${m.bass}</b> bpm`;
            if (m.einig && !m.alt && !(L.hb[k].bpm >= 40)) { zeile.querySelector('[data-feld="bpm"]').value = m.bass; hbAendern(k, { bpm: m.bass }).then(() => { L.hb[k].bpm = m.bass; }); }
        }).catch(() => { info.textContent = 'Messen ging nicht'; });
        return;
    }
    const tippen = e.target.closest('[data-tippen]');
    if (tippen && e.type === 'pointerdown') {
        const k = tippen.dataset.tippen, t = e.timeStamp || performance.now();
        if (tippKey !== k || (tippZeiten.length && t - tippZeiten[tippZeiten.length - 1] > 2500)) tippZeiten = [];
        tippKey = k; tippZeiten.push(t);
        const bpm = tippBpm(tippZeiten), info = document.querySelector(`[data-info="${k}"]`);
        if (!bpm) { info.textContent = `weiter tippen … (${tippZeiten.length})`; return; }
        const wert = Math.round(bpm);
        info.innerHTML = `getippt: <b>${wert}</b> bpm${tippZeiten.length < 8 ? ' – noch ein paar Mal' : ''}`;
        if (tippZeiten.length >= 8) { zeile.querySelector('[data-feld="bpm"]').value = wert; hbAendern(k, { bpm: wert }).then(() => { L.hb[k].bpm = wert; }); }
        return;
    }
    const loeschen = e.target.closest('[data-loeschen]');
    if (loeschen && confirm('Diesen Song aus der Liste entfernen?')) {
        const k = loeschen.dataset.loeschen;
        if (song.dataset.key === k) song.pause();
        hbLoeschen(k).then(lHbAnzeigen);
    }
}
async function lHbWaehlen(dateien) {
    const SCHLUESSEL = ['boy', 'ace', 'crusader', 'digimon', 'voulez'];
    const liste = [...dateien].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    let frei = 1, n = 0;
    for (const d of liste) {
        const name = d.name.toLowerCase();
        let nr = (name.match(/hb\s*0?([1-5])/) || [])[1];
        if (!nr) { const k = SCHLUESSEL.findIndex(s => name.includes(s)); if (k >= 0) nr = k + 1; }
        if (!nr) nr = frei;
        nr = Number(nr);
        frei = Math.max(frei, nr + 1);
        if (nr >= 1 && nr <= 5) { await hbSpeichern(nr, d); n++; }
    }
    await lHbAnzeigen();
    toast(`${n} Hörbeispiel${n === 1 ? '' : 'e'} gespeichert`);
}

function qrMalen(feld, url, groesse) {
    $(feld).innerHTML = '';
    new QRCode($(feld), { text: url, width: groesse, height: groesse, correctLevel: QRCode.CorrectLevel.M });
}
const schuelerUrl = () => `${location.origin}${location.pathname}?raum=${L.code}`;

async function lRaumOeffnen(weiter) {
    audio();
    if (weiter) {
        Object.assign(L, weiter);
    } else {
        // Ein vergessener Raum (nicht "Schliessen" gedrueckt) bliebe sonst fuer immer in der Datenbank
        const alt = lesen('mt-lehrer', null);
        if (alt && alt.code) remove(ref(db, pfad(alt.code))).catch(() => { });
        L.code = zufall(4, CODE_ZEICHEN);
        L.spiel = zufall(4, CODE_ZEICHEN);
        L.plan = planBauen();
        if (!spielRunden().length) { toast('Bitte mindestens einen Teil wählen', 'fehler'); return; }
        L.pos = -1; L.phase = 'lobby'; L.gesamt = {}; L.entfernt = {}; L.letzte = null;
    }
    try {
        await update(ref(db, pfad(L.code, 'lehrer')), { phase: L.phase, nr: L.pos, anzahl: spielRunden().length, spiel: L.spiel, entfernt: L.entfernt });
    } catch (e) {
        toast('Keine Verbindung zur Datenbank – Raum nicht geöffnet', 'fehler');
        return;
    }
    lSichern();
    zeigen('l-start', false); zeigen('l-raum', true);
    $('l-code').textContent = L.code;
    qrMalen('l-qr', schuelerUrl(), 520);
    $('l-url').textContent = schuelerUrl().replace(/^https?:\/\//, '');
    if (lSpielerAbo) lSpielerAbo();
    lSpielerAbo = onValue(ref(db, pfad(L.code, 'spieler')), s => {
        L.spieler = s.val() || {};
        // Entfernte bleiben draussen - ausser sie sind danach bewusst neu beigetreten (seit > Zeitpunkt des Entfernens)
        Object.keys(L.entfernt).forEach(id => {
            const sp = L.spieler[id], t = L.entfernt[id];
            if (sp && sp.name && typeof t === 'number' && sp.seit > t) {
                delete L.entfernt[id];
                update(ref(db, pfad(L.code, 'lehrer/entfernt')), { [id]: null }).catch(() => { });
                lSichern();
            } else delete L.spieler[id];
        });
        // Reste ohne Namen (z. B. ein spaetes onDisconnect nach dem Entfernen) ignorieren
        Object.keys(L.spieler).forEach(id => { if (!L.spieler[id] || !L.spieler[id].name) delete L.spieler[id]; });
        lSpielerZeigen();
        lAbgabeZeigen();
        if ($('l-spieler-dialog').open) lSpielerListe();
        // Listen mit Namen (nach "Weiterfuehren" kommen die Spieler erst nach dem ersten Zeichnen)
        if (L.phase === 'aufl' || L.phase === 'ende') lZeichnen();
    });
    if (L.phase === 'frage' && L.pos >= 0) lAntwortenAbo();
    lZeichnen();
}

// on === false: Geraet hat die Verbindung verloren (onDisconnect beim Kind)
const istWeg = (id) => L.spieler[id] && L.spieler[id].on === false;
const aktive = () => Object.keys(L.spieler).filter(id => !istWeg(id));
function lSpielerZeigen() {
    const ids = Object.keys(L.spieler), weg = ids.filter(istWeg).length;
    $('l-anzahl').textContent = ids.length ? `${ids.length} dabei${weg ? ` · ${weg} ohne Verbindung` : ''}` : 'Noch niemand da …';
    $('l-namen').innerHTML = ids.map(id => `<button type="button" class="name ${istWeg(id) ? 'weg' : ''}" data-raus="${esc(id)}" title="${istWeg(id) ? 'Keine Verbindung · ' : ''}Antippen zum Entfernen">${esc(L.spieler[id].emoji)} ${esc(L.spieler[id].name)}</button>`).join('');
    $('l-spieler-zahl').textContent = ids.length;
    $('l-weg-zahl').textContent = weg ? `${weg} weg` : '';
    zeigen('l-weg-zahl', weg > 0);
}
// Ein Schreibvorgang fuer alle: aus spieler loeschen und in lehrer/entfernt eintragen
async function lEntfernen(ids, frage = true) {
    ids = ids.filter(id => L.spieler[id]);
    if (!ids.length) return;
    const namen = ids.map(id => L.spieler[id].name);
    if (frage && !confirm(ids.length === 1 ? `${namen[0]} aus dem Raum entfernen?` : `${ids.length} Kinder entfernen?\n${namen.join(', ')}`)) return;
    const u = {};
    const t = jetzt();
    ids.forEach(id => { u[`spieler/${id}`] = null; u[`lehrer/entfernt/${id}`] = t; L.entfernt[id] = t; delete L.spieler[id]; });
    try { await update(ref(db, pfad(L.code)), u); } catch (e) { toast('Entfernen hat nicht geklappt', 'fehler'); return; }
    lSichern();
    lSpielerZeigen(); lAbgabeZeigen();
    if ($('l-spieler-dialog').open) lSpielerListe();
    lAlleFertigPruefen();
}
function lSpielerListe() {
    const ids = Object.keys(L.spieler).sort((a, b) => (istWeg(b) - istWeg(a)) || L.spieler[a].name.localeCompare(L.spieler[b].name, 'de'));
    const gewaehlt = new Set([...document.querySelectorAll('[data-wahl]:checked')].map(c => c.dataset.wahl));
    $('l-spieler-liste').innerHTML = ids.length ? ids.map(id => `<label class="spieler-zeile ${istWeg(id) ? 'weg' : ''}">
        <input type="checkbox" data-wahl="${esc(id)}" ${gewaehlt.has(id) ? 'checked' : ''}>
        <span class="punkt-status" title="${istWeg(id) ? 'keine Verbindung' : 'verbunden'}"></span>
        <span class="n">${esc(L.spieler[id].emoji)} ${esc(L.spieler[id].name)}</span>
        <span class="p">${L.gesamt[id] || 0} Pkt</span>
        <button type="button" class="btn klein" data-raus-sofort="${esc(id)}" title="Sofort entfernen"><i class="fa-solid fa-xmark"></i></button>
    </label>`).join('') : '<p class="hinweis">Niemand im Raum.</p>';
    lWahlZaehlen();
}
function lWahlZaehlen() {
    const n = document.querySelectorAll('[data-wahl]:checked').length;
    $('l-raus-btn').disabled = !n;
    $('l-raus-btn').innerHTML = `<i class="fa-solid fa-user-xmark"></i> ${n ? n + ' ' : ''}Ausgewählte entfernen`;
}
function lSpielerDialog() {
    lSpielerListe();
    if (!$('l-spieler-dialog').open) $('l-spieler-dialog').showModal();
}
// Haben alle verbundenen Kinder abgegeben? Dann Runde aufloesen (auch nach dem Entfernen)
function lAlleFertigPruefen() {
    const ids = aktive();
    if (L.phase === 'frage' && ids.length && ids.every(id => L.antw[id]) && !lEndeGeplant) {
        lEndeGeplant = setTimeout(() => { lEndeGeplant = null; if (L.phase === 'frage') lAufloesen(); }, 900);
    }
}

function lAntwortenAbo() {
    if (lAntwAbo) lAntwAbo();
    L.antw = {};
    lAntwAbo = onValue(ref(db, pfad(L.code, `antw/${L.spiel}_${L.pos}`)), s => {
        L.antw = s.val() || {};
        Object.keys(L.entfernt).forEach(id => delete L.antw[id]);
        lAbgabeZeigen();
        lAlleFertigPruefen();
    });
}
function lAbgabeZeigen() {
    if (L.phase !== 'frage') return;
    // Kinder ohne Verbindung zaehlen nicht mit - auf sie wartet die Runde nicht
    const ids = Object.keys(L.spieler), mit = aktive(), fertig = mit.filter(id => L.antw[id]), weg = ids.length - mit.length;
    $('l-abgabe-text').textContent = `${fertig.length} / ${mit.length} abgegeben${weg ? ` · ${weg} ohne Verbindung` : ''}`;
    $('l-abgabe-balken').style.width = mit.length ? `${fertig.length / mit.length * 100}%` : '0';
    $('l-abgabe-namen').innerHTML = ids.map(id => `<button type="button" class="name ${istWeg(id) ? 'weg' : L.antw[id] ? 'fertig' : 'offen'}" data-raus="${esc(id)}" title="${istWeg(id) ? 'Keine Verbindung · ' : ''}Antippen zum Entfernen">${esc(L.spieler[id].emoji)} ${esc(L.spieler[id].name)}</button>`).join('');
    const r = L.plan[L.pos];
    if (r && r.art === 'quiz') {
        const zahl = $('l-quiz-zahl');
        if (zahl) zahl.textContent = fertig.length;
    }
}

/* ---------- Ablauf ---------- */
async function lGeheZu(pos) {
    clearTimeout(lEndeGeplant); lEndeGeplant = null;
    vorspielStopp(); songStopp();
    if (pos >= L.plan.length) return lEnde();
    L.pos = pos;
    const r = L.plan[pos];
    if (r.art === 'teil') {
        L.phase = 'teil';
        await update(ref(db, pfad(L.code, 'lehrer')), { phase: 'teil', nr: pos, art: r.teil, aufgabe: null, loesung: null, wertung: null, spieltBis: null, start: null, dauer: null });
        lSichern();
        return lZeichnen();
    }
    L.phase = 'frage';
    L.dauer = L.zeiten[r.art];
    let aufgabe;
    if (r.art === 'tempo') aufgabe = { titel: r.titel, hb: r.hb };
    else if (r.art === 'quiz') aufgabe = { frage: r.frage, antworten: r.antworten, stufe: r.stufe };
    else aufgabe = { bpm: r.bpm };
    lAntwortenAbo();
    // Song noch im Klick starten - Safari blockt play() nach einem await
    if (r.art === 'tempo') songStart(r.hb);
    // Nachmachen: Zeit laeuft erst ab Ende des Vorspielens
    let spieltBis = null;
    if (r.art === 'nach') {
        const dauer = vorspielen(r.bpm, r.r, lSchlagZeigen);
        spieltBis = jetzt() + dauer;
    }
    L.start = spieltBis || jetzt();
    await update(ref(db, pfad(L.code, 'lehrer')), {
        phase: 'frage', nr: pos, rundeNr: rundenNr(pos), art: r.art, aufgabe, loesung: null, wertung: null,
        start: L.start, dauer: L.dauer, spieltBis
    });
    lSichern();
    lZeichnen();
}

async function lNochmalVorspielen() {
    const r = L.plan[L.pos];
    if (!r || r.art !== 'nach' || L.phase !== 'frage') return;
    const dauer = vorspielen(r.bpm, r.r, lSchlagZeigen);
    const bis = jetzt() + dauer;
    // Zeit verlaengert sich um das erneute Vorspielen
    L.start = Math.max(L.start, bis);
    await update(ref(db, pfad(L.code, 'lehrer')), { spieltBis: bis, start: L.start });
    lSichern();
}
function lSchlagZeigen(i, art) {
    const el = $('l-schlag');
    if (!el) return;
    const status = $('l-nach-status');
    if (art === 'ende') {
        el.querySelectorAll('span').forEach(s => s.classList.remove('an'));
        if (status) status.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> Jetzt ihr – tippt den Rhythmus nach!';
        return;
    }
    if (status) status.innerHTML = art === 'vor' ? '<i class="fa-solid fa-ear-listen"></i> Hört zu … ' + (i + 1) : '<i class="fa-solid fa-ear-listen"></i> Hört zu!';
    el.querySelectorAll('span').forEach((s, k) => s.classList.toggle('an', k === i));
    el.classList.toggle('vor', art === 'vor');
}

async function lAufloesen() {
    if (L.phase !== 'frage') return;
    clearTimeout(lEndeGeplant); lEndeGeplant = null;
    vorspielStopp();
    songAusblenden();
    const r = L.plan[L.pos];
    // Antworten noch einmal frisch holen - der Listener kann eine Abgabe der letzten Millisekunden verpassen
    try { const s = await get(ref(db, pfad(L.code, `antw/${L.spiel}_${L.pos}`))); L.antw = s.val() || {}; } catch (e) { /* Listener-Stand nehmen */ }
    Object.keys(L.entfernt).forEach(id => delete L.antw[id]);
    const ein = r.art === 'nach' ? einsaetze(r.r) : null;
    const zeilen = Object.keys(L.antw).map(id => {
        const a = L.antw[id];
        let basis;
        if (r.art === 'tempo') basis = tempoBasis(r.bpm, Number(a.w));
        else if (r.art === 'quiz') basis = quizBasis(r.richtig, Number(a.w));
        else basis = nachBasis(ein.o, a.w, r.bpm);
        return Object.assign({ id, w: a.w, t: a.t || 0 }, basis);
    });
    zeilen.filter(z => z.b >= PUNKTE_BONUS_AB).sort((a, b) => a.t - b.t).forEach((z, i) => { z.x = PUNKTE_PLATZ[i] || 0; z.platz = i + 1; });
    const wertung = {};
    zeilen.forEach(z => {
        z.x = z.x || 0;
        z.p = z.b + z.x;
        L.gesamt[z.id] = (L.gesamt[z.id] || 0) + z.p;
    });
    const plaetze = lPlaetze();
    Object.keys(L.spieler).forEach(id => {
        const z = zeilen.find(q => q.id === id);
        wertung[id] = { p: z ? z.p : 0, b: z ? z.b : 0, x: z ? z.x : 0, g: L.gesamt[id] || 0, pl: plaetze[id] || 0 };
    });
    let loesung;
    if (r.art === 'tempo') loesung = { bpm: r.bpm };
    else if (r.art === 'quiz') loesung = { richtig: r.richtig };
    else loesung = { r: r.r, o: ein.o, laenge: ein.laenge, bpm: r.bpm };
    L.phase = 'aufl';
    L.letzte = { zeilen, loesung };
    await update(ref(db, pfad(L.code, 'lehrer')), { phase: 'aufl', loesung, wertung, spieltBis: null });
    lSichern();
    lZeichnen();
}
function lPlaetze() {
    const ids = Object.keys(L.spieler);
    const sortiert = ids.slice().sort((a, b) => (L.gesamt[b] || 0) - (L.gesamt[a] || 0));
    const pl = {};
    sortiert.forEach((id, i) => {
        const vorher = sortiert[i - 1];
        pl[id] = i > 0 && (L.gesamt[vorher] || 0) === (L.gesamt[id] || 0) ? pl[vorher] : i + 1;
    });
    return pl;
}
async function lEnde() {
    songStopp(); vorspielStopp();
    L.phase = 'ende';
    const plaetze = lPlaetze(), wertung = {};
    Object.keys(L.spieler).forEach(id => { wertung[id] = { p: 0, b: 0, x: 0, g: L.gesamt[id] || 0, pl: plaetze[id] || 0 }; });
    await update(ref(db, pfad(L.code, 'lehrer')), { phase: 'ende', wertung, aufgabe: null, loesung: null, spieltBis: null });
    lSichern();
    lZeichnen();
}
async function lNochmal() {
    if (!confirm('Neues Spiel mit denselben Namen starten? Die Punkte beginnen wieder bei 0.')) return;
    L.spiel = zufall(4, CODE_ZEICHEN);
    L.plan = planBauen();
    L.gesamt = {}; L.letzte = null; L.pos = -1; L.phase = 'lobby';
    await update(ref(db, pfad(L.code, 'lehrer')), { phase: 'lobby', nr: -1, spiel: L.spiel, anzahl: spielRunden().length, wertung: null, aufgabe: null, loesung: null });
    lSichern();
    lZeichnen();
}
async function lSchliessen() {
    if (!confirm('Raum schließen? Die Kinder fliegen raus, der Spielstand ist weg.')) return;
    songStopp(); vorspielStopp();
    if (lSpielerAbo) lSpielerAbo();
    if (lAntwAbo) lAntwAbo();
    lSpielerAbo = lAntwAbo = null;
    try { await remove(ref(db, pfad(L.code))); } catch (e) { /* egal */ }
    try { localStorage.removeItem('mt-lehrer'); } catch (e) { /* egal */ }
    L.code = null;
    zeigen('l-raum', false); zeigen('l-start', true);
    $('l-weiter-raum-btn').classList.add('hidden');
}

/* ---------- Song am Beamer ---------- */
let songFade = null;
function songStart(hb) {
    songStopp();
    const url = L.hbUrl[hb];
    if (!url) return;
    songLaden(hb, url);
    song.play().catch(() => toast('Song startet nicht – bitte ▶ drücken', 'fehler'));
    lSongKnopf();
}
// Eigene Songs sind meist ganze Titel: ab 0:30 starten, damit kein langes Intro ohne Beat laeuft
function songLaden(key, url) {
    song.src = url;
    song.dataset.key = String(key);
    song.dataset.ab = String(key).startsWith('e-') ? '30' : '0';
    song.volume = 1;
    song.addEventListener('loadedmetadata', () => { if (song.duration > 90) song.currentTime = Number(song.dataset.ab); }, { once: true });
}
const songAnfang = () => (song.duration > 90 ? Number(song.dataset.ab || 0) : 0);
function songStopp() {
    clearInterval(songFade); songFade = null;
    song.pause();
    lSongKnopf();
}
function songAusblenden() {
    if (song.paused) return;
    clearInterval(songFade);
    songFade = setInterval(() => {
        song.volume = Math.max(0, song.volume - 0.08);
        if (song.volume <= 0) songStopp();
    }, 80);
}
function lSongKnopf() {
    const k = $('l-song-btn');
    if (k) k.innerHTML = song.paused ? '<i class="fa-solid fa-play"></i> Song abspielen' : '<i class="fa-solid fa-pause"></i> Pause';
}
song.addEventListener('play', lSongKnopf);
song.addEventListener('pause', lSongKnopf);

/* ---------- Zeichnen (Beamer) ---------- */
function lZeichnen() {
    ['l-lobby', 'l-teil', 'l-runde', 'l-aufl', 'l-ende'].forEach(id => zeigen(id, false));
    const r = L.plan[L.pos];
    const gesamtRunden = spielRunden().length;
    clearInterval(lTimer);
    zeigen('l-timer', false);
    if (L.phase === 'lobby') {
        $('l-phase-info').textContent = `${gesamtRunden} Runden`;
        zeigen('l-lobby', true);
        lSpielerZeigen();
        return;
    }
    if (L.phase === 'ende') {
        $('l-phase-info').textContent = 'Spiel vorbei';
        zeigen('l-ende', true);
        lEndeZeigen();
        return;
    }
    if (L.phase === 'teil') {
        const t = TEIL_INFO[r.teil];
        const n = L.plan.filter(x => x.art === r.teil).length;
        $('l-phase-info').textContent = t.name;
        $('l-teil-inhalt').innerHTML = `<div class="teil-icon"><i class="fa-solid ${t.icon}"></i></div>
            <div class="teil-folie">${esc(t.folie)} · ${n} Runden</div>
            <h2>${esc(t.name)}</h2><p>${esc(t.text)}</p>
            ${(() => {
                const fehlt = r.teil === 'tempo' ? L.plan.filter(x => x.art === 'tempo' && !L.hbUrl[x.hb]).length : 0;
                return fehlt ? `<p class="hinweis warnung"><i class="fa-solid fa-triangle-exclamation"></i> ${fehlt} Hörbeispiel(e) nicht geladen – dann über Folie 16 abspielen.</p>` : '';
            })()}`;
        zeigen('l-teil', true);
        return;
    }
    $('l-phase-info').textContent = `${TEIL_INFO[r.art].name} · Runde ${rundenNr(L.pos)} von ${gesamtRunden}`;
    if (L.phase === 'frage') {
        zeigen('l-runde', true);
        $('l-runde-inhalt').innerHTML = lRundeHtml(r);
        const knoepfe = [];
        if (r.art === 'tempo') knoepfe.push(`<button type="button" class="btn" id="l-song-btn" ${L.hbUrl[r.hb] ? '' : 'disabled title="Hörbeispiel nicht geladen"'}></button>`,
            `<button type="button" class="btn" id="l-song-neu" ${L.hbUrl[r.hb] ? '' : 'disabled'} title="Song von vorn"><i class="fa-solid fa-backward-step"></i></button>`);
        if (r.art === 'nach') knoepfe.push('<button type="button" class="btn" id="l-vorspielen-btn"><i class="fa-solid fa-repeat"></i> Nochmal vorspielen</button>');
        $('l-runde-knoepfe').innerHTML = knoepfe.join('');
        lSongKnopf();
        lAbgabeZeigen();
        zeigen('l-timer', true);
        const tick = () => {
            const rest = Math.ceil((L.start + L.dauer * 1000 - jetzt()) / 1000);
            const vorspiel = jetzt() < L.start;
            $('l-timer').textContent = vorspiel ? '🎧' : Math.max(0, rest);
            $('l-timer').classList.toggle('knapp', !vorspiel && rest <= 5);
            if (!vorspiel && rest <= 0 && L.phase === 'frage') { clearInterval(lTimer); lAufloesen(); }
        };
        tick();
        lTimer = setInterval(tick, 250);
        return;
    }
    if (L.phase === 'aufl') {
        zeigen('l-aufl', true);
        lAufloesungZeigen(r);
        const naechste = L.plan[L.pos + 1];
        $('l-weiter-btn').innerHTML = !naechste ? '<i class="fa-solid fa-trophy"></i> Endstand'
            : naechste.art === 'teil' ? `<i class="fa-solid fa-forward"></i> Weiter: ${esc(TEIL_INFO[naechste.teil].name)}`
                : '<i class="fa-solid fa-forward"></i> Nächste Runde';
        $('l-aufl-knoepfe').innerHTML = r.art === 'nach' ? '<button type="button" class="btn" id="l-aufl-hoeren"><i class="fa-solid fa-volume-high"></i> Lösung vorspielen</button>' : '';
    }
}

function lRundeHtml(r) {
    if (r.art === 'tempo') {
        return `<div class="buehne tempo">
            <div class="buehne-klein">Hörbeispiel ${r.k || r.hb} von ${r.n || 5}</div>
            <div class="buehne-titel"><i class="fa-solid fa-music"></i> ${esc(r.titel)}</div>
            <div class="puls"><span></span></div>
            <p class="buehne-text">Tippt im Metrum – mindestens 8-mal – und gebt dann ab!</p>
        </div>`;
    }
    if (r.art === 'quiz') {
        const stufe = QUIZ[r.i] ? LEITER.indexOf(QUIZ[r.i].stufe) : -1;
        return `<div class="wwm">
            <div class="wwm-haupt">
                <div class="wwm-frage">${esc(r.frage)}</div>
                <div class="wwm-antworten">${r.antworten.map((a, k) => `<div class="wwm-a"><b>${ABCD[k]}:</b> ${esc(a)}</div>`).join('')}</div>
                <p class="buehne-text"><span id="l-quiz-zahl">0</span> Antworten eingegangen</p>
            </div>
            ${leiterHtml(stufe)}
        </div>`;
    }
    const n = einsaetze(r.r).laenge;
    return `<div class="buehne nach">
        <div class="buehne-klein">${r.bpm} bpm · 4/4-Takt</div>
        <div class="buehne-titel" id="l-nach-status"><i class="fa-solid fa-ear-listen"></i> Hört zu!</div>
        <div class="schlag" id="l-schlag">${Array.from({ length: Math.max(4, n) }, (_, k) => `<span>${k + 1}</span>`).join('')}</div>
        <p class="buehne-text">Erst zählt das Metronom einen Takt vor, dann wird geklatscht. Danach seid ihr dran.</p>
    </div>`;
}
function leiterHtml(stufe) {
    return `<div class="leiter">${LEITER.map((s, k) => `<div class="${k === stufe ? 'an' : k < stufe ? 'vorbei' : ''}"><span>${k + 1}</span> ${esc(s)}</div>`).reverse().join('')}</div>`;
}

function spName(id) {
    const sp = L.spieler[id];
    return sp ? `${esc(sp.emoji)} ${esc(sp.name)}` : '<span class="hinweis">(weg)</span>';
}
function lAufloesungZeigen(r) {
    const { zeilen = [], loesung = {} } = L.letzte || {};
    let kopf = '';
    if (r.art === 'tempo') {
        kopf = `<div class="loesung-kopf"><div class="buehne-klein">${esc(r.titel)}</div>
            <div class="riesig">ca. ${r.bpm} <small>bpm</small></div></div>${tempoStreifen(r.bpm, zeilen)}`;
    } else if (r.art === 'quiz') {
        const zahl = r.antworten.map((_, k) => zeilen.filter(z => Number(z.w) === k).length);
        const max = Math.max(1, ...zahl);
        kopf = `<div class="wwm"><div class="wwm-haupt">
            <div class="wwm-frage">${esc(r.frage)}</div>
            <div class="wwm-antworten">${r.antworten.map((a, k) => `<div class="wwm-a ${k === r.richtig ? 'richtig' : 'falsch'}">
                <b>${ABCD[k]}:</b> ${esc(a)}<span class="wwm-zahl"><i style="width:${zahl[k] / max * 100}%"></i>${zahl[k]}</span></div>`).join('')}</div>
        </div>${leiterHtml(LEITER.indexOf(r.stufe))}</div>`;
    } else {
        kopf = `<div class="loesung-kopf"><div class="buehne-klein">${r.bpm} bpm · ${esc(r.r.split('-').map(c => SILBEN[c] || c).join(' · '))}</div>
            <div class="noten" id="l-noten"></div></div>${zeitstrahl(loesung.o, loesung.laenge, null)}`;
    }
    $('l-loesung').innerHTML = kopf;
    if (r.art === 'nach') notenMalen($('l-noten'), r.r, 2.2);

    const wert = (z) => {
        if (r.art === 'tempo') return `${rund1(Number(z.w))} bpm <small>${z.abw == null ? '' : (z.abw < 0.5 ? 'genau' : (Number(z.w) > r.bpm ? '+' : '−') + Math.round(z.abw) + ' %')}${z.halb ? ` · ${z.halb === 'halb' ? 'halbes' : 'doppeltes'} Tempo – zählt nicht` : ''}</small>`;
        if (r.art === 'quiz') return `${ABCD[Number(z.w)] || '?'} ${Number(z.w) === r.richtig ? '✅' : '❌'}`;
        return `${z.b} %`;
    };
    const sortiert = zeilen.slice().sort((a, b) => b.p - a.p || a.t - b.t);
    const ohne = Object.keys(L.spieler).filter(id => !zeilen.find(z => z.id === id));
    $('l-rundenliste').innerHTML = `<ol class="liste">${sortiert.map(z => `<li>
        <span class="n">${spName(z.id)}</span><span class="w">${wert(z)}</span>
        <span class="p">+${z.p}${z.x ? ` <small class="bonus">⚡${z.platz}.</small>` : ''}</span></li>`).join('')}
        ${ohne.map(id => `<li class="leer"><span class="n">${spName(id)}</span><span class="w">–</span><span class="p">0</span></li>`).join('')}</ol>`;
    $('l-gesamtliste').innerHTML = gesamtListe(8);
}
function gesamtListe(max) {
    const pl = lPlaetze();
    const ids = Object.keys(L.spieler).sort((a, b) => pl[a] - pl[b]);
    return `<ol class="liste gesamt">${ids.slice(0, max || ids.length).map(id => `<li><span class="pl">${pl[id]}.</span>
        <span class="n">${spName(id)}</span><span class="p">${L.gesamt[id] || 0}</span></li>`).join('')}</ol>`;
}
function lEndeZeigen() {
    const pl = lPlaetze();
    const ids = Object.keys(L.spieler).sort((a, b) => pl[a] - pl[b]);
    const top = [ids[1], ids[0], ids[2]];
    $('l-podest').innerHTML = top.map((id, k) => id ? `<div class="stufe s${[2, 1, 3][k]}">
        <div class="emoji">${esc(L.spieler[id].emoji)}</div><div class="nm">${esc(L.spieler[id].name)}</div>
        <div class="pk">${L.gesamt[id] || 0}</div><div class="block">${pl[id]}</div></div>` : '<div class="stufe leer"></div>').join('');
    $('l-endliste').innerHTML = gesamtListe();
}

// Punktstreifen: jeder Tipp als Punkt um das Zieltempo (+-30 %)
function tempoStreifen(ziel, zeilen) {
    const lo = ziel * 0.7, hi = ziel * 1.3;
    const x = (v) => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
    const marken = [-20, -10, 0, 10, 20].map(p => `<span class="marke ${p === 0 ? 'ziel' : ''}" style="left:${x(ziel * (1 + p / 100))}%">${p === 0 ? ziel : (p > 0 ? '+' : '') + p + ' %'}</span>`).join('');
    const punkte = zeilen.map((z, k) => {
        const v = Number(z.w);
        const aussen = v < lo || v > hi;
        return `<span class="punkt ${z.b >= 80 ? 'gut' : z.b >= 40 ? 'mittel' : 'schlecht'} ${aussen ? 'aussen' : ''}"
            style="left:${x(v)}%; top:${18 + (k % 4) * 16}px" title="${esc(L.spieler[z.id]?.name || '')}: ${rund1(v)} bpm">${esc(L.spieler[z.id]?.emoji || '•')}</span>`;
    }).join('');
    return `<div class="streifen"><div class="zone" style="left:${x(ziel * 0.9)}%; width:${x(ziel * 1.1) - x(ziel * 0.9)}%"></div>
        <div class="zone eng" style="left:${x(ziel * 0.97)}%; width:${x(ziel * 1.03) - x(ziel * 0.97)}%"></div>${marken}${punkte}</div>`;
}
// Zeitstrahl eines Takts: Soll-Einsaetze oben, eigene Tipps (in Schlaegen) unten
function zeitstrahl(o, laenge, tipps) {
    const x = (b) => b / laenge * 100;
    const schlaege = Array.from({ length: laenge + 1 }, (_, k) => `<span class="takt-linie" style="left:${x(k)}%">${k < laenge ? k + 1 : ''}</span>`).join('');
    const soll = (o || []).map(e => `<span class="soll" style="left:${x(e)}%"></span>`).join('');
    const ist = (tipps || []).filter(b => b <= laenge + 0.5).map(b => `<span class="ist" style="left:${x(Math.min(b, laenge))}%"></span>`).join('');
    return `<div class="zeitstrahl ${tipps ? 'mit-ist' : ''}">${schlaege}${soll}${ist}</div>`;
}
function notenMalen(host, kuerzel, skal) {
    if (!host || typeof stueckAnzeigeHtml !== 'function') return;
    const stueck = { zeichen: '4/4', takte: [{ bausteine: rhythmusLesen(kuerzel) }] };
    host.innerHTML = stueckAnzeigeHtml(stueck, { zaehlzeiten: true, undAlsPlus: true, breite: 360, skalierung: skal });
}

function lZeitenZeigen() {
    $('l-zeiten').innerHTML = ['tempo', 'quiz', 'nach'].map(a => `<span class="stufen"><span class="stufen-name">${esc(TEIL_INFO[a].name)}</span>
        <button type="button" class="btn" data-zeit="${a}:-5">−</button><span class="stufen-wert">${L.zeiten[a]} s</span>
        <button type="button" class="btn" data-zeit="${a}:5">+</button></span>`).join('');
}

function vollbild() {
    const d = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (d.requestFullscreen) d.requestFullscreen().catch(() => toast('Vollbild ging nicht – im Browser-Menü „Vollbild“ wählen', 'fehler'));
    else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
}

function lehrerStart() {
    zeigen('lehrer', true);
    const bloecke = lesen('mt-bloecke', null);
    if (bloecke) document.querySelectorAll('[data-block]').forEach(c => { c.checked = bloecke.includes(c.dataset.block); });
    $('l-regeln').innerHTML = regelnHtml();
    lHbAnzeigen();
    lZeitenZeigen();
    const alt = lesen('mt-lehrer', null);
    if (alt && alt.code && Date.now() - alt.zeit < 4 * 3600 * 1000) {
        $('l-weiter-raum-btn').classList.remove('hidden');
        $('l-weiter-raum-btn').innerHTML = `<i class="fa-solid fa-rotate-right"></i> Raum ${esc(alt.code)} weiterführen`;
    }
    $('l-hb-datei').addEventListener('change', e => { if (e.target.files.length) lHbWaehlen(e.target.files); e.target.value = ''; });
    $('l-eigene-datei').addEventListener('change', e => { if (e.target.files.length) lEigeneHinzufuegen([...e.target.files]); e.target.value = ''; });
    // Haekchen (Song im Spiel ja/nein), Titel und BPM eigener Songs sofort speichern
    document.addEventListener('change', e => {
        const an = e.target.closest('[data-hb-an]');
        if (an) { hbAusSetzen(an.dataset.hbAn, !an.checked); lSongwahlZeigen(); }
        if (e.target.id === 'l-folie16') { schreiben('mt-songwahl', Object.assign(songwahl(), { folie16: e.target.checked })); lSongwahlZeigen(); }
        const feld = e.target.closest('.eigene-zeile [data-feld]');
        if (feld) {
            const k = feld.closest('[data-eigen]').dataset.eigen, wert = feld.dataset.feld === 'bpm' ? (Number(feld.value) || null) : feld.value.trim();
            hbAendern(k, { [feld.dataset.feld]: wert }).then(() => { L.hb[k][feld.dataset.feld] = wert; if (feld.dataset.feld === 'bpm') lEigeneZeigen(); });
        }
        if (e.target.closest('[data-wahl]')) lWahlZaehlen();
    });
    $('l-eigene-liste').addEventListener('pointerdown', e => { if (e.target.closest('[data-tippen]')) { e.preventDefault(); lEigeneEreignis(e); } });
    song.addEventListener('ended', () => { if ($('l-start').offsetParent) lEigeneZeigen(); });
    // Tastatur am Beamer-Rechner: F = Vollbild, M = Mitspieler (nicht beim Tippen in ein Feld)
    document.addEventListener('keydown', e => {
        if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); vollbild(); }
        if ((e.key === 'm' || e.key === 'M') && L.code) { e.preventDefault(); lSpielerDialog(); }
    });
    const vollIcon = () => { $('l-voll-btn').innerHTML = `<i class="fa-solid ${document.fullscreenElement || document.webkitFullscreenElement ? 'fa-compress' : 'fa-expand'}"></i>`; };
    document.addEventListener('fullscreenchange', vollIcon);
    document.addEventListener('webkitfullscreenchange', vollIcon);
    $('l-oeffnen-btn').addEventListener('click', () => lRaumOeffnen(null));
    $('l-weiter-raum-btn').addEventListener('click', () => {
        const a = lesen('mt-lehrer', null);
        if (!a) return;
        // Eine unterbrochene Runde startet neu, statt mit abgelaufener Zeit weiterzulaufen
        // (bis dahin kurz die Lobby - deren Stand ist immer gueltig)
        const unterbrochen = a.phase === 'frage';
        lRaumOeffnen({ code: a.code, spiel: a.spiel, plan: a.plan, pos: a.pos, phase: unterbrochen ? 'lobby' : a.phase, gesamt: a.gesamt || {}, entfernt: a.entfernt || {}, letzte: a.letzte, start: a.start, dauer: a.dauer })
            .then(() => { if (unterbrochen && L.code) lGeheZu(a.pos); });
    });
    $('l-start-btn').addEventListener('click', () => {
        if (!Object.keys(L.spieler).length && !confirm('Noch niemand im Raum. Trotzdem starten?')) return;
        audio();
        lGeheZu(0);
    });
    $('l-teil-los').addEventListener('click', () => { audio(); lGeheZu(L.pos + 1); });
    $('l-beenden-btn').addEventListener('click', lAufloesen);
    $('l-weiter-btn').addEventListener('click', () => { audio(); lGeheZu(L.pos + 1); });
    $('l-nochmal-btn').addEventListener('click', lNochmal);
    $('l-schliessen-btn').addEventListener('click', lSchliessen);
    $('l-qr-btn').addEventListener('click', () => {
        qrMalen('l-qr-gross', schuelerUrl(), 640);
        $('l-url-gross').textContent = schuelerUrl().replace(/^https?:\/\//, '');
        $('l-qr-dialog').showModal();
    });
    $('l-plan-btn').addEventListener('click', () => {
        $('l-plan-liste').innerHTML = L.plan.map((r, k) => r.art === 'teil'
            ? `<div class="plan-teil"><i class="fa-solid ${TEIL_INFO[r.teil].icon}"></i> ${esc(TEIL_INFO[r.teil].name)}</div>`
            : `<button type="button" class="btn ${k === L.pos ? 'btn-primaer' : ''}" data-springe="${k}">${rundenNr(k)}. ${esc(r.art === 'tempo' ? r.titel : r.art === 'quiz' ? r.stufe + ' – ' + r.frage : r.bpm + ' bpm · ' + r.r.split('-').map(c => SILBEN[c] || c).join(' '))}</button>`).join('');
        $('l-plan-dialog').showModal();
    });
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-schliessen]');
        if (t) t.closest('dialog').close();
        const sp = e.target.closest('[data-springe]');
        if (sp) { $('l-plan-dialog').close(); audio(); lGeheZu(Number(sp.dataset.springe)); }
        const raus = e.target.closest('[data-raus]');
        if (raus) lEntfernen([raus.dataset.raus]);
        const sofort = e.target.closest('[data-raus-sofort]');
        if (sofort) { e.preventDefault(); lEntfernen([sofort.dataset.rausSofort]); }
        const zf = e.target.closest('[data-zufall]');
        if (zf) {
            const w = songwahl(), i = ZUFALL_STUFEN.indexOf(w.n) >= 0 ? ZUFALL_STUFEN.indexOf(w.n) : 5;
            w.n = ZUFALL_STUFEN[Math.max(0, Math.min(ZUFALL_STUFEN.length - 1, i + Number(zf.dataset.zufall)))];
            schreiben('mt-songwahl', w);
            lSongwahlZeigen();
        }
        if (e.target.closest('#l-spieler-btn')) lSpielerDialog();
        if (e.target.closest('#l-voll-btn')) vollbild();
        if (e.target.closest('#l-wahl-alle')) { document.querySelectorAll('[data-wahl]').forEach(c => { c.checked = true; }); lWahlZaehlen(); }
        if (e.target.closest('#l-wahl-keine')) { document.querySelectorAll('[data-wahl]').forEach(c => { c.checked = false; }); lWahlZaehlen(); }
        if (e.target.closest('#l-wahl-weg')) { document.querySelectorAll('[data-wahl]').forEach(c => { c.checked = istWeg(c.dataset.wahl); }); lWahlZaehlen(); }
        if (e.target.closest('#l-raus-btn')) lEntfernen([...document.querySelectorAll('[data-wahl]:checked')].map(c => c.dataset.wahl));
        if (e.target.closest('[data-hoeren], [data-messen], [data-loeschen]')) lEigeneEreignis(e);
        const z = e.target.closest('[data-zeit]');
        if (z) {
            const [a, d] = z.dataset.zeit.split(':');
            L.zeiten[a] = Math.max(10, Math.min(180, L.zeiten[a] + Number(d)));
            schreiben('mt-zeiten', L.zeiten);
            lZeitenZeigen();
            const r = L.plan[L.pos];
            if (L.phase === 'frage' && r && r.art === a) {
                L.dauer = L.zeiten[a];
                update(ref(db, pfad(L.code, 'lehrer')), { dauer: L.dauer });
                lSichern();
            }
        }
        if (e.target.closest('#l-song-btn')) {
            if (song.paused) { song.volume = 1; song.play().catch(() => { }); } else song.pause();
        }
        if (e.target.closest('#l-song-neu')) { song.currentTime = songAnfang(); song.volume = 1; song.play().catch(() => { }); }
        if (e.target.closest('#l-vorspielen-btn')) lNochmalVorspielen();
        if (e.target.closest('#l-aufl-hoeren')) {
            const r = L.plan[L.pos];
            if (r && r.art === 'nach') vorspielen(r.bpm, r.r, null);
        }
    });
}

/* ============================================================
   SCHUELER
   ============================================================ */
let sCode = (new URLSearchParams(location.search).get('raum') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
let geraet = lesen('mt-geraet', null);
if (!geraet) { geraet = zufall(10, 'abcdefghijkmnpqrstuvwxyz23456789'); schreiben('mt-geraet', geraet); }
let sEmoji = lesen('mt-emoji', EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
let sLehrerAbo = null, sStand = null, sDrin = false, sTimer = null;
let sTipps = [];             // Tipp-Zeiten (performance.now) der laufenden Runde
let sAbgabe = {};            // runde -> eigene Abgabe (fuer Anzeige nach Reload)
let sRundeKey = null, sSpieltBisAlt = null;

function sEmojisZeigen() {
    $('s-emojis').innerHTML = EMOJIS.map(e => `<button type="button" class="${e === sEmoji ? 'an' : ''}" data-emoji="${e}">${e}</button>`).join('');
}
async function sBeitreten() {
    if (!sCode) {
        sCode = $('s-code-eingabe').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (sCode.length < 4) { toast('Bitte den Raumcode eingeben', 'fehler'); return; }
    }
    const name = $('s-name').value.trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!name) { toast('Bitte deinen Namen eingeben', 'fehler'); $('s-name').focus(); return; }
    try {
        const s = await get(ref(db, pfad(sCode, 'lehrer/phase')));
        if (!s.exists()) { toast('Diesen Raum gibt es nicht (mehr).', 'fehler'); return; }
        sBeitrittZeit = jetzt();
        await set(ref(db, pfad(sCode, `spieler/${geraet}`)), { name, emoji: sEmoji, seit: serverTimestamp(), on: true });
        sPraesenz();
    } catch (e) { toast('Keine Verbindung – nochmal versuchen', 'fehler'); return; }
    schreiben('mt-name', name); schreiben('mt-emoji', sEmoji); schreiben('mt-raum', sCode);
    sDrin = true;
    zeigen('s-beitritt', false); zeigen('s-spiel', true);
    sAbgabe = lesen('mt-abgabe-' + sCode, {});
    if (sLehrerAbo) sLehrerAbo();
    sLehrerAbo = onValue(ref(db, pfad(sCode, 'lehrer')), s => {
        const st = s.val();
        if (!st) { sRaus('Der Raum wurde geschlossen.'); return; }
        // entfernt[id] = Zeitpunkt des Entfernens; wer danach neu beitritt, ist wieder dabei
        const e = st.entfernt && st.entfernt[geraet];
        if (e === true || (typeof e === 'number' && e > sBeitrittZeit)) {
            try { localStorage.removeItem('mt-raum'); } catch (x) { /* egal */ }   // kein automatischer Wiederbeitritt
            sRaus('Du wurdest aus dem Raum genommen. Mit „Mitspielen“ kannst du neu beitreten.');
            return;
        }
        sStand = st;
        sZeichnen();
    });
}
/* Anwesenheit: on = true, und Firebase setzt on = false, sobald die
   Verbindung des Geraets abreisst (onDisconnect). Nach einem Wiederverbinden
   erneut melden (Listener auf .info/connected ganz oben). */
let sBeitrittZeit = 0;
function sPraesenz() {
    if (!sCode) return;
    const r = ref(db, pfad(sCode, `spieler/${geraet}/on`));
    onDisconnect(r).set(false).then(() => (sDrin ? set(r, true) : null)).catch(() => { });
}
function sRaus(text) {
    if (sCode) onDisconnect(ref(db, pfad(sCode, `spieler/${geraet}/on`))).cancel().catch(() => { });
    if (sLehrerAbo) sLehrerAbo();
    sLehrerAbo = null; sDrin = false; clearInterval(sTimer);
    zeigen('s-spiel', false); zeigen('s-beitritt', true);
    if (text) toast(text, 'fehler');
}

let sLetzteWertung = null;   // waehrend einer Runde ist lehrer.wertung leer - Kopf zeigt den letzten Stand
function sKopf() {
    if (sStand.wertung && sStand.wertung[geraet]) sLetzteWertung = sStand.wertung[geraet];
    if (sStand.phase === 'lobby') sLetzteWertung = null;
    const w = sLetzteWertung;
    const name = lesen('mt-name', '');
    $('s-stand').innerHTML = `<span>${esc(sEmoji)} <b>${esc(name)}</b></span>
        <span>${sStand.phase === 'frage' || sStand.phase === 'aufl' ? `Runde ${sStand.rundeNr || ''}/${sStand.anzahl || ''}` : ''}</span>
        <span id="s-zeit" class="s-zeit"></span>
        <span>${w ? `<b>${w.g}</b> Pkt · ${w.pl}.` : ''}</span>`;
}
function sZeichnen() {
    const st = sStand;
    clearInterval(sTimer);
    sKopf();
    const key = `${st.spiel}_${st.nr}`;
    const neu = key !== sRundeKey;
    const box = $('s-inhalt');
    box.className = 'karte s-mitte';
    if (st.phase === 'lobby') {
        box.innerHTML = `<div class="s-gross">Du bist drin! 🎉</div><p class="hinweis">Gleich geht’s los – schau zum Beamer.</p>
            <button type="button" class="link" id="s-anders">Anderen Namen wählen</button>`;
        sRundeKey = key;
        return;
    }
    if (st.phase === 'teil') {
        const t = TEIL_INFO[st.art] || {};
        box.innerHTML = `<div class="teil-icon klein"><i class="fa-solid ${t.icon}"></i></div><div class="s-gross">${esc(t.name)}</div><p class="hinweis">${esc(t.text)}</p>`;
        sRundeKey = key;
        return;
    }
    if (st.phase === 'ende') {
        const w = st.wertung && st.wertung[geraet];
        box.innerHTML = `<div class="s-gross">🏆 Spiel vorbei!</div>
            ${w ? `<div class="s-riesig">${w.pl}. Platz</div><p class="s-mittel">${w.g} Punkte</p>` : ''}
            <p class="hinweis">Danke fürs Mitspielen!</p>`;
        sRundeKey = key;
        return;
    }
    if (st.phase === 'frage') {
        if (neu) { sRundeKey = key; sTipps = []; sSpieltBisAlt = st.spieltBis || null; }
        if (sAbgabe[key] !== undefined) {
            box.innerHTML = `<div class="s-gross">✅ Abgegeben!</div><p class="hinweis">Warte auf die Auflösung …</p>`;
            sZeitTick();
            return;
        }
        if (st.art === 'tempo') sTempoZeigen(neu);
        else if (st.art === 'quiz') sQuizZeigen();
        else sNachZeigen(neu);
        sZeitTick();
        return;
    }
    if (st.phase === 'aufl') {
        sRundeKey = key;
        sErgebnisZeigen(key);
    }
}
function sZeitTick() {
    const st = sStand;
    const tick = () => {
        const el = $('s-zeit');
        if (!el || st.phase !== 'frage') return;
        if (st.spieltBis && jetzt() < st.spieltBis) { el.textContent = '🎧'; return; }
        const rest = Math.max(0, Math.ceil((st.start + st.dauer * 1000 - jetzt()) / 1000));
        el.textContent = `⏱ ${rest}`;
        el.classList.toggle('knapp', rest <= 5);
    };
    tick();
    sTimer = setInterval(tick, 250);
}
async function sAbgeben(w) {
    const st = sStand, key = `${st.spiel}_${st.nr}`;
    if (st.phase !== 'frage' || sAbgabe[key] !== undefined) return;
    sAbgabe[key] = w;
    schreiben('mt-abgabe-' + sCode, sAbgabe);
    try {
        await set(ref(db, pfad(sCode, `antw/${key}/${geraet}`)), { w, t: serverTimestamp() });
    } catch (e) {
        delete sAbgabe[key];
        toast('Abgabe hat nicht geklappt – nochmal!', 'fehler');
    }
    sZeichnen();
}

/* ----- Tempo tippen ----- */
// bpm aus den letzten bis zu 12 Tipps: Ausgleichsgerade Zeit ueber Tipp-Nummer
function tippBpm(t) {
    const z = t.slice(-12), n = z.length;
    if (n < 4) return null;
    const mx = (n - 1) / 2, my = z.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    z.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) * (i - mx); });
    const ms = sxy / sxx;
    return ms > 0 ? 60000 / ms : null;
}
function sTempoZeigen(neu) {
    const st = sStand;
    if (!neu && $('s-tap')) return;
    $('s-inhalt').innerHTML = `<div class="s-klein"><i class="fa-solid fa-music"></i> ${esc(st.aufgabe?.titel || '')}</div>
        <button type="button" class="tap" id="s-tap"><span id="s-tap-bpm">Tipp!</span><small id="s-tap-info">im Metrum tippen</small></button>
        <div class="leiste mitte">
            <button type="button" class="btn" id="s-tap-neu"><i class="fa-solid fa-rotate-left"></i> Neu</button>
            <button type="button" class="btn btn-gross btn-primaer" id="s-tap-ab" disabled><i class="fa-solid fa-check"></i> Abgeben</button>
        </div>`;
    sTipps = [];
    const tap = $('s-tap');
    tap.addEventListener('pointerdown', e => {
        e.preventDefault();
        const t = e.timeStamp || performance.now();
        // Nach einer langen Pause neu anfangen
        if (sTipps.length && t - sTipps[sTipps.length - 1] > 2500) sTipps = [];
        sTipps.push(t);
        tap.classList.remove('blitz'); void tap.offsetWidth; tap.classList.add('blitz');
        const bpm = tippBpm(sTipps);
        $('s-tap-bpm').textContent = bpm ? Math.round(bpm) : sTipps.length;
        $('s-tap-info').textContent = bpm ? (sTipps.length < 8 ? `bpm · noch ${8 - sTipps.length}× tippen` : 'bpm') : 'weiter tippen …';
        $('s-tap-ab').disabled = !(bpm && sTipps.length >= 8);
    });
    $('s-tap-neu').addEventListener('click', () => {
        sTipps = [];
        $('s-tap-bpm').textContent = 'Tipp!'; $('s-tap-info').textContent = 'im Metrum tippen';
        $('s-tap-ab').disabled = true;
    });
    $('s-tap-ab').addEventListener('click', () => {
        const bpm = tippBpm(sTipps);
        if (bpm) sAbgeben(rund1(bpm));
    });
}

/* ----- Millionaer ----- */
function sQuizZeigen() {
    const a = sStand.aufgabe || {};
    $('s-inhalt').className = 'karte s-mitte s-wwm';
    $('s-inhalt').innerHTML = `<div class="s-klein">🏆 ${esc(a.stufe || '')}</div><div class="s-frage">${esc(a.frage || '')}</div>
        <div class="s-antworten">${(a.antworten || []).map((t, k) => `<button type="button" class="wwm-knopf f${k}" data-antwort="${k}"><b>${ABCD[k]}</b> ${esc(t)}</button>`).join('')}</div>`;
}

/* ----- Nachmachen ----- */
function sNachZeigen(neu) {
    const st = sStand;
    const hoeren = st.spieltBis && jetzt() < st.spieltBis;
    // Spielt der Beamer erneut vor, faengt man von vorn an
    if (!neu && (st.spieltBis || null) !== sSpieltBisAlt) { sTipps = []; sSpieltBisAlt = st.spieltBis || null; neu = true; }
    if (!neu && $('s-nach-tap')) { sNachStatus(); return; }
    $('s-inhalt').innerHTML = `<div class="s-klein">${st.aufgabe?.bpm || ''} bpm · 4/4</div>
        <div class="s-gross" id="s-nach-status"></div>
        <button type="button" class="tap nach" id="s-nach-tap"><span id="s-nach-zahl">👏</span><small>hier nachtippen</small></button>
        <div class="tipp-punkte" id="s-nach-punkte"></div>
        <div class="leiste mitte">
            <button type="button" class="btn" id="s-nach-neu"><i class="fa-solid fa-rotate-left"></i> Neu</button>
            <button type="button" class="btn btn-gross btn-primaer" id="s-nach-ab" disabled><i class="fa-solid fa-check"></i> Fertig</button>
        </div>`;
    sTipps = [];
    const tap = $('s-nach-tap');
    tap.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (sStand.spieltBis && jetzt() < sStand.spieltBis) return;
        if (sTipps.length >= 16) return;
        sTipps.push(e.timeStamp || performance.now());
        tap.classList.remove('blitz'); void tap.offsetWidth; tap.classList.add('blitz');
        $('s-nach-zahl').textContent = sTipps.length;
        $('s-nach-punkte').innerHTML = sTipps.map(() => '<span></span>').join('');
        $('s-nach-ab').disabled = sTipps.length < 2;
    });
    $('s-nach-neu').addEventListener('click', () => {
        sTipps = [];
        $('s-nach-zahl').textContent = '👏'; $('s-nach-punkte').innerHTML = '';
        $('s-nach-ab').disabled = true;
    });
    $('s-nach-ab').addEventListener('click', () => {
        if (sTipps.length < 2) return;
        const t0 = sTipps[0];
        sAbgeben(sTipps.map(t => Math.round(t - t0)));
    });
    sNachStatus();
    if (hoeren) setTimeout(() => { if (sStand && sStand.phase === 'frage' && sStand.art === 'nach') sNachStatus(); }, st.spieltBis - jetzt() + 50);
}
function sNachStatus() {
    const el = $('s-nach-status'), tap = $('s-nach-tap');
    if (!el) return;
    const hoeren = sStand.spieltBis && jetzt() < sStand.spieltBis;
    el.innerHTML = hoeren ? '🎧 Hör zu!' : '👆 Jetzt du!';
    tap.classList.toggle('gesperrt', !!hoeren);
}

/* ----- Ergebnis ----- */
function sErgebnisZeigen(key) {
    const st = sStand, w = st.wertung && st.wertung[geraet], meine = sAbgabe[key], l = st.loesung || {};
    let detail = '';
    if (st.art === 'tempo') {
        const h = meine !== undefined ? tempoBasis(l.bpm, Number(meine)).halb : false;
        detail = `<p class="s-mittel">Lösung: <b>ca. ${l.bpm} bpm</b></p>${meine !== undefined ? `<p class="hinweis">Du: ${meine} bpm${h ? ` – das ist das ${h === 'halb' ? 'halbe' : 'doppelte'} Tempo, es zählt nur ${l.bpm}` : ''}</p>` : ''}`;
    } else if (st.art === 'quiz') {
        const a = st.aufgabe || {};
        detail = `<p class="s-mittel">Richtig: <b>${ABCD[l.richtig]}</b> – ${esc((a.antworten || [])[l.richtig] || '')}</p>`;
    } else if (l.o) {
        const schlag = 60000 / l.bpm;
        let tipps = null;
        if (Array.isArray(meine)) {
            const k = nachBasis(l.o, meine, l.bpm).k;
            tipps = meine.map(ms => ms / (schlag * k));
        }
        detail = `<div class="noten" id="s-noten"></div>${zeitstrahl(l.o, l.laenge, tipps)}
            <p class="hinweis klein"><span class="leg soll"></span> Rhythmus <span class="leg ist"></span> deine Tipps</p>`;
    }
    const gut = w && w.p >= 100, mittel = w && w.p > 0;
    $('s-inhalt').innerHTML = `
        <div class="s-riesig ${gut ? 'gut' : mittel ? 'mittel' : 'schlecht'}">${w ? '+' + w.p : '+0'}</div>
        ${w && w.x ? `<p class="s-mittel">${w.b} + ⚡ ${w.x} Platzbonus</p>` : ''}
        ${meine === undefined ? '<p class="hinweis">Diesmal keine Abgabe.</p>' : ''}
        ${detail}
        ${w ? `<p class="hinweis">Gesamt: <b>${w.g}</b> Punkte · Platz ${w.pl}</p>` : ''}`;
    if (st.art === 'nach' && l.r) notenMalen($('s-noten'), l.r, 1.4);
}

function schuelerStart() {
    zeigen('schueler', true);
    $('s-code').textContent = sCode || '';
    zeigen('s-code-feld', !sCode);
    $('s-name').value = lesen('mt-name', '');
    sEmojisZeigen();
    $('s-emojis').addEventListener('click', e => {
        const b = e.target.closest('[data-emoji]');
        if (b) { sEmoji = b.dataset.emoji; sEmojisZeigen(); }
    });
    $('s-los-btn').addEventListener('click', sBeitreten);
    $('s-name').addEventListener('keydown', e => { if (e.key === 'Enter') sBeitreten(); });
    $('s-inhalt').addEventListener('click', e => {
        const a = e.target.closest('[data-antwort]');
        if (a) {
            document.querySelectorAll('[data-antwort]').forEach(b => { b.disabled = true; b.classList.toggle('gewaehlt', b === a); });
            sAbgeben(Number(a.dataset.antwort));
        }
        if (e.target.closest('#s-anders')) {
            remove(ref(db, pfad(sCode, `spieler/${geraet}`))).catch(() => { });
            sRaus(null);
        }
    });
    // Gleicher Raum und Name schon bekannt: direkt wieder rein (Reload, Sperrbildschirm)
    if (sCode && lesen('mt-raum', '') === sCode && lesen('mt-name', '')) sBeitreten();
}

/* ---------- Start ---------- */
if (sCode || new URLSearchParams(location.search).has('raum')) schuelerStart();
else lehrerStart();
