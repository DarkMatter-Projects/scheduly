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

// Ask Claude to suggest hashtags relevant to the supplied caption.
// We tell the model to emit *only* hashtags so we can parse with a
// simple regex regardless of whether it picks lines or commas as
// separators. Per-platform hints kick in for IG (allow many) vs
// LinkedIn (one or none).
async function suggestHashtags({ caption, platforms = [], count = 5 }) {
  if (!caption || !caption.trim()) {
    throw Object.assign(new Error('A caption is required'), { status: 400 });
  }
  const c = getClient();
  const guidance = platforms.length > 0
    ? `Tailor for these platforms: ${platforms.join(', ')}.`
    : 'Tailor for general social media.';
  const message = await c.messages.create({
    model: env.anthropic.model,
    max_tokens: 200,
    system: [
      'You suggest relevant social media hashtags for marketing posts.',
      guidance,
      `Return exactly ${count} hashtags, each starting with "#", separated by spaces or commas.`,
      'Prefer specific, mid-volume tags over generic mega-tags (#brand instead of #love).',
      'Output ONLY the hashtags. No commentary, no numbering, no explanation.',
    ].join('\n'),
    messages: [{ role: 'user', content: caption.trim() }],
  });
  const text = (message.content || []).find(b => b.type === 'text')?.text || '';
  // Extract unique hashtags from the response. Cap at `count` so a
  // chatty response can't blow up the chip list.
  const seen = new Set();
  const hashtags = [];
  for (const m of text.matchAll(/#[\wÀ-￿]+/g)) {
    const tag = m[0];
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hashtags.push(tag);
    if (hashtags.length >= count) break;
  }
  if (hashtags.length === 0) {
    throw Object.assign(new Error('Model returned no hashtags'), { status: 502 });
  }
  return { hashtags, model: env.anthropic.model };
}

module.exports = { generateCaption, suggestHashtags };
