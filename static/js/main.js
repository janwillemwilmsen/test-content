// Main JavaScript file for frontend functionality

document.addEventListener('DOMContentLoaded', function() {
    console.log('Frontend JavaScript loaded');
    
    // Get DOM elements
    const statusBtn = document.getElementById('statusBtn');
    const healthBtn = document.getElementById('healthBtn');
    const apiResult = document.getElementById('apiResult');
    const testWebsiteBtn = document.getElementById('testWebsiteBtn');
    const websiteUrl = document.getElementById('websiteUrl');
    const websiteResult = document.getElementById('websiteResult');
    const handleCookies = document.getElementById('handleCookies');
    const cookieSelector = document.getElementById('cookieSelector');
    
    // Add event listeners if elements exist
    if (statusBtn) {
        statusBtn.addEventListener('click', () => testAPI('/api/status', 'Status'));
    }
    
    if (healthBtn) {
        healthBtn.addEventListener('click', () => testAPI('/api/health', 'Health'));
    }
    
    if (testWebsiteBtn) {
        testWebsiteBtn.addEventListener('click', testWebsite);
    }
    
    // Add enter key support for URL input
    if (websiteUrl) {
        websiteUrl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                testWebsite();
            }
        });
    }
    
    // Function to test API endpoints
    async function testAPI(endpoint, name) {
        try {
            // Show loading state
            apiResult.innerHTML = `<div class="loading"></div> Testing ${name} endpoint...`;
            
            const response = await fetch(endpoint);
            const data = await response.json();
            
            // Display the result
            apiResult.innerHTML = `
                <h4>${name} API Response:</h4>
                <pre>${JSON.stringify(data, null, 2)}</pre>
                <p><strong>Status:</strong> ${response.status} ${response.statusText}</p>
            `;
            
        } catch (error) {
            apiResult.innerHTML = `
                <h4>Error testing ${name} endpoint:</h4>
                <p style="color: red;">${error.message}</p>
            `;
        }
    }
    
    // Function to test website URLs
    async function testWebsite() {
        const url = websiteUrl.value.trim();
        
        if (!url) {
            websiteResult.innerHTML = '<p style="color: red;">Please enter a URL to test</p>';
            websiteResult.classList.add('show');
            return;
        }
        
        try {
            // Show loading state
            websiteResult.innerHTML = '<div class="loading"></div> Testing website...';
            websiteResult.classList.add('show');
            
            const response = await fetch('/api/test-website', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url: url,
                    handleCookies: handleCookies.checked,
                    cookieSelector: cookieSelector.value.trim()
                })
            });
            
            const data = await response.json();
            
            // Debug logging
            console.log('API Response:', data);
            console.log('urlHrefsArr:', data.data.urlHrefsArr);
            console.log('urlHrefsArr type:', typeof data.data.urlHrefsArr);
            console.log('urlHrefsArr length:', data.data.urlHrefsArr ? data.data.urlHrefsArr.length : 'undefined');
            
            if (data.success) {
                websiteResult.innerHTML = `
                    <h4>Website Test Results</h4>
                    <div class="url-info">
                        <strong>Original URL:</strong> ${data.data.originalUrl}<br>
                        <strong>Final URL:</strong> ${data.data.finalUrl}<br>
                        <strong>Tested at:</strong> ${new Date(data.data.timestamp).toLocaleString()}
                    </div>
                    <div class="title">
                        <strong>Page Title:</strong> ${data.data.title}
                    </div>
                    ${data.data.cookieHandled !== undefined ? `
                        <div class="cookie-status">
                            <strong>Cookie Consent:</strong> ${data.data.cookieHandled ? '✅ Handled' : '❌ Not found or not handled'}
                        </div>
                    ` : ''}
                    ${data.data.urlHrefsArr && Array.isArray(data.data.urlHrefsArr) && data.data.urlHrefsArr.length > 0 ? `
                        <div class="links-buttons-section">
                            <h4>Links and Buttons Found (${data.data.urlHrefsArr.length})</h4>
                            <div class="links-buttons-list">
                                ${data.data.urlHrefsArr.map((item, index) => {
                                    console.log('Processing item:', item);
                                    return `
                                        <div class="link-button-item">
                                            <div class="item-header">
                                                <span class="item-type ${item.isButton ? 'button' : 'link'}">${item.isButton ? 'Button' : 'Link'} #${item.buttonOrLinkId || index + 1}</span>
                                                <span class="item-element">${item.element || 'Unknown'}</span>
                                            </div>
                                                                                    <div class="item-content">
                                            ${item.linkTxt ? `<div class="item-text"><strong>Text:</strong> ${item.linkTxt}</div>` : ''}
                                            ${item.linkUrl ? `<div class="item-url"><strong>URL:</strong> <a href="${item.linkUrl}" target="_blank">${item.linkUrl}</a></div>` : ''}
                                            ${item.target ? `<div class="item-target"><strong>Target:</strong> ${item.target}</div>` : ''}
                                            ${item.titleAttribute ? `<div class="item-title"><strong>Title:</strong> ${item.titleAttribute}</div>` : ''}
                                            ${item.hasImageInLink ? `
                                                <div class="item-image">
                                                    <strong>Images:</strong>
                                                    <div class="image-details">
                                                        ${item.imageDetails ? renderImageDetails(item.imageDetails) : '<span class="no-image-details">No image details object found</span>'}
                                                    </div>
                                                    <details class="debug-details">
                                                        <summary>Debug: Raw Image Data</summary>
                                                        <pre class="debug-data">${JSON.stringify(item.imageDetails, null, 2)}</pre>
                                                    </details>
                                                </div>
                                            ` : ''}
                                            ${item.elementAriaLabel ? `<div class="item-aria"><strong>Aria Label:</strong> ${item.elementAriaLabel}</div>` : ''}
                                            ${item.elementHtml ? `
                                                <div class="item-html">
                                                    <button class="html-view-btn" ${isPopoverSupported() ? `popovertarget="html-popover-${index}"` : `onclick="showHtmlFallback('${escapeHtml(item.elementHtml)}', this)"`}>
                                                        <span class="btn-icon">🔍</span>
                                                        View HTML
                                                    </button>
                                                    ${isPopoverSupported() ? `
                                                        <div id="html-popover-${index}" class="html-popover" popover>
                                                            <div class="popover-header">
                                                                <h4>Element HTML</h4>
                                                                <button class="popover-close" onclick="this.parentElement.parentElement.hidePopover()">×</button>
                                                            </div>
                                                            <div class="popover-content">
                                                                <pre><code>${escapeHtml(item.elementHtml)}</code></pre>
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            ` : ''}
                                        </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : data.data.urlHrefsArr ? `
                        <div class="debug-section">
                            <h4>Debug: Raw Data</h4>
                            <pre>${JSON.stringify(data.data.urlHrefsArr, null, 2)}</pre>
                        </div>
                    ` : '<div class="no-links">No links or buttons found on this page.</div>'}
                `;
            } else {
                websiteResult.innerHTML = `
                    <h4>Error Testing Website</h4>
                    <p style="color: red;">${data.error}</p>
                `;
            }
            
        } catch (error) {
            websiteResult.innerHTML = `
                <h4>Error Testing Website</h4>
                <p style="color: red;">${error.message}</p>
            `;
        }
    }
    
    // Add smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Only prevent default for same-page links
            if (this.getAttribute('href').startsWith('#')) {
                e.preventDefault();
                const targetId = this.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });
    
    // Add some interactive features
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    // Add a simple animation for the hero section
    const hero = document.querySelector('.hero');
    if (hero) {
        hero.style.opacity = '0';
        hero.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            hero.style.transition = 'all 0.8s ease';
            hero.style.opacity = '1';
            hero.style.transform = 'translateY(0)';
        }, 100);
    }
    
    // Add current time display
    function updateTime() {
        const timeElement = document.createElement('div');
        timeElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.9);
            padding: 10px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
            color: #4a5568;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            z-index: 1000;
        `;
        timeElement.textContent = new Date().toLocaleTimeString();
        document.body.appendChild(timeElement);
        
        // Update time every second
        setInterval(() => {
            timeElement.textContent = new Date().toLocaleTimeString();
        }, 1000);
    }
    
    // Initialize time display
    updateTime();
});

// Utility function to make API calls
async function makeAPICall(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
        ...options
    };
    
    try {
        const response = await fetch(url, defaultOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Utility function to escape HTML for safe display
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Function to render image details
function renderImageDetails(imageDetails) {
    console.log('Image details received:', imageDetails);
    console.log('Image details type:', typeof imageDetails);
    
    if (!imageDetails) {
        return '<span class="no-image-details">No image details available</span>';
    }

    // Handle array format from backend
    if (Array.isArray(imageDetails)) {
        return renderImageDetailsArray(imageDetails);
    }
    
    // Handle object format (fallback)
    if (typeof imageDetails === 'object') {
        return renderImageDetailsObject(imageDetails);
    }
    
    return '<span class="no-image-details">Invalid image details format</span>';
}

// Function to render image details from array format (backend format)
function renderImageDetailsArray(imageDetails) {
    if (!imageDetails || imageDetails.length === 0) {
        return '<span class="no-image-details">No images found</span>';
    }

    let html = '';
    
    // Group images by type
    const normalImages = imageDetails.filter(img => img.type === 'img');
    const svgImages = imageDetails.filter(img => img.type === 'svg');
    const backgroundImages = imageDetails.filter(img => img.type === 'background');
    
    console.log('Normal images:', normalImages);
    console.log('SVG images:', svgImages);
    console.log('Background images:', backgroundImages);
    
    // Normal images
    if (normalImages.length > 0) {
        html += '<div class="image-type-section">';
        html += '<h5>📷 Normal Images:</h5>';
        normalImages.forEach((img, index) => {
            html += '<div class="image-item">';
            if (img.src) html += `<div class="image-src"><strong>Source:</strong> <a href="${img.src}" target="_blank">${img.src}</a></div>`;
            if (img.altText) html += `<div class="image-alt"><strong>Alt:</strong> ${img.altText}</div>`;
            if (img.titleText) html += `<div class="image-title"><strong>Title:</strong> ${img.titleText}</div>`;
            // Restore the ARIA attributes
            if (img.ariaLabel) html += `<div class="image-alt"><strong>Aria Label:</strong> ${img.ariaLabel}</div>`;
            if (img.ariaLabelledBy) html += `<div class="image-alt"><strong>Aria Labelled By:</strong> ${img.ariaLabelledBy}</div>`;
            if (img.ariaDescribedBy) html += `<div class="image-alt"><strong>Aria Described By:</strong> ${img.ariaDescribedBy}</div>`;
            // Add preview display
            if (img.preview) html += `<div class="image-preview"><strong>Preview:</strong><br><img src="${img.preview}" alt="Image Preview" style="max-width:150px;max-height:150px;border:1px solid #ddd;border-radius:4px;margin-top:5px;"/></div>`;
            html += '</div>';
        });
        html += '</div>';
    }
    
    // SVG images
    if (svgImages.length > 0) {
        html += '<div class="image-type-section">';
        html += '<h5>🎨 SVG Images:</h5>';
        svgImages.forEach((svg, index) => {
            html += '<div class="image-item">';
            if (svg.ariaLabel) html += `<div class="image-alt"><strong>Aria Label:</strong> ${svg.ariaLabel}</div>`;
            if (svg.ariaLabelledBy) html += `<div class="image-alt"><strong>Aria Labelled By:</strong> ${svg.ariaLabelledBy}</div>`;
            if (svg.ariaDescribedBy) html += `<div class="image-alt"><strong>Aria Described By:</strong> ${svg.ariaDescribedBy}</div>`;
            if (svg.titleText) html += `<div class="image-title"><strong>Title:</strong> ${svg.titleText}</div>`;
            if (svg.titleDesc) html += `<div class="image-desc"><strong>Description:</strong> ${svg.titleDesc}</div>`;
            // Add SVG preview display
            if (svg.preview) html += `<div class="image-preview"><strong>Preview:</strong><br><img src="${svg.preview}" alt="SVG Preview" style="max-width:150px;max-height:150px;border:1px solid #ddd;border-radius:4px;margin-top:5px;"/></div>`;
            html += '</div>';
        });
        html += '</div>';
    }
    
    // Background images
    if (backgroundImages.length > 0) {
        html += '<div class="image-type-section">';
        html += '<h5>🎭 Background Images:</h5>';
        backgroundImages.forEach((bg, index) => {
            html += '<div class="image-item">';
            if (bg.src) html += `<div class="image-src"><strong>Background:</strong> ${bg.src}</div>`;
            if (bg.previewSrc) html += `<div class="image-preview"><strong>Preview:</strong> Available</div>`;
            html += '</div>';
        });
        html += '</div>';
    }
    
    return html || '<span class="no-image-details">No specific image details found</span>';
}

// Function to render image details from object format (fallback)
function renderImageDetailsObject(imageDetails) {
    let html = '';
    
    // Normal images
    if (imageDetails.normalImages && imageDetails.normalImages.length > 0) {
        html += '<div class="image-type-section">';
        html += '<h5>📷 Normal Images:</h5>';
        imageDetails.normalImages.forEach((img, index) => {
            html += '<div class="image-item">';
            html += `<div class="image-src"><strong>Source:</strong> <a href="${img.src}" target="_blank">${img.src}</a></div>`;
            if (img.alt) html += `<div class="image-alt"><strong>Alt:</strong> ${img.alt}</div>`;
            if (img.title) html += `<div class="image-title"><strong>Title:</strong> ${img.title}</div>`;
            html += '</div>';
        });
        html += '</div>';
    }
    
    // SVG images
    if (imageDetails.svgImages && imageDetails.svgImages.length > 0) {
        html += '<div class="image-type-section">';
        html += '<h5>🎨 SVG Images:</h5>';
        imageDetails.svgImages.forEach((svg, index) => {
            html += '<div class="image-item">';
            if (svg.ariaLabel) html += `<div class="image-alt"><strong>Aria Label:</strong> ${svg.ariaLabel}</div>`;
            if (svg.ariaLabelledBy) html += `<div class="image-alt"><strong>Aria Labelled By:</strong> ${svg.ariaLabelledBy}</div>`;
            if (svg.ariaDescribedBy) html += `<div class="image-alt"><strong>Aria Described By:</strong> ${svg.ariaDescribedBy}</div>`;
            if (svg.title) html += `<div class="image-title"><strong>Title:</strong> ${svg.title}</div>`;
            if (svg.desc) html += `<div class="image-desc"><strong>Description:</strong> ${svg.desc}</div>`;
            html += '</div>';
        });
        html += '</div>';
    }
    
    // Background images
    if (imageDetails.backgroundImages && imageDetails.backgroundImages.length > 0) {
        html += '<div class="image-type-section">';
        html += '<h5>🎭 Background Images:</h5>';
        imageDetails.backgroundImages.forEach((bg, index) => {
            html += '<div class="image-item">';
            html += `<div class="image-src"><strong>Background:</strong> ${bg.backgroundImage}</div>`;
            if (bg.alt) html += `<div class="image-alt"><strong>Alt:</strong> ${bg.alt}</div>`;
            if (bg.title) html += `<div class="image-title"><strong>Title:</strong> ${bg.title}</div>`;
            html += '</div>';
        });
        html += '</div>';
    }
    
    return html || '<span class="no-image-details">No specific image details found</span>';
}

// Check if native popover is supported
function isPopoverSupported() {
    return 'showPopover' in HTMLElement.prototype;
}



// Fallback for browsers without native popover support
function showHtmlFallback(htmlContent, button) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        border-radius: 8px;
        max-width: 80%;
        max-height: 80%;
        overflow: auto;
        position: relative;
    `;
    
    content.innerHTML = `
        <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
            <h4 style="margin: 0; color: #374151;">Element HTML</h4>
            <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">×</button>
        </div>
        <div style="padding: 16px;">
            <pre style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 0.8rem; line-height: 1.4; overflow-x: auto; white-space: pre-wrap; word-break: break-word; margin: 0;"><code>${escapeHtml(htmlContent)}</code></pre>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Export for use in other scripts (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeAPICall };
} 