# Review Radar — Hackathon demo

A working positive/negative review classifier using **CSV → JavaScript TF-IDF → JavaScript Logistic Regression → JSON → browser**, with optional server-side Gemini explanations.

## 1. Run locally — JavaScript only

You need **Node.js 18+**. Open the `review-radar` folder in VS Code, then run:

```bash
npm start
```

Visit **http://localhost:5500**. The classifier works immediately without an API key or Python. Do not double-click `index.html`: browsers often block loading JSON from `file://`.

The optional **Ask Gemini** button requires Vercel deployment, or `vercel dev` with `GEMINI_API_KEY` configured in your Vercel environment.

## 2. Retrain the ML model (JavaScript, no Python)

```bash
npm run train
```

This reads `data/reviews.csv`, trains a real **TF-IDF + Logistic Regression** model in Node.js (implemented with plain JavaScript), evaluates it on a stratified held-out set, and writes `model/model.json`. To use your own data, edit the CSV with `review,label` columns (`positive` or `negative`), run `npm run train`, then reload the page. No `pip`, `scikit-learn`, or npm dependencies are required.

**Dataset honesty:** Included data consists of 160 hand-written demonstration reviews plus 216 simple templated examples, not downloaded Kaggle reviews. Accuracy is measured on a random stratified 20% hold-out set (including similar templates, so scores may be optimistic); it is not a real-world performance guarantee. Current JavaScript trainer evaluation: **84.2% on 76 held-out demo reviews**. The model can misread sarcasm, mixed sentiment, other languages, or unusual phrases. The percentages on screen are uncalibrated model outputs, not measured certainty.

## 3. Optional Gemini API key

1. Go to https://aistudio.google.com/app/apikey and create an API key.
2. Deploy this folder to Vercel. In your Vercel project, open **Settings → Environment Variables** and add `GEMINI_API_KEY` with the secret value.
3. Redeploy. Now the **Ask Gemini** button will work on the deployed site.

Never paste the key into `index.html`, `app.js`, GitHub, or chat. `/api/explain.js` reads it from the server environment only. Gemini **explains** the Logistic Regression prediction; it does **not** replace the ML classifier.

## 4. Deploy to Vercel

Use Vercel CLI inside the folder:

```bash
vercel
vercel --prod
```

Choose your team/account when prompted. Vercel serves the static page and the Node.js serverless function in `api/explain.js`. No frontend framework or build script is required.

## Demo speech (35 seconds)

> “Our project is Review Radar. It predicts whether a customer review is positive or negative. We labeled a small review dataset, converted the text to TF-IDF features, and trained a real Logistic Regression classifier entirely in JavaScript. We exported its coefficients to JSON, so predictions run instantly inside the browser. We also added an optional Gemini explanation feature to help users understand the output. Now let me paste a positive review, a negative review, and a mixed review. The model is a demo and we can improve it using a larger, more representative dataset.”

## Project architecture

- `data/reviews.csv` — labeled dataset
- `scripts/train.js` — JavaScript model training, evaluation, export
- `model/model.json` — exported coefficients, vocabulary, TF-IDF weights
- `index.html` + `styles.css` — responsive UI
- `app.js` — JavaScript inference using the trained model
- `scripts/serve.js` — local Node.js web server
- `package.json` — npm start and npm run train scripts
- `api/explain.js` — optional Gemini explanation, secret stays server-side

## Limitations and future improvements

The current demo is focused on English-language reviews. In a production version: train on much more diverse real review data, verify source rights, use a separate untouched real-world test set, calibrate probabilities, detect out-of-distribution inputs, and consider a **mixed/neutral** label. Never present these outputs as guaranteed facts about a customer.

### Negation-aware tests

The JavaScript frontend also loads `negation.js`. This small, explicit language layer corrects common negated phrases before showing the verdict. For example, "The garlic bread was not bad!" should be **mildly positive**, while "The food was not good" should be **negative**. This is a hybrid model (TF-IDF + Logistic Regression + linguistic adjustment), not proof that the classifier fully understands all negation or sarcasm. Review scores remain heuristic estimates.

## v2 — one-page redesign & edge cases

The UI is now a single fixed screen — no page scroll, no scrollbars, no textarea resize handle (hero + analyzer + one-line limits note) styled after `Empower — Style Reference`: chartreuse `#e4e24e` as the only accent, alternating Smoke/Bone bands, pill buttons, shadowless surfaces.

Edge cases handled in `app.js`: empty / one-word / emoji-only / repeated-word / link-only input; 2000-char cap notice; non-English scripts and gibberish → **Unclear** (no fake percentages); close calls and contrast sentences ("nice but…") → **Mixed**; sarcasm, ALL CAPS and stretched-letter warnings; expanded negation phrases (`not happy`, `would not recommend`, `no complaints`, `not disappointed`); model load failure with Retry and `file://` guidance; Gemini 15 s client timeout, non-JSON/404 replies, stale-response race protection; busy-port message in `serve.js`; `model/model.json` is fetched with a relative path so subfolder hosting works; `prefers-reduced-motion` respected.
