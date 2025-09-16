const browserApi = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
    const debugToggle = document.getElementById('debugToggle');

    // Get the initial state from storage and set the toggle accordingly
    browserApi.storage.sync.get('showDebug', (data) => {
        debugToggle.checked = !!data.showDebug;
    });

    // Listen for changes on the toggle switch
    debugToggle.addEventListener('change', () => {
        const showDebug = debugToggle.checked;
        
        // Save the new state to storage
        browserApi.storage.sync.set({ showDebug: showDebug });

        // Send a message to the active tab's content script to update its state
        browserApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                browserApi.tabs.sendMessage(tabs[0].id, { 
                    action: 'toggleDebug', 
                    showDebug: showDebug 
                });
            }
        });
    });
});