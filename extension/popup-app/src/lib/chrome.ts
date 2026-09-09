/**
 * Promise wrappers over the callback-based extension APIs, with a single
 * environment guard so components never branch on `typeof chrome`.
 */
export const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);

function settle<T>(resolve: (value: T | null) => void, value: T | undefined) {
  // Reading lastError marks the failure as handled.
  if (chrome.runtime.lastError) {
    console.warn('extension message failed:', chrome.runtime.lastError.message);
    resolve(null);
    return;
  }
  resolve(value ?? null);
}

export function sendMessage<T>(message: unknown): Promise<T | null> {
  if (!isExtension) return Promise.resolve(null);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: T | undefined) => settle(resolve, response));
  });
}

export function sendTabMessage<T>(
  tabId: number,
  message: unknown,
  options?: chrome.tabs.MessageSendOptions
): Promise<T | null> {
  if (!isExtension) return Promise.resolve(null);
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, options ?? {}, (response: T | undefined) =>
      settle(resolve, response)
    );
  });
}

export function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  if (!isExtension) return Promise.resolve(null);
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => settle(resolve, tabs[0]));
  });
}

export function getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  if (!isExtension) return Promise.resolve(null);
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => settle(resolve, tab));
  });
}

export function openTab(url: string) {
  if (isExtension && chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank');
}

export function extensionUrl(path: string): string {
  return isExtension && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : window.location.href;
}
