// Generic list of potential sensitive payload data
const sensitiveFields = [
  'username',
  'user',
  'user_id',
  'userid',
  'password',
  'pass',
  'pin',
  'passcode',
  'token',
  'api_token',
  'email',
  'address',
  'phone',
  'sex',
  'gender',
  'order',
  'order_id',
  'orderid',
  'payment',
  'credit_card',
];

/** JSON-stringifies the payload with sensitive field values masked. */
export const sanitizePayload = (data: unknown) => {
  let dataStr = JSON.stringify(data);
  sensitiveFields.forEach((field) => {
    dataStr = dataStr.replaceAll(
      new RegExp(`("${field}"):(".+?"|\\d+)`, 'mgi'),
      '$1:"********"',
    );
  });
  return dataStr;
};
