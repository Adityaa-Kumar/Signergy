const browserApi = typeof browser !== 'undefined' ? browser : chrome;

let signQueue = [];
let isDisplaying = false;
let overlay = null;
let signImage = null;
let signVideo = null;
let debugText = null;
let mutationObserver = null;
let showDebugInfo = false;
let dictionary = {};

function initializeOverlay() {
    if (document.getElementById('sign-language-overlay')) return; 
    if (!document.body) {
        console.error("Signergy: document.body not available.");
        return;
    }

    overlay = document.createElement('div');
    overlay.id = 'sign-language-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = 'calc(100vh - 280px)';
    overlay.style.left = 'calc(100vw - 220px)';
    overlay.style.width = '200px';
    overlay.style.height = '200px';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.border = '2px solid #a78bfa';
    overlay.style.borderRadius = '10px';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.color = 'white';
    overlay.style.fontFamily = 'Arial, sans-serif';
    overlay.style.cursor = 'move';
    overlay.innerHTML = '<p>Loading Dictionary...</p>';
    document.body.appendChild(overlay);

    debugText = document.createElement('p');
    debugText.style.position = 'absolute';
    debugText.style.bottom = '5px';
    debugText.style.left = '5px';
    debugText.style.fontSize = '10px';
    debugText.style.color = '#cccccc';
    debugText.style.margin = '0';
    debugText.style.fontFamily = 'monospace';
    debugText.style.display = 'none';
    overlay.appendChild(debugText);
    
    signImage = document.createElement('img');
    signImage.style.display = 'none';
    signImage.style.maxWidth = '100%';
    signImage.style.maxHeight = '100%';
    overlay.appendChild(signImage);

    signVideo = document.createElement('video');
    signVideo.style.display = 'none';
    signVideo.style.maxWidth = '100%';
    signVideo.style.maxHeight = '100%';
    signVideo.autoplay = true;
    signVideo.muted = true;
    signVideo.loop = false;
    signVideo.playbackRate = 2.5;
    overlay.appendChild(signVideo);

    let isDragging = false;
    let offsetX, offsetY;
    overlay.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - overlay.getBoundingClientRect().left;
        offsetY = e.clientY - overlay.getBoundingClientRect().top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        overlay.style.left = `${e.clientX - offsetX}px`;
        overlay.style.top = `${e.clientY - offsetY}px`;
    });
    document.addEventListener('mouseup', () => { isDragging = false; });
}

function processSubtitleText(text) {
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    words.forEach(word => {
        if (word) signQueue.push(word);
    });
    if (!isDisplaying) {
        displayNextSign();
    }
}

function displayNextSign() {
    if (!overlay) return;

    if (signQueue.length === 0) {
        isDisplaying = false;
        setTimeout(() => {
            if (signQueue.length === 0 && overlay) {
                signImage.style.display = 'none';
                signVideo.style.display = 'none';
                debugText.style.display = 'none';
                overlay.querySelector('p').style.display = 'block';
                overlay.querySelector('p').textContent = 'Waiting for captions...';
            }
        }, 2000);
        return;
    }

    isDisplaying = true;
    const word = signQueue.shift();
    displaySignForWord(word);
}

function displaySignForWord(word) {
    if (!overlay) return;

    const fileId = dictionary[word];
    if (!fileId) {
        displayNextSign();
        return;
    }
    
    // Ask the background script to fetch the video as a secure blob
    browserApi.runtime.sendMessage({ action: 'fetchVideoAsBlob', fileId: fileId }, (response) => {
        if (response && response.success) {
            const blobUrl = response.blobUrl;

            overlay.querySelector('p').style.display = 'none';
            signImage.style.display = 'none';
            if (!signVideo.paused) signVideo.pause();

            signVideo.style.display = 'block';
            if (showDebugInfo) {
                debugText.textContent = `${word}.mp4 (Blob)`;
                debugText.style.display = 'block';
            }

            const onVideoReady = () => {
                // Revoke the old blob URL to prevent memory leaks, if it exists
                if (signVideo.currentBlobUrl) {
                    URL.revokeObjectURL(signVideo.currentBlobUrl);
                }
                signVideo.currentBlobUrl = blobUrl; // Store the new blob URL

                signVideo.play().catch(e => console.error("Video play failed:", e));
                const durationInSeconds = signVideo.duration / signVideo.playbackRate;
                setTimeout(displayNextSign, (durationInSeconds * 1000) + 200);
            };

            const onVideoError = () => {
                console.error(`Failed to load video blob for word: ${word}`);
                displayNextSign();
            };

            signVideo.addEventListener('loadeddata', onVideoReady, { once: true });
            signVideo.addEventListener('error', onVideoError, { once: true });
            signVideo.src = blobUrl;
        } else {
            console.error(`Background script failed to fetch blob for word: ${word}`, response ? response.error : "No response");
            displayNextSign();
        }
    });
}


function startObserver() {
    let captionContainer = null;
    let site = '';

    if (window.location.hostname === 'www.youtube.com') {
        captionContainer = document.querySelector('.ytp-caption-window-container');
        site = 'youtube';
    } else if (window.location.hostname === 'meet.google.com') {
        const meetSelectors = ['[jsname="dsdcsc"]', '.a4cQT', '.adErb', '.ADivge[data-is-captions]'];
        for (const selector of meetSelectors) {
            captionContainer = document.querySelector(selector);
            if (captionContainer) {
                site = 'meet';
                break;
            }
        }
    }

    if (captionContainer) {
        if (overlay) overlay.querySelector('p').textContent = 'Observer active!';
        let meetTranscriptHistory = '';

        mutationObserver = new MutationObserver((mutations) => {
             if (site === 'youtube') {
                let newText = '';
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        if (node.classList.contains('ytp-caption-segment')) {
                            newText += node.textContent + ' ';
                        } else {
                            const segments = node.querySelectorAll('.ytp-caption-segment');
                            segments.forEach(segment => newText += segment.textContent + ' ');
                        }
                    });
                });
                if (newText.trim()) processSubtitleText(newText);
            } else if (site === 'meet') {
                const captionElements = captionContainer.querySelectorAll('.ygicle.VbkSUe');
                let fullTranscript = '';
                captionElements.forEach(el => { fullTranscript += el.textContent; });
                fullTranscript = fullTranscript.replace(/\s+/g, ' ').trim();

                if (fullTranscript === meetTranscriptHistory) return;

                let newText = '';
                if (fullTranscript.startsWith(meetTranscriptHistory)) {
                    newText = fullTranscript.substring(meetTranscriptHistory.length);
                } else {
                    const oldWords = meetTranscriptHistory.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w);
                    const newWords = fullTranscript.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w);
                    let firstDiffIndex = 0;
                    while(oldWords[firstDiffIndex] && newWords[firstDiffIndex] && oldWords[firstDiffIndex] === newWords[firstDiffIndex]) {
                        firstDiffIndex++;
                    }
                    newText = newWords.slice(firstDiffIndex).join(' ');
                }

                if (newText.trim()) processSubtitleText(newText);
                meetTranscriptHistory = fullTranscript;
            }
        });

        mutationObserver.observe(captionContainer, { childList: true, subtree: true, characterData: true });
        return true;
    }
    return false;
}

async function main() {
    initializeOverlay();

    browserApi.storage.sync.get('showDebug', (data) => {
        showDebugInfo = !!data.showDebug;
    });

    try {
        const dictionaryUrl = browserApi.runtime.getURL('dictionary.json');
        const response = await fetch(dictionaryUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        dictionary = await response.json();
        
        if (overlay) overlay.querySelector('p').textContent = 'Waiting for captions...';
        
        const observerInterval = setInterval(() => {
            if (startObserver()) {
                clearInterval(observerInterval);
            }
        }, 1000);

    } catch (error) {
        console.error("Failed to load dictionary:", error);
        if (overlay) overlay.querySelector('p').textContent = 'Error: dictionary missing';
    }
}

browserApi.runtime.onMessage.addListener((request) => {
    if (request.action === 'toggleDebug') {
        showDebugInfo = !!request.showDebug;
    }
});

main();

