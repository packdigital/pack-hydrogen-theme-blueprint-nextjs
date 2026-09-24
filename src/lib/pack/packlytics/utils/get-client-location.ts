export function getClientLocation(locale: string) {
  const localeSplit = locale.split('-');
  return localeSplit.length > 1 ? localeSplit[1].toLowerCase() : '';
}
