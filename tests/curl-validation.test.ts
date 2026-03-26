import { describe, it, expect } from 'vitest';
import {
  curlCommandAssertion,
  buildCurlAssertions,
  httpRequestCodeAssertion,
} from '../src/assertions/curl-validation.js';
import type { CurlCommandSchema } from '../src/assertions/curl-validation.js';

// Helper: evaluate a self-contained assertion string against an output value.
function runAssertion(assertionCode: string, output: string): { pass: boolean; score: number; reason: string } {
  // eslint-disable-next-line no-new-func
  return new Function('output', `return (${assertionCode})`)(output) as {
    pass: boolean;
    score: number;
    reason: string;
  };
}

describe('curlCommandAssertion (generated JS string)', () => {
  describe('basic curl detection', () => {
    it('passes for a simple valid curl command', () => {
      const schema: CurlCommandSchema = {};
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl https://example.com/api');
      expect(result.pass).toBe(true);
    });

    it('fails when output does not contain curl', () => {
      const schema: CurlCommandSchema = {};
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'fetch("https://example.com/api")');
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toMatch(/curl/i);
    });
  });

  describe('HTTP method validation', () => {
    it('passes when method matches -X flag', () => {
      const schema: CurlCommandSchema = { requiredMethod: 'POST' };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl -X POST https://api.example.com/create');
      expect(result.pass).toBe(true);
    });

    it('passes when method matches --request flag', () => {
      const schema: CurlCommandSchema = { requiredMethod: 'PUT' };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl --request PUT https://api.example.com/update');
      expect(result.pass).toBe(true);
    });

    it('is case-insensitive for required method', () => {
      const schema: CurlCommandSchema = { requiredMethod: 'post' };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl -X POST https://api.example.com');
      expect(result.pass).toBe(true);
    });

    it('fails when method does not match', () => {
      const schema: CurlCommandSchema = { requiredMethod: 'POST' };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl -X GET https://api.example.com');
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/method/i);
    });
  });

  describe('URL validation', () => {
    it('passes when output includes required string URL', () => {
      const schema: CurlCommandSchema = { requiredUrl: 'api.example.com' };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl -X POST https://api.example.com/projects/123');
      expect(result.pass).toBe(true);
    });

    it('passes when URL matches regex pattern', () => {
      const schema: CurlCommandSchema = { requiredUrl: /\/v1\/projects\/\w+\/update/ };
      const code = curlCommandAssertion(schema);
      // Use a project slug without hyphens so \w+ matches
      const result = runAssertion(code, 'curl -X POST https://example.com/v1/projects/myproject/update');
      expect(result.pass).toBe(true);
    });

    it('fails when URL does not match regex pattern', () => {
      const schema: CurlCommandSchema = { requiredUrl: /\/v1\/projects\/\w+\/update/ };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl -X POST https://example.com/v1/other/endpoint');
      expect(result.pass).toBe(false);
    });
  });

  describe('header validation', () => {
    it('passes when required header is present', () => {
      const schema: CurlCommandSchema = {
        requiredHeaders: { 'Content-Type': 'application/json' },
      };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(
        code,
        'curl -X POST -H "Content-Type: application/json" https://api.example.com',
      );
      expect(result.pass).toBe(true);
    });

    it('passes when auth header matches regex', () => {
      const schema: CurlCommandSchema = {
        requiredHeaders: { 'X-DevServer-Token': /.+/ },
      };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(
        code,
        'curl -X POST -H "X-DevServer-Token: my-secret-token" https://api.example.com',
      );
      expect(result.pass).toBe(true);
    });

    it('fails when required header is absent', () => {
      const schema: CurlCommandSchema = {
        requiredHeaders: { Authorization: /Bearer .+/ },
      };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl -X POST https://api.example.com/resource');
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/Authorization/i);
    });
  });

  describe('body field validation', () => {
    it('passes when body contains required field', () => {
      const schema: CurlCommandSchema = { requiredBodyFields: ['branch'] };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(
        code,
        'curl -X POST -H "Content-Type: application/json" -d \'{"branch":"main"}\' https://api.example.com',
      );
      expect(result.pass).toBe(true);
    });

    it('fails when required body field is missing', () => {
      const schema: CurlCommandSchema = { requiredBodyFields: ['branch', 'restartMode'] };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(
        code,
        'curl -X POST -d \'{"branch":"main"}\' https://api.example.com',
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/restartMode/);
    });
  });

  describe('forbidden flags', () => {
    it('fails when a forbidden flag is present', () => {
      const schema: CurlCommandSchema = { forbiddenFlags: ['--insecure', '-k'] };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl --insecure https://api.example.com');
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/--insecure/);
    });

    it('passes when no forbidden flags are present', () => {
      const schema: CurlCommandSchema = { forbiddenFlags: ['--insecure', '-k'] };
      const code = curlCommandAssertion(schema);
      const result = runAssertion(code, 'curl -X POST https://api.example.com');
      expect(result.pass).toBe(true);
    });
  });

  describe('code fence extraction', () => {
    it('extracts curl from a bash code fence', () => {
      const schema: CurlCommandSchema = { requiredMethod: 'POST' };
      const code = curlCommandAssertion(schema);
      const output = '```bash\ncurl -X POST https://api.example.com\n```';
      const result = runAssertion(code, output);
      expect(result.pass).toBe(true);
    });
  });

  describe('combined schema validation', () => {
    it('validates method + URL + header + body together', () => {
      const schema: CurlCommandSchema = {
        requiredMethod: 'POST',
        requiredUrl: /\/v1\/projects\/\w+\/update/,
        requiredHeaders: { 'X-DevServer-Token': /.+/ },
        requiredBodyFields: ['branch'],
      };
      const code = curlCommandAssertion(schema);
      const validCmd = [
        'curl -X POST',
        '-H "X-DevServer-Token: secret"',
        '-H "Content-Type: application/json"',
        "-d '{\"branch\":\"main\"}'",
        // Use a project slug without hyphens so the \w+ regex matches
        'https://sourcemanager.local/v1/projects/myproject/update',
      ].join(' ');
      expect(runAssertion(code, validCmd).pass).toBe(true);

      // Wrong method
      const wrongMethod = validCmd.replace('-X POST', '-X GET');
      expect(runAssertion(code, wrongMethod).pass).toBe(false);
    });
  });
});

describe('buildCurlAssertions', () => {
  it('returns an array with one javascript assertion', () => {
    const schema: CurlCommandSchema = { requiredMethod: 'POST' };
    const assertions = buildCurlAssertions(schema);
    expect(assertions).toHaveLength(1);
    expect(assertions[0]?.type).toBe('javascript');
    expect(typeof assertions[0]?.value).toBe('string');
  });
});

describe('httpRequestCodeAssertion (generated JS string)', () => {
  it('passes when output references required URL pattern', () => {
    const code = httpRequestCodeAssertion({ requiredUrl: 'api.example.com' });
    const result = runAssertion(code, 'const res = await fetch("https://api.example.com/data");');
    expect(result.pass).toBe(true);
  });

  it('fails when output does not reference required URL', () => {
    const code = httpRequestCodeAssertion({ requiredUrl: 'api.example.com' });
    const result = runAssertion(code, 'const res = await fetch("https://other.com/data");');
    expect(result.pass).toBe(false);
  });

  it('detects POST method in fetch code', () => {
    const code = httpRequestCodeAssertion({ requiredMethod: 'POST' });
    const result = runAssertion(
      code,
      'const res = await fetch("/api", { method: "POST", body: JSON.stringify(data) });',
    );
    expect(result.pass).toBe(true);
  });

  it('fails when POST method is not found in GET fetch call', () => {
    const code = httpRequestCodeAssertion({ requiredMethod: 'POST' });
    const result = runAssertion(code, 'const res = await fetch("/api");');
    expect(result.pass).toBe(false);
  });

  it('validates a required header reference in the code', () => {
    const code = httpRequestCodeAssertion({
      requiredHeaders: { Authorization: /Bearer / },
    });
    const output = 'headers: { Authorization: "Bearer my-token" }';
    expect(runAssertion(code, output).pass).toBe(true);
  });

  it('validates required body field presence in code', () => {
    const code = httpRequestCodeAssertion({ requiredBodyFields: ['branch'] });
    const output = 'body: JSON.stringify({ branch: "main", restartMode: "immediate" })';
    expect(runAssertion(code, output).pass).toBe(true);
  });

  it('fails when required body field is absent from code', () => {
    const code = httpRequestCodeAssertion({ requiredBodyFields: ['branch'] });
    const result = runAssertion(code, 'body: JSON.stringify({ restartMode: "immediate" })');
    expect(result.pass).toBe(false);
  });
});
