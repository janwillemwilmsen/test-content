const express = require('express');
const router = express.Router();

// Route to get all SVGs from a webpage
router.post('/extract-svgs', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }

        // Validate URL format
        let testUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            testUrl = 'https://' + url;
        }

        const { chromium } = require('playwright');
        const browser = await chromium.launch({ headless: false });
        const page = await browser.newPage();
        
        // Set a reasonable timeout
        page.setDefaultTimeout(30000);
        
        await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
        
        // Extract all SVGs using the optimized functions
        const svgData = await page.evaluate(() => {
            const DEBUG = true;
            
            function debugLog(...args) {
                if (DEBUG) console.log(...args);
            }
            
            // Enhanced SVG analysis functions
            function getSvgTitleDesc(svgElement) {
                const titleEl = svgElement.querySelector('title');
                const descEl = svgElement.querySelector('desc');
                const title = titleEl ? titleEl.textContent?.trim() : '';
                const desc = descEl ? descEl.textContent?.trim() : '';
                if (title && desc) return `${title} - ${desc}`;
                return title || desc || '';
            }
            
            function sanitizeSvgForPreview(svgSource) {
                if (!svgSource || typeof svgSource !== 'string') {
                    console.warn('sanitizeSvgForPreview received invalid input:', svgSource);
                    return '';
                }
                try {
                    // Fix incorrect namespace URLs
                    let cleanedSource = svgSource.replace(/xmlns=["']https?:\/\/(www\.)?w3\.org\/2000\/svg["']/g,
                                             'xmlns="http://www.w3.org/2000/svg"');
                    
                    // Fix xlink namespace issues
                    const usesXlink = cleanedSource.includes('xlink:');
                    const declaresXlink = cleanedSource.includes('xmlns:xlink');
                    
                    if (usesXlink && !declaresXlink) {
                        debugLog('Detected xlink usage without declaration. Adding xmlns:xlink.');
                        cleanedSource = cleanedSource.replace(/<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
                    }
                    
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(cleanedSource, 'image/svg+xml');
                    
                    const errors = doc.querySelectorAll('parsererror');
                    if (errors.length > 0) {
                        console.warn('SVG parsing error (after xlink fix attempt):', errors[0].textContent, 'Source:', cleanedSource);
                        return svgSource;
                    }
                    
                    const svg = doc.querySelector('svg');
                    if (!svg) {
                        console.warn('Could not find SVG element after parsing:', cleanedSource);
                        return svgSource;
                    }
                    
                    // Ensure main SVG namespace is correct
                    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                    if (usesXlink && !svg.hasAttribute('xmlns:xlink')) {
                         svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
                    }
                    
                    return new XMLSerializer().serializeToString(doc);
                    
                } catch (e) {
                    console.error('Error sanitizing SVG:', e, 'Original source:', svgSource);
                    return svgSource;
                }
            }
            
            function ensureSvgFixedColor(svgString, fixedColor = '#888888') {
                if (!svgString) return null;
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(svgString, "image/svg+xml");
                    const svgElement = doc.documentElement;
                    
                    const parseError = svgElement.querySelector('parsererror');
                    if (svgElement.tagName === 'parsererror' || parseError) {
                         console.warn('Failed to parse SVG string. Original source:', svgString);
                         return svgString;
                    }
                    
                    // Select elements that typically need fill/stroke
                    const elementsToColor = svgElement.querySelectorAll('path, rect, circle, polygon, ellipse, line, polyline');
                    
                    elementsToColor.forEach(el => {
                         const currentFill = el.getAttribute('fill');
                         const currentStroke = el.getAttribute('stroke');
                         const hasClasses = el.getAttribute('class');
                         
                         // Handle fill: Add if missing, currentColor, inherit, or none (for paths that should be filled)
                         if (!currentFill || 
                             currentFill.toLowerCase() === 'currentcolor' || 
                             currentFill.toLowerCase() === 'inherit' ||
                             (currentFill.toLowerCase() === 'none' && el.tagName.toLowerCase() === 'path')) {
                              el.setAttribute('fill', fixedColor);
                              console.log(`Added fill="${fixedColor}" to ${el.tagName} element`);
                         }
                         
                         // Handle stroke: Add if missing, currentColor, or inherit
                         if (!currentStroke || 
                             currentStroke.toLowerCase() === 'currentcolor' || 
                             currentStroke.toLowerCase() === 'inherit') {
                              el.setAttribute('stroke', fixedColor);
                              console.log(`Added stroke="${fixedColor}" to ${el.tagName} element`);
                         }
                         
                         // Special case: If element has both fill="none" and stroke, ensure stroke is visible
                         if (currentFill && currentFill.toLowerCase() === 'none' && 
                             (!currentStroke || currentStroke.toLowerCase() === 'inherit')) {
                              el.setAttribute('stroke', fixedColor);
                              console.log(`Added stroke="${fixedColor}" to ${el.tagName} with fill="none"`);
                         }
                    });
                    
                    const serializer = new XMLSerializer();
                    const result = serializer.serializeToString(svgElement);
                    console.log(`ensureSvgFixedColor processed ${elementsToColor.length} elements, result length: ${result.length}`);
                    return result;
                } catch (e) {
                    console.error("Error processing SVG for fixed color. Original source:", svgString, e);
                    return svgString;
                }
            }
            
            function resolveCssVariablesInSvg(svgElement) {
                try {
                    const clonedSvg = svgElement.cloneNode(true);
                    
                    const originalElements = svgElement.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon, text, g');
                    const clonedElements = clonedSvg.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon, text, g');
                    
                    if (originalElements.length !== clonedElements.length) {
                        console.warn('Mismatch between original and cloned SVG elements for CSS var resolution. Skipping.', svgElement);
                        return clonedSvg.outerHTML;
                    }
                    
                    originalElements.forEach((origEl, index) => {
                        const clonedEl = clonedElements[index];
                        if (!clonedEl) return;
                        
                        try {
                            const computedStyle = window.getComputedStyle(origEl);
                            const computedFill = computedStyle.getPropertyValue('fill');
                            const computedStroke = computedStyle.getPropertyValue('stroke');
                            const computedOpacity = computedStyle.getPropertyValue('opacity');
                            const computedFillOpacity = computedStyle.getPropertyValue('fill-opacity');
                            const computedStrokeOpacity = computedStyle.getPropertyValue('stroke-opacity');
                            
                            if (computedFill) {
                                clonedEl.setAttribute('fill', computedFill);
                            }
                            if (computedStroke && computedStroke !== 'none') {
                                clonedEl.setAttribute('stroke', computedStroke);
                            }
                            
                            if (computedOpacity && computedOpacity !== '1') {
                                clonedEl.setAttribute('opacity', computedOpacity);
                            }
                            if (computedFillOpacity && computedFillOpacity !== '1') {
                                clonedEl.setAttribute('fill-opacity', computedFillOpacity);
                            }
                            if (computedStrokeOpacity && computedStrokeOpacity !== '1') {
                                clonedEl.setAttribute('stroke-opacity', computedStrokeOpacity);
                            }
                            
                        } catch (styleError) {
                            console.warn('Error getting computed style for SVG child:', styleError, origEl);
                        }
                    });
                    
                    return clonedSvg.outerHTML;
                } catch (cloneError) {
                    console.error('Error resolving CSS variables in SVG:', cloneError, svgElement);
                    return svgElement.outerHTML;
                }
            }
            
            async function fetchAndProcessSvgUse(svgElement) {
                try {
                    const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    
                    // Copy original SVG attributes
                    Array.from(svgElement.attributes).forEach(attr => {
                        newSvg.setAttribute(attr.name, attr.value);
                    });
                    
                    // Ensure required SVG attributes
                    newSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                    if (!newSvg.getAttribute('width')) newSvg.setAttribute('width', '24');
                    if (!newSvg.getAttribute('height')) newSvg.setAttribute('height', '24');
                    
                    // Check if SVG has inline content (Scenario 1)
                    const hasInlineContent = svgElement.children.length > 0 && 
                        !svgElement.querySelector('use');
                    if (hasInlineContent) {
                        Array.from(svgElement.children).forEach(child => {
                            newSvg.appendChild(child.cloneNode(true));
                        });
                        return newSvg.outerHTML;
                    }
                    
                    // Get the use element for scenarios 2 and 3
                    const useEl = svgElement.querySelector('use');
                    if (!useEl) return null;
                    
                    // Get href (support both xlink:href and href)
                    const href = useEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || 
                                  useEl.getAttribute('href');
                    
                    if (!href) return null;
                    
                    // Split URL and fragment
                    const [url, fragment] = href.split('#');
                    
                    // Handle inline reference (Scenario 3)
                    if (!url && fragment) {
                        const referencedElement = document.getElementById(fragment);
                        if (!referencedElement) return null;
                        
                        if (referencedElement.tagName.toLowerCase() === 'symbol') {
                            const viewBox = referencedElement.getAttribute('viewBox');
                            if (viewBox) newSvg.setAttribute('viewBox', viewBox);
                            Array.from(referencedElement.children).forEach(child => {
                                newSvg.appendChild(child.cloneNode(true));
                            });
                        } else {
                            newSvg.appendChild(referencedElement.cloneNode(true));
                        }
                        return newSvg.outerHTML;
                    }
                    
                    // Handle external SVG (Scenario 2)
                    if (!fragment) return null;
                    
                    const fullUrl = new URL(url, window.location.href).href;
                    if (DEBUG) console.log('Fetching SVG from:', fullUrl);
                    
                    const response = await fetch(fullUrl);
                    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
                    
                    const svgText = await response.text();
                    if (DEBUG) console.log('Fetched SVG content:', svgText.substring(0, 100) + '...');
                    
                    const parser = new DOMParser();
                    const externalDoc = parser.parseFromString(svgText, 'image/svg+xml');
                    
                    const referencedElement = externalDoc.getElementById(fragment);
                    if (!referencedElement) {
                        if (DEBUG) console.log('Referenced element not found:', fragment);
                        return null;
                    }
                    
                    if (referencedElement.tagName.toLowerCase() === 'symbol') {
                        const viewBox = referencedElement.getAttribute('viewBox');
                        if (viewBox) newSvg.setAttribute('viewBox', viewBox);
                        Array.from(referencedElement.children).forEach(child => {
                            newSvg.appendChild(child.cloneNode(true));
                        });
                    } else {
                        newSvg.appendChild(referencedElement.cloneNode(true));
                    }
                    
                    if (DEBUG) console.log('Processed SVG:', newSvg.outerHTML);
                    return newSvg.outerHTML;
                } catch (error) {
                    console.error('Error processing SVG use:', error);
                    return null;
                }
            }
            
            // Main SVG extraction function
            async function extractAllSvgs() {
                const svgs = document.querySelectorAll('svg');
                const svgData = [];
                
                for (let i = 0; i < svgs.length; i++) {
                    const svg = svgs[i];
                    try {
                        // Get basic SVG info
                        const originalHtml = svg.outerHTML;
                        const titleDesc = getSvgTitleDesc(svg);
                        const ariaLabel = svg.getAttribute('aria-label') || '';
                        const ariaLabelledBy = svg.getAttribute('aria-labelledby') || '';
                        const ariaDescribedBy = svg.getAttribute('aria-describedby') || '';
                        const hasAriaHidden = svg.getAttribute('aria-hidden') === 'true';
                        const hasRolePresentation = svg.getAttribute('role') === 'presentation' || svg.getAttribute('role') === 'none';
                        
                        // Process SVG with enhanced functions
                        let processedSvg = originalHtml;
                        
                        // Step 1: Sanitize SVG
                        processedSvg = sanitizeSvgForPreview(processedSvg);
                        
                        // Step 2: Resolve CSS variables
                        processedSvg = resolveCssVariablesInSvg(svg);
                        
                        // Step 3: Process <use> elements
                        const processedUseSvg = await fetchAndProcessSvgUse(svg);
                        if (processedUseSvg) {
                            processedSvg = processedUseSvg;
                        }
                        
                        // Step 4: Ensure fixed colors
                        processedSvg = ensureSvgFixedColor(processedSvg);
                        
                        // Check for <use> elements
                        const hasUseElements = svg.querySelector('use') !== null;
                        const useElements = Array.from(svg.querySelectorAll('use')).map(use => {
                            const href = use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || 
                                       use.getAttribute('href');
                            return { href };
                        });
                        
                        svgData.push({
                            id: i,
                            originalHtml,
                            processedSvg,
                            titleDesc,
                            ariaLabel,
                            ariaLabelledBy,
                            ariaDescribedBy,
                            hasAriaHidden,
                            hasRolePresentation,
                            hasUseElements,
                            useElements,
                            width: svg.getAttribute('width') || 'auto',
                            height: svg.getAttribute('height') || 'auto',
                            viewBox: svg.getAttribute('viewBox') || '',
                            className: svg.className || '',
                            style: svg.getAttribute('style') || ''
                        });
                        
                    } catch (error) {
                        console.error(`Error processing SVG ${i}:`, error);
                        svgData.push({
                            id: i,
                            error: error.message,
                            originalHtml: svg.outerHTML
                        });
                    }
                }
                
                return svgData;
            }
            
            return extractAllSvgs();
        });
        
        // Generate previews for each SVG
        const svgsWithPreviews = [];
        for (const svg of svgData) {
            try {
                if (svg.processedSvg && !svg.error) {
                    // Generate preview using the existing function from backend.js
                    const svgPreview = await generateSvgPreview(svg.processedSvg, page);
                    svg.preview = svgPreview;
                } else {
                    svg.preview = null;
                }
            } catch (previewError) {
                console.error(`Error generating preview for SVG ${svg.id}:`, previewError);
                svg.preview = null;
            }
            svgsWithPreviews.push(svg);
        }
        
        await browser.close();
        
        res.json({
            success: true,
            data: {
                url: testUrl,
                timestamp: new Date().toISOString(),
                svgCount: svgsWithPreviews.length,
                svgs: svgsWithPreviews
            }
        });
        
    } catch (error) {
        console.error('Error extracting SVGs:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to extract SVGs'
        });
    }
});

// Add the generateSvgPreview function from backend.js
async function generateSvgPreview(svgString, page) {
    try {
        console.log('🔍 Starting SVG preview generation...');
        console.log('🔍 Input SVG string:', svgString.substring(0, 100) + '...');
        
        // Get the current page URL to use as base for relative URLs
        const pageUrl = page.url();
        console.log('🔍 Current page URL:', pageUrl);
        
        // First, check if the SVG has <use> elements that need processing
        const hasUseElements = await page.evaluate((svgStr) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgStr, 'image/svg+xml');
            const svgElement = doc.querySelector('svg');
            if (!svgElement) return false;
            
            const useElements = svgElement.querySelectorAll('use');
            return useElements.length > 0;
        }, svgString);
        
        console.log('🔍 Has use elements:', hasUseElements);
        
        if (hasUseElements) {
            // Process SVG in browser context to handle <use> elements
            const processedSvg = await page.evaluate(async (svgStr, pageUrl) => {
                // Import the SVG analysis functions into browser context
                function sanitizeSvgForPreview(svgSource) {
                    if (!svgSource || typeof svgSource !== 'string') {
                        console.warn('sanitizeSvgForPreview received invalid input:', svgSource);
                        return '';
                    }
                    try {
                        // Fix incorrect namespace URLs
                        let cleanedSource = svgSource.replace(/xmlns=["']https?:\/\/(www\.)?w3\.org\/2000\/svg["']/g,
                                                 'xmlns="http://www.w3.org/2000/svg"');
                        
                        // Fix xlink namespace issues
                        const usesXlink = cleanedSource.includes('xlink:');
                        const declaresXlink = cleanedSource.includes('xmlns:xlink');
                        
                        if (usesXlink && !declaresXlink) {
                            cleanedSource = cleanedSource.replace(/<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
                        }
                        
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(cleanedSource, 'image/svg+xml');
                        
                        const errors = doc.querySelectorAll('parsererror');
                        if (errors.length > 0) {
                            console.warn('SVG parsing error:', errors[0].textContent);
                            return svgSource;
                        }
                        
                        const svg = doc.querySelector('svg');
                        if (!svg) {
                            return svgSource;
                        }
                        
                        // Ensure main SVG namespace is correct
                        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                        if (usesXlink && !svg.hasAttribute('xmlns:xlink')) {
                             svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
                        }
                        
                        return new XMLSerializer().serializeToString(doc);
                        
                    } catch (e) {
                        console.error('Error sanitizing SVG:', e);
                        return svgSource;
                    }
                }
                
                function ensureSvgFixedColor(svgString, fixedColor = '#888888') {
                    if (!svgString) return null;
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(svgString, "image/svg+xml");
                        const svgElement = doc.documentElement;
                        
                        const parseError = svgElement.querySelector('parsererror');
                        if (svgElement.tagName === 'parsererror' || parseError) {
                             return svgString;
                        }
                        
                        // Select elements that typically need fill/stroke
                        const elementsToColor = svgElement.querySelectorAll('path, rect, circle, polygon, ellipse, line, polyline');
                        
                        elementsToColor.forEach(el => {
                             const currentFill = el.getAttribute('fill');
                             const currentStroke = el.getAttribute('stroke');
                             const hasClasses = el.getAttribute('class');
                             
                             // Handle fill: Add if missing, currentColor, inherit, or none (for paths that should be filled)
                             if (!currentFill || 
                                 currentFill.toLowerCase() === 'currentcolor' || 
                                 currentFill.toLowerCase() === 'inherit' ||
                                 (currentFill.toLowerCase() === 'none' && el.tagName.toLowerCase() === 'path')) {
                                  el.setAttribute('fill', fixedColor);
                             }
                             
                             // Handle stroke: Add if missing, currentColor, or inherit
                             if (!currentStroke || 
                                 currentStroke.toLowerCase() === 'currentcolor' || 
                                 currentStroke.toLowerCase() === 'inherit') {
                                  el.setAttribute('stroke', fixedColor);
                             }
                             
                             // Special case: If element has both fill="none" and stroke, ensure stroke is visible
                             if (currentFill && currentFill.toLowerCase() === 'none' && 
                                 (!currentStroke || currentStroke.toLowerCase() === 'inherit')) {
                                  el.setAttribute('stroke', fixedColor);
                             }
                        });
                        
                        const serializer = new XMLSerializer();
                        return serializer.serializeToString(svgElement);
                    } catch (e) {
                        console.error("Error processing SVG for fixed color:", e);
                        return svgString;
                    }
                }
                
                async function fetchAndProcessSvgUse(svgElement) {
                    try {
                        const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        
                        // Copy original SVG attributes
                        Array.from(svgElement.attributes).forEach(attr => {
                            newSvg.setAttribute(attr.name, attr.value);
                        });
                        
                        // Ensure required SVG attributes
                        newSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                        if (!newSvg.getAttribute('width')) newSvg.setAttribute('width', '24');
                        if (!newSvg.getAttribute('height')) newSvg.setAttribute('height', '24');
                        
                        // Check if SVG has inline content (Scenario 1)
                        const hasInlineContent = svgElement.children.length > 0 && 
                            !svgElement.querySelector('use');
                        if (hasInlineContent) {
                            Array.from(svgElement.children).forEach(child => {
                                newSvg.appendChild(child.cloneNode(true));
                            });
                            return newSvg.outerHTML;
                        }
                        
                        // Get the use element for scenarios 2 and 3
                        const useEl = svgElement.querySelector('use');
                        if (!useEl) return null;
                        
                        // Get href (support both xlink:href and href)
                        const href = useEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || 
                                      useEl.getAttribute('href');
                        
                        if (!href) return null;
                        
                        console.log('🔍 Processing use element with href:', href);
                        
                        // Split URL and fragment
                        const [url, fragment] = href.split('#');
                        
                        // Handle inline reference (Scenario 3)
                        if (!url && fragment) {
                            const referencedElement = document.getElementById(fragment);
                            if (!referencedElement) return null;
                            
                            if (referencedElement.tagName.toLowerCase() === 'symbol') {
                                const viewBox = referencedElement.getAttribute('viewBox');
                                if (viewBox) newSvg.setAttribute('viewBox', viewBox);
                                Array.from(referencedElement.children).forEach(child => {
                                    newSvg.appendChild(child.cloneNode(true));
                                });
                            } else {
                                newSvg.appendChild(referencedElement.cloneNode(true));
                            }
                            return newSvg.outerHTML;
                        }
                        
                        // Handle external SVG (Scenario 2)
                        if (!fragment) return null;
                        
                        const fullUrl = new URL(url, window.location.href).href;
                        console.log('🔍 Full URL for external SVG:', fullUrl);
                        
                        const response = await fetch(fullUrl);
                        if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
                        
                        const svgText = await response.text();
                        console.log('🔍 Fetched SVG content length:', svgText.length);
                        
                        const parser = new DOMParser();
                        const externalDoc = parser.parseFromString(svgText, 'image/svg+xml');
                        
                        const referencedElement = externalDoc.getElementById(fragment);
                        if (!referencedElement) {
                            console.log(' Referenced element not found:', fragment);
                            return null;
                        }
                        
                        if (referencedElement.tagName.toLowerCase() === 'symbol') {
                            const viewBox = referencedElement.getAttribute('viewBox');
                            if (viewBox) newSvg.setAttribute('viewBox', viewBox);
                            Array.from(referencedElement.children).forEach(child => {
                                newSvg.appendChild(child.cloneNode(true));
                            });
                        } else {
                            newSvg.appendChild(referencedElement.cloneNode(true));
                        }
                        
                        return newSvg.outerHTML;
                    } catch (error) {
                        console.error('Error processing SVG use:', error);
                        return null;
                    }
                }
                
                // Process the SVG
                const parser = new DOMParser();
                const doc = parser.parseFromString(svgStr, 'image/svg+xml');
                const svgElement = doc.querySelector('svg');
                
                if (!svgElement) {
                    console.log('🔍 No SVG element found in parsed document');
                    return svgStr;
                }
                
                // Step 1: Sanitize SVG
                let processedSvg = sanitizeSvgForPreview(svgStr);
                
                // Step 2: Process <use> elements
                const processedUseSvg = await fetchAndProcessSvgUse(svgElement);
                if (processedUseSvg) {
                    processedSvg = processedUseSvg;
                }
                
                // Step 3: Ensure fixed colors
                processedSvg = ensureSvgFixedColor(processedSvg);
                
                return processedSvg;
                
            }, svgString, pageUrl);
            
            console.log('🔍 Processed SVG length:', processedSvg.length);
            
            // Now generate the preview using resvg
            try {
                const { Resvg } = require('@resvg/resvg-js');
                const resvg = new Resvg(processedSvg);
                const pngData = resvg.render();
                const pngBuffer = pngData.asPng();
                const base64Preview = `data:image/png;base64,${pngBuffer.toString('base64')}`;
                
                console.log('🔍 Generated preview successfully');
                return base64Preview;
                
            } catch (resvgError) {
                console.error(' Resvg error:', resvgError.message);
                return null;
            }
            
        } else {
            // Simple SVG without <use> elements
            try {
                const { Resvg } = require('@resvg/resvg-js');
                const resvg = new Resvg(svgString);
                const pngData = resvg.render();
                const pngBuffer = pngData.asPng();
                const base64Preview = `data:image/png;base64,${pngBuffer.toString('base64')}`;
                
                console.log('🔍 Generated simple preview successfully');
                return base64Preview;
                
            } catch (resvgError) {
                console.error('🔍 Resvg error for simple SVG:', resvgError.message);
                return null;
            }
        }
        
    } catch (error) {
        console.error('🔍 SVG preview generation error:', error);
        return null;
    }
}

module.exports = router;
