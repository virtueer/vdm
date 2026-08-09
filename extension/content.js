// Scans for <video> tags and dynamic sources in DOM
function scanForVideos() {
    if (isYouTubeHost()) return; // YouTube handled separately

    const videos = document.querySelectorAll('video, source');
    const links = new Set();

    videos.forEach(v => {
        if (v.src && !v.src.startsWith('blob:') && !v.src.startsWith('data:')) {
            links.add(v.src);
        }
        if (v.currentSrc && !v.currentSrc.startsWith('blob:') && !v.currentSrc.startsWith('data:')) {
            links.add(v.currentSrc);
        }
    });

    links.forEach(url => {
        chrome.runtime.sendMessage({
            action: 'addVideoLinkFromDOM',
            url: url
        });
    });
}

function extractBestTitle() {
    let title = '';
    
    // Check for OpenGraph title which is usually the most accurate movie/series name
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) title = ogTitle.content;
    
    // Check for main heading
    if (!title || title.length < 3) {
        const h1 = document.querySelector('h1');
        if (h1 && h1.innerText) title = h1.innerText;
    }
    
    // Fallback to document title
    if (!title || title.length < 3) {
        title = document.title;
    }
    
    // Some sites suffix their domain to the title, optionally we could clean it here
    return title ? title.trim() : '';
}

function isYouTubeHost() {
    return window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
}

function getYouTubeVideoInfo() {
    const href = window.location.href;
    let videoId = null;

    if (href.includes('/watch')) {
        try {
            const urlObj = new URL(href);
            videoId = urlObj.searchParams.get('v');
        } catch (e) {}
    } else if (href.includes('/shorts/')) {
        const parts = href.split('/shorts/');
        if (parts[1]) {
            videoId = parts[1].split('?')[0].split('/')[0];
        }
    } else if (href.includes('/embed/')) {
        const parts = href.split('/embed/');
        if (parts[1]) {
            videoId = parts[1].split('?')[0].split('/')[0];
        }
    }

    if (!videoId) return null;

    let title = '';
    const ytH1 = document.querySelector('ytd-watch-metadata h1, #title h1.ytd-watch-metadata, h1.ytd-video-primary-info-renderer, h1.ytd-watch-flexy');
    if (ytH1 && ytH1.innerText) {
        title = ytH1.innerText.trim();
    }

    if (!title) {
        const shortsTitle = document.querySelector('h2.title, ytd-reel-player-header-renderer h2, h2.ytd-shorts');
        if (shortsTitle && shortsTitle.innerText) {
            title = shortsTitle.innerText.trim();
        }
    }

    if (!title) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && ogTitle.content) {
            title = ogTitle.content.trim();
        }
    }

    if (!title) {
        title = document.title ? document.title.replace(/ - YouTube$/, '').trim() : '';
    }

    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return {
        videoId: videoId,
        url: cleanUrl,
        title: title || 'YouTube Video'
    };
}

let lastYtUrl = '';
let lastYtTitle = '';

function checkAndReportYouTube() {
    if (!isYouTubeHost()) return;
    if (window.self !== window.top) return; // Only main frame

    const info = getYouTubeVideoInfo();
    if (info) {
        if (info.url !== lastYtUrl || (info.title && info.title !== lastYtTitle && info.title !== 'YouTube Video')) {
            lastYtUrl = info.url;
            lastYtTitle = info.title;
            chrome.runtime.sendMessage({
                action: 'setYouTubeVideo',
                url: info.url,
                title: info.title
            });
        }
    } else {
        if (lastYtUrl) {
            lastYtUrl = '';
            lastYtTitle = '';
            chrome.runtime.sendMessage({
                action: 'clearYouTubeVideo'
            });
        }
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getPageTitle') {
        sendResponse({ title: extractBestTitle() });
    }
});

if (isYouTubeHost()) {
    checkAndReportYouTube();
    window.addEventListener('yt-navigate-finish', checkAndReportYouTube);
    window.addEventListener('popstate', checkAndReportYouTube);
    setInterval(checkAndReportYouTube, 1500);
} else {
    // Initial scan
    scanForVideos();

    // Monitor DOM for new videos
    const observer = new MutationObserver(() => {
        scanForVideos();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

