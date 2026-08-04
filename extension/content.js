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

// Initial scan
scanForVideos();

// Monitor DOM for new videos
const observer = new MutationObserver(() => {
    scanForVideos();
});

observer.observe(document.body, { childList: true, subtree: true });
