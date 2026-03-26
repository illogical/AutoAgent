import type { Assertion } from 'promptfoo';

export interface CurlCommandSchema {
  requiredUrl?: string | RegExp;
  requiredMethod?: string;
  requiredHeaders?: Record<string, string | RegExp>;
  requiredBodyFields?: string[];
  forbiddenFlags?: string[];
}

export interface HttpRequestSchema {
  requiredUrl?: string | RegExp;
  requiredMethod?: string;
  requiredHeaders?: Record<string, string | RegExp>;
  requiredBodyFields?: string[];
}

/**
 * Serialize a RegExp or string value into an expression usable inside a generated JS string.
 * RegExp values become regex literals; strings become JSON string literals.
 */
function serializePattern(value: string | RegExp): string {
  if (value instanceof RegExp) {
    return value.toString();
  }
  return JSON.stringify(value);
}

/**
 * Generate a self-contained JavaScript assertion string that validates a curl command in output.
 */
export function curlCommandAssertion(schema: CurlCommandSchema): string {
  const requiredUrlExpr = schema.requiredUrl !== undefined ? serializePattern(schema.requiredUrl) : 'null';
  const requiredMethodExpr = schema.requiredMethod ? JSON.stringify(schema.requiredMethod.toUpperCase()) : 'null';
  const forbiddenFlagsExpr = JSON.stringify(schema.forbiddenFlags ?? []);

  const headerEntries = Object.entries(schema.requiredHeaders ?? {}).map(
    ([k, v]) => `[${JSON.stringify(k)}, ${serializePattern(v)}]`,
  );
  const headersExpr = `[${headerEntries.join(', ')}]`;

  const requiredBodyFieldsExpr = JSON.stringify(schema.requiredBodyFields ?? []);

  return `
(function() {
  var out = output;

  if (!out.toLowerCase().includes('curl')) {
    return { pass: false, score: 0, reason: 'Output does not contain curl command' };
  }

  // NOTE: All patterns are self-contained — Promptfoo javascript assertions run in an
  // isolated context with no imports, so helpers cannot be shared across assertions.
  // Extract the curl command block (may be in a bash/sh/shell code fence)
  var curlMatch = out.match(/\\\`\\\`\\\`(?:bash|sh|shell)?\\s*([\\s\\S]*?)\\\`\\\`\\\`/);
  var curlLine = curlMatch ? curlMatch[1].trim() : out;

  // Split arguments respecting quoted strings
  var tokens = [];
  var current = '';
  var inSingle = false, inDouble = false;
  for (var ci = 0; ci < curlLine.length; ci++) {
    var ch = curlLine[ci];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if ((ch === ' ' || ch === '\\t' || ch === '\\n') && !inSingle && !inDouble) {
      if (current.length) { tokens.push(current); current = ''; }
    } else { current += ch; }
  }
  if (current.length) tokens.push(current);

  // Check forbidden flags
  var forbiddenFlags = ${forbiddenFlagsExpr};
  for (var fi = 0; fi < forbiddenFlags.length; fi++) {
    if (tokens.indexOf(forbiddenFlags[fi]) !== -1) {
      return { pass: false, score: 0, reason: 'Forbidden flag "' + forbiddenFlags[fi] + '" found in curl command' };
    }
  }

  // Extract method (-X or --request)
  var method = null;
  for (var mi = 0; mi < tokens.length - 1; mi++) {
    if (tokens[mi] === '-X' || tokens[mi] === '--request') {
      method = tokens[mi + 1].toUpperCase();
      break;
    }
  }

  var requiredMethod = ${requiredMethodExpr};
  if (requiredMethod && method !== requiredMethod) {
    return { pass: false, score: 0.4, reason: 'Method "' + (method || 'not found') + '" does not match required "' + requiredMethod + '"' };
  }

  // Extract URL: first non-flag, non-value token after 'curl'
  var url = null;
  var skipNext = false;
  var flagsWithValues = ['-X','--request','-H','--header','-d','--data','--data-raw','--data-binary','-u','--user','-o','--output','--connect-timeout','--max-time','-A','--user-agent'];
  for (var ui = 1; ui < tokens.length; ui++) {
    if (skipNext) { skipNext = false; continue; }
    var tok = tokens[ui];
    if (tok.startsWith('-')) {
      if (flagsWithValues.indexOf(tok) !== -1) skipNext = true;
      continue;
    }
    url = tok;
    break;
  }

  var requiredUrl = ${requiredUrlExpr};
  if (requiredUrl) {
    var urlMatch = requiredUrl instanceof RegExp ? requiredUrl.test(url || '') : (url || '').includes(requiredUrl);
    if (!urlMatch) {
      return { pass: false, score: 0.4, reason: 'URL "' + (url || 'not found') + '" does not match required pattern' };
    }
  }

  // Extract headers (-H or --header)
  var headers = {};
  for (var hi = 0; hi < tokens.length - 1; hi++) {
    if (tokens[hi] === '-H' || tokens[hi] === '--header') {
      var hv = tokens[hi + 1];
      var colonIdx = hv.indexOf(':');
      if (colonIdx > -1) {
        headers[hv.slice(0, colonIdx).trim().toLowerCase()] = hv.slice(colonIdx + 1).trim();
      }
    }
  }

  var requiredHeaders = ${headersExpr};
  for (var rhi = 0; rhi < requiredHeaders.length; rhi++) {
    var headerName = requiredHeaders[rhi][0].toLowerCase();
    var headerPattern = requiredHeaders[rhi][1];
    var headerValue = headers[headerName];
    if (headerValue === undefined) {
      return { pass: false, score: 0.5, reason: 'Required header "' + requiredHeaders[rhi][0] + '" not found' };
    }
    var headerMatch = headerPattern instanceof RegExp ? headerPattern.test(headerValue) : headerValue.includes(headerPattern);
    if (!headerMatch) {
      return { pass: false, score: 0.5, reason: 'Header "' + requiredHeaders[rhi][0] + '" value "' + headerValue + '" does not match expected' };
    }
  }

  // Extract body (-d, --data, --data-raw, --data-binary)
  var body = '';
  for (var bi = 0; bi < tokens.length - 1; bi++) {
    if (tokens[bi] === '-d' || tokens[bi] === '--data' || tokens[bi] === '--data-raw' || tokens[bi] === '--data-binary') {
      body = tokens[bi + 1];
      break;
    }
  }

  var requiredBodyFields = ${requiredBodyFieldsExpr};
  for (var rfi = 0; rfi < requiredBodyFields.length; rfi++) {
    if (!body.includes(requiredBodyFields[rfi])) {
      return { pass: false, score: 0.6, reason: 'Required body field "' + requiredBodyFields[rfi] + '" not found in request body' };
    }
  }

  return { pass: true, score: 1, reason: 'curl command is valid and meets all schema requirements' };
})()
  `.trim();
}

/**
 * Build Promptfoo Assertion objects for a curl command schema.
 */
export function buildCurlAssertions(schema: CurlCommandSchema): Assertion[] {
  return [
    {
      type: 'javascript' as const,
      value: curlCommandAssertion(schema),
    },
  ];
}

/**
 * Generate a self-contained JavaScript assertion string for validating HTTP request code
 * (e.g., fetch(), axios, requests.get()) rather than raw curl commands.
 */
export function httpRequestCodeAssertion(schema: HttpRequestSchema): string {
  const requiredUrlExpr = schema.requiredUrl !== undefined ? serializePattern(schema.requiredUrl) : 'null';
  const requiredMethodExpr = schema.requiredMethod ? JSON.stringify(schema.requiredMethod.toUpperCase()) : 'null';

  const headerEntries = Object.entries(schema.requiredHeaders ?? {}).map(
    ([k, v]) => `[${JSON.stringify(k.toLowerCase())}, ${serializePattern(v)}]`,
  );
  const headersExpr = `[${headerEntries.join(', ')}]`;

  const requiredBodyFieldsExpr = JSON.stringify(schema.requiredBodyFields ?? []);

  return `
(function() {
  var out = output;

  var requiredUrl = ${requiredUrlExpr};
  if (requiredUrl) {
    var urlMatch = requiredUrl instanceof RegExp ? requiredUrl.test(out) : out.includes(requiredUrl);
    if (!urlMatch) {
      return { pass: false, score: 0.4, reason: 'Output does not reference required URL pattern' };
    }
  }

  var requiredMethod = ${requiredMethodExpr};
  if (requiredMethod) {
    var methodPatterns = {
      'GET': /\\b(?:get|GET|\.get\\()\\b/,
      'POST': /\\b(?:post|POST|\.post\\()\\b/,
      'PUT': /\\b(?:put|PUT|\.put\\()\\b/,
      'PATCH': /\\b(?:patch|PATCH|\.patch\\()\\b/,
      'DELETE': /\\b(?:delete|DELETE|\.delete\\()\\b/
    };
    var methodRegex = methodPatterns[requiredMethod];
    if (methodRegex && !methodRegex.test(out)) {
      return { pass: false, score: 0.4, reason: 'HTTP method "' + requiredMethod + '" not found in output' };
    }
  }

  var requiredHeaders = ${headersExpr};
  for (var hi = 0; hi < requiredHeaders.length; hi++) {
    var headerName = requiredHeaders[hi][0];
    var headerPattern = requiredHeaders[hi][1];
    if (!out.toLowerCase().includes(headerName)) {
      return { pass: false, score: 0.5, reason: 'Header "' + headerName + '" not referenced in output' };
    }
    var headerMatch = headerPattern instanceof RegExp ? headerPattern.test(out) : out.includes(headerPattern);
    if (!headerMatch) {
      return { pass: false, score: 0.5, reason: 'Header "' + headerName + '" value pattern not found in output' };
    }
  }

  var requiredBodyFields = ${requiredBodyFieldsExpr};
  for (var bi = 0; bi < requiredBodyFields.length; bi++) {
    if (!out.includes(requiredBodyFields[bi])) {
      return { pass: false, score: 0.6, reason: 'Required body field "' + requiredBodyFields[bi] + '" not found in output' };
    }
  }

  return { pass: true, score: 1, reason: 'HTTP request code meets all schema requirements' };
})()
  `.trim();
}
