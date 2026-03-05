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
                    item.className = 'video-item';

                    const urlString = video.url.length > 100 ? video.url.substring(0, 100) + '...' : video.url;

                    item.innerHTML = `
                        <div class="video-url" title="${video.url}">${urlString}</div>
                        <div class="video-meta">
                            Tip: ${video.type} | Boyut: ${video.size} <span class="res-info"></span>
                        </div>
                        <div class="action-buttons">
                            <button class="btn-preview" data-url="${video.url}">Önizle</button>
                            <button class="btn-download" data-url="${video.url}">İndir</button>
                            <button class="btn-copy" data-url="${video.url}">Kopyala</button>
                            <button class="btn-delete" data-url="${video.url}">Sil</button>
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
                                resInfo.textContent = `| Çözünürlük: ${this.videoWidth}x${this.videoHeight}`;
                            }
                        });
                    } else if (video.type === 'dom-video') {
                        const tempVid = document.createElement('video');
                        tempVid.src = video.url;
                        tempVid.addEventListener('loadedmetadata', function () {
                            const resInfo = item.querySelector('.res-info');
                            if (resInfo && this.videoWidth && this.videoHeight) {
                                resInfo.textContent = `| Çözünürlük: ${this.videoWidth}x${this.videoHeight}`;
                            }
                        });
                    }
                });

                // Add click handlers
                document.querySelectorAll('.btn-download').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const url = e.target.getAttribute('data-url');
                        const command = `yt-dlp "${url}" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M --file-allocation=none"`;

                        try {
                            // Modern Clipboard API ile yt-dlp kodunu kopyalama işlemi
                            await navigator.clipboard.writeText(command);

                            // Buton metnini güncelleme
                            const originalText = e.target.innerText;
                            e.target.innerText = 'Kod Kopyalandı!';

                            setTimeout(() => {
                                e.target.innerText = originalText;
                            }, 1500);
                        } catch (err) {
                            console.error('Kopyalama başarısız oldu: ', err);
                            alert('Kopyalama işlemi desteklenmiyor veya engellendi.');
                        }
                    });
                });

                document.querySelectorAll('.btn-copy').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const url = e.target.getAttribute('data-url');
                        navigator.clipboard.writeText(url).then(() => {
                            const originalText = e.target.innerText;
                            e.target.innerText = 'Kopyalandı!';
                            setTimeout(() => {
                                e.target.innerText = originalText;
                            }, 1500);
                        });
                    });
                });
                // Delete handlers
                document.querySelectorAll('.btn-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const url = e.target.getAttribute('data-url');
                        chrome.runtime.sendMessage({
                            action: 'deleteVideoLink',
                            tabId: currentTab.id,
                            url: url
                        }, () => {
                            e.target.closest('.video-item').remove();
                            if (list.children.length === 0) {
                                list.innerHTML = '<div class="empty">Video bulunamadı.</div>';
                            }
                        });
                    });
                });

                // Preview handlers
                const modal = document.getElementById('preview-modal');
                const closeBtn = modal.querySelector('.close-btn');
                const playerContainer = document.getElementById('player-container');

                document.querySelectorAll('.btn-preview').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const url = e.target.getAttribute('data-url');
                        playerContainer.innerHTML = '';

                        // Expand popup size for larger preview (Max Chrome limit is usually 800x600)
                        document.body.style.width = '780px';
                        document.body.style.height = '580px';

                        const video = document.createElement('video');
                        video.controls = true;
                        video.autoplay = true;
                        video.src = url;
                        video.style.width = '100%';
                        video.style.height = '100%';
                        // The user can drag to resize .modal-content.resizable, so the video will scale with it
                        playerContainer.appendChild(video);
                        modal.style.display = 'block';
                    });
                });

                closeBtn.addEventListener('click', () => {
                    modal.style.display = 'none';
                    playerContainer.innerHTML = '';

                    // Revert popup size
                    document.body.style.width = '350px';
                    // Let height auto-adjust
                    document.body.style.height = 'auto';
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
                        // Eğer linkText bir <input> veya <textarea> ise .value alırız.
                        // Eğer <div> veya <span> gibi bir etiketse .innerText kullanırız.
                        const textToCopy = linkText.value || linkText.innerText;

                        // Modern Clipboard API ile kopyalama işlemi
                        await navigator.clipboard.writeText(textToCopy);

                        // Buton metnini güncelleme
                        const originalText = copyBtn.innerText;
                        copyBtn.innerText = 'Kopyalandı!';

                        setTimeout(() => {
                            copyBtn.innerText = originalText;
                        }, 1500);

                    } catch (err) {
                        console.error('Kopyalama başarısız oldu: ', err);
                        alert('Kopyalama işlemi desteklenmiyor veya engellendi.');
                    }
                });

            }
        });
    });
});
