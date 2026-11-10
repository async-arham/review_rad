/** Train TF-IDF + binary logistic regression entirely in Node.js (no packages). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function parseCsv(csv) {
  const records = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(field); if (row.some(v => v.length)) records.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed quoted field in CSV');
  row.push(field); if (row.some(v => v.length)) records.push(row);
  const header = records.shift().map(v => v.trim().toLowerCase());
  const textIdx = header.indexOf('review'), labelIdx = header.indexOf('label');
  if (textIdx < 0 || labelIdx < 0) throw Error('CSV needs review,label columns');
  return records.map((r, i) => {
    const review = (r[textIdx] || '').trim(), label = (r[labelIdx] || '').trim().toLowerCase();
    if (!review || !['positive', 'negative'].includes(label)) throw Error(`Invalid row ${i + 2}`);
    return { review, label: label === 'positive' ? 1 : 0 };
  });
}
const tokenize = text => text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [];
function terms(text) {
  const t = tokenize(text), result = new Map();
  for (let n = 1; n <= 2; n++) for (let i = 0; i <= t.length - n; i++) {
    const k = t.slice(i, i + n).join(' ');
    result.set(k, (result.get(k) || 0) + 1);
  }
  return result;
}
let seed = 42;
function random() { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function split(rows) {
  const pos = shuffle(rows.filter(r => r.label === 1));
  const neg = shuffle(rows.filter(r => r.label === 0));
  const testPos = Math.max(1, Math.round(pos.length * .2));
  const testNeg = Math.max(1, Math.round(neg.length * .2));
  return { train: shuffle([...pos.slice(testPos), ...neg.slice(testNeg)]), test: [...pos.slice(0, testPos), ...neg.slice(0, testNeg)] };
}
function vectorizer(train) {
  const vocabulary = Object.create(null), docFreq = new Map();
  for (const row of train) for (const token of terms(row.review).keys()) docFreq.set(token, (docFreq.get(token) || 0) + 1);
  const sorted = [...docFreq.keys()].sort();
  sorted.forEach((token, i) => { vocabulary[token] = i; });
  const idf = sorted.map(token => Math.log((train.length + 1) / (docFreq.get(token) + 1)) + 1);
  const vectorize = review => {
    const vec = [], counts = terms(review); let sumSq = 0;
    for (const [token, count] of counts) {
      const i = vocabulary[token]; if (i === undefined) continue;
      const value = (1 + Math.log(count)) * idf[i];
      vec.push([i, value]); sumSq += value * value;
    }
    const norm = Math.sqrt(sumSq) || 1;
    return vec.map(([i, value]) => [i, value / norm]);
  };
  return { vocabulary, idf, vectorize };
}
function sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, z)))); }
function dot(vec, w) { let z = 0; for (const [i, v] of vec) z += w[i] * v; return z; }
function trainModel(train, vectorize, dim) {
  const X = train.map(r => vectorize(r.review)), y = train.map(r => r.label);
  const w = new Float64Array(dim), grad = new Float64Array(dim);
  let bias = 0;
  // Full-batch gradient descent with L2 penalty; C=2.5 analogous to sklearn's objective.
  const epochs = 2500, learningRate = 2.5, lambda = 1 / (2.5 * train.length);
  for (let epoch = 0; epoch < epochs; epoch++) {
    grad.fill(0); let biasGrad = 0;
    for (let j = 0; j < X.length; j++) {
      const error = sigmoid(bias + dot(X[j], w)) - y[j];
      biasGrad += error;
      for (const [i, value] of X[j]) grad[i] += error * value;
    }
    for (let i = 0; i < dim; i++) w[i] -= learningRate * (grad[i] / X.length + lambda * w[i]);
    bias -= learningRate * biasGrad / X.length;
  }
  return { weights: Array.from(w), intercept: bias };
}
function main() {
  const rows = parseCsv(fs.readFileSync(path.join(root, 'data/reviews.csv'), 'utf8').replace(/^\uFEFF/, ''));
  if (rows.length < 20 || !rows.some(r => r.label === 0) || !rows.some(r => r.label === 1)) throw Error('Need at least 20 reviews across both labels.');
  const reviews = new Set(rows.map(r => r.review.toLowerCase().trim()));
  if (reviews.size !== rows.length) throw Error('Duplicate reviews found; clean the CSV before training.');
  const { train, test } = split(rows);
  const { vocabulary, idf, vectorize } = vectorizer(train);
  const { weights, intercept } = trainModel(train, vectorize, idf.length);
  const correct = test.filter(r => (sigmoid(intercept + dot(vectorize(r.review), weights)) >= .5 ? 1 : 0) === r.label).length;
  const accuracy = correct / test.length;
  const model = {
    type: 'tfidf_logistic_regression', labels: ['negative', 'positive'],
    vocabulary, idf, weights, intercept,
    ngram_range: [1, 2], sublinear_tf: true, l2_normalize: true,
    examples_count: rows.length, held_out_examples: test.length,
    held_out_accuracy: Math.round(accuracy * 10000) / 10000,
    dataset_note: 'Small demonstration dataset; held-out accuracy may be optimistic because templates resemble each other.'
  };
  fs.mkdirSync(path.join(root, 'model'), { recursive: true });
  fs.writeFileSync(path.join(root, 'model/model.json'), JSON.stringify(model));
  console.log(`Trained with JavaScript only. Reviews: ${rows.length}; test: ${test.length}; held-out accuracy: ${(accuracy * 100).toFixed(1)}%.`);
  console.log('Saved model/model.json — reload the website to use it.');
}
main();
