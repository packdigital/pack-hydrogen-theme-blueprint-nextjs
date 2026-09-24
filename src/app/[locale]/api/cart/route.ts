import type {
  AttributeInput,
  Cart,
} from '@shopify/hydrogen/storefront-api-types';

import {CART_ACTIONS} from '~/lib/constants';
import type {CartQueryDataReturn} from '~/lib/server/cart';
import {isLocalPath} from '~/lib/utils';
import {routeHandler} from '~/lib/server/route';
import type {ActionArgs, LoaderArgs} from '~/lib/server/route';

const getParsedJson = (value: FormDataEntryValue | null) => {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

async function action({request, context}: ActionArgs) {
  const {cart} = context;

  const formData = await request.formData();
  const action = formData.get('action');

  let status = 200;
  let result: CartQueryDataReturn;

  if (!action)
    return Response.json({errors: ['Missing `action` in body']}, {status: 400});

  switch (action) {
    case CART_ACTIONS.Create:
      result = await cart.create(getParsedJson(formData.get('cart')));
      break;
    case CART_ACTIONS.LinesAdd:
      result = await cart.addLines(getParsedJson(formData.get('lines')));
      break;
    case CART_ACTIONS.LinesUpdate:
      result = await cart.updateLines(getParsedJson(formData.get('lines')));
      break;
    case CART_ACTIONS.LinesRemove:
      result = await cart.removeLines(getParsedJson(formData.get('lineIds')));
      break;
    case CART_ACTIONS.DiscountCodesUpdate: {
      const formDiscountCodes = getParsedJson(formData.get('discountCodes'));
      const discountCodes = (
        Array.isArray(formDiscountCodes) ? formDiscountCodes : []
      ) as string[];
      result = await cart.updateDiscountCodes(discountCodes);
      break;
    }
    case CART_ACTIONS.BuyerIdentityUpdate:
      result = await cart.updateBuyerIdentity(
        getParsedJson(formData.get('buyerIdentity')),
      );
      break;
    case CART_ACTIONS.AttributesUpdateInput: {
      const attributeInputs = getParsedJson(
        formData.get('attributes'),
      ) as AttributeInput[];
      const existingCartWithAttributes = (await cart.get()) as Cart;
      const existingAttributes = existingCartWithAttributes?.attributes || [];
      if (
        Array.isArray(attributeInputs) &&
        attributeInputs.every(
          (a) => typeof a.key === 'string' && typeof a.value === 'string',
        )
      ) {
        // If empty array is passed, it means all attributes should be removed
        if (!attributeInputs.length) {
          result = await cart.updateAttributes([]);
        } else {
          const mergedMap = new Map(
            existingAttributes.map((a) => [
              a.key,
              {key: a.key, value: a.value || ''},
            ]),
          );
          attributeInputs.forEach((a) => {
            // If value is empty, it means the attribute should be removed
            if (!a.value) {
              mergedMap.delete(a.key);
              return;
            }
            mergedMap.set(a.key, {key: a.key, value: a.value});
          });
          result = await cart.updateAttributes([...mergedMap.values()]);
        }
      } else {
        result = {
          cart: existingCartWithAttributes,
          userErrors: [{message: 'Invalid `attributes` format.'}],
        };
      }
      break;
    }
    case CART_ACTIONS.NoteUpdate:
      result = await cart.updateNote(formData.get('note') as string);
      break;
    default:
      return Response.json(
        {errors: [`${action} cart action is not defined`]},
        {status: 400},
      );
  }

  /**
   * The Cart ID may change after each mutation. We need to update it each time in the session.
   */
  let headers = new Headers();
  if (result.cart?.id) headers = cart.setCartId(result.cart.id);

  const redirectTo = formData.get('redirectTo') ?? null;
  if (typeof redirectTo === 'string' && isLocalPath(redirectTo)) {
    status = 303;
    headers.set('Location', redirectTo);
  }

  const {cart: cartResult, warnings, userErrors} = result;

  return Response.json(
    {
      cart: cartResult,
      userErrors,
      warnings,
    },
    {status, headers},
  );
}

async function loader({context}: LoaderArgs) {
  return Response.json({cart: await context.cart.get()});
}

export const GET = routeHandler(loader);
export const POST = routeHandler(action);
