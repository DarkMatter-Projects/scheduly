const Anthropic = require('@anthropic-ai/sdk');
const env = require('../config/env');

// Single shared client. Reads ANTHROPIC_API_KEY at module load; throws a
// friendly error at call-time if the env var is missing so the request
// fails with a clear status instead of an opaque SDK error.
let client = null;
function getClient() {
  if (client) return client;
  if (!env.anthropic?.apiKey) {
    throw Object.assign(new Error('ANTHROPIC_API_KEY is not set on the server'), { status: 503 });
  }
  client = new Anthropic({ apiKey: env.anthropic.apiKey });
  return client;
}

// Platform-aware system prompts. Keeps the model from suggesting hashtags
// on LinkedIn or links on TikTok where they don't perform.
const PLATFORM_GUIDANCE = {
  facebook_page:       'Conversational, 1-3 short paragraphs, max 300 chars. Emojis OK in moderation. 1-3 hashtags max, at the end.',
  instagram_business:  'Punchy hook in the first line, then 2-4 short sentences. Up to 30 hashtags allowed but prefer 5-10 high-intent ones.',
  tiktok:              'Single sentence or short hook, max 150 chars. 3-5 hashtags including 1-2 trending ones if relevant.',
  linkedin:            'Professional tone. 2-4 paragraphs. No hashtags unless explicitly relevant. Lead with a strong insight or question.',
  twitter:             'Single tweet, hard cap 280 chars. Punchy, opinionated. 0-2 hashtags max.',
  youtube:             'Acts as the YouTube description. 1-3 paragraphs, can include timestamps or links. Keywords help discovery.',
};

function buildSystemPrompt(platforms = [], tone = 'engaging') {
  const guidance = platforms.length > 0
    ? platforms.map(p => `${p}: ${PLATFORM_GUIDANCE[p] || 'Default social caption rules.'}`).join('\n')
    : 'No specific platform — write a generic social caption.';
  return [
    'You write social media captions for a marketing team\'s scheduling tool.',
    `Tone: ${tone}.`,
    'Per-platform guidance:',
    guidance,
    'Output ONLY the caption text — no preamble, no quotes, no explanations.',
  ].join('\n\n');
}

// Generate a caption. Returns { caption: string } or throws with
// .status set so the controller can map it onto an HTTP response.
async function generateCaption({ prompt, platforms = [], tone = 'engaging', maxTokens = 400 }) {
  if (!prompt || !prompt.trim()) {
    throw Object.assign(new Error('A prompt is required'), { status: 400 });
  }
  const c = getClient();
  const message = await c.messages.create({
    model: env.anthropic.model,
    max_tokens: maxTokens,
    system: buildSystemPrompt(platforms, tone),
    messages: [{ role: 'user', content: prompt.trim() }],
  });
  const block = (message.content || []).find(b => b.type === 'text');
  const text = block?.text?.trim() || '';
  if (!text) {
    throw Object.assign(new Error('Empty caption returned by the model'), { status: 502 });
  }
  return { caption: text, model: env.anthropic.model };
}

module.exports = { generateCaption };
