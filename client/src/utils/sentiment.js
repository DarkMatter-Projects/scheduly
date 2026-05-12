import Sentiment from 'sentiment';

const analyzer = new Sentiment();

function labelFor(comparative) {
  if (comparative >= 0.2) return 'positive';
  if (comparative <= -0.2) return 'negative';
  return 'neutral';
}

export function analyzeSentiment(text) {
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

export const SENTIMENT_STYLES = {
  positive: {
    label: 'Positive',
    text: 'text-emerald-700',
    bg: 'bg-emerald-100',
    dot: 'bg-emerald-500',
  },
  neutral: {
    label: 'Neutral',
    text: 'text-slate-600',
    bg: 'bg-slate-100',
    dot: 'bg-slate-400',
  },
  negative: {
    label: 'Negative',
    text: 'text-rose-700',
    bg: 'bg-rose-100',
    dot: 'bg-rose-500',
  },
};
