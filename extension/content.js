// Scans for <video> tags and dynamic sources in DOM
function scanForVideos() {
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getPageTitle') {
        sendResponse({ title: extractBestTitle() });
    }
});

// Initial scan
scanForVideos();

// Monitor DOM for new videos
const observer = new MutationObserver(() => {
    scanForVideos();
});

observer.observe(document.body, { childList: true, subtree: true });
