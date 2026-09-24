import {sanitizePayload} from './sanitize-payload';

type PacklyticsMetadata = {
  dataSourceName?: string;
  [region: string]: any;
};

let metadata: PacklyticsMetadata | null = null;

const getPacklyticsMetadata = async () => {
  if (metadata) return;
  try {
    const response = await fetch(
      'https://cdn.packlytics.packdigital.com/metadata.json',
      {
        headers: {
          'User-Agent': 'packlytics-js',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );
    if (response.ok) {
      metadata = await response.json();
    } else {
      console.error('Error getting Packlytics metadata:', response.statusText);
    }
  } catch (error) {
    console.error(
      'Error getting Packlytics metadata:',
      error instanceof Error ? error.message : error,
    );
  }
};

export const sendEvent = (storefrontId: string, sessionId: string) => {
  return async (action: string, eventPayload: Record<string, unknown>) => {
    const sanitizedEventPayload = sanitizePayload({...eventPayload});

    await getPacklyticsMetadata();

    if (!metadata) {
      console.warn('Pack event not sent: packlytics medatada is missing');
      return;
    }

    const analyticsData = metadata['us'] || metadata['default'];

    if (!analyticsData?.token) {
      console.warn('Pack event not sent: api token is missing');
      return;
    }

    const dataSourceName = metadata['dataSourceName'] || 'analytics_events';
    const endpointUrl = `${analyticsData.endpoint}/${analyticsData.version}/events?name=${dataSourceName}`;

    // qualified event data with payload and session id
    const eventData = {
      timestamp: new Date().toISOString(),
      action,
      version: '1',
      storefront_id: storefrontId || 'unknown',
      session_id: sessionId,
      payload: sanitizedEventPayload,
    };

    return fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${analyticsData.token}`,
      },
      body: JSON.stringify(eventData),
    });
  };
};

export const trackPageHit = (storefrontId: string, sessionId: string) => {
  return (eventPayload: Record<string, unknown> = {}) => {
    return sendEvent(storefrontId, sessionId)('page_hit', eventPayload);
  };
};
