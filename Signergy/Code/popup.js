document.addEventListener('DOMContentLoaded', () => {
    const browserApi = typeof browser !== 'undefined' ? browser : chrome;
    
    const enableToggle = document.getElementById('enableToggle');
    const debugToggle = document.getElementById('debugToggle');
    const reloadButton = document.getElementById('reloadButton');

    // Load saved settings from storage
    browserApi.storage.sync.get(['isOverlayEnabled', 'showDebug'], (data) => {
        // Default to enabled if not set
        enableToggle.checked = typeof data.isOverlayEnabled === 'undefined' ? true : data.isOverlayEnabled;
        debugToggle.checked = !!data.showDebug;
    });

    // Main overlay toggle
    enableToggle.addEventListener('change', () => {
        const isEnabled = enableToggle.checked;
        browserApi.storage.sync.set({ isOverlayEnabled: isEnabled });
        
        sendMessageToContentScript({ 
            action: isEnabled ? 'enableOverlay' : 'disableOverlay' 
        });
    });

    // Debug info toggle
    debugToggle.addEventListener('change', () => {
        const showDebug = debugToggle.checked;
        browserApi.storage.sync.set({ showDebug: showDebug });

        sendMessageToContentScript({ 
            action: 'toggleDebug', 
            showDebug: showDebug 
        });
    });

    // Reload button
    reloadButton.addEventListener('click', () => {
        sendMessageToContentScript({ action: 'reloadOverlay' });
    });

    function sendMessageToContentScript(message) {
        browserApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                browserApi.tabs.sendMessage(tabs[0].id, message)
                    .catch(err => console.log("Signergy popup: Could not send message to content script.", err));
            }
        });
    }
});