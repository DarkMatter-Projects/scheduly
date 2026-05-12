const Sentiment = require('sentiment');

const analyzer = new Sentiment();

// Map AFINN comparative score (-5 .. 5, but typically -2..2 for short text)
// to a coarse label. Threshold chosen empirically: anything past ±0.2
// "comparative" reads as more than neutral noise to a human.
function labelFor(comparative) {
  if (comparative >= 0.2) return 'positive';
  if (comparative <= -0.2) return 'negative';
  return 'neutral';
}

function analyze(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { score: 0, comparative: 0, label: 'neutral' };
  }
  const result = analyzer.analyze(text);
  return {
    score: result.score,
    comparative: Number(result.comparative.toFixed(3)),
    label: labelFor(result.comparative),
  };
}

module.exports = { analyze };
