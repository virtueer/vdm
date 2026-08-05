let videoLinks = {}; // tabId -> list of links
let isLoaded = false;

// Restore state from storage if Service Worker was suspended
let loadPromise = chrome.storage.local.get(['videoLinks']).then((res) => {
    if (res.videoLinks) {
        // Merge stored links with any links captured while waking up
        for (const tabId in res.videoLinks) {
            if (!videoLinks[tabId]) {
                videoLinks[tabId] = res.videoLinks[tabId];
            } else {
                const existingUrls = new Set(videoLinks[tabId].map(v => v.url));
                for (const link of res.videoLinks[tabId]) {
                    if (!existingUrls.has(link.url)) {
                        videoLinks[tabId].push(link);
                    }
                }
            }
        }
    }
    isLoaded = true;
    chrome.storage.local.set({ videoLinks: videoLinks });
});

function saveLinks() {
    if (isLoaded) {
        chrome.storage.local.set({ videoLinks: videoLinks });
    }
}

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
            let size = 'Unknown';
            const cl = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-length');
            if (cl) {
                const bytes = parseInt(cl.value, 10);
                if (bytes > 1024 * 1024) size = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
                else if (bytes > 1024) size = (bytes / 1024).toFixed(2) + ' KB';
                else size = bytes + ' B';
            }

            let mimeType = '';
            const ct = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-type');
            if (ct) mimeType = ct.value.toLowerCase();

            // Avoid duplicates
            if (!videoLinks[tabId].find(v => v.url === details.url)) {
                const pageUrl = details.initiator || '';

                const finalizeLink = (pageTitle) => {
                    // Fallback to extract from URL if title is empty
                    if (!pageTitle || pageTitle.trim() === '' || pageTitle.toLowerCase() === 'video' || pageTitle === 'Player') {
                        try {
                            const u = new URL(pageUrl);
                            const path = u.pathname.replace(/^\/+|\/+$/g, '');
                            if (path) {
                                const parts = path.split('/');
                                if (parts.length > 1) {
                                    pageTitle = parts.slice(-2).join('-');
                                } else {
                                    pageTitle = parts[parts.length - 1];
                                }
                            } else {
                                pageTitle = u.hostname;
                            }
                        } catch(e) {
                            pageTitle = 'Video';
                        }
                    }
                    
                    const newLink = {
                        url: details.url,
                        type: details.type || 'network',
                        mimeType: mimeType,
                        size: size,
                        timestamp: Date.now(),
                        pageUrl: pageUrl,
                        title: pageTitle
                    };
                    videoLinks[tabId].push(newLink);
                    
                    saveLinks();

                    // Update badge
                    chrome.action.setBadgeText({ text: videoLinks[tabId].length.toString(), tabId: tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: tabId });
                    
                    // Parse HLS manifest for resolution, bandwidth, and estimate full size
                    const isM3u8 = details.url.includes('.m3u8') || details.url.includes('master.txt') || details.responseHeaders.some(h => h.name.toLowerCase() === 'content-type' && h.value.toLowerCase().includes('mpegurl'));
                    
                    if (isM3u8) {
                        (async () => {
                            try {
                                const res = await fetch(details.url);
                                const text = await res.text();
                                
                                let maxBandwidth = 0;
                                let maxRes = "";
                                let bestStreamUri = "";
                                
                                const lines = text.split('\n');
                                let currentBandwidth = 0;
                                let currentRes = "";
                                
                                for (let i = 0; i < lines.length; i++) {
                                    let line = lines[i].trim();
                                    if (line.startsWith('#EXT-X-STREAM-INF:')) {
                                        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
                                        const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
                                        
                                        currentBandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
                                        currentRes = resMatch ? resMatch[1] : "";
                                    } else if (line && !line.startsWith('#')) {
                                        if (currentBandwidth > maxBandwidth) {
                                            maxBandwidth = currentBandwidth;
                                            maxRes = currentRes;
                                            bestStreamUri = line;
                                        }
                                    }
                                }
                                
                                let updated = false;
                                if (maxRes) {
                                    newLink.resolution = maxRes;
                                    updated = true;
                                }
                                if (maxBandwidth > 0) {
                                    newLink.bandwidth = (maxBandwidth / 1000000).toFixed(2) + ' Mbps';
                                    updated = true;
                                }
                                
                                // If we found a stream URI, fetch it to calculate total size
                                if (bestStreamUri && maxBandwidth > 0) {
                                    const mediaUrl = new URL(bestStreamUri, details.url).href;
                                    const mediaRes = await fetch(mediaUrl);
                                    const mediaText = await mediaRes.text();
                                    
                                    let totalDuration = 0;
                                    const mediaLines = mediaText.split('\n');
                                    for (let line of mediaLines) {
                                        if (line.trim().startsWith('#EXTINF:')) {
                                            const durMatch = line.match(/#EXTINF:([\d.]+)/i);
                                            if (durMatch) {
                                                totalDuration += parseFloat(durMatch[1]);
                                            }
                                        }
                                    }
                                    
                                    if (totalDuration > 0) {
                                        const totalBytes = (maxBandwidth * totalDuration) / 8;
                                        let sizeStr = "";
                                        if (totalBytes > 1024 * 1024 * 1024) sizeStr = (totalBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
                                        else if (totalBytes > 1024 * 1024) sizeStr = (totalBytes / (1024 * 1024)).toFixed(2) + ' MB';
                                        else if (totalBytes > 1024) sizeStr = (totalBytes / 1024).toFixed(2) + ' KB';
                                        else sizeStr = totalBytes.toFixed(0) + ' B';
                                        
                                        newLink.size = "~" + sizeStr;
                                        updated = true;
                                    }
                                }
                                
                                if (updated) {
                                    saveLinks();
                                }
                            } catch (err) {
                                console.error("Failed to deeply parse m3u8:", err);
                            }
                        })();
                    }
                };

                // Try to get title from the main frame (frameId: 0) first
                chrome.tabs.sendMessage(tabId, { action: 'getPageTitle' }, { frameId: 0 }, (response) => {
                    let title = '';
                    if (!chrome.runtime.lastError && response && response.title) {
                        title = response.title;
                    }
                    
                    if (title && title.toLowerCase() !== 'video' && title !== 'Player') {
                        finalizeLink(title);
                    } else {
                        // Fallback to the specific frame if it's different
                        if (details.frameId !== undefined && details.frameId !== 0 && details.frameId !== -1) {
                            chrome.tabs.sendMessage(tabId, { action: 'getPageTitle' }, { frameId: details.frameId }, (resp2) => {
                                let title2 = '';
                                if (!chrome.runtime.lastError && resp2 && resp2.title) {
                                    title2 = resp2.title;
                                }
                                if (title2 && title2.toLowerCase() !== 'video' && title2 !== 'Player') {
                                    finalizeLink(title2);
                                } else {
                                    chrome.tabs.get(tabId, (tab) => {
                                        finalizeLink(tab ? tab.title : '');
                                    });
                                }
                            });
                        } else {
                            chrome.tabs.get(tabId, (tab) => {
                                finalizeLink(tab ? tab.title : '');
                            });
                        }
                    }
                });
            }
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

// Listen to close tab to cleanup memory
chrome.tabs.onRemoved.addListener((tabId) => {
    delete videoLinks[tabId];
    saveLinks();
});

// Clear links when a tab navigates or refreshes
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' || changeInfo.url) {
        delete videoLinks[tabId];
        saveLinks();
        chrome.action.setBadgeText({ text: '', tabId: tabId });
    }
});

// Provide links to popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getVideoLinks') {
        loadPromise.then(() => {
            sendResponse({ links: videoLinks[request.tabId] || [] });
        });
        return true; // Keep the message channel open for async response
    } else if (request.action === 'addVideoLinkFromDOM') {
        const tabId = sender.tab.id;
        if (!videoLinks[tabId]) videoLinks[tabId] = [];

        if (!videoLinks[tabId].find(v => v.url === request.url)) {
            videoLinks[tabId].push({
                url: request.url,
                type: 'dom-video',
                size: 'Unknown',
                timestamp: Date.now()
            });
            saveLinks();
            chrome.action.setBadgeText({ text: videoLinks[tabId].length.toString(), tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: tabId });
        }
    } else if (request.action === 'hideVideoLink') {
        const tabId = request.tabId;
        if (videoLinks[tabId]) {
            const linkObj = videoLinks[tabId].find(v => v.url === request.url);
            if (linkObj) {
                linkObj.hidden = true;
                saveLinks();
            }
            
            const count = videoLinks[tabId].filter(v => !v.hidden).length;
            chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '', tabId: tabId });
        }
        sendResponse({ success: true });
    } else if (request.action === 'showVideoLink') {
        const tabId = request.tabId;
        if (videoLinks[tabId]) {
            const linkObj = videoLinks[tabId].find(v => v.url === request.url);
            if (linkObj) {
                linkObj.hidden = false;
                saveLinks();
            }
            
            const count = videoLinks[tabId].filter(v => !v.hidden).length;
            chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '', tabId: tabId });
        }
        sendResponse({ success: true });
    }
});
