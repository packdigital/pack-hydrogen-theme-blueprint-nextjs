import {PRODUCT_IMAGE_ASPECT_RATIO} from '~/lib/constants';

export function ProductItemSkeleton() {
  return (
    <div className="w-full animate-pulse">
      <div
        className="relative overflow-hidden bg-neutralLightest"
        style={{aspectRatio: PRODUCT_IMAGE_ASPECT_RATIO}}
      />

      <div className="relative mt-3 h-6 w-full max-w-[280px] overflow-hidden bg-neutralLightest" />

      <div className="relative mt-1 h-5 w-20 overflow-hidden bg-neutralLightest" />

      <div className="relative mt-1 h-5 w-8 overflow-hidden bg-neutralLightest" />
    </div>
  );
}

ProductItemSkeleton.displayName = 'ProductItemSkeleton';
