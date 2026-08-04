document.addEventListener('DOMContentLoaded', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const currentTab = tabs[0];

        chrome.runtime.sendMessage({
            action: 'getVideoLinks',
            tabId: currentTab.id
        }, function (response) {
            const list = document.getElementById('video-list');

            if (response && response.links && response.links.length > 0) {
                list.innerHTML = ''; // clear empty state

                response.links.forEach(video => {
                    const item = document.createElement('div');
                    
                    if (video.hidden) {
                        item.className = 'video-item hidden-state';
                        item.innerHTML = `
                            <div class="hidden-state-info">
                                <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" opacity="0.3"/></svg>
                                <span>Hidden Link</span>
                            </div>
                            <button class="btn-show" data-url="${video.url}">Restore</button>
                        `;
                        const showBtn = item.querySelector('.btn-show');
                        showBtn.addEventListener('click', () => {
                            chrome.runtime.sendMessage({
                                action: 'showVideoLink',
                                tabId: currentTab.id,
                                url: video.url
                            }, () => {
                                window.location.reload();
                            });
                        });
                        list.appendChild(item);
                        return;
                    }

                    item.className = 'video-item';

                    const urlString = video.url.length > 100 ? video.url.substring(0, 100) + '...' : video.url;

                    const isAudio = (video.mimeType && video.mimeType.startsWith('audio/')) || 
                                    /\.(mp3|wav|m4a|aac|ogg|flac|mka)$/i.test(video.url) ||
                                    /_aud(\d+)?\.(txt|m3u8)$/i.test(video.url) ||
                                    /audio/i.test(video.url.split('/').pop());
                    
                    let mediaElement = '';
                    if (isAudio) {
                        mediaElement = `<audio src="${video.url}" controls style="width: 100%; outline: none;"></audio>`;
                    } else {
                        const isM3u8 = video.url.includes('.m3u8') || video.url.includes('master.txt');
                        const srcHash = isM3u8 ? '' : '#t=0.001';
                        mediaElement = `<video src="${video.url}${srcHash}" preload="metadata" controls style="width: 100%; max-height: 200px; border-radius: 4px; background: #000;"></video>`;
                    }

                    item.innerHTML = `
                        <div class="video-url-container" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div class="video-url" title="${video.url}" style="margin-bottom: 0; width: calc(100% - 30px);">${urlString}</div>
                            <button class="btn-copy-icon" data-url="${video.url}" title="Copy Link">📋</button>
                        </div>
                        <div class="video-meta">
                            Type: ${video.type} | Size: ${(video.size && video.size.startsWith('~')) ? video.size : (video.bandwidth ? video.bandwidth + ' (Stream)' : video.size)} <span class="res-info">${video.resolution ? '| Resolution: ' + video.resolution : ''}</span>
                        </div>
                        <div class="video-preview-container" style="margin-top: 10px; margin-bottom: 10px;">
                            ${mediaElement}
                        </div>
                        <div class="action-buttons">
                            <button class="btn-download" data-url="${video.url}">Download</button>
                            <button class="btn-hide" data-url="${video.url}">Hide</button>
                        </div>
                    `;

                    list.appendChild(item);

                    // Fetch resolution for direct video files (mp4, webm)
                    if (video.type === 'network' && (video.url.includes('.mp4') || video.url.includes('.webm') || video.url.includes('.ogg'))) {
                        const tempVid = document.createElement('video');
                        tempVid.src = video.url;
                        tempVid.addEventListener('loadedmetadata', function () {
                            const resInfo = item.querySelector('.res-info');
                            if (resInfo && this.videoWidth && this.videoHeight) {
                                resInfo.textContent = `| Resolution: ${this.videoWidth}x${this.videoHeight}`;
                            }
                        });
                    } else if (video.type === 'dom-video') {
                        const tempVid = document.createElement('video');
                        tempVid.src = video.url;
                        tempVid.addEventListener('loadedmetadata', function () {
                            const resInfo = item.querySelector('.res-info');
                            if (resInfo && this.videoWidth && this.videoHeight) {
                                resInfo.textContent = `| Resolution: ${this.videoWidth}x${this.videoHeight}`;
                            }
                        });
                    }
                });

                // Add click handlers
                document.querySelectorAll('.btn-download').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const url = e.target.getAttribute('data-url');
                        const videoItem = response.links.find(v => v.url === url);

                        try {
                            const res = await fetch('http://localhost:9614/api/download', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    url: url,
                                    type: videoItem ? videoItem.type : 'network',
                                    size: videoItem ? videoItem.size : 'Unknown'
                                })
                            });

                            if (res.ok) {
                                const originalText = e.target.innerText;
                                e.target.innerText = 'Sent!';
                                setTimeout(() => {
                                    e.target.innerText = originalText;
                                }, 1500);
                            } else {
                                throw new Error("Server returned error status");
                            }
                        } catch (err) {
                            console.error('Failed to send to app: ', err);
                            alert('VDM Desktop application is not running or unreachable. Please launch the desktop app.');
                        }
                    });
                });

                // Copy icon handlers
                document.querySelectorAll('.btn-copy-icon').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const url = e.currentTarget.getAttribute('data-url');
                        try {
                            await navigator.clipboard.writeText(url);
                            const oldHtml = e.currentTarget.innerHTML;
                            e.currentTarget.innerHTML = '✅';
                            setTimeout(() => e.currentTarget.innerHTML = oldHtml, 1500);
                        } catch (err) {
                            console.error('Copy failed', err);
                        }
                    });
                });

                // Hide handlers
                document.querySelectorAll('.btn-hide').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const url = e.target.getAttribute('data-url');
                        chrome.runtime.sendMessage({
                            action: 'hideVideoLink',
                            tabId: currentTab.id,
                            url: url
                        }, () => {
                            const item = e.target.closest('.video-item');
                            
                            // Animate collapse
                            item.style.transition = 'opacity 0.2s ease';
                            item.style.opacity = '0';
                            
                            setTimeout(() => {
                                item.className = 'video-item hidden-state';
                                item.innerHTML = `
                                    <div class="hidden-state-info">
                                        <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" opacity="0.3"/></svg>
                                        <span>Hidden Link</span>
                                    </div>
                                    <button class="btn-show" data-url="${url}">Restore</button>
                                `;
                                item.style.opacity = '1';
                                
                                const showBtn = item.querySelector('.btn-show');
                                showBtn.addEventListener('click', () => {
                                    chrome.runtime.sendMessage({
                                        action: 'showVideoLink',
                                        tabId: currentTab.id,
                                        url: url
                                    }, () => {
                                        window.location.reload();
                                    });
                                });
                            }, 200);
                        });
                    });
                });
                
                // Info Modal Handlers
                const infoModal = document.getElementById('info-modal');
                const closeInfoBtn = infoModal.querySelector('.close-info-btn');
                const copyBtn = document.getElementById('copy-m3u8-btn');
                const linkText = document.getElementById('m3u8-link-text');

                closeInfoBtn.addEventListener('click', () => {
                    infoModal.style.display = 'none';
                });

                copyBtn.addEventListener('click', async () => {
                    try {
                        const textToCopy = linkText.value || linkText.innerText;
                        await navigator.clipboard.writeText(textToCopy);

                        const originalText = copyBtn.innerText;
                        copyBtn.innerText = 'Copied!';

                        setTimeout(() => {
                            copyBtn.innerText = originalText;
                        }, 1500);

                    } catch (err) {
                        console.error('Copy failed: ', err);
                        alert('Copy operation is not supported or was blocked.');
                    }
                });

            }
        });
    });
});
