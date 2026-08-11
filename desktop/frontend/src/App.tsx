import React, { useState, useCallback } from "react";
import { useDownloadEvents } from "./hooks/useDownloadEvents";
import { isYouTubeUrl } from "./utils/formatters";
import { HeaderBar } from "./components/header/HeaderBar";
import { DownloadsView } from "./components/downloads/DownloadsView";
import { SettingsView } from "./components/settings/SettingsView";
import { LiveConsole } from "./components/terminal/LiveConsole";
import { DeleteModal } from "./components/modals/DeleteModal";
import { ProcessLogModal } from "./components/modals/ProcessLogModal";
import { YouTubeFormatModal } from "./components/modals/YouTubeFormatModal";

export default function App() {
    const [activeTab, setActiveTab] = useState<"downloads" | "settings">("downloads");
    const [showTerminal, setShowTerminal] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState<number>(280);

    const [showManualInput, setShowManualInput] = useState(false);
    const [manualUrl, setManualUrl] = useState('');
    const [manualTitle, setManualTitle] = useState('');

    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [logModalItem, setLogModalItem] = useState<string | null>(null);
    const [formatModalTarget, setFormatModalTarget] = useState<{ id?: string; url: string; title?: string } | null>(null);

    const handleNewYouTubeDownloadWithoutFormat = useCallback((target: { id: string; url: string; title?: string }) => {
        setFormatModalTarget(target);
    }, []);

    const {
        downloads,
        setDownloads,
        config,
        setConfig,
        logs,
        setLogs,
        downloadLogs,
        setDownloadLogs,
        probes
    } = useDownloadEvents(handleNewYouTubeDownloadWithoutFormat);

    const handleManualDownload = (chosenFormatId?: string) => {
        if (!manualUrl.trim()) return;
        fetch('http://localhost:9614/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: manualUrl.trim(),
                type: isYouTubeUrl(manualUrl) ? 'youtube' : 'manual',
                size: 'Unknown',
                pageUrl: '',
                title: manualTitle.trim() || '',
                formatId: chosenFormatId || ''
            })
        }).then(res => {
            if (res.ok) {
                setManualUrl('');
                setManualTitle('');
                setShowManualInput(false);
                setFormatModalTarget(null);
            } else {
                alert('Failed to add download. Make sure the desktop app is running.');
            }
        }).catch(err => {
            console.error('Failed to add download:', err);
            alert('Failed to add download.');
        });
    };

    const handleUpdateItemStatus = (id: string, status: string, msg: string) => {
        setDownloads(prev => prev.map(d => d.id === id ? { ...d, status, speed: '', statusMsg: msg } : d));
    };

    const itemToDeleteObj = downloads.find(d => d.id === itemToDelete);

    return (
        <div className="flex flex-col h-full bg-background text-foreground transition-colors">
            <HeaderBar 
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                showTerminal={showTerminal}
                setShowTerminal={setShowTerminal}
            />

            <main className="flex-1 overflow-hidden flex flex-col relative">
                <div 
                    style={showTerminal ? { height: `calc(100% - ${terminalHeight}px)` } : { height: '100%' }}
                    className="w-full px-6 py-4 flex flex-col transition-all duration-150 overflow-hidden"
                >
                    <div className={`flex-1 flex flex-col min-h-0 ${activeTab === "downloads" ? "" : "hidden"}`}>
                        <DownloadsView 
                            downloads={downloads}
                            downloadLogs={downloadLogs}
                            probes={probes}
                            showManualInput={showManualInput}
                            setShowManualInput={setShowManualInput}
                            manualUrl={manualUrl}
                            setManualUrl={setManualUrl}
                            manualTitle={manualTitle}
                            setManualTitle={setManualTitle}
                            onManualDownload={handleManualDownload}
                            onOpenFormatModal={(target) => setFormatModalTarget(target)}
                            onViewLogs={(id) => setLogModalItem(id)}
                            onDelete={(id) => setItemToDelete(id)}
                            onUpdateItemStatus={handleUpdateItemStatus}
                        />
                    </div>

                    <div className={`flex-1 flex flex-col min-h-0 ${activeTab === "settings" ? "" : "hidden"}`}>
                        <SettingsView config={config} setConfig={setConfig} />
                    </div>
                </div>

                {showTerminal && (
                    <LiveConsole 
                        logs={logs}
                        terminalHeight={terminalHeight}
                        setTerminalHeight={setTerminalHeight}
                        onClear={() => setLogs([])}
                        onClose={() => setShowTerminal(false)}
                    />
                )}
            </main>

            {itemToDeleteObj && <DeleteModal item={itemToDeleteObj} onClose={() => setItemToDelete(null)} />}
            {logModalItem && <ProcessLogModal downloadId={logModalItem} downloadLogs={downloadLogs} setDownloadLogs={setDownloadLogs} onClose={() => setLogModalItem(null)} />}
            {formatModalTarget && <YouTubeFormatModal target={formatModalTarget} downloads={downloads} onManualDownload={handleManualDownload} onClose={() => setFormatModalTarget(null)} />}
        </div>
    );
}
