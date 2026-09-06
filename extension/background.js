let videoLinks = {}; // tabId -> list of links
let isLoaded = false;
let autoIntercept = true; // Default: enable auto-intercept

// Restore state from storage if Service Worker was suspended
let loadPromise = chrome.storage.local.get(['videoLinks', 'autoIntercept']).then((res) => {
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
    if (res.autoIntercept !== undefined) {
        autoIntercept = res.autoIntercept;
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

            // Ignore raw stream requests on YouTube tabs (handled by YouTube page detector)
            const pageUrl = details.initiator || '';
            if (pageUrl.includes('youtube.com') || details.url.includes('googlevideo.com') || details.url.includes('youtube.com')) {
                return;
            }

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
    } else if (request.action === 'toggleAutoIntercept') {
        autoIntercept = !autoIntercept;
        chrome.storage.local.set({ autoIntercept: autoIntercept });
        sendResponse({ success: true, autoIntercept: autoIntercept });
    } else if (request.action === 'getAutoIntercept') {
        sendResponse({ autoIntercept: autoIntercept });
    } else if (request.action === 'setYouTubeVideo') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
            videoLinks[tabId] = [{
                url: request.url,
                type: 'youtube',
                mimeType: 'video/youtube',
                size: 'YouTube Video',
                timestamp: Date.now(),
                pageUrl: request.url,
                title: request.title || 'YouTube Video'
            }];
            saveLinks();
            chrome.action.setBadgeText({ text: '1', tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: tabId });
        }
        sendResponse({ success: true });
    } else if (request.action === 'clearYouTubeVideo') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
            delete videoLinks[tabId];
            saveLinks();
            chrome.action.setBadgeText({ text: '', tabId: tabId });
        }
        sendResponse({ success: true });
    } else if (request.action === 'downloadWithChrome') {
        const url = request.url;
        let filename = request.filename || '';

        if (filename) {
            filename = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
        }

        bypassedUrls.add(url);
        try {
            const u = new URL(url);
            bypassedUrls.add(u.href);
        } catch (e) {}

        const downloadOptions = {
            url: url,
            saveAs: Boolean(request.saveAs)
        };
        if (filename) {
            downloadOptions.filename = filename;
        }

        chrome.downloads.download(downloadOptions, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('Chrome download failed:', chrome.runtime.lastError);
                bypassedUrls.delete(url);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                if (downloadId) {
                    bypassedDownloadIds.add(downloadId);
                }
                setTimeout(() => {
                    bypassedUrls.delete(url);
                    if (downloadId) bypassedDownloadIds.delete(downloadId);
                }, 30000);
                sendResponse({ success: true, downloadId: downloadId });
            }
        });
        return true;
    }
});

// Bypassed downloads (initiated directly by user via Chrome download button)
const bypassedDownloadIds = new Set();
const bypassedUrls = new Set();

// Clean up completed/interrupted downloads from bypass set
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
        bypassedDownloadIds.delete(delta.id);
    }
});

// Video file extensions and MIME types to intercept
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.3g2', '.ts', '.mts', '.m2ts', '.m3u8', '.mpd'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus'];
const VIDEO_MIME_TYPES = ['video/', 'audio/', 'application/x-mpegurl', 'application/vnd.apple.mpegurl', 'application/dash+xml', 'application/octet-stream'];

// Intercept Chrome downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
    // Skip if auto-intercept is disabled
    if (!autoIntercept) return;
    
    // Skip if download was explicitly initiated via Chrome
    if (bypassedDownloadIds.has(downloadItem.id) ||
        bypassedUrls.has(downloadItem.url) ||
        (downloadItem.finalUrl && bypassedUrls.has(downloadItem.finalUrl))) {
        return;
    }

    // Skip if already completed or paused
    if (downloadItem.state && downloadItem.state !== 'in_progress') return;
    
    const url = downloadItem.url.toLowerCase();
    const filename = (downloadItem.filename || '').toLowerCase();
    
    // Check if it's a video/audio file by extension
    const isVideoByExtension = VIDEO_EXTENSIONS.some(ext => url.endsWith(ext) || filename.endsWith(ext)) ||
                               AUDIO_EXTENSIONS.some(ext => url.endsWith(ext) || filename.endsWith(ext));
    
    // Check if it's a video/audio by MIME type (if available)
    const isVideoByMime = downloadItem.mimeTypeId && VIDEO_MIME_TYPES.some(mime => downloadItem.mimeTypeId.includes(mime));
    
    // Only intercept video/audio downloads
    if (!isVideoByExtension && !isVideoByMime) return;
    
    // Cancel the Chrome download
    chrome.downloads.cancel(downloadItem.id, () => {
        // Send to VDM desktop app
        sendToVDM(downloadItem.url, downloadItem.filename, downloadItem.tabId);
    });
});

// Send download to VDM desktop app
function sendToVDM(url, filename, tabId) {
    // Get page title for better naming
    if (tabId && tabId > 0) {
        chrome.tabs.get(tabId, (tab) => {
            const title = tab ? tab.title : '';
            
            fetch('http://localhost:9614/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    type: 'download',
                    size: 'Unknown',
                    pageUrl: tab ? tab.url : '',
                    title: title || filename || 'Video'
                })
            }).then(res => {
                if (!res.ok) {
                    console.error('Failed to send to VDM:', res.status);
                }
            }).catch(err => {
                console.error('Failed to send to VDM:', err);
            });
        });
    } else {
        // Fallback if no tab info
        fetch('http://localhost:9614/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                type: 'download',
                size: 'Unknown',
                pageUrl: '',
                title: filename || 'Video'
            })
        }).catch(err => {
            console.error('Failed to send to VDM:', err);
        });
    }
}
