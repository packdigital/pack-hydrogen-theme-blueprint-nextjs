import type {TestWithRules, TestWithRulesVariant} from './local-test-resolver';

function getVariantImpressionSectionIds(
  testVariant: TestWithRulesVariant | undefined,
): string[] {
  const sectionIds =
    testVariant?.sectionTestVariants
      ?.map((variant) => variant?.section?.id)
      .filter((id): id is string => Boolean(id)) || [];
  return [...new Set(sectionIds)];
}

/**
 * Section ids whose visibility counts as an impression for `ON_ELEMENT_VIEW`
 * tests. The control variant has no sections of its own, so it falls back to
 * the sections the other variants replace.
 */
export function getImpressionSectionIdsForVariant(
  test: TestWithRules | undefined,
  testVariant: TestWithRulesVariant | undefined,
): string[] {
  const selectedVariantSectionIds = getVariantImpressionSectionIds(testVariant);
  if (selectedVariantSectionIds.length > 0) {
    return selectedVariantSectionIds;
  }

  if (testVariant?.handle !== 'control') {
    return [];
  }

  const fallbackSectionIds =
    test?.testVariants
      ?.filter((variant) => variant.handle !== 'control')
      .flatMap((variant) => getVariantImpressionSectionIds(variant)) || [];
  return [...new Set(fallbackSectionIds)];
}
