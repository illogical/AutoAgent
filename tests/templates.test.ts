import { describe, it, expect } from 'vitest';
import { getTemplate, listTemplates, mergeTemplateWithUserConfig } from '../src/templates/index.js';
import type { TemplateType } from '../src/types.js';
import type { TestCase, Assertion } from 'promptfoo';

const ALL_TEMPLATE_TYPES: TemplateType[] = [
  'summarization',
  'categorization',
  'tagging',
  'rag-pipeline',
  'llm-eval-judge',
  'repeatable-experiments',
  'agent-swe',
];

describe('getTemplate', () => {
  it.each(ALL_TEMPLATE_TYPES)('returns a valid TemplateConfig for "%s"', (type) => {
    const template = getTemplate(type);
    expect(template.type).toBe(type);
    expect(typeof template.name).toBe('string');
    expect(template.name.length).toBeGreaterThan(0);
    expect(typeof template.description).toBe('string');
    expect(Array.isArray(template.defaultAssertions)).toBe(true);
    expect(Array.isArray(template.exampleTestCases)).toBe(true);
    expect(template.exampleTestCases.length).toBeGreaterThan(0);
  });

  it('throws for an unknown template type', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getTemplate('nonexistent' as any)).toThrow(/unknown template/i);
  });

  it('each template has at least one default assertion', () => {
    for (const type of ALL_TEMPLATE_TYPES) {
      const template = getTemplate(type);
      expect(template.defaultAssertions.length, `${type} has no default assertions`).toBeGreaterThan(0);
    }
  });
});

describe('listTemplates', () => {
  it('returns an array of all 7 templates', () => {
    const templates = listTemplates();
    expect(templates).toHaveLength(7);
  });

  it('contains every template type', () => {
    const types = listTemplates().map(t => t.type);
    for (const type of ALL_TEMPLATE_TYPES) {
      expect(types).toContain(type);
    }
  });

  it('each entry has a non-empty name and description', () => {
    for (const t of listTemplates()) {
      expect(t.name.length, `Template "${t.type}" has empty name`).toBeGreaterThan(0);
      expect(t.description.length, `Template "${t.type}" has empty description`).toBeGreaterThan(0);
    }
  });
});

describe('mergeTemplateWithUserConfig', () => {
  const summarizationTemplate = getTemplate('summarization');

  describe('using template example test cases when userTests is empty', () => {
    it('falls back to template example test cases', () => {
      const merged = mergeTemplateWithUserConfig(summarizationTemplate, []);
      expect(merged.length).toBe(summarizationTemplate.exampleTestCases.length);
    });

    it('prepends template default assertions to each test case', () => {
      const merged = mergeTemplateWithUserConfig(summarizationTemplate, []);
      for (const tc of merged) {
        const assertions = tc.assert as Assertion[];
        // Every merged test case should have at least all default assertions
        expect(assertions.length).toBeGreaterThanOrEqual(
          summarizationTemplate.defaultAssertions.length,
        );
      }
    });
  });

  describe('using user-provided test cases', () => {
    const userTests: TestCase[] = [
      {
        description: 'My custom test',
        vars: { sourceText: 'Some article content here.' },
        assert: [{ type: 'icontains', value: 'summary' }],
      },
    ];

    it('uses user tests instead of example test cases', () => {
      const merged = mergeTemplateWithUserConfig(summarizationTemplate, userTests);
      expect(merged).toHaveLength(1);
      expect(merged[0]?.description).toBe('My custom test');
    });

    it('prepends template default assertions before user assertions', () => {
      const merged = mergeTemplateWithUserConfig(summarizationTemplate, userTests);
      const assertions = merged[0]?.assert as Assertion[];

      // Template defaults come first
      const firstN = assertions.slice(0, summarizationTemplate.defaultAssertions.length);
      expect(firstN).toEqual(summarizationTemplate.defaultAssertions);

      // User assertion appears at the end
      const last = assertions[assertions.length - 1];
      expect((last as Assertion).type).toBe('icontains');
    });

    it('does not mutate the original user test cases', () => {
      const originalAssertCount = (userTests[0]?.assert as Assertion[]).length;
      mergeTemplateWithUserConfig(summarizationTemplate, userTests);
      expect((userTests[0]?.assert as Assertion[]).length).toBe(originalAssertCount);
    });
  });

  describe('user assertion overrides', () => {
    it('appends extra assertions after template defaults', () => {
      const extraAssertions: Assertion[] = [{ type: 'contains', value: 'keyword' }];
      const merged = mergeTemplateWithUserConfig(summarizationTemplate, [], extraAssertions);

      // Check that the extra assertion is present in each test case
      for (const tc of merged) {
        const assertions = tc.assert as Assertion[];
        const hasKeyword = assertions.some(
          a => a.type === 'contains' && (a as { value: string }).value === 'keyword',
        );
        expect(hasKeyword).toBe(true);
      }
    });

    it('does not remove template default assertions when overrides are added', () => {
      const extraAssertions: Assertion[] = [{ type: 'contains', value: 'extra' }];
      const merged = mergeTemplateWithUserConfig(summarizationTemplate, [], extraAssertions);

      for (const tc of merged) {
        const assertions = tc.assert as Assertion[];
        expect(assertions.length).toBeGreaterThan(summarizationTemplate.defaultAssertions.length);
      }
    });
  });

  describe('assertion type presence', () => {
    it('summarization template includes an llm-rubric assertion', () => {
      const template = getTemplate('summarization');
      const types = template.defaultAssertions.map(a => a.type);
      expect(types).toContain('llm-rubric');
    });

    it('tagging template includes is-json assertion', () => {
      const template = getTemplate('tagging');
      const types = template.defaultAssertions.map(a => a.type);
      expect(types).toContain('is-json');
    });

    it('rag-pipeline template includes answer-relevance assertion', () => {
      const template = getTemplate('rag-pipeline');
      const types = template.defaultAssertions.map(a => a.type);
      expect(types).toContain('answer-relevance');
    });
  });
});
