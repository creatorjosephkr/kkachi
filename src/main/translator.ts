import { parseDocument } from 'htmlparser2';
import { isTag, isText, type ParentNode, type Text } from 'domhandler';
import render from 'dom-serializer';
import type { AppSettings } from '../shared/types';

const MAX_CHUNK_CHARS = 3200;
const MAX_BATCH_ITEMS = 25;
const MAX_BATCH_CHARS = 2400;
const TRANSLATE_TIMEOUT_MS = 15000;
const CHUNK_DELAY_MS = 120;

const SKIP_HTML_TAGS = new Set([
  'style',
  'script',
  'head',
  'title',
  'noscript',
  'svg',
  'code',
  'pre',
  'textarea',
]);

interface HtmlTextTarget {
  node: Text;
  leading: string;
  core: string;
  trailing: string;
}

/**
 * Checks whether the given text is predominantly Korean (or contains no translatable letters).
 */
export function isKoreanText(text: string): boolean {
  const cleaned = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, ' ')
    .trim();

  if (!cleaned) return true;

  const hangulMatches = cleaned.match(/[\uAC00-\uD7A3\u3131-\u318E]/g) ?? [];
  const letterMatches = cleaned.match(/\p{L}/gu) ?? [];

  if (letterMatches.length === 0) return true;
  if (hangulMatches.length === 0) return false;

  const ratio = hangulMatches.length / letterMatches.length;
  // Treat as Korean when Hangul accounts for at least 35% of alphabetic characters
  return ratio >= 0.35;
}

export function splitTextIntoChunks(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  let current = '';

  const pushOversized = (piece: string) => {
    if (piece.length <= maxChars) {
      chunks.push(piece);
      return;
    }
    const lines = piece.split('\n');
    let buf = '';
    for (const line of lines) {
      if (buf.length + line.length + 1 > maxChars) {
        if (buf) chunks.push(buf);
        if (line.length > maxChars) {
          for (let i = 0; i < line.length; i += maxChars) {
            const slice = line.slice(i, i + maxChars);
            if (slice.trim()) chunks.push(slice);
          }
          buf = '';
        } else {
          buf = line;
        }
      } else {
        buf = buf ? `${buf}\n${line}` : line;
      }
    }
    if (buf.trim()) chunks.push(buf);
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      pushOversized(para);
      continue;
    }

    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > maxChars) {
      if (current) chunks.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function translateGoogleFreeChunk(chunk: string): Promise<string> {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t';
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: new URLSearchParams({ q: chunk }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Google Translate HTTP ${res.status}`);
  }
  const data = (await res.json()) as unknown[];
  const sentences = Array.isArray(data[0]) ? data[0] : [];
  const translated = sentences
    .map((entry) => (Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : ''))
    .join('');

  if (!translated) {
    throw new Error('Empty Google Translate response');
  }
  return translated;
}

async function translateGoogleChromeChunk(chunk: string): Promise<string> {
  const url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=ko';
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: new URLSearchParams({ q: chunk }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Google Chrome Translate HTTP ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  let translated = '';
  if (Array.isArray(data)) {
    translated = data
      .map((item) => {
        if (typeof item === 'string') return item;
        if (Array.isArray(item) && typeof item[0] === 'string') return item[0];
        return '';
      })
      .join('');
  }
  if (!translated) {
    throw new Error('Empty Google Chrome Translate response');
  }
  return translated;
}

async function translateMyMemoryChunk(chunk: string): Promise<string> {
  const trimmed = chunk.slice(0, 480);
  const params = new URLSearchParams({
    q: trimmed,
    langpair: 'en|ko',
  });
  const res = await fetchWithTimeout(`https://api.mymemory.translated.net/get?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`MyMemory HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
  };
  const out = data.responseData?.translatedText;
  if (!out) {
    throw new Error('Empty MyMemory response');
  }
  return out;
}

async function translateFreeChunkWithFallback(chunk: string): Promise<string> {
  try {
    return await translateGoogleFreeChunk(chunk);
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    try {
      return await translateGoogleChromeChunk(chunk);
    } catch {
      await new Promise((r) => setTimeout(r, 400));
      try {
        return await translateGoogleFreeChunk(chunk);
      } catch {
        try {
          return await translateMyMemoryChunk(chunk);
        } catch {
          throw new Error(
            '무료 번역 요청이 일시적으로 제한되었습니다. 잠시 후 "다시 번역"을 눌러주세요.'
          );
        }
      }
    }
  }
}

async function translateWithDeepL(text: string, apiKey: string): Promise<string> {
  const out = await translateDeepLBatch([text], apiKey);
  return out[0];
}

async function translateDeepLBatch(texts: string[], apiKey: string): Promise<string[]> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error('DeepL API 키가 입력되지 않았습니다.');
  }
  const baseUrl = key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const body = new URLSearchParams();
  for (const item of texts) {
    body.append('text', item);
  }
  body.append('target_lang', 'KO');

  const res = await fetchWithTimeout(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`DeepL API 오류 (${res.status})`);
  }
  const data = (await res.json()) as {
    translations?: Array<{ text?: string }>;
  };
  const translations = data.translations ?? [];
  if (translations.length !== texts.length) {
    throw new Error('DeepL 응답 항목 수가 일치하지 않습니다.');
  }
  return translations.map((item, idx) => item.text || texts[idx]);
}

async function translateWithOpenAI(
  text: string,
  apiKey: string,
  model: string
): Promise<string> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error('OpenAI API 키가 입력되지 않았습니다.');
  }

  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are an accurate email translator. Translate the user email text naturally into Korean while preserving formatting, line breaks, names, URLs, and numbers. Output only the Korean translation.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API 오류 (${res.status})`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI 응답이 비어 있습니다.');
  }
  return content;
}

function parseDelimitedBatchOutput(output: string, expectedCount: number): string[] | null {
  const results = new Array<string>(expectedCount);
  const regex = /\[\[(\d+)\]\]\s*([\s\S]*?)(?=\[\[\d+\]\]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(output)) !== null) {
    const idx = Number.parseInt(match[1], 10);
    if (idx >= 0 && idx < expectedCount) {
      results[idx] = match[2].trim();
    }
  }

  for (let i = 0; i < expectedCount; i++) {
    if (!results[i]) return null;
  }
  return results;
}

async function translateClients5Batch(texts: string[]): Promise<string[]> {
  const url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=ko';
  const body = new URLSearchParams();
  for (const item of texts) {
    body.append('q', item);
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Google Chrome batch HTTP ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error('Unexpected batch response shape');
  }

  return data.map((entry, idx) => {
    if (typeof entry === 'string' && entry.trim()) return entry;
    if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].trim()) {
      return entry[0];
    }
    return texts[idx];
  });
}

async function translateGtxDelimitedBatch(texts: string[]): Promise<string[]> {
  const joined = texts.map((item, idx) => `[[${idx}]] ${item}`).join('\n');
  const translated = await translateGoogleFreeChunk(joined);
  const parsed = parseDelimitedBatchOutput(translated, texts.length);
  if (!parsed) {
    throw new Error('Delimited batch alignment mismatch');
  }
  return parsed;
}

export async function translateToKorean(
  text: string,
  settings: AppSettings
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || isKoreanText(trimmed)) {
    return trimmed;
  }

  if (settings.translationProvider === 'deepl') {
    const chunks = splitTextIntoChunks(trimmed, 4000);
    const out: string[] = [];
    for (const chunk of chunks) {
      if (!chunk.trim() || !/\p{L}/u.test(chunk) || isKoreanText(chunk)) {
        out.push(chunk);
      } else {
        out.push(await translateWithDeepL(chunk, settings.deeplApiKey));
      }
    }
    return out.join('\n\n');
  }

  if (settings.translationProvider === 'openai') {
    const chunks = splitTextIntoChunks(trimmed, 6000);
    const out: string[] = [];
    for (const chunk of chunks) {
      if (!chunk.trim() || !/\p{L}/u.test(chunk) || isKoreanText(chunk)) {
        out.push(chunk);
      } else {
        out.push(await translateWithOpenAI(chunk, settings.openaiApiKey, settings.openaiModel));
      }
    }
    return out.join('\n\n');
  }

  // Default: Google Translate free POST endpoints with retry and MyMemory fallback
  const chunks = splitTextIntoChunks(trimmed, MAX_CHUNK_CHARS);
  const translatedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk.trim() || !/\p{L}/u.test(chunk) || isKoreanText(chunk)) {
      translatedChunks.push(chunk);
      continue;
    }
    if (i > 0) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
    translatedChunks.push(await translateFreeChunkWithFallback(chunk));
  }
  return translatedChunks.join('\n\n');
}

async function translateBatchToKorean(
  batch: string[],
  settings: AppSettings
): Promise<string[]> {
  if (batch.length === 0) return [];

  if (settings.translationProvider === 'deepl') {
    return translateDeepLBatch(batch, settings.deeplApiKey);
  }

  if (settings.translationProvider === 'openai') {
    if (batch.length === 1) {
      return [await translateToKorean(batch[0], settings)];
    }
    const joined = batch.map((item, idx) => `[[${idx}]] ${item}`).join('\n');
    const out = await translateWithOpenAI(joined, settings.openaiApiKey, settings.openaiModel);
    const parsed = parseDelimitedBatchOutput(out, batch.length);
    if (parsed) return parsed;

    const sequential: string[] = [];
    for (const item of batch) {
      sequential.push(await translateWithOpenAI(item, settings.openaiApiKey, settings.openaiModel));
    }
    return sequential;
  }

  // Free provider batch: 1) clients5 multi-q 1:1 array, 2) gtx delimited, 3) individual fallback
  try {
    return await translateClients5Batch(batch);
  } catch {
    if (batch.length > 1) {
      try {
        return await translateGtxDelimitedBatch(batch);
      } catch {
        // fall through to individual item translation
      }
    }
    const results: string[] = [];
    for (let i = 0; i < batch.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
      results.push(await translateToKorean(batch[i], settings));
    }
    return results;
  }
}

function collectTranslatableHtmlTextNodes(
  node: ParentNode,
  targets: HtmlTextTarget[]
): void {
  for (const child of node.children) {
    if (isTag(child)) {
      if (!SKIP_HTML_TAGS.has(child.name.toLowerCase())) {
        collectTranslatableHtmlTextNodes(child, targets);
      }
      continue;
    }

    if (isText(child)) {
      const match = child.data.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const leading = match?.[1] ?? '';
      const core = match?.[2] ?? '';
      const trailing = match?.[3] ?? '';

      if (
        core &&
        /\p{L}/u.test(core) &&
        !isKoreanText(core) &&
        !/^https?:\/\/\S+$/i.test(core)
      ) {
        targets.push({ node: child, leading, core, trailing });
      }
    }
  }
}

function groupIntoBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_ITEMS || currentChars + text.length > MAX_BATCH_CHARS)
    ) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

export async function translateHtmlToKorean(
  html: string,
  settings: AppSettings,
  customBatchTranslator?: (texts: string[]) => Promise<string[]>
): Promise<string> {
  if (!html.trim()) return html;

  const doc = parseDocument(html);
  const targets: HtmlTextTarget[] = [];
  collectTranslatableHtmlTextNodes(doc, targets);

  if (targets.length === 0) {
    return html;
  }

  const uniqueTexts = Array.from(new Set(targets.map((t) => t.core)));
  const batches = groupIntoBatches(uniqueTexts);
  const translationMap = new Map<string, string>();

  for (let i = 0; i < batches.length; i++) {
    if (i > 0 && !customBatchTranslator) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
    const batch = batches[i];
    const translated = customBatchTranslator
      ? await customBatchTranslator(batch)
      : await translateBatchToKorean(batch, settings);

    for (let j = 0; j < batch.length; j++) {
      translationMap.set(batch[j], translated[j] ?? batch[j]);
    }
  }

  for (const target of targets) {
    const nextCore = translationMap.get(target.core) ?? target.core;
    target.node.data = `${target.leading}${nextCore}${target.trailing}`;
  }

  return render(doc, { encodeEntities: 'utf8' });
}
