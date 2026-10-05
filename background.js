const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Capture the user-invoked tab locally for clip recording.'
  });
}

async function captured(tabId) {
  const tabs = await chrome.tabCapture.getCapturedTabs();
  return tabs.some(x => x.tabId === tabId && (x.status === 'active' || x.status === 'pending'));
}

async function tell(tabId, message) {
  try { await chrome.tabs.sendMessage(tabId, message); } catch (_) {}
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await ensureOffscreen();
    if (await captured(tab.id)) {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'DISARM', tabId: tab.id });
      await tell(tab.id, { type: 'CLIPPAH_CAPTURE_STATE', armed: false });
      return;
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const result = await chrome.runtime.sendMessage({
      target: 'offscreen', type: 'ARM', tabId: tab.id, streamId
    });

    if (!result?.ok) throw new Error(result?.error || 'Could not start tab capture');
    await tell(tab.id, { type: 'CLIPPAH_CAPTURE_STATE', armed: true });
  } catch (error) {
    await tell(tab.id, { type: 'CLIPPAH_ERROR', message: error?.message || String(error) });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === 'offscreen') return;
  const tabId = sender.tab?.id ?? message.tabId;

  if (message.type === 'GET_CAPTURE_STATE') {
    (async () => {
      try { sendResponse({ ok: true, armed: tabId ? await captured(tabId) : false }); }
      catch (error) { sendResponse({ ok: false, armed: false, error: error?.message || String(error) }); }
    })();
    return true;
  }

  if (message.type === 'SEGMENT_START') {
    (async () => {
      try {
        if (!tabId || !(await captured(tabId))) {
          return sendResponse({ ok: false, error: 'Capture is not armed. Click the Clippah toolbar icon once.' });
        }
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen', type: 'SEGMENT_START', tabId, meta: message.meta
        });
        sendResponse(result || { ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === 'SEGMENT_STOP') {
    (async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen', type: 'SEGMENT_STOP', tabId, meta: message.meta
        });
        sendResponse(result || { ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === 'OPEN_STUDIO') {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
    sendResponse({ ok: true });
  }
});
