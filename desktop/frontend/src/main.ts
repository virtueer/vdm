import {Events} from "@wailsio/runtime";
import {GetDownloads} from "../bindings/vdm/app";

interface DownloadItem {
    id: string;
    url: string;
    type: string;
    size: string;
    status: string;
}

const listContainer = document.getElementById("downloads-list") as HTMLDivElement;
const emptyState = document.getElementById("empty-state") as HTMLDivElement;
const template = document.getElementById("download-item-template") as HTMLTemplateElement;

function getFilenameFromUrl(url: string): string {
    try {
        const path = new URL(url).pathname;
        const parts = path.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart) {
            return lastPart.length > 30 ? lastPart.substring(0, 30) + '...' : lastPart;
        }
    } catch(e) {}
    return "Video.mp4";
}

function renderItem(item: DownloadItem) {
    if (emptyState) {
        emptyState.style.display = "none";
    }

    let el = document.getElementById(`dl-${item.id}`);
    
    if (!el) {
        const clone = template.content.cloneNode(true) as DocumentFragment;
        el = clone.querySelector('.download-item') as HTMLDivElement;
        el.id = `dl-${item.id}`;
        listContainer.appendChild(clone);
    }
    
    const title = el.querySelector('.item-title') as HTMLHeadingElement;
    const typeTag = el.querySelector('.type-tag') as HTMLSpanElement;
    const sizeTag = el.querySelector('.size-tag') as HTMLSpanElement;
    const statusText = el.querySelector('.status-text') as HTMLSpanElement;
    
    title.innerText = getFilenameFromUrl(item.url);
    title.title = item.url;
    typeTag.innerText = item.type;
    sizeTag.innerText = item.size;
    
    el.classList.remove('status-error', 'status-completed');
    
    if (item.status === 'pending') {
        statusText.innerText = 'Pending';
    } else if (item.status === 'downloading') {
        statusText.innerText = 'Downloading...';
        const progress = el.querySelector('.progress-bar') as HTMLDivElement;
        if (progress) progress.style.width = '50%'; // placeholder for active download
    } else if (item.status === 'completed') {
        statusText.innerText = 'Completed';
        el.classList.add('status-completed');
        const progress = el.querySelector('.progress-bar') as HTMLDivElement;
        if (progress) progress.style.width = '100%';
    } else if (item.status === 'error') {
        statusText.innerText = 'Error Occurred';
        el.classList.add('status-error');
        const progress = el.querySelector('.progress-bar') as HTMLDivElement;
        if (progress) progress.style.width = '100%';
    }
}

// Load existing downloads
try {
    GetDownloads().then((downloads: any) => {
        if (Array.isArray(downloads)) {
            downloads.forEach(d => renderItem(d as DownloadItem));
        }
    });
} catch(e) {
    console.error(e);
}

// Listen for new downloads
Events.On("new_download", (evt: any) => {
    console.log("new download event:", evt);
    if (evt.data) {
        renderItem(evt.data as DownloadItem);
    }
});

Events.On("download_updated", (evt: any) => {
    console.log("download updated:", evt);
    if (evt.data) {
        renderItem(evt.data as DownloadItem);
    }
});
