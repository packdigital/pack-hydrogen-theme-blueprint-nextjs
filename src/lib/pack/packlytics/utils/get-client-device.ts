import parser from 'ua-parser-js';

export function getDevice(userAgent: string) {
  const userAgentData = parser(userAgent);
  return {
    deviceType: userAgentData.device.type || 'desktop',
    deviceModel: userAgentData.device.model || 'unknown',
    deviceVendor: userAgentData.device.vendor || 'unknown',
    os: userAgentData.os.name || 'unknown',
    osVersion: userAgentData.os.version || 'unknown',
    browser: userAgentData.browser.name || 'unknown',
    browserVersion: userAgentData.browser.version || 'unknown',
    engine: userAgentData.engine.name || 'unknown',
    engineVersion: userAgentData.engine.version || 'unknown',
    cpu: userAgentData.cpu.architecture || 'unknown',
  };
}
