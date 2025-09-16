const browserApi = typeof browser !== 'undefined' ? browser : chrome;

let signQueue = [];
let isDisplaying = false;
let overlay = null;
let signVideo = null;
let debugText = null;
let mutationObserver = null;
let showDebugInfo = false;
let dictionary = {};
let isOverlayEnabled = true;
const BASE_PATH_IN_REPO = "Signergy/Signs";

let captionDebounceTimer = null;
let transcriptHistory = "";

function initializeOverlay() {
    if (document.getElementById('sign-language-overlay')) return;
    if (!document.body) return;

    // Mobile-aware adjustments
    const isMobile = window.innerWidth < 768;
    const overlaySize = isMobile ? '150px' : '200px';
    const initialTop = `calc(100vh - ${isMobile ? 230 : 280}px)`;
    const initialLeft = `calc(100vw - ${isMobile ? 170 : 220}px)`;

    overlay = document.createElement('div');
    overlay.id = 'sign-language-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = initialTop;
    overlay.style.left = initialLeft;
    overlay.style.width = overlaySize;
    overlay.style.height = overlaySize;
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
    
    signVideo = document.createElement('video');
    signVideo.style.display = 'none';
    signVideo.style.maxWidth = '100%';
    signVideo.style.maxHeight = '100%';
    signVideo.autoplay = true;
    signVideo.muted = true;
    signVideo.loop = false;
    signVideo.playbackRate = 2.5;
    signVideo.playsInline = true; // Essential for mobile browsers
    overlay.appendChild(signVideo);

    let isDragging = false;
    let offsetX, offsetY;
    
    // Combined touch and mouse event handlers
    const dragStart = (e) => {
        isDragging = true;
        const event = e.touches ? e.touches[0] : e;
        offsetX = event.clientX - overlay.getBoundingClientRect().left;
        offsetY = event.clientY - overlay.getBoundingClientRect().top;
        e.preventDefault();
    };
    const dragMove = (e) => {
        if (!isDragging) return;
        const event = e.touches ? e.touches[0] : e;
        overlay.style.left = `${event.clientX - offsetX}px`;
        overlay.style.top = `${event.clientY - offsetY}px`;
    };
    const dragEnd = () => { isDragging = false; };

    overlay.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
    overlay.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);
}

function processNewText(text) {
    const cleanedText = text.toLowerCase().replace(/[^\w\s']/g, '').trim();
    if (!cleanedText) return;

    let matchedSentenceKey = null;

    if (dictionary.sentences) {
        for (const sentenceKey in dictionary.sentences) {
            if (cleanedText.includes(sentenceKey)) {
                if (!matchedSentenceKey || sentenceKey.length > matchedSentenceKey.length) {
                    matchedSentenceKey = sentenceKey;
                }
            }
        }
    }

    if (matchedSentenceKey) {
        addSignToQueue(matchedSentenceKey, 'sentences');
    } else {
        const words = cleanedText.split(/\s+/);
        words.forEach(word => {
            let wordFound = false;
            if (dictionary.words && dictionary.words[word]) {
                addSignToQueue(word, 'words');
                wordFound = true;
            }
            if (!wordFound && dictionary.letters) {
                for (const letter of word) {
                    if (dictionary.letters[letter]) {
                        addSignToQueue(letter, 'letters');
                    }
                }
            }
        });
    }

    if (!isDisplaying) {
        displayNextSign();
    }
}

function addSignToQueue(key, category) {
    const fileName = dictionary[category]?.[key];
    if (fileName) {
        const url = `https://raw.githubusercontent.com/${dictionary._repo_user}/${dictionary._repo_name}/main/${BASE_PATH_IN_REPO}/${category}/${fileName}`;
        signQueue.push({ key, fileName, url, category });
    }
}

function displayNextSign() {
    if (!overlay || !isOverlayEnabled) {
        isDisplaying = false;
        return;
    }

    if (signQueue.length === 0) {
        isDisplaying = false;
        setTimeout(() => {
            if (signQueue.length === 0 && overlay) {
                signVideo.style.display = 'none';
                debugText.style.display = 'none';
                overlay.querySelector('p').style.display = 'block';
                overlay.querySelector('p').textContent = 'Waiting for captions...';
            }
        }, 2000);
        return;
    }

    isDisplaying = true;
    const sign = signQueue.shift();
    
    overlay.querySelector('p').style.display = 'none';
    if (!signVideo.paused) signVideo.pause();

    signVideo.style.display = 'block';
    if (showDebugInfo) {
        debugText.textContent = sign.fileName;
        debugText.style.display = 'block';
    }

    const onVideoReady = () => {
        signVideo.play().catch(e => console.error("Video play failed:", e));
        const durationInSeconds = signVideo.duration / signVideo.playbackRate;

        if (sign.category === 'letters') {
            setTimeout(displayNextSign, (durationInSeconds * 1000) * 0.5); 
        } else {
            setTimeout(displayNextSign, (durationInSeconds * 1000) + 200);
        }
    };
    const onVideoError = () => {
        console.error(`Failed to load video: ${sign.fileName}`);
        displayNextSign();
    };

    signVideo.addEventListener('loadeddata', onVideoReady, { once: true });
    signVideo.addEventListener('error', onVideoError, { once: true });
    signVideo.src = sign.url;
}

function startObserver() {
    let captionContainer = null;
    let site = '';
    const hostname = window.location.hostname;

    if (hostname === 'www.youtube.com') {
        captionContainer = document.querySelector('.ytp-caption-window-container');
        site = 'youtube-desktop';
    } else if (hostname === 'm.youtube.com') {
        const mobileSelectors = ['.ytm-timed-text-container', '.caption-window', '.player-timed-text-container'];
        for(const selector of mobileSelectors) {
            captionContainer = document.querySelector(selector);
            if (captionContainer) {
                site = 'youtube-mobile';
                break;
            }
        }
    } else if (hostname === 'meet.google.com') {
        const meetSelectors = ['[jsname="dsdcsc"]', '.a4cQT', '.adErb', '.ADivge[data-is-captions]'];
        for (const selector of meetSelectors) {
            captionContainer = document.querySelector(selector);
            if (captionContainer) { site = 'meet'; break; }
        }
    }
    
    if (captionContainer) {
        if (overlay) overlay.querySelector('p').textContent = 'Observer active!';
        
        mutationObserver = new MutationObserver(() => {
            clearTimeout(captionDebounceTimer);
            captionDebounceTimer = setTimeout(() => {
                let fullTranscript = '';
                if (site === 'meet') {
                    const captionElements = captionContainer.querySelectorAll('.ygicle.VbkSUe');
                    captionElements.forEach(el => { fullTranscript += el.textContent + ' '; });
                    fullTranscript = fullTranscript.replace(/\s+/g, ' ').trim();
                } else { // Handles both youtube-desktop and youtube-mobile
                    fullTranscript = captionContainer.textContent.replace(/\s+/g, ' ').trim();
                }

                if (fullTranscript === transcriptHistory) return;

                let newText = '';
                if (fullTranscript.startsWith(transcriptHistory)) {
                    newText = fullTranscript.substring(transcriptHistory.length);
                } else {
                    newText = fullTranscript;
                }
                
                if (newText.trim()) {
                    processNewText(newText);
                }
                
                transcriptHistory = fullTranscript;

            }, 750); 
        });
        mutationObserver.observe(captionContainer, { childList: true, subtree: true, characterData: true });
        return true;
    }
    return false;
}

async function main() {
    const data = await browserApi.storage.sync.get(['isOverlayEnabled', 'showDebug']);
    isOverlayEnabled = typeof data.isOverlayEnabled === 'undefined' ? true : data.isOverlayEnabled;
    showDebugInfo = !!data.showDebug;

    if (!isOverlayEnabled) {
        return;
    }

    initializeOverlay();

    try {
        const dictionaryUrl = browserApi.runtime.getURL('dictionary.json');
        const response = await fetch(dictionaryUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
    } else if (request.action === 'enableOverlay') {
        isOverlayEnabled = true;
        if (!overlay) main(); 
        else overlay.style.display = 'flex';
    } else if (request.action === 'disableOverlay') {
        isOverlayEnabled = false;
        if (overlay) overlay.style.display = 'none';
    } else if (request.action === 'reloadOverlay') {
        if (overlay) overlay.remove();
        overlay = null;
        if (mutationObserver) mutationObserver.disconnect();
        mutationObserver = null;
        transcriptHistory = ""; // Reset history on reload
        main();
    }
});

main();

