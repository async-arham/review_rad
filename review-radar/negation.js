/* Lightweight, transparent negation-aware correction on top of the ML model. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReviewNegation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const patterns = [
    { regex: /\b(?:not|isn't|wasn't|aren't|weren't)\s+(?:at\s+all\s+)?bad\b/i, phrase: 'not bad', delta: 1.55, meaning: 'mildly positive', positive: true },
    { regex: /\b(?:not|isn't|wasn't|aren't|weren't)\s+(?:at\s+all\s+)?terrible\b/i, phrase: 'not terrible', delta: 1.35, meaning: 'mildly positive', positive: true },
    { regex: /\b(?:not|isn't|wasn't|aren't|weren't)\s+(?:very\s+)?good\b/i, phrase: 'not good', delta: -1.7, meaning: 'negative', positive: false },
    { regex: /\b(?:not|isn't|wasn't|aren't|weren't)\s+(?:very\s+)?great\b/i, phrase: 'not great', delta: -1.4, meaning: 'mildly negative', positive: false },
    { regex: /\b(?:not|isn't|wasn't|aren't|weren't)\s+impressed\b/i, phrase: 'not impressed', delta: -1.8, meaning: 'negative', positive: false },
    { regex: /\b(?:not|isn't|wasn't|aren't|weren't)\s+(?:very\s+|too\s+)?(?:happy|satisfied|pleased)\b/i, phrase: 'not happy', delta: -1.7, meaning: 'negative', positive: false },
    { regex: /\b(?:not|isn't|wasn't)\s+(?:worth|recommended)\b|\b(?:would\s+not|wouldn't|don't|do\s+not|can't|cannot)\s+recommend\b|\bnever\s+again\b/i, phrase: 'would not recommend', delta: -1.8, meaning: 'negative', positive: false },
    { regex: /\b(?:not|wasn't|weren't|never)\s+(?:at\s+all\s+)?(?:disappointed|disappointing)\b/i, phrase: 'not disappointed', delta: 1.5, meaning: 'mildly positive', positive: true },
    { regex: /\b(?:no\s+complaints|can't\s+complain|cannot\s+complain|couldn't\s+be\s+happier)\b/i, phrase: 'no complaints', delta: 1.5, meaning: 'positive', positive: true }
  ];
  function adjust(text, prediction) {
    const matches = patterns.filter(p => p.regex.test(String(text || '')));
    if (!matches.length) return { ...prediction, negation: null, strength: null };
    let logit = Math.log(Math.max(1e-6, prediction.positive) / Math.max(1e-6, 1 - prediction.positive));
    for (const match of matches) logit += match.delta;
    let positive = 1 / (1 + Math.exp(-logit));
    // On short, otherwise neutral reviews, prevent an incidental unigram ('bad')
    // from overpowering a known negated phrase. Don't override mixed feedback.
    const wordCount = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
    if (matches.length === 1 && wordCount <= 8) {
      const match = matches[0];
      if (match.positive) positive = Math.max(positive, 0.64);
      else positive = Math.min(positive, 0.39);
    }
    return {
      ...prediction,
      positive,
      negative: 1 - positive,
      label: positive >= .5 ? 'positive' : 'negative',
      negation: matches.map(({ phrase, meaning }) => ({ phrase, meaning })),
      strength: matches.length === 1 && matches[0].positive ? 'Mildly positive' : null
    };
  }
  return { adjust };
});
