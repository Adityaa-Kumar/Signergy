const browserApi = self.browser || self.chrome;

// Listen for messages from the content script
browserApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Check if the message is to fetch a video
    if (request.action === 'fetchVideoAsBlob') {
        const videoUrl = `https://drive.google.com/uc?export=view&id=${request.fileId}`;
        
        // Fetch the video from the Google Drive URL
        fetch(videoUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.blob(); // Convert the response to a blob
            })
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob); // Create a temporary URL for the blob
                sendResponse({ success: true, blobUrl: blobUrl }); // Send the blob URL back
            })
            .catch(error => {
                console.error("Background script failed to fetch video:", error);
                sendResponse({ success: false, error: error.message });
            });
        
        return true; // Required to indicate that the response will be sent asynchronously
    }
});

