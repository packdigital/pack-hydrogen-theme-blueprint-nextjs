import {
  createCartCookie,
  getCartId as getCartIdFromRequest,
} from '@shopify/hydrogen';
import type {
  AttributeInput,
  Cart,
  CartBuyerIdentityInput,
  CartInput,
  CartLineInput,
  CartLineUpdateInput,
  CartUserError,
  CartWarning,
} from '@shopify/hydrogen/storefront-api-types';

import {CART_FRAGMENT} from '~/data/graphql/storefront/cart';

import type {CustomerAccount} from './customer-account';
import type {Storefront} from './storefront';

/**
 * Server cart API with the same methods as Hydrogen's React Router
 * `createCartHandler` (`get`, `create`, `addLines`, `updateLines`, ...), which
 * `/api/cart` and the cart routes call.
 *
 * The cart id is stored in the `cart` cookie in the same format
 * `@shopify/hydrogen` uses (`createCartCookie`), so carts survive the
 * migration and interoperate with Hydrogen's checkout / cart-permalink
 * handlers registered in the proxy.
 */

export type CartQueryDataReturn = {
  cart: Cart | null;
  userErrors?: CartUserError[] | Array<{message: string}>;
  warnings?: CartWarning[];
  errors?: unknown;
};

export type HydrogenCart = {
  get: () => Promise<Cart | null>;
  getCartId: () => string | undefined;
  setCartId: (cartId: string) => Headers;
  create: (input: CartInput) => Promise<CartQueryDataReturn>;
  addLines: (lines: CartLineInput[]) => Promise<CartQueryDataReturn>;
  updateLines: (lines: CartLineUpdateInput[]) => Promise<CartQueryDataReturn>;
  removeLines: (lineIds: string[]) => Promise<CartQueryDataReturn>;
  updateDiscountCodes: (
    discountCodes: string[],
  ) => Promise<CartQueryDataReturn>;
  updateBuyerIdentity: (
    buyerIdentity: CartBuyerIdentityInput,
  ) => Promise<CartQueryDataReturn>;
  updateNote: (note: string) => Promise<CartQueryDataReturn>;
  updateAttributes: (
    attributes: AttributeInput[],
  ) => Promise<CartQueryDataReturn>;
};

const CART_QUERY_FRAGMENT = CART_FRAGMENT;
const CART_MUTATE_FRAGMENT = CART_FRAGMENT.replace(
  'CartApiQuery',
  'CartApiMutation',
).replace('$numCartLines', '250');

const IN_CONTEXT_VARIABLES = `$country: CountryCode = ZZ
    $language: LanguageCode`;
const IN_CONTEXT_DIRECTIVE =
  '@inContext(country: $country, language: $language)';

const USER_ERROR_FRAGMENT = `#graphql
  fragment CartApiError on CartUserError {
    message
    field
    code
  }
`;

const CART_WARNING_FRAGMENT = `#graphql
  fragment CartApiWarning on CartWarning {
    code
    message
    target
  }
`;

const CART_QUERY = `#graphql
  query CartQuery(
    $cartId: ID!
    $numCartLines: Int = 100
    ${IN_CONTEXT_VARIABLES}
  ) ${IN_CONTEXT_DIRECTIVE} {
    cart(id: $cartId) {
      ...CartApiQuery
    }
  }
  ${CART_QUERY_FRAGMENT}
`;

function cartMutation(name: string, args: string, call: string) {
  return `#graphql
  mutation ${name}(
    ${args}
    ${IN_CONTEXT_VARIABLES}
  ) ${IN_CONTEXT_DIRECTIVE} {
    ${call} {
      cart {
        ...CartApiMutation
      }
      userErrors {
        ...CartApiError
      }
      warnings {
        ...CartApiWarning
      }
    }
  }
  ${CART_MUTATE_FRAGMENT}
  ${USER_ERROR_FRAGMENT}
  ${CART_WARNING_FRAGMENT}
`;
}

const CART_CREATE_MUTATION = cartMutation(
  'cartCreate',
  '$input: CartInput!',
  'cartCreate(input: $input)',
);
const CART_LINES_ADD_MUTATION = cartMutation(
  'cartLinesAdd',
  '$cartId: ID!\n    $lines: [CartLineInput!]!',
  'cartLinesAdd(cartId: $cartId, lines: $lines)',
);
const CART_LINES_UPDATE_MUTATION = cartMutation(
  'cartLinesUpdate',
  '$cartId: ID!\n    $lines: [CartLineUpdateInput!]!',
  'cartLinesUpdate(cartId: $cartId, lines: $lines)',
);
const CART_LINES_REMOVE_MUTATION = cartMutation(
  'cartLinesRemove',
  '$cartId: ID!\n    $lineIds: [ID!]!',
  'cartLinesRemove(cartId: $cartId, lineIds: $lineIds)',
);
const CART_DISCOUNT_CODES_UPDATE_MUTATION = cartMutation(
  'cartDiscountCodesUpdate',
  '$cartId: ID!\n    $discountCodes: [String!]',
  'cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes)',
);
const CART_BUYER_IDENTITY_UPDATE_MUTATION = cartMutation(
  'cartBuyerIdentityUpdate',
  '$cartId: ID!\n    $buyerIdentity: CartBuyerIdentityInput!',
  'cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity)',
);
const CART_NOTE_UPDATE_MUTATION = cartMutation(
  'cartNoteUpdate',
  '$cartId: ID!\n    $note: String!',
  'cartNoteUpdate(cartId: $cartId, note: $note)',
);
const CART_ATTRIBUTES_UPDATE_MUTATION = cartMutation(
  'cartAttributesUpdate',
  '$cartId: ID!\n    $attributes: [AttributeInput!]!',
  'cartAttributesUpdate(cartId: $cartId, attributes: $attributes)',
);

type MutationPayload = {
  cart?: Cart | null;
  userErrors?: CartUserError[];
  warnings?: CartWarning[];
};

export function createCartHandler({
  storefront,
  customerAccount,
  request,
  cookieDomain,
}: {
  storefront: Storefront;
  customerAccount?: CustomerAccount;
  request: {headers: Headers};
  cookieDomain?: string;
}): HydrogenCart {
  let cartId =
    getCartIdFromRequest({
      cookie: request.headers.get('cookie') || '',
    } as any) || undefined;
  const getCartId = () => cartId;

  const i18nVariables = {
    country: storefront.i18n.country,
    language: storefront.i18n.language,
  };

  const mutate = async (
    mutation: string,
    field: string,
    variables: Record<string, unknown>,
  ): Promise<CartQueryDataReturn> => {
    const result = await storefront.mutate<Record<string, MutationPayload>>(
      mutation,
      {variables: {...i18nVariables, ...variables}},
    );
    const payload = result[field];
    return {
      cart: payload?.cart ?? null,
      userErrors: payload?.userErrors,
      warnings: payload?.warnings,
      ...(result.errors ? {errors: result.errors} : {}),
    };
  };

  const create: HydrogenCart['create'] = async (input) => {
    const customerAccessToken = customerAccount
      ? await customerAccount.getAccessToken().catch(() => undefined)
      : undefined;
    const result = await mutate(CART_CREATE_MUTATION, 'cartCreate', {
      input: {
        ...input,
        buyerIdentity: {
          ...(customerAccessToken ? {customerAccessToken} : null),
          ...input.buyerIdentity,
        },
      },
    });
    if (result.cart?.id) cartId = result.cart.id;
    return result;
  };

  return {
    async get() {
      if (!cartId) return null;
      const [isLoggedIn, result] = await Promise.all([
        customerAccount ? customerAccount.isLoggedIn() : false,
        storefront.query<{cart: Cart | null}>(CART_QUERY, {
          variables: {cartId, ...i18nVariables},
          cache: storefront.CacheNone(),
        }),
      ]);
      const cart = result.cart;
      if (isLoggedIn && cart?.checkoutUrl) {
        const checkoutUrl = new URL(cart.checkoutUrl);
        checkoutUrl.searchParams.set('logged_in', 'true');
        cart.checkoutUrl = checkoutUrl.toString();
      }
      return cart || null;
    },
    getCartId,
    setCartId(id: string) {
      const headers = new Headers();
      const domain = cookieDomain ? `; Domain=${cookieDomain}` : '';
      headers.append('Set-Cookie', `${createCartCookie(id)}${domain}`);
      return headers;
    },
    create,
    addLines: (lines) =>
      cartId
        ? mutate(CART_LINES_ADD_MUTATION, 'cartLinesAdd', {
            cartId,
            lines: lines.map(
              ({
                attributes,
                quantity,
                merchandiseId,
                sellingPlanId,
                parent,
              }: any) => ({
                attributes,
                quantity,
                merchandiseId,
                sellingPlanId,
                parent,
              }),
            ),
          })
        : create({lines}),
    updateLines: (lines) =>
      mutate(CART_LINES_UPDATE_MUTATION, 'cartLinesUpdate', {cartId, lines}),
    removeLines: (lineIds) =>
      mutate(CART_LINES_REMOVE_MUTATION, 'cartLinesRemove', {cartId, lineIds}),
    updateDiscountCodes: (discountCodes) =>
      cartId
        ? mutate(
            CART_DISCOUNT_CODES_UPDATE_MUTATION,
            'cartDiscountCodesUpdate',
            {
              cartId,
              discountCodes,
            },
          )
        : create({discountCodes}),
    updateBuyerIdentity: (buyerIdentity) =>
      cartId
        ? mutate(
            CART_BUYER_IDENTITY_UPDATE_MUTATION,
            'cartBuyerIdentityUpdate',
            {
              cartId,
              buyerIdentity,
            },
          )
        : create({buyerIdentity}),
    updateNote: (note) =>
      cartId
        ? mutate(CART_NOTE_UPDATE_MUTATION, 'cartNoteUpdate', {cartId, note})
        : create({note}),
    updateAttributes: (attributes) =>
      cartId
        ? mutate(CART_ATTRIBUTES_UPDATE_MUTATION, 'cartAttributesUpdate', {
            cartId,
            attributes,
          })
        : create({attributes}),
  };
}
