// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// DOM Elements
const pdfInput = document.getElementById('pdfInput');
const uploadArea = document.getElementById('uploadArea');
const convertBtn = document.getElementById('convertBtn');
const progressArea = document.getElementById('progressArea');
const resultsArea = document.getElementById('resultsArea');
const zipCheckbox = document.getElementById('zipDownload');

let selectedFiles = [];
let currentFormat = 'jpg';

// Format selection
document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFormat = btn.dataset.format;
    });
});

// Upload handlers
uploadArea.addEventListener('click', () => pdfInput.click());

pdfInput.addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
        showToast(`✅ ${selectedFiles.length} PDF file(s) selected`, 'success');
        updateFileList();
    }
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length) {
        selectedFiles = files;
        showToast(`✅ ${files.length} PDF file(s) loaded`, 'success');
        updateFileList();
    } else {
        showToast('❌ Please drop valid PDF files', 'error');
    }
});

function updateFileList() {
    const uploadContent = uploadArea.querySelector('.upload-content');
    if (selectedFiles.length === 1) {
        uploadContent.innerHTML = `
            <i class="fas fa-file-pdf"></i>
            <h3>${selectedFiles[0].name}</h3>
            <p>${(selectedFiles[0].size / 1024 / 1024).toFixed(2)} MB · Click to change</p>
        `;
    } else if (selectedFiles.length > 1) {
        uploadContent.innerHTML = `
            <i class="fas fa-files"></i>
            <h3>${selectedFiles.length} PDF files selected</h3>
            <p>Total: ${(selectedFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB</p>
        `;
    }
}

// Smart crop - removes white borders without resizing
function smartCrop(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    let top = height, bottom = 0, left = width, right = 0;
    const threshold = 245;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            
            if (r < threshold || g < threshold || b < threshold) {
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
                left = Math.min(left, x);
                right = Math.max(right, x);
            }
        }
    }
    
    if (top >= bottom || left >= right) return canvas;
    
    const padding = 2;
    const cropX = Math.max(0, left - padding);
    const cropY = Math.max(0, top - padding);
    const cropW = Math.min(width - cropX, (right - left) + (padding * 2));
    const cropH = Math.min(height - cropY, (bottom - top) + (padding * 2));
    
    const cropped = document.createElement('canvas');
    cropped.width = cropW;
    cropped.height = cropH;
    cropped.getContext('2d').drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    
    return cropped;
}

// Convert button
convertBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        showToast('❌ Please select PDF files first', 'error');
        return;
    }
    
    convertBtn.disabled = true;
    progressArea.style.display = 'block';
    resultsArea.innerHTML = '';
    
    const allImages = [];
    const shouldCrop = document.getElementById('autoCrop')?.checked ?? true;
    
    for (let fIndex = 0; fIndex < selectedFiles.length; fIndex++) {
        const pdfFile = selectedFiles[fIndex];
        updateProgress(0, `Processing ${pdfFile.name} (${fIndex + 1}/${selectedFiles.length})`);
        
        try {
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdf.numPages;
            
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                updateProgress((pageNum / numPages) * 100, `Page ${pageNum} of ${numPages}`);
                
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({
                    canvasContext: context,
                    viewport: viewport,
                    intent: 'print'
                }).promise;
                
                let finalCanvas = shouldCrop ? smartCrop(canvas) : canvas;
                
                let mimeType, imageData;
                switch(currentFormat) {
                    case 'png':
                        mimeType = 'png';
                        imageData = finalCanvas.toDataURL('image/png');
                        break;
                    case 'webp':
                        mimeType = 'webp';
                        imageData = finalCanvas.toDataURL('image/webp', 0.95);
                        break;
                    case 'bmp':
                        mimeType = 'bmp';
                        imageData = finalCanvas.toDataURL('image/bmp');
                        break;
                    case 'tiff':
                        mimeType = 'tiff';
                        imageData = finalCanvas.toDataURL('image/tiff');
                        break;
                    default:
                        mimeType = 'jpg';
                        imageData = finalCanvas.toDataURL('image/jpeg', 0.95);
                }
                
                allImages.push({
                    data: imageData,
                    filename: `${pdfFile.name.replace('.pdf', '')}_page${pageNum}.${mimeType}`,
                    width: finalCanvas.width,
                    height: finalCanvas.height
                });
            }
            
            showToast(`✅ Converted ${pdfFile.name}`, 'success');
        } catch (error) {
            showToast(`❌ Error: ${error.message}`, 'error');
        }
    }
    
    displayResults(allImages);
    progressArea.style.display = 'none';
    convertBtn.disabled = false;
});

function displayResults(images) {
    if (images.length === 0) {
        resultsArea.innerHTML = '<div style="text-align:center;padding:2rem;color:#64748b;">No images converted. Please try again.</div>';
        return;
    }
    
    let html = `<div class="results-header">
        <h3><i class="fas fa-images"></i> ${images.length} image(s) converted</h3>`;
    
    if (zipCheckbox.checked && images.length > 0) {
        html += `<button id="zipDownloadBtn" class="zip-btn"><i class="fas fa-download"></i> Download All (ZIP)</button>`;
    }
    html += `</div><div class="images-grid" id="imagesGrid"></div>`;
    
    resultsArea.innerHTML = html;
    
    const grid = document.getElementById('imagesGrid');
    images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.innerHTML = `
            <img src="${img.data}" alt="${img.filename}">
            <div class="image-info">
                <div class="image-name">${img.filename.length > 20 ? img.filename.substring(0, 17) + '...' : img.filename}</div>
                <div style="font-size:0.6rem;color:#888;margin-bottom:0.4rem;">${img.width}×${img.height}</div>
                <a href="${img.data}" download="${img.filename}" class="download-single">
                    <i class="fas fa-download"></i> Download
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
    
    if (zipCheckbox.checked) {
        document.getElementById('zipDownloadBtn')?.addEventListener('click', () => downloadAsZip(images));
    }
}

async function downloadAsZip(images) {
    showToast('📦 Creating ZIP file...', 'info');
    const zip = new JSZip();
    
    images.forEach(img => {
        const base64 = img.data.split(',')[1];
        zip.file(img.filename, base64, { base64: true });
    });
    
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `pdf_images_${Date.now()}.zip`);
    showToast('✅ ZIP downloaded!', 'success');
}

function updateProgress(percent, message) {
    const fill = document.getElementById('progressFill');
    const msg = document.getElementById('progressMessage');
    if (fill) fill.style.width = `${percent}%`;
    if (msg) msg.textContent = message;
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}