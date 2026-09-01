/**
 * Narrow, dependency-free reader for YouTube's public channel Atom feed.
 *
 * The caller supplies only a validated channel id. This module constructs the
 * one permitted URL, resolves the fixed host before the request, refuses
 * redirects, bounds time and bytes, and parses only the small Atom subset the
 * runner needs. Raw XML, descriptions, captions, and transcripts never leave
 * this boundary.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { sha256Hex } from './canonical.mjs';

export const YOUTUBE_RSS_HOST = 'www.youtube.com';
export const YOUTUBE_RSS_PATH = '/feeds/videos.xml';
export const YOUTUBE_RSS_MAX_BYTES = 512 * 1024;
export const YOUTUBE_RSS_TIMEOUT_MS = 10_000;

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_CONTENT_TYPES = new Set(['application/atom+xml', 'application/xml', 'text/xml']);
const MAX_ENTRIES = 15;
const MAX_CHANNEL_NAME_LENGTH = 200;
const MAX_TITLE_LENGTH = 300;
const MAX_XML_NODES = 5000;
const MAX_XML_DEPTH = 64;

export function validateYouTubeChannelId(value) {
  return typeof value === 'string' && CHANNEL_ID_PATTERN.test(value);
}

export function youtubeChannelFeedUrl(channelId) {
  if (!validateYouTubeChannelId(channelId)) {
    throw new Error('channelId must be exactly UC followed by 22 URL-safe characters');
  }
  return `https://${YOUTUBE_RSS_HOST}${YOUTUBE_RSS_PATH}?channel_id=${channelId}`;
}

function isPublicIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function parseIpv6Groups(address) {
  let normalized = address.toLowerCase().split('%')[0];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (dotted) {
    if (isIP(dotted[1]) !== 4) return null;
    const bytes = dotted[1].split('.').map(Number);
    normalized = normalized.slice(0, dotted.index)
      + ((bytes[0] << 8) | bytes[1]).toString(16)
      + ':'
      + ((bytes[2] << 8) | bytes[3]).toString(16);
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return null;
  const rawGroups = [...left, ...Array(missing).fill('0'), ...right];
  if (rawGroups.length !== 8 || rawGroups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return rawGroups.map((group) => Number.parseInt(group, 16));
}

function isPublicIpv6(address) {
  const groups = parseIpv6Groups(address);
  if (!groups) return false;
  const [first, second] = groups;
  if (groups.every((group) => group === 0)) return false;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const mapped = `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
    return isPublicIpv4(mapped);
  }
  // Deprecated IPv4-compatible addresses are not accepted.
  if (groups.slice(0, 6).every((group) => group === 0)) return false;
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xffc0) === 0xfec0) return false; // deprecated site-local fec0::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast ff00::/8
  if (first === 0x2001 && [0x0000, 0x0002, 0x0010, 0x0db8].includes(second)) return false;
  if (first === 0x2002) {
    const embedded = `${second >> 8}.${second & 255}.${groups[2] >> 8}.${groups[2] & 255}`;
    return isPublicIpv4(embedded);
  }
  return true;
}

/** False for loopback, private, link-local, documentation, and reserved IPs. */
export function isPublicNetworkAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function decodeXml(value) {
  const entityPattern = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);/g;
  let output = '';
  let cursor = 0;
  for (const match of value.matchAll(entityPattern)) {
    const before = value.slice(cursor, match.index);
    if (before.includes('&')) throw new Error('malformed XML: unknown entity reference');
    output += before;
    const entity = match[0];
    if (entity === '&amp;') output += '&';
    else if (entity === '&lt;') output += '<';
    else if (entity === '&gt;') output += '>';
    else if (entity === '&quot;') output += '"';
    else if (entity === '&apos;') output += "'";
    else {
      const radix = entity.startsWith('&#x') ? 16 : 10;
      const digits = entity.slice(radix === 16 ? 3 : 2, -1);
      const codePoint = Number.parseInt(digits, radix);
      const valid = Number.isInteger(codePoint)
        && codePoint <= 0x10ffff
        && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        && (codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd || codePoint >= 0x20);
      if (!valid) throw new Error('malformed XML: invalid character reference');
      output += String.fromCodePoint(codePoint);
    }
    cursor = match.index + entity.length;
  }
  const tail = value.slice(cursor);
  if (tail.includes('&')) throw new Error('malformed XML: unknown entity reference');
  return output + tail;
}

function findTagEnd(xml, start) {
  let quote = null;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return -1;
}

function parseAttributes(raw) {
  const attributes = {};
  let cursor = 0;
  while (cursor < raw.length) {
    while (/\s/.test(raw[cursor] ?? '')) cursor += 1;
    if (cursor >= raw.length) break;
    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(raw.slice(cursor));
    if (!nameMatch) throw new Error('malformed XML: invalid attribute name');
    const name = nameMatch[0];
    if (Object.prototype.hasOwnProperty.call(attributes, name)) throw new Error('malformed XML: duplicate attribute');
    cursor += name.length;
    while (/\s/.test(raw[cursor] ?? '')) cursor += 1;
    if (raw[cursor] !== '=') throw new Error('malformed XML: attribute requires a value');
    cursor += 1;
    while (/\s/.test(raw[cursor] ?? '')) cursor += 1;
    const quote = raw[cursor];
    if (quote !== '"' && quote !== "'") throw new Error('malformed XML: attribute value must be quoted');
    const end = raw.indexOf(quote, cursor + 1);
    if (end < 0) throw new Error('malformed XML: unterminated attribute');
    const attributeValue = raw.slice(cursor + 1, end);
    if (attributeValue.includes('<')) throw new Error('malformed XML: unescaped < in attribute');
    attributes[name] = decodeXml(attributeValue);
    cursor = end + 1;
  }
  return attributes;
}

function parseXml(xml) {
  if (typeof xml !== 'string' || xml.length === 0) throw new Error('malformed XML: feed is empty');
  if (/<!DOCTYPE/i.test(xml)) throw new Error('DTD is not allowed in a YouTube feed');
  if (/<!ENTITY/i.test(xml)) throw new Error('XML entity declarations are not allowed in a YouTube feed');
  if (xml.includes('\u0000')) throw new Error('malformed XML: NUL is not allowed');

  const stack = [];
  let root = null;
  let nodeCount = 0;
  let cursor = 0;
  let sawDeclaration = false;

  const appendText = (raw) => {
    if (raw.length === 0) return;
    if (raw.includes(']]>')) throw new Error('malformed XML: invalid text terminator');
    if (stack.length === 0) {
      if (raw.trim().length > 0) throw new Error('malformed XML: text outside the root element');
      return;
    }
    stack[stack.length - 1].text += decodeXml(raw);
  };

  while (cursor < xml.length) {
    const opening = xml.indexOf('<', cursor);
    if (opening < 0) {
      appendText(xml.slice(cursor));
      cursor = xml.length;
      break;
    }
    appendText(xml.slice(cursor, opening));

    if (xml.startsWith('<!--', opening)) {
      const end = xml.indexOf('-->', opening + 4);
      if (end < 0) throw new Error('malformed XML: unterminated comment');
      if (xml.slice(opening + 4, end).includes('--')) throw new Error('malformed XML: invalid comment');
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', opening)) {
      const end = xml.indexOf('?>', opening + 2);
      if (end < 0) throw new Error('malformed XML: unterminated processing instruction');
      const instruction = xml.slice(opening + 2, end).trim();
      if (sawDeclaration || root || !/^xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"UTF-8"|'UTF-8'))?$/i.test(instruction)) {
        throw new Error('malformed XML: processing instructions are not allowed');
      }
      sawDeclaration = true;
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', opening) || xml.startsWith('<!', opening)) {
      throw new Error('malformed XML: declarations and CDATA are not allowed');
    }

    const end = findTagEnd(xml, opening + 1);
    if (end < 0) throw new Error('malformed XML: unterminated tag');
    let tag = xml.slice(opening + 1, end).trim();
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name)) throw new Error('malformed XML: invalid closing tag');
      const current = stack.pop();
      if (!current || current.name !== name) throw new Error('malformed XML: closing tag mismatch');
    } else {
      const selfClosing = tag.endsWith('/');
      if (selfClosing) tag = tag.slice(0, -1).trimEnd();
      const nameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(tag);
      if (!nameMatch) throw new Error('malformed XML: invalid opening tag');
      const node = { name: nameMatch[1], attributes: parseAttributes(nameMatch[2]), text: '', children: [] };
      nodeCount += 1;
      if (nodeCount > MAX_XML_NODES) throw new Error('malformed XML: too many elements');
      if (stack.length > MAX_XML_DEPTH) throw new Error('malformed XML: nesting is too deep');
      if (stack.length > 0) stack[stack.length - 1].children.push(node);
      else if (root) throw new Error('malformed XML: multiple root elements');
      else root = node;
      if (!selfClosing) stack.push(node);
    }
    cursor = end + 1;
  }

  if (stack.length > 0) throw new Error('malformed XML: unclosed element');
  if (!root) throw new Error('malformed XML: root element is missing');
  return root;
}

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name);
}

function textContent(node) {
  return node.text + node.children.map(textContent).join('');
}

function requiredChildText(node, name) {
  const matches = directChildren(node, name);
  if (matches.length !== 1) throw new Error(`malformed XML: expected one ${name} element`);
  const value = textContent(matches[0]).trim();
  if (!value) throw new Error(`malformed XML: ${name} is empty`);
  return value;
}

function normalizedTimestamp(value, field) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error(`malformed XML: ${field} is not a valid timestamp`);
  return new Date(timestamp).toISOString();
}

function normalizedVideoUrl(rawUrl, videoId) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('malformed XML: invalid alternate video link');
  }
  if (url.protocol !== 'https:'
    || url.hostname !== YOUTUBE_RSS_HOST
    || url.port !== ''
    || url.username
    || url.password
    || url.hash) {
    throw new Error('malformed XML: alternate link leaves the fixed YouTube origin');
  }
  const searchKeys = [...url.searchParams.keys()];
  if (url.pathname === '/watch'
    && url.searchParams.get('v') === videoId
    && searchKeys.length === 1
    && searchKeys[0] === 'v') {
    return `https://${YOUTUBE_RSS_HOST}/watch?v=${videoId}`;
  }
  for (const kind of ['shorts', 'live']) {
    if (url.pathname === `/${kind}/${videoId}` && searchKeys.length === 0) {
      return `https://${YOUTUBE_RSS_HOST}/watch?v=${videoId}`;
    }
  }
  throw new Error('malformed XML: alternate link does not match the video id');
}

export function parseYouTubeChannelFeed(xml, channelId, { now = () => Date.now() } = {}) {
  youtubeChannelFeedUrl(channelId);
  if (Buffer.byteLength(xml, 'utf8') > YOUTUBE_RSS_MAX_BYTES) throw new Error('YouTube feed exceeds the body limit');
  const root = parseXml(xml);
  if (root.name !== 'feed'
    || root.attributes.xmlns !== 'http://www.w3.org/2005/Atom'
    || root.attributes['xmlns:yt'] !== 'http://www.youtube.com/xml/schemas/2015') {
    throw new Error('malformed XML: expected the YouTube Atom feed namespaces');
  }
  const feedChannelId = requiredChildText(root, 'yt:channelId');
  // YouTube's feed-level value omits the literal "UC" prefix; entry values
  // carry the full id. Both forms are checked against the requested id.
  if (feedChannelId !== channelId.slice(2)) throw new Error('feed channel does not match the requested channelId');
  const channelName = requiredChildText(root, 'title').slice(0, MAX_CHANNEL_NAME_LENGTH);
  const entryNodes = directChildren(root, 'entry');
  if (entryNodes.length > MAX_ENTRIES) throw new Error(`YouTube feed contains more than ${MAX_ENTRIES} entries`);

  const seen = new Set();
  const entries = entryNodes.map((entry) => {
    const videoId = requiredChildText(entry, 'yt:videoId');
    if (!VIDEO_ID_PATTERN.test(videoId)) throw new Error('malformed XML: invalid YouTube video id');
    if (seen.has(videoId)) throw new Error('malformed XML: duplicate YouTube video id');
    seen.add(videoId);
    if (requiredChildText(entry, 'yt:channelId') !== channelId) {
      throw new Error('feed entry channel does not match the requested channelId');
    }
    const title = requiredChildText(entry, 'title').slice(0, MAX_TITLE_LENGTH);
    const publishedAt = normalizedTimestamp(requiredChildText(entry, 'published'), 'published');
    const links = directChildren(entry, 'link').filter((link) => link.attributes.rel === 'alternate');
    if (links.length !== 1) throw new Error('malformed XML: expected one alternate video link');
    return {
      videoId,
      title,
      url: normalizedVideoUrl(links[0].attributes.href, videoId),
      publishedAt,
    };
  });

  return {
    schemaVersion: 1,
    channelId,
    checkedAt: new Date(now()).toISOString(),
    channelName,
    feedHash: sha256Hex(xml),
    entries,
  };
}

function awaitWithAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolvePromise, rejectPromise) => {
    const onAbort = () => rejectPromise(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolvePromise(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        rejectPromise(error);
      },
    );
  });
}

async function readBoundedBody(response, maxBytes, signal) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('YouTube feed exceeds the body limit');
  if (!response.body) throw new Error('YouTube feed returned no body');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await awaitWithAbort(reader.read(), signal);
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('YouTube feed exceeds the body limit');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('YouTube feed is not valid UTF-8');
  }
}

function validateFinalFeedUrl(rawUrl, channelId) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('YouTube feed returned an invalid final URL');
  }
  const keys = [...url.searchParams.keys()];
  if (url.protocol !== 'https:'
    || url.hostname !== YOUTUBE_RSS_HOST
    || url.port !== ''
    || url.pathname !== YOUTUBE_RSS_PATH
    || keys.length !== 1
    || keys[0] !== 'channel_id'
    || url.searchParams.get('channel_id') !== channelId
    || url.username
    || url.password
    || url.hash) {
    throw new Error('YouTube feed final URL is outside the fixed origin');
  }
}

export async function fetchYouTubeChannelFeed(channelId, {
  lookup = dnsLookup,
  request = globalThis.fetch,
  now = () => Date.now(),
  signal,
  timeoutMs = YOUTUBE_RSS_TIMEOUT_MS,
  maxBytes = YOUTUBE_RSS_MAX_BYTES,
} = {}) {
  const feedUrl = youtubeChannelFeedUrl(channelId);
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > YOUTUBE_RSS_MAX_BYTES) {
    throw new Error(`maxBytes must be between 1 and ${YOUTUBE_RSS_MAX_BYTES}`);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > YOUTUBE_RSS_TIMEOUT_MS) {
    throw new Error(`timeoutMs must be between 1 and ${YOUTUBE_RSS_TIMEOUT_MS}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`YouTube feed timed out after ${timeoutMs}ms`)), timeoutMs);
  timeout.unref?.();
  const abort = () => controller.abort(signal?.reason ?? new Error('YouTube feed request cancelled'));
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  try {
    const addresses = await awaitWithAbort(lookup(YOUTUBE_RSS_HOST, { all: true, verbatim: true }), controller.signal);
    if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some(({ address }) => !isPublicNetworkAddress(address))) {
      throw new Error('YouTube feed host did not resolve only to a public address');
    }
    let response;
    try {
      response = await awaitWithAbort(
        request(feedUrl, {
          method: 'GET',
          redirect: 'error',
          headers: { accept: 'application/atom+xml, application/xml;q=0.9' },
          signal: controller.signal,
        }),
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw new Error(`YouTube feed request failed: ${error?.message ?? error}`);
    }
    validateFinalFeedUrl(response.url, channelId);
    if (response.status !== 200) throw new Error(`YouTube feed returned HTTP ${response.status}`);
    const contentType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new Error('YouTube feed returned an unsupported content type');
    const xml = await readBoundedBody(response, maxBytes, controller.signal);
    return parseYouTubeChannelFeed(xml, channelId, { now });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
