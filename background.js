let videoLinks = {}; // tabId -> list of links

chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        // Look for video types
        const isVideo = details.responseHeaders.some(header => {
            const name = header.name.toLowerCase();
            if (name === 'content-type') {
                const value = header.value.toLowerCase();
                return value.includes('video/') ||
                    value.includes('audio/') ||
                    value.includes('application/x-mpegurl') || // HLS
                    value.includes('application/vnd.apple.mpegurl') ||
                    value.includes('application/dash+xml') || // DASH
                    (value.includes('application/octet-stream') && ['.mp4', '.mkv', '.ts'].includes(details.url));
            }

            return false;
        });

        if (isVideo) {
            const tabId = details.tabId;
            if (tabId === -1) return; // Ignore background requests

            if (!videoLinks[tabId]) {
                videoLinks[tabId] = [];
            }

            // Determine size if available
            let size = 'Bilinmiyor';
            const cl = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-length');
            if (cl) {
                const bytes = parseInt(cl.value, 10);
                if (bytes > 1024 * 1024) size = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
                else if (bytes > 1024) size = (bytes / 1024).toFixed(2) + ' KB';
                else size = bytes + ' B';
            }

            // Avoid duplicates
            if (!videoLinks[tabId].find(v => v.url === details.url)) {
                videoLinks[tabId].push({
                    url: details.url,
                    type: details.type || 'network',
                    size: size,
                    timestamp: Date.now()
                });

                // Update badge
                chrome.action.setBadgeText({ text: videoLinks[tabId].length.toString(), tabId: tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: tabId });
            }
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

// Listen to close tab to cleanup memory
chrome.tabs.onRemoved.addListener((tabId) => {
    delete videoLinks[tabId];
});

// Provide links to popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getVideoLinks') {
        const links = videoLinks[request.tabId] || [];
        sendResponse({ links: links });
    } else if (request.action === 'addVideoLinkFromDOM') {
        const tabId = sender.tab.id;
        if (!videoLinks[tabId]) videoLinks[tabId] = [];

        if (!videoLinks[tabId].find(v => v.url === request.url)) {
            videoLinks[tabId].push({
                url: request.url,
                type: 'dom-video',
                size: 'Bilinmiyor',
                timestamp: Date.now()
            });
            chrome.action.setBadgeText({ text: videoLinks[tabId].length.toString(), tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: tabId });
        }
    } else if (request.action === 'deleteVideoLink') {
        const tabId = request.tabId;
        if (videoLinks[tabId]) {
            videoLinks[tabId] = videoLinks[tabId].filter(v => v.url !== request.url);

            const count = videoLinks[tabId].length;
            chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '', tabId: tabId });
        }
        sendResponse({ success: true });
    }
});
