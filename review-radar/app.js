'use strict';
const $ = id => document.getElementById(id);
const input = $('reviewInput'), btn = $('analyzeBtn'), MAX = 2000;
let model = null, latest = null, count = 0, rid = 0, loading = false;

const tokenize = t => t.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [];
function features(text) {
  const tokens = tokenize(text), counts = {};
  for (let n = 1; n <= 2; n++) for (let i = 0; i <= tokens.length - n; i++) {
    const idx = model.vocabulary[tokens.slice(i, i + n).join(' ')];
    if (idx !== undefined) counts[idx] = (counts[idx] || 0) + 1;
  }
  let norm = 0; const vec = [];
  for (const [k, c] of Object.entries(counts)) { const v = (1 + Math.log(c)) * model.idf[k]; vec.push([+k, v]); norm += v * v; }
  norm = Math.sqrt(norm) || 1;
  return vec.map(([i, v]) => [i, v / norm]);
}
function predict(text) {
  const vec = features(text); let logit = model.intercept;
  for (const [i, v] of vec) logit += model.weights[i] * v;
  const positive = 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, logit))));
  const contributions = vec.map(([i, v]) => ({ token: model.inverseVocabulary[i], score: v * model.weights[i] }))
    .filter(x => Math.abs(x.score) > .008).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 5);
  return ReviewNegation.adjust(text, { positive, negative: 1 - positive, label: positive >= .5 ? 'positive' : 'negative', contributions, recognized: vec.length });
}

/* ---- edge-case guards --------------------------------------------------- */
function clean(raw) {
  return raw.normalize('NFKC').replace(/https?:\/\/\S+|www\.\S+/gi, ' ').replace(/[\u0000-\u001f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
}
function problem(text) {
  if (!text) return 'Please enter a review first.';
  const words = tokenize(text);
  if (words.length < 2) return 'Please enter a longer review (at least two words — links, emoji and numbers alone don’t count).';
  if (new Set(words).size === 1 && words.length > 3) return 'That’s one word repeated. Write a sentence or two about the experience.';
  return null;
}
const sarcasm = /\b(yeah,?\s+right|oh,?\s+great|oh,?\s+wow|just\s+what\s+i\s+needed|thanks\s+for\s+nothing|as\s+if|sure,?\s+because|real\s+great|so\s+helpful\s+not|what\s+a\s+(?:surprise|joke))\b/i;
const contrast = /\b(but|however|although|though|except|yet|while)\b/i;

function verdict(text, r) {
  const pos = Math.round(r.positive * 100), certain = Math.max(pos, 100 - pos), notes = [];
  const letters = text.match(/\p{L}/gu) || [], latin = letters.filter(c => /\p{Script=Latin}/u.test(c)).length;
  const foreign = letters.length > 3 && latin / letters.length < .6;
  const posHit = r.contributions.some(c => c.score > .02), negHit = r.contributions.some(c => c.score < -.02);
  if (foreign) notes.push('This doesn’t look like English. The model only knows English reviews.');
  if (sarcasm.test(text)) notes.push('Possible sarcasm detected — the words may say the opposite of what’s meant.');
  if (text.length > 24 && letters.length > 8 && text === text.toUpperCase()) notes.push('ALL CAPS reads as shouting; the model ignores case, so intensity is lost.');
  if (/(.)\1{4,}/.test(text)) notes.push('Stretched letters (sooooo) are not understood as emphasis.');
  if (r.recognized < 2 && !r.negation) notes.push('Few known words recognized; treat any lean cautiously.');
  let kind = r.label, title = r.label === 'positive' ? 'Positive' : 'Negative';
  if (foreign || (r.recognized < 2 && !r.negation)) { kind = 'unclear'; title = 'Unclear'; }
  else if (!r.negation && (certain < 62 || (contrast.test(text) && posHit && negHit))) { kind = 'mixed'; title = 'Mixed'; }
  else if (sarcasm.test(text) && certain < 85) { kind = 'mixed'; title = 'Mixed'; }
  const desc = {
    positive: r.strength ? 'Sounds mildly positive rather than strongly enthusiastic.' : 'The model detects a clearly positive tone.',
    negative: 'The model detects a clearly negative tone.',
    mixed: 'Signals pull both ways, or the call is too close to trust — read it as mixed.',
    unclear: foreign ? 'Not enough English to judge. No verdict given.' : 'Too few known words for a trustworthy verdict.'
  }[kind];
  if (kind === 'mixed' && certain >= 62) notes.push('Contrast words (“but”, “however”) plus opposing signals — likely both praise and complaint.');
  return { kind, title, desc, notes, pos, certain };
}

/* ---- UI ----------------------------------------------------------------- */
function showError(msg, retry) {
  const e = $('inputError'); e.textContent = msg; e.hidden = false;
  if (retry) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill ghost'; b.textContent = 'Retry'; b.onclick = load; e.append(b); }
}
function sync() {
  const n = input.value.length; $('charCount').textContent = n;
  $('cc').classList.toggle('warn', n >= MAX);
  $('inputHelp').textContent = n >= MAX ? 'Limit reached — extra text was cut off' : 'English reviews work best · ⌘/Ctrl + Enter';
  btn.disabled = !model || !input.value.trim(); $('inputError').hidden = true;
}
function resetExplain() { $('aiReply').hidden = true; $('explainBtn').disabled = false; $('explainBtn').textContent = 'Ask Gemini for a deeper take'; }
function reset() {
  rid++; input.value = ''; latest = null; $('emptyState').hidden = false; $('resultContent').hidden = true;
  $('resultsPanel').className = 'out s-empty'; $('reportNum').textContent = 'Ready when you are'; resetExplain(); sync(); input.focus();
}
function render(v, r) {
  $('emptyState').hidden = true; $('resultContent').hidden = false; $('resultsPanel').className = 'out s-' + v.kind;
  $('reportNum').textContent = 'Report #' + String(++count).padStart(3, '0');
  $('verdictText').textContent = v.title; $('resultDescription').textContent = v.desc;
  $('positiveBar').style.width = (v.kind === 'unclear' ? 50 : v.pos) + '%';
  $('positiveScore').textContent = v.kind === 'unclear' ? 'Positive —' : 'Positive ' + v.pos + '%';
  $('negativeScore').textContent = v.kind === 'unclear' ? 'Negative —' : 'Negative ' + (100 - v.pos) + '%';
  const ul = $('notes'); ul.replaceChildren(...v.notes.slice(0,2).map(t => Object.assign(document.createElement('li'), { textContent: t })));
  const words = r.contributions.filter(x => r.label === 'negative' ? x.score < 0 : x.score > 0).slice(0, 3).map(x => '“' + x.token + '”');
  $('reasonText').textContent = v.kind === 'unclear' ? 'Percentages are hidden because the model has too little to go on.'
    : r.negation ? 'Negation detected: ' + r.negation.map(x => '“' + x.phrase + '” means ' + x.meaning).join('; ') + '. Combined with the trained model.'
    : words.length ? 'Words steering the classifier: ' + words.join(', ') + '. These are estimates, not verified probabilities.'
    : 'Based on overall text patterns. Estimates only, not verified probabilities.';
  $('explainBtn').hidden = v.kind === 'unclear'; resetExplain();
}
function analyze() {
  if (!model) return showError('The model isn’t loaded yet.', true);
  const text = clean(input.value), bad = problem(text);
  if (bad) return showError(bad);
  rid++;
  try { const r = predict(text), v = verdict(text, r); latest = { text, kind: v.kind }; render(v, r); }
  catch (err) { console.error(err); return showError('Something went wrong analyzing that text. Try rephrasing it.'); }
}
async function explain() {
  if (!latest || latest.kind === 'unclear') return;
  const my = rid, rec = latest, b = $('explainBtn'), ai = $('aiReply'), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
  b.disabled = true; b.textContent = 'Thinking with Gemini…'; ai.hidden = false; ai.textContent = 'Generating your explanation…';
  try {
    if (location.protocol === 'file:') throw new Error('Gemini needs a deployed site.');
    const res = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ review: rec.text, sentiment: rec.kind }) });
    const data = await res.json().catch(() => ({}));
    if (my !== rid) return;
    if (!res.ok) throw new Error(data.error || 'Gemini is unavailable here.');
    ai.textContent = data.explanation || 'No explanation returned.';
  } catch (e) { if (my === rid) ai.textContent = (e.name === 'AbortError' ? 'Gemini timed out.' : e.message || 'Unable to reach Gemini.') + ' The classifier works without it.'; }
  finally { clearTimeout(timer); if (my === rid) { b.disabled = false; b.textContent = 'Try Gemini again'; } }
}
async function load() {
  if (loading) return; loading = true; const st = $('modelStatus'), dot = $('statusDot');
  st.textContent = 'Loading model…'; dot.className = 'dot';
  if (location.protocol === 'file:') { st.textContent = 'Needs a server'; dot.className = 'dot bad'; loading = false; return showError('Don’t open index.html directly — run “npm start” and visit http://localhost:5500.'); }
  try {
    const res = await fetch('model/model.json', { cache: 'no-store' });
    if (!res.ok) throw Error('HTTP ' + res.status);
    const m = await res.json();
    if (!m || !Array.isArray(m.weights) || !Array.isArray(m.idf) || !m.vocabulary || m.weights.length !== m.idf.length || typeof m.intercept !== 'number') throw Error('invalid model');
    m.inverseVocabulary = Object.entries(m.vocabulary).reduce((o, [k, v]) => (o[v] = k, o), {}); model = m;
    if (typeof m.held_out_accuracy === 'number') $('acc').textContent = (m.held_out_accuracy * (m.held_out_accuracy <= 1 ? 100 : 1)).toFixed(1) + '% on ' + (m.held_out_examples || 'a') + ' held-out reviews';
    st.textContent = 'Model ready'; dot.className = 'dot ok'; sync();
  } catch (e) { st.textContent = 'Model unavailable'; dot.className = 'dot bad'; showError('Could not load the ML model (' + e.message + ').', true); }
  finally { loading = false; }
}
input.addEventListener('input', sync);
input.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!btn.disabled) analyze(); } });
btn.addEventListener('click', analyze); $('clearBtn').addEventListener('click', reset); $('explainBtn').addEventListener('click', explain);
document.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.review; sync(); analyze(); }));
load();
