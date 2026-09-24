/**
 * Cart action names posted to `/api/cart` (formerly Hydrogen's
 * `CartForm.ACTIONS`; values unchanged).
 */
export const CART_ACTIONS = {
  AttributesUpdateInput: 'AttributesUpdateInput',
  BuyerIdentityUpdate: 'BuyerIdentityUpdate',
  Create: 'Create',
  DiscountCodesUpdate: 'DiscountCodesUpdate',
  LinesAdd: 'LinesAdd',
  LinesRemove: 'LinesRemove',
  LinesUpdate: 'LinesUpdate',
  NoteUpdate: 'NoteUpdate',
} as const;

export type CartAction = (typeof CART_ACTIONS)[keyof typeof CART_ACTIONS];
