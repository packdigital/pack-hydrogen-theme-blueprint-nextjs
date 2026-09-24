import 'server-only';
import createDebug from 'debug';
import {Engine, Rule} from 'json-rules-engine';

import type {Test, TestTargetAudienceAttributes} from '../types';

import {getImpressionSectionIdsForVariant} from './impression';

const debug = createDebug('pack:ab-testing:local-resolver');

// Types for json-rules-engine
type EngineResult = any;

export interface TestWithRulesVariant {
  id: string;
  handle: string;
  trafficPercentage: number;
  sectionTestVariants?: Array<{section?: {id?: string | null} | null} | null>;
}

export interface TestWithRules {
  id: string;
  handle: string;
  impressionTrigger?: string;
  rules: Array<{
    attribute: string;
    operator: string;
    value: string;
  }>;
  testVariants: TestWithRulesVariant[];
}

/**
 * Local test resolver that evaluates test rules without external API calls
 * Rules are stored in memory for the request duration only - caching is handled by fetchTestRulesShared
 */
export class LocalTestResolver {
  private testRules: TestWithRules[] = [];

  /**
   * Set test rules (from the shared cache)
   */
  setTestRules(rules: TestWithRules[]) {
    this.testRules = rules;
  }

  /**
   * Check if rules are loaded
   */
  hasRules(): boolean {
    return this.testRules.length > 0;
  }

  /**
   * Check if a specific test is still active in the current rules
   */
  isTestActive(testId: string): boolean {
    return this.testRules.some((test) => test.id === testId);
  }

  /**
   * Get fresh test data by ID from current rules
   */
  getTestById(testId: string): TestWithRules | null {
    return this.testRules.find((test) => test.id === testId) || null;
  }

  /**
   * Get random number for test assignment
   */
  private getRandomNumber(max: number, min = 0): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  /**
   * Evaluate test rules and assign a variant
   */
  async assignTest(
    attributes: TestTargetAudienceAttributes,
    _sessionId: string,
  ): Promise<Test | null> {
    debug(
      '[Pack Test LocalResolver] Starting test assignment:',
      JSON.stringify({totalRules: this.testRules.length, attributes}),
    );

    if (!this.testRules.length) {
      debug('[Pack Test LocalResolver] No test rules available');
      return null;
    }

    // Filter tests by evaluating rules
    const eligibleTests = await this.evaluateRules(this.testRules, attributes);

    debug(
      '[Pack Test LocalResolver] Rule evaluation result:',
      JSON.stringify({
        totalTests: this.testRules.length,
        eligibleTests: eligibleTests.length,
        eligibleTestIds: eligibleTests.map((t) => ({
          id: t.id,
          handle: t.handle,
        })),
      }),
    );

    if (!eligibleTests.length) {
      debug('[Pack Test LocalResolver] No eligible tests found');
      return null;
    }

    // Select a random test from eligible ones
    const randomTestIndex = this.getRandomNumber(eligibleTests.length - 1);
    const selectedTest = eligibleTests[randomTestIndex];

    debug(
      '[Pack Test LocalResolver] Selected test:',
      JSON.stringify({
        testId: selectedTest.id,
        testHandle: selectedTest.handle,
        randomIndex: randomTestIndex,
        totalEligible: eligibleTests.length,
      }),
    );

    // Assign variant based on traffic percentage
    const randomPercentage = this.getRandomNumber(100, 1);
    let accumulatedPercentage = 0;

    debug(
      '[Pack Test LocalResolver] Starting variant assignment:',
      JSON.stringify({
        randomPercentage,
        variants: selectedTest.testVariants.map((v) => ({
          id: v.id,
          handle: v.handle,
          trafficPercentage: v.trafficPercentage,
        })),
      }),
    );

    for (const variant of selectedTest.testVariants) {
      accumulatedPercentage += variant.trafficPercentage * 100;

      debug(
        '[Pack Test LocalResolver] Checking variant:',
        JSON.stringify({
          variantId: variant.id,
          variantHandle: variant.handle,
          trafficPercentage: variant.trafficPercentage,
          accumulatedPercentage,
          randomPercentage,
          isSelected: accumulatedPercentage >= randomPercentage,
        }),
      );

      if (accumulatedPercentage >= randomPercentage) {
        const impressionSectionIds = getImpressionSectionIdsForVariant(
          selectedTest,
          variant,
        );
        const result: Test = {
          id: selectedTest.id,
          handle: selectedTest.handle,
          impressionTrigger: selectedTest.impressionTrigger,
          testVariant: {
            id: variant.id,
            handle: variant.handle,
          },
          impression:
            impressionSectionIds.length > 0
              ? {sectionIds: impressionSectionIds}
              : undefined,
        };
        debug(
          '[Pack Test LocalResolver] Variant selected:',
          JSON.stringify(result),
        );
        return result;
      }
    }

    debug('[Pack Test LocalResolver] No variant selected (should not happen)');
    return null;
  }

  /**
   * Evaluate rules using json-rules-engine (same as tests-service)
   */
  private async evaluateRules(
    tests: TestWithRules[],
    attributes: TestTargetAudienceAttributes,
  ): Promise<TestWithRules[]> {
    debug(
      '[Pack Test LocalResolver] Starting rule evaluation:',
      JSON.stringify({
        totalTests: tests.length,
        attributes,
        isClientSide: typeof window !== 'undefined',
      }),
    );

    // Only run on server side
    if (typeof window !== 'undefined') {
      debug('[Pack Test LocalResolver] Client side - returning all tests');
      return tests; // Return all tests on client side
    }

    const engineResultsPromises: (Promise<EngineResult> | undefined)[] =
      tests.map((test, index) => {
        const {rules} = test;

        debug(
          `[Pack Test LocalResolver] Processing test ${index}:`,
          JSON.stringify({
            testId: test.id,
            testHandle: test.handle,
            rulesCount: rules?.length || 0,
            rules,
          }),
        );

        if (rules && Array.isArray(rules)) {
          if (rules.length === 0) {
            debug(
              `[Pack Test LocalResolver] Test ${test.handle} has no rules - targeting all`,
            );
            // If there are no rules, targeting all, so simulate a targeted event
            return Promise.resolve({
              events: [{type: 'targeted'}],
            } as EngineResult);
          }

          const engineConditionalProperties = (
            rules.filter(
              (rule: any) =>
                rule !== null &&
                typeof rule === 'object' &&
                Object.hasOwn(rule, 'attribute') &&
                Object.hasOwn(rule, 'operator') &&
                Object.hasOwn(rule, 'value'),
            ) as {attribute: string; operator: string; value: string}[]
          ).map((rule) => ({
            fact: rule.attribute,
            operator: rule.operator,
            value: rule.value,
          }));

          debug(
            `[Pack Test LocalResolver] Test ${test.handle} engine conditions:`,
            JSON.stringify(engineConditionalProperties),
          );

          const engineRules = [
            new Rule({
              conditions: {all: engineConditionalProperties},
              event: {type: 'targeted'},
            }),
          ];

          const engine = new Engine(engineRules, {allowUndefinedFacts: true});

          // Add custom operators to the engine
          engine.addOperator<string, string>(
            'stringContains',
            (factValue, jsonValue) => {
              return !!factValue && factValue.includes(jsonValue);
            },
          );
          engine.addOperator<string, string>(
            'stringDoesNotContain',
            (factValue, jsonValue) => {
              return !!factValue && !factValue.includes(jsonValue);
            },
          );
          engine.addOperator<string, string>(
            'matchesRegex',
            (factValue, jsonValue) => {
              return !!factValue && new RegExp(jsonValue).test(factValue);
            },
          );
          engine.addOperator<string, string>(
            'doesNotMatchRegex',
            (factValue, jsonValue) => {
              return !!factValue && !new RegExp(jsonValue).test(factValue);
            },
          );
          engine.addOperator<string, string>(
            'isSet',
            (factValue) => !!factValue,
          );
          engine.addOperator<string, string>(
            'isNotSet',
            (factValue) => !factValue,
          );

          const result = engine.run(attributes as Record<string, any>);
          debug(
            `[Pack Test LocalResolver] Engine result for test ${test.handle}:`,
            JSON.stringify(result),
          );
          return result;
        }

        debug(
          `[Pack Test LocalResolver] Test ${test.handle} has invalid rules`,
        );
        // Return undefined for tests without valid rules
        return undefined;
      });

    const engineResults = await Promise.all(engineResultsPromises);

    debug(
      '[Pack Test LocalResolver] All engine results:',
      JSON.stringify(engineResults),
    );

    const eligibleTests = tests.filter((test, index) => {
      const hasTargetedEvent = !!engineResults?.[index]?.events.find(
        (event: any) => event.type === 'targeted',
      );
      debug(
        `[Pack Test LocalResolver] Test ${test.handle} eligibility:`,
        JSON.stringify({
          hasTargetedEvent,
          events: engineResults?.[index]?.events,
        }),
      );
      return hasTargetedEvent;
    });

    debug(
      '[Pack Test LocalResolver] Final eligible tests:',
      JSON.stringify({
        eligibleCount: eligibleTests.length,
        eligibleTests: eligibleTests.map((t) => ({id: t.id, handle: t.handle})),
      }),
    );

    return eligibleTests;
  }

  /**
   * Resolve test and variant IDs from their handles
   */
  resolveTestIdsFromHandles(
    testHandle: string,
    variantHandle: string,
  ): {testId?: string; variantId?: string} | null {
    const test = this.testRules.find((t) => t.handle === testHandle);
    if (!test) {
      return null;
    }

    const variant = test.testVariants?.find((v) => v.handle === variantHandle);
    if (!variant) {
      return null;
    }

    return {testId: test.id, variantId: variant.id};
  }
}
