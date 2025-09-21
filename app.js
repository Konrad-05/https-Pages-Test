"use strict";

// DOM Elements
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const folderInput = document.getElementById('folder');
const commentInput = document.getElementById('comment');
const startCameraButton = document.getElementById('start-camera');
const capturePhotoButton = document.getElementById('capture-photo');
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const photoPreview = document.getElementById('photo-preview');
const uploadButton = document.getElementById('upload-button');
const statusDiv = document.getElementById('status');
const snackbar = document.getElementById('snackbar');
const retryCommentButton = document.getElementById('retry-comment');
const loginSection = document.getElementById('login-section');
const uploadSection = document.getElementById('upload-section');
const loginProceedButton = document.getElementById('login-proceed-button');
const commentInputGroup = document.getElementById('comment-input-group');

const thumbnailsContainer = document.getElementById('thumbnails-container');
const deletePhotoButton = document.getElementById('delete-photo-button');

const zoomSlider = document.getElementById('zoom-slider');
const zoomContainer = document.getElementById('zoom-container');

const videoContainer = document.querySelector('.video-container');
const toggleFlashlightButton = document.getElementById('toggle-flashlight');
const focusCameraButton = document.getElementById('focus-camera-button');

const folderList = document.getElementById('folder-list');

let stream = null;
let videoTrack = null;
let lastUploadArgs = null;
let isFlashlightOn = false;

let capturedPhotos = [];
let selectedPhotoId = null;

let storedUsername = '';
let storedPassword = '';
let storedCredentials = '';

const NEXTCLOUD_BASE_URL = 'https://cloud.sincotec.de';
const BASE_UPLOAD_FOLDER = 'Snapshot';

// --- Login Logic ---
async function proceedToUpload() {
    storedUsername = usernameInput.value.trim();
    storedPassword = passwordInput.value;

    if (!storedUsername || !storedPassword) {
        showSnackbar('Benutzername und Passwort sind erforderlich.');
        return;
    }

    storedCredentials = btoa(`${storedUsername}:${storedPassword}`);

    loginProceedButton.disabled = true;
    statusDiv.textContent = 'Versuche anzumelden...';
    showSnackbar('Melde an...');
    console.log('--- Anmeldeversuch ---');
    console.log('Benutzername:', storedUsername);
    console.log('Codierte Zugangsdaten (Base64):', storedCredentials);
    loginSection.style.display = 'none';
    uploadSection.style.display = 'block';
    statusDiv.textContent = 'Anmeldung erfolgreich! Bereit, ein Foto aufzunehmen oder auszuwählen.';
    showSnackbar('Anmeldung erfolgreich!');
    console.log('Anmeldung erfolgreich über WebDAV PROPFIND!');
    await fetchAndPopulateFolders();
    console.log('--- Ende Anmeldeversuch ---');
}

// --- Camera Logic ---
async function startCamera() {
    if (stream) {
        stopCamera();
        startCameraButton.textContent = 'Kamera starten';
        statusDiv.textContent = 'Kamera gestoppt. Bereit zum erneuten Starten.';
        return;
    }

    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' && !location.hostname.includes('ngrok.io')) {
        showSnackbar('Direkter Kamerazugriff erfordert eine sichere Verbindung (HTTPS). Nutze ngrok oder ein lokales HTTPS-Setup.');
        console.warn('getUserMedia needs HTTPS');
        return;
    }
    console.log('Versuche, Kamera zu starten...');
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                facingMode: 'environment',
                width: { ideal: 4096 },
                height: { ideal: 2160 }
            }, 
            audio: false 
        });

        videoElement.srcObject = stream;
        videoContainer.style.display = 'block';
        videoElement.classList.add('visible');
        
        videoTrack = stream.getVideoTracks()[0];
        
        const capabilities = videoTrack.getCapabilities();
        
        // Bedienelemente immer anzeigen, aber je nach Verfügbarkeit deaktivieren
        capturePhotoButton.disabled = false;
        capturePhotoButton.style.display = 'block';
        
        // Überprüfung des Zooms
        zoomContainer.style.display = 'block';
        if (capabilities.zoom) {
            zoomSlider.min = capabilities.zoom.min;
            zoomSlider.max = capabilities.zoom.max;
            zoomSlider.step = capabilities.zoom.step;
            zoomSlider.value = videoTrack.getSettings().zoom || capabilities.zoom.min;
            zoomSlider.disabled = false;
            console.log('Zoom-Funktion ist verfügbar.');
        } else {
            zoomSlider.disabled = true; // Deaktivieren, wenn nicht vorhanden
            console.warn("Die Kamera unterstützt die Zoom-API nicht.");
        }
        
        // Überprüfung der Taschenlampe
        toggleFlashlightButton.style.display = 'block';
        if ('torch' in capabilities) {
            toggleFlashlightButton.disabled = false;
            console.log('Taschenlampen-Funktion ist verfügbar.');
        } else {
            toggleFlashlightButton.disabled = true; // Deaktivieren, wenn nicht vorhanden
            console.warn("Taschenlampen-Funktion wird von dieser Kamera nicht unterstützt.");
        }

        // Überprüfung des Fokus
        focusCameraButton.style.display = 'block';
        if ('focusMode' in capabilities) {
             videoTrack.applyConstraints({
                 advanced: [{ focusMode: 'continuous' }]
             }).catch(e => console.log("Kontinuierlicher Autofokus wird nicht unterstützt."));
             focusCameraButton.disabled = false;
             console.log('Fokus-Funktion ist verfügbar.');
        } else {
             focusCameraButton.disabled = true; // Deaktivieren, wenn nicht vorhanden
             console.warn("Fokus-Funktion wird von dieser Kamera nicht unterstützt.");
        }

        startCameraButton.textContent = 'Kamera stoppen';
        commentInputGroup.style.display = 'none';
        console.log('Kamera erfolgreich gestartet.');
        
        const settings = videoTrack.getSettings();
        console.log(`Tatsächliche Auflösung: ${settings.width}x${settings.height}`);
        showSnackbar(`Kamera aktiv. Auflösung: ${settings.width}x${settings.height}`);
    } catch (err) {
        console.error("Fehler beim Zugriff auf Kamera:", err);
        if (err.name === 'NotAllowedError') {
             statusDiv.textContent = 'Kameraberechtigung verweigert. Bitte erlaube den Kamerazugriff.';
             showSnackbar('Kameraberechtigung verweigert.');
        } else if (err.name === 'NotFoundError') {
             statusDiv.textContent = 'Keine Kamera auf diesem Gerät gefunden.';
             showSnackbar('Keine Kamera gefunden.');
        } else {
             statusDiv.textContent = `Fehler beim Zugriff auf Kamera: ${err.name}`;
             showSnackbar(`Kamera-Fehler: ${err.name}`);
        }
        console.log('Fehler beim Starten der Kamera:', err.name);
        startCameraButton.textContent = 'Kamera starten';
        // Alle Bedienelemente ausblenden bei Fehler
        zoomContainer.style.display = 'none';
        toggleFlashlightButton.style.display = 'none';
        focusCameraButton.style.display = 'none';
    }
}

function stopCamera() {
    if (stream) {
        if (isFlashlightOn && videoTrack && 'torch' in videoTrack.getCapabilities()) {
            videoTrack.applyConstraints({
                advanced: [{ torch: false }]
            }).then(() => {
                isFlashlightOn = false;
                toggleFlashlightButton.textContent = 'Taschenlampe';
            }).catch(console.error);
        }

        stream.getTracks().forEach(track => track.stop());
        stream = null;
        videoTrack = null;
        videoElement.srcObject = null;
        videoContainer.style.display = 'none';
        videoElement.classList.remove('visible');
        capturePhotoButton.disabled = true;
        capturePhotoButton.style.display = 'none';
        zoomSlider.value = 1;
        zoomContainer.style.display = 'none';
        toggleFlashlightButton.disabled = true;
        toggleFlashlightButton.style.display = 'none';
        focusCameraButton.disabled = true;
        focusCameraButton.style.display = 'none';
        console.log('Kamera gestoppt.');
    }
}

function capturePhoto() {
    if (!stream) return;
    
    // NEU: Berechne die idealen Dimensionen für das 2:3 Seitenverhältnis
    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;
    const targetRatio = 2 / 3;

    let captureWidth, captureHeight;
    if (videoWidth / videoHeight > targetRatio) {
        // Video ist breiter als das Zielformat, schneide links und rechts ab
        captureHeight = videoHeight;
        captureWidth = videoHeight * targetRatio;
    } else {
        // Video ist höher als das Zielformat, schneide oben und unten ab
        captureWidth = videoWidth;
        captureHeight = videoWidth / targetRatio;
    }
    
    canvasElement.width = captureWidth;
    canvasElement.height = captureHeight;

    const context = canvasElement.getContext('2d');
    context.drawImage(
        videoElement, 
        (videoWidth - captureWidth) / 2, // Start-X-Koordinate für den Zuschnitt
        (videoHeight - captureHeight) / 2, // Start-Y-Koordinate für den Zuschnitt
        captureWidth, 
        captureHeight, 
        0, 
        0, 
        captureWidth, 
        captureHeight
    );
    
    console.log(`Foto aufgenommen mit festem Format: ${captureWidth}x${captureHeight}.`);

    canvasElement.toBlob(blob => {
        if (blob) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const photoId = Date.now().toString();
                const photoObject = { id: photoId, blob: blob, dataUrl: e.target.result, comment: '' };
                capturedPhotos.push(photoObject);
                addThumbnail(photoObject);
                displayLargePreview(photoId);
                statusDiv.textContent = `Foto ${capturedPhotos.length} aufgenommen.`;
                updateUploadButtonState();
            };
            reader.readAsDataURL(blob);
            console.log('Captured photo converted to Blob.');
        }
    }, 'image/jpeg', 0.9);
}

function setCameraZoom(zoomLevel) {
    if (!videoTrack) {
        console.error("Kein Video-Track verfügbar, um den Zoom zu setzen.");
        return;
    }
    const capabilities = videoTrack.getCapabilities();
    if (capabilities.zoom) {
        const newZoom = Math.min(Math.max(zoomLevel, capabilities.zoom.min), capabilities.zoom.max);
        videoTrack.applyConstraints({
            advanced: [{ zoom: newZoom }]
        }).then(() => {
            console.log(`Zoom auf ${newZoom} gesetzt.`);
        }).catch(e => {
            console.error("Fehler beim Setzen des Zooms:", e);
        });
    } else {
        console.warn("Zoom-Funktion wird von dieser Kamera nicht unterstützt.");
    }
}

async function toggleFlashlight() {
    if (!videoTrack) return;

    try {
        await videoTrack.applyConstraints({
            advanced: [{ torch: !isFlashlightOn }]
        });
        isFlashlightOn = !isFlashlightOn;
        toggleFlashlightButton.textContent = isFlashlightOn ? 'Taschenlampe aus' : 'Taschenlampe an';
        console.log(`Taschenlampe umgeschaltet: ${isFlashlightOn}`);
    } catch (e) {
        console.error("Fehler beim Umschalten der Taschenlampe:", e);
        showSnackbar("Fehler beim Umschalten der Taschenlampe.");
    }
}

function focusCamera() {
    if (!videoTrack) return;

    const capabilities = videoTrack.getCapabilities();
    const settings = videoTrack.getSettings();

    if ('focusMode' in capabilities && capabilities.focusMode.includes('manual')) {
        videoTrack.applyConstraints({
            advanced: [{ focusMode: 'manual', focusDistance: settings.focusDistance }]
        }).then(() => {
            if (capabilities.focusMode.includes('continuous')) {
                videoTrack.applyConstraints({
                    advanced: [{ focusMode: 'continuous' }]
                }).catch(e => console.warn("Wechsel zu kontinuierlichem Autofokus fehlgeschlagen.", e));
            }
        }).catch(e => {
            console.error("Fehler beim manuellen Fokussieren:", e);
        });
    } else if ('focusMode' in capabilities && capabilities.focusMode.includes('single-shot')) {
        videoTrack.applyConstraints({
            advanced: [{ focusMode: 'single-shot' }]
        }).catch(e => console.error("Fehler beim Fokussieren im Single-Shot-Modus:", e));
    } else {
        console.warn("Die Kamera unterstützt keine steuerbaren Fokusmodi.");
    }
}

async function fetchAndPopulateFolders() {
    console.log('--- Versuche, Ordnerliste abzurufen ---');
    const folderUrl = `${NEXTCLOUD_BASE_URL}/remote.php/webdav/${BASE_UPLOAD_FOLDER}/`;

    try {
        const response = await fetch(folderUrl, {
            method: 'PROPFIND',
            headers: {
                'Authorization': `Basic ${storedCredentials}`,
                'Depth': '1',
                'Content-Type': 'application/xml'
            },
            body: `<?xml version="1.0"?>
                   <d:propfind xmlns:d="DAV:">
                     <d:prop>
                       <d:resourcetype/>
                     </d:prop>
                   </d:propfind>`
        });

        if (!response.ok) {
            console.error(`Fehler beim Abrufen der Ordnerliste: ${response.status} ${response.statusText}`);
            showSnackbar(`Fehler beim Laden der Ordnerliste: ${response.statusText}`);
            return;
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");
        const responses = xmlDoc.getElementsByTagNameNS("DAV:", "response");

        folderList.innerHTML = '';

        for (const res of responses) {
            const href = res.getElementsByTagNameNS("DAV:", "href")[0].textContent;
            const resourcetype = res.getElementsByTagNameNS("DAV:", "resourcetype")[0];

            if (resourcetype && resourcetype.getElementsByTagNameNS("DAV:", "collection").length > 0) {
                const folderName = decodeURIComponent(href).split('/').filter(Boolean).pop();
                if (folderName && folderName !== BASE_UPLOAD_FOLDER) {
                    const option = document.createElement('option');
                    option.value = folderName;
                    folderList.appendChild(option);
                }
            }
        }
        console.log('Ordnerliste erfolgreich geladen und befüllt.');
        showSnackbar('Ordnerliste aktualisiert.');

    } catch (error) {
        console.error('Netzwerkfehler beim Abrufen der Ordnerliste:', error);
        showSnackbar('Netzwerkfehler beim Laden der Ordnerliste.');
    }
}


// --- Thumbnail-Management ---
function addThumbnail(photoObject) {
    const placeholderText = thumbnailsContainer.querySelector('p');
    if (placeholderText) {
        thumbnailsContainer.removeChild(placeholderText);
    }

    const thumbnailWrapper = document.createElement('div');
    thumbnailWrapper.classList.add('thumbnail-wrapper');
    thumbnailWrapper.dataset.id = photoObject.id;

    const thumbnailImg = document.createElement('img');
    thumbnailImg.src = photoObject.dataUrl;
    thumbnailImg.alt = `Foto ${photoObject.id}`;

    thumbnailWrapper.appendChild(thumbnailImg);
    
    thumbnailWrapper.onclick = () => {
        if (selectedPhotoId === photoObject.id) {
            clearPreview();
            statusDiv.textContent = 'Großansicht geschlossen.';
        } else {
            displayLargePreview(photoObject.id);
        }
    };
    thumbnailsContainer.appendChild(thumbnailWrapper);
}

function displayLargePreview(photoId) {
    const photoObject = capturedPhotos.find(p => p.id === photoId);
    if (!photoObject) {
        clearPreview();
        return;
    }

    photoPreview.src = photoObject.dataUrl;
    photoPreview.classList.add('visible');
    selectedPhotoId = photoId;

    commentInput.value = photoObject.comment;
    commentInputGroup.style.display = 'block';

    document.querySelectorAll('.thumbnail-wrapper').forEach(wrapper => {
        wrapper.classList.remove('selected');
    });
    const selectedThumbnail = thumbnailsContainer.querySelector(`.thumbnail-wrapper[data-id="${photoId}"]`);
    if (selectedThumbnail) {
        selectedThumbnail.classList.add('selected');
    }

    deletePhotoButton.disabled = false;
    updateUploadButtonState();
    statusDiv.textContent = `Foto ${capturedPhotos.indexOf(photoObject) + 1} ausgewählt. Bereit zum Hochladen oder Löschen.`;
}

function deletePhoto(photoIdToDelete = selectedPhotoId) {
    if (!photoIdToDelete) {
        showSnackbar('Kein Foto zum Löschen ausgewählt.');
        return;
    }

    const initialLength = capturedPhotos.length;
    capturedPhotos = capturedPhotos.filter(p => p.id !== photoIdToDelete);
    console.log(`Foto mit ID ${photoIdToDelete} gelöscht. ${initialLength} -> ${capturedPhotos.length}`);

    const thumbnailToRemove = thumbnailsContainer.querySelector(`.thumbnail-wrapper[data-id="${photoIdToDelete}"]`);
    if (thumbnailToRemove) {
        thumbnailsContainer.removeChild(thumbnailToRemove);
    }

    if (selectedPhotoId === photoIdToDelete) {
        clearPreview();
        statusDiv.textContent = 'Foto gelöscht. Bitte wähle ein anderes Foto oder nimm ein neues auf.';
    }

    if (capturedPhotos.length === 0) {
        thumbnailsContainer.innerHTML = '<p style="color: #999; font-size: 0.9em;">Aufgenommene Fotos erscheinen hier.</p>';
        deletePhotoButton.disabled = true;
        statusDiv.textContent = 'Bereit zum Aufnehmen oder Auswählen eines Fotos.';
    } else if (selectedPhotoId === null && capturedPhotos.length > 0) {
        displayLargePreview(capturedPhotos[0].id);
    }
    updateUploadButtonState();
}

function clearPreview() {
    photoPreview.src = '#';
    photoPreview.classList.remove('visible');
    selectedPhotoId = null;
    commentInput.value = '';
    commentInputGroup.style.display = 'none';
    updateUploadButtonState();
    deletePhotoButton.disabled = true;
    document.querySelectorAll('.thumbnail-wrapper').forEach(wrapper => {
        wrapper.classList.remove('selected');
    });
}

function updateUploadButtonState() {
    if (capturedPhotos.length === 0) {
        uploadButton.textContent = 'Zur Nextcloud';
        uploadButton.style.backgroundColor = '#007bff';
        uploadButton.disabled = false;
        uploadButton.removeEventListener('click', uploadPhoto);
        uploadButton.addEventListener('click', navigateToNextcloud);
    } else {
        uploadButton.textContent = 'Alle Fotos hochladen';
        uploadButton.style.backgroundColor = '#ffc107';
        uploadButton.disabled = false;
        uploadButton.removeEventListener('click', navigateToNextcloud);
        uploadButton.addEventListener('click', uploadPhoto);
    }
}

function navigateToNextcloud() {
    window.open(NEXTCLOUD_BASE_URL, '_blank');
}

function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-z0-9_\-\.]/gi, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
}

// --- XML Parsing Helper ---
function parseFileId(xmlString) {
    console.log('Attempting to parse XML for file ID:', xmlString);
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
        const fileIdNode = xmlDoc.querySelector("*[local-name()='fileid']");
        if (fileIdNode) {
            console.log('Found fileid using local-name:', fileIdNode.textContent);
            return fileIdNode.textContent;
        }
        const fileIdElements = xmlDoc.getElementsByTagNameNS("http://owncloud.org/ns", "fileid");
        if (fileIdElements.length > 0) {
            console.log('Found fileid using NS (owncloud.org/ns):', fileIdElements[0].textContent);
            return fileIdElements[0].textContent;
        }
         const genericFileId = xmlDoc.getElementsByTagName("oc:fileid");
         if(genericFileId.length > 0) {
             console.log('Found fileid using generic tag (oc:fileid):', genericFileId[0].textContent);
             return genericFileId[0].textContent;
         }
        console.error("Could not find oc:fileid in PROPFIND response:", xmlString);
        return null;
    } catch (e) {
        console.error("Error parsing XML:", e, xmlString);
        return null;
    }
}

// --- Create Folder (MKCOL) ---
async function createFolder(fullPathSegments, credentials) {
    console.log('--- Attempting Folder Creation ---');
    console.log('Full Path Segments:', fullPathSegments);
    let currentPath = '';
    for (const segment of fullPathSegments) {
        if (!segment || segment === '.') continue;

        currentPath += encodeURIComponent(segment) + '/';

        const folderUrl = `${NEXTCLOUD_BASE_URL}/remote.php/webdav/${currentPath}`;
        console.log(`Attempting to create folder: ${folderUrl}`);

        try {
            const response = await fetch(folderUrl, {
                method: 'MKCOL',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                },
            });

            console.log(`MKCOL Response for ${currentPath} HTTP Status:`, response.status, response.statusText);
            
            if (response.ok || response.status === 405) {
                console.log(`Folder ${currentPath} is ready. Status: ${response.status}.`);
            } else {
                const errorText = await response.text();
                console.error(`Failed to create folder ${currentPath}: ${response.status} ${response.statusText}`, errorText);
                console.log('MKCOL Response Body (Error Text):', errorText);
                showSnackbar(`Fehler beim Erstellen des Ordners: ${response.statusText}. Pfad prüfen.`, false);
                return false;
            }
        } catch (error) {
            console.error(`Netzwerkfehler beim Erstellen des Ordners ${currentPath}:`, error);
            showSnackbar('Netzwerkfehler beim Erstellen des Ordners. Konnektivität prüfen.', false);
            return false;
        }
    }
    console.log('--- Ordnererstellung abgeschlossen ---');
    return true;
}

/**
 * Checks if a file exists at a given path.
 * @param {string} fileUrl The full URL to the file.
 * @param {string} credentials Base64 encoded credentials.
 * @returns {Promise<boolean>} True if the file exists and is accessible, false otherwise.
 */
async function checkIfFileExists(fileUrl, credentials) {
    try {
        const response = await fetch(fileUrl, {
            method: 'HEAD',
            headers: {
                'Authorization': `Basic ${credentials}`,
            },
        });
        return response.ok; 
    } catch (error) {
        console.error(`Error checking file existence for ${fileUrl}:`, error);
        return false;
    }
}

// --- Upload Logic ---
async function uploadPhoto() {
    if (capturedPhotos.length === 0) {
        showSnackbar('Keine Fotos zum Hochladen ausgewählt.');
        return;
    }

    const credentials = storedCredentials;
    let subfolder = folderInput.value.trim();
    if (subfolder.startsWith('/')) { 
        subfolder = subfolder.substring(1); 
    }
    if (subfolder.endsWith('/')) {
        subfolder = subfolder.slice(0, -1);
    }

    if (!credentials) {
        showSnackbar('Anmeldedaten fehlen. Bitte aktualisieren.');
        return;
    }

    uploadButton.disabled = true;
    deletePhotoButton.disabled = true; 
    retryCommentButton.style.display = 'none';
    commentInputGroup.style.display = 'none';
    console.log('--- Start des Datei-Upload-Prozesses ---');

    let fullUploadPathSegments = [BASE_UPLOAD_FOLDER];
    if (subfolder) {
        fullUploadPathSegments = fullUploadPathSegments.concat(subfolder.split('/').filter(s => s.length > 0));
    }
    const baseFolderUrl = `${NEXTCLOUD_BASE_URL}/remote.php/webdav/${fullUploadPathSegments.map(encodeURIComponent).join('/')}/`;
    console.log('Basisordner URL:', baseFolderUrl);

    statusDiv.textContent = 'Ordnerstruktur wird erstellt...';
    const folderCreationSuccess = await createFolder(fullUploadPathSegments, credentials);
    if (!folderCreationSuccess) {
        statusDiv.textContent = 'Vorbereitung des Ordners fehlgeschlagen. Upload abgebrochen.';
        updateUploadButtonState();
        deletePhotoButton.disabled = false; 
        if (selectedPhotoId) commentInputGroup.style.display = 'block';
        console.log('Ordnererstellung fehlgeschlagen, Upload abgebrochen.');
        return;
    }

    let photosToUpload = [...capturedPhotos]; 
    let uploadedCount = 0;
    const totalPhotos = photosToUpload.length;

    for (let i = 0; i < photosToUpload.length; i++) {
        const photoObject = photosToUpload[i];
        const blob = photoObject.blob;
        const photoComment = photoObject.comment.trim();

        statusDiv.textContent = `Foto ${i + 1} von ${totalPhotos} wird hochgeladen...`;

        let baseFilename;
        if (photoComment) {
            baseFilename = sanitizeFilename(photoComment);
        } else {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            baseFilename = `${timestamp}-${photoObject.id}`;
        }
        
        let filename = `${baseFilename}.jpg`;
        let counter = 0;
        let uploadUrl;

        do {
            const currentAttemptFilename = counter === 0 ? `${baseFilename}.jpg` : `${baseFilename}_${counter}.jpg`;
            uploadUrl = `${baseFolderUrl}${encodeURIComponent(currentAttemptFilename)}`;
            
            const fileExists = await checkIfFileExists(uploadUrl, credentials);
            if (!fileExists) {
                filename = currentAttemptFilename;
                break;
            }
            counter++;
        } while (true);

        console.log(`Uploading file (${i + 1}/${totalPhotos}):`, uploadUrl);
        console.log("Dateiname:", filename);

        try {
            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': blob.type || 'image/jpeg',
                },
                body: blob
            });

            console.log(`Upload Antwort für Foto ${i + 1}:`, response.status, response.statusText);

            if (response.ok) {
                uploadedCount++;
                console.log(`Foto ${i + 1} erfolgreich hochgeladen.`);
                deletePhoto(photoObject.id); 
                
                if (photoComment) {
                    statusDiv.textContent = `Foto ${i + 1} erfolgreich. Kommentar wird hinzugefügt...`;
                    await getFileIdAndPostComment(uploadUrl, photoComment, credentials);
                }

            } else {
                const errorText = await response.text();
                console.log(`Upload Antwort Body für Foto ${i + 1} (Fehler):`, errorText);
                statusDiv.textContent = `Upload für Foto ${i + 1} fehlgeschlagen: ${response.status} ${response.statusText}.`;
                showSnackbar(`Upload-Fehler für Foto ${i + 1}: ${response.status} ${errorText || response.statusText}`);
            }
        } catch (error) {
            console.error(`Upload Netzwerkfehler für Foto ${i + 1}:`, error);
            statusDiv.textContent = `Upload für Foto ${i + 1} fehlgeschlagen: Netzwerkfehler.`;
            showSnackbar(`Upload-Fehler für Foto ${i + 1}: Netzwerkfehler oder CORS-Problem.`);
        }
    }

    statusDiv.textContent = `Upload-Vorgang abgeschlossen. ${uploadedCount} von ${totalPhotos} Fotos erfolgreich hochgeladen.`;
    showSnackbar(`Upload abgeschlossen! ${uploadedCount} von ${totalPhotos} Fotos hochgeladen.`);
    commentInput.value = '';
    lastUploadArgs = null;

    if (capturedPhotos.length > 0) {
        updateUploadButtonState();
        deletePhotoButton.disabled = false;
        displayLargePreview(capturedPhotos[0].id);
    } else {
        updateUploadButtonState();
        deletePhotoButton.disabled = true;
        clearPreview();
    }
    console.log('--- Ende des Datei-Upload-Prozesses ---');
}

async function getFileIdAndPostComment(fileUrl, comment, credentials) {
    console.log('--- Versuche, Datei-ID für Kommentar zu erhalten ---');
    console.log('PROPFIND URL:', fileUrl);
    try {
        const propfindResponse = await fetch(fileUrl, {
            method: 'PROPFIND',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Depth': '0',
                'Content-Type': 'application/xml'
            },
            body: `<?xml version="1.0"?>
                   <d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
                     <d:prop>
                       <oc:fileid/>
                     </d:prop>
                   </d:propfind>`
        });

        console.log('PROPFIND Antwort HTTP Status:', propfindResponse.status, propfindResponse.statusText);

        if (!propfindResponse.ok) {
            const errorText = await propfindResponse.text();
            console.error(`PROPFIND fehlgeschlagen: ${propfindResponse.status}`, errorText);
            console.log('PROPFIND Antwort Body (Fehlertext):', errorText);
            showSnackbar(`Fehler beim Abrufen der Dateiinfo für Kommentar: ${propfindResponse.status}`, true);
            console.log('Fehler beim Abrufen der Datei-ID für Kommentar.');
            return;
        }

        const xmlText = await propfindResponse.text();
        console.log('PROPFIND Antwort Body (XML):', xmlText);

        const fileId = parseFileId(xmlText);
        if (fileId) {
            await postComment(fileId, comment, credentials);
        } else {
            showSnackbar('Fehler beim Parsen der Datei-ID für Kommentar.', true);
            console.log('Fehler beim Parsen der Datei-ID aus XML.');
        }

    } catch (error) {
        console.error('Fehler während PROPFIND:', error);
        showSnackbar('Netzwerkfehler beim Abrufen der Dateiinfo für Kommentar.', true);
        console.log('Netzwerkfehler während PROPFIND.');
    }
}

async function postComment(fileId, comment, credentials) {
    const commentUrl = `${NEXTCLOUD_BASE_URL}/remote.php/dav/comments/files/${fileId}`;
    const commentPayload = JSON.stringify({
        verb: "comment",
        message: comment
    });
    console.log('--- Versuche, Kommentar zu posten ---');
    console.log('Kommentar-URL:', commentUrl);
    console.log('Kommentar-Payload:', commentPayload);

    try {
        const commentResponse = await fetch(commentUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            body: commentPayload
        });

        console.log('Kommentar-Post Antwort HTTP Status:', commentResponse.status, commentResponse.statusText);

        if (commentResponse.ok) {
            showSnackbar('Kommentar erfolgreich hinzugefügt!');
            lastUploadArgs = null;
            console.log('Kommentar erfolgreich gepostet!');
        } else {
            const errorText = await commentResponse.text();
            console.error(`Kommentar-POST fehlgeschlagen: ${commentResponse.status}`, errorText);
            console.log('Kommentar-Post Antwort Body (Fehlertext):', errorText);
            showSnackbar(`Kommentar konnte nicht hinzugefügt werden: ${commentResponse.status}`, true);
            lastUploadArgs = { fileId: fileId, comment: comment, credentials: credentials };
            console.log('Kommentar konnte nicht gepostet werden.');
        }
    } catch (error) {
        console.error('Fehler beim Posten des Kommentars:', error);
        showSnackbar('Netzwerkfehler beim Posten des Kommentars.', true);
        lastUploadArgs = { fileId: fileId, comment: comment, credentials: credentials };
        console.log('Netwerkfehler beim Posten des Kommentars.');
    }
}

// --- Snackbar ---
function showSnackbar(message, showRetry = false) {
    snackbar.textContent = message;
    if (showRetry) {
        retryCommentButton.style.display = 'inline-block';
    } else {
        retryCommentButton.style.display = 'none';
    }
    snackbar.className = "show";
    clearTimeout(snackbar.timeoutId); 
    snackbar.timeoutId = setTimeout(() => {
        snackbar.className = snackbar.className.replace("show", "");
        retryCommentButton.style.display = 'none';
     }, 3000);
     console.log('Snackbar angezeigt:', message);
}

// --- Retry Logic ---
async function handleRetryComment() {
    if (!lastUploadArgs) {
        console.warn("Wiederholung unangemessen aufgerufen");
        return;
    }

    showSnackbar('Kommentar erneut versuchen...');
    retryCommentButton.disabled = true;
    console.log('--- Kommentar erneut versuchen ---');

    const { comment, credentials, fileId, fileUrl } = lastUploadArgs;

    if (fileId) { 
        postComment(fileId, comment, credentials);
    } else if (fileUrl) { 
        getFileIdAndPostComment(fileUrl, comment, credentials);
    } else {
        showSnackbar('Kein Kommentar oder Dateiinfo zum erneuten Versuch vorhanden.', false);
        retryCommentButton.disabled = false;
        console.log('Kein gültiger Kommentar oder Dateiinfo zum erneuten Versuch.');
    }
    console.log('--- Ende Kommentar erneut versuchen ---');
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loginProceedButton.addEventListener('click', proceedToUpload);
    startCameraButton.addEventListener('click', startCamera);
    capturePhotoButton.addEventListener('click', capturePhoto);
    toggleFlashlightButton.addEventListener('click', toggleFlashlight);
    focusCameraButton.addEventListener('click', focusCamera);
    
    videoElement.addEventListener('click', focusCamera);
    
    updateUploadButtonState();

    deletePhotoButton.addEventListener('click', () => deletePhoto());
    retryCommentButton.addEventListener('click', handleRetryComment);

    commentInput.addEventListener('input', () => {
        if (selectedPhotoId) {
            const photoObject = capturedPhotos.find(p => p.id === selectedPhotoId);
            if (photoObject) {
                photoObject.comment = commentInput.value;
                console.log(`Kommentar für Foto ${selectedPhotoId} aktualisiert auf: "${photoObject.comment}"`);
            }
        }
    });
    
    zoomSlider.addEventListener('input', () => {
        setCameraZoom(zoomSlider.value);
    });

    // Initial state
    uploadSection.style.display = 'none';
    clearPreview();
    deletePhotoButton.disabled = true;
    commentInputGroup.style.display = 'none';
    zoomContainer.style.display = 'none';
    videoContainer.style.display = 'none';
    toggleFlashlightButton.disabled = true;
    toggleFlashlightButton.style.display = 'none';
    focusCameraButton.disabled = true;
    focusCameraButton.style.display = 'none';
    console.log('App initialisiert.');
});