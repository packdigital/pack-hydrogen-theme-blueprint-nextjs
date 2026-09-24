'use client';

import {ProductProvider} from '@shopify/hydrogen-react';
import {RenderSections} from '@pack/react';

import {Analytics} from '~/lib/analytics';
import {useLoaderData} from '~/lib/router';
import {Product} from '~/components/Product';
import {useGlobal, useProductWithGrouping} from '~/hooks';
import type {
  Page,
  ProductWithInitialGrouping,
  SelectedVariant,
} from '~/lib/types';
import type {ProductLoaderData} from '~/app/[locale]/products/[handle]/page';

export default function ProductRoute() {
  const {
    product: initialProduct,
    productPage,
    selectedVariant: initialSelectedVariant,
  } = useLoaderData<
    Omit<ProductLoaderData, 'product' | 'productPage' | 'selectedVariant'> & {
      product: ProductWithInitialGrouping;
      productPage?: Page;
      selectedVariant?: SelectedVariant;
    }
  >();
  const {isCartReady} = useGlobal();
  const product = useProductWithGrouping(initialProduct);

  return (
    <ProductProvider
      data={product}
      initialVariantId={initialSelectedVariant?.id || null}
    >
      <div data-comp="ProductRoute">
        <Product
          product={product}
          initialSelectedVariant={initialSelectedVariant}
        />

        {productPage && <RenderSections content={productPage} />}
      </div>

      {isCartReady && (
        <Analytics.ProductView
          data={{
            products: [
              {
                id: product.id,
                title: product.title,
                price: initialSelectedVariant?.price.amount || '0',
                vendor: product.vendor,
                variantId: initialSelectedVariant?.id || '',
                variantTitle: initialSelectedVariant?.title || '',
                quantity: 1,
              },
            ],
          }}
          customData={{product, selectedVariant: initialSelectedVariant}}
        />
      )}
    </ProductProvider>
  );
}
