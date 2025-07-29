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
        
        console.log('🔍 Visiting URL:', testUrl);
        await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
        
        // Extract all SVGs from the page
        const svgData = await page.evaluate(() => {
            const svgs = document.querySelectorAll('svg');
            const svgList = [];
            
            svgs.forEach((svg, index) => {
                // Get basic SVG information
                const svgInfo = {
                    id: index,
                    outerHTML: svg.outerHTML,
                    innerHTML: svg.innerHTML,
                    className: svg.className,
                    id: svg.id,
                    width: svg.getAttribute('width'),
                    height: svg.getAttribute('height'),
                    viewBox: svg.getAttribute('viewBox'),
                    focusable: svg.getAttribute('focusable'),
                    'aria-hidden': svg.getAttribute('aria-hidden'),
                    style: svg.getAttribute('style'),
                    // Check for use elements
                    hasUseElements: svg.querySelector('use') !== null,
                    useElements: []
                };
                
                // Extract use elements if they exist
                const useElements = svg.querySelectorAll('use');
                useElements.forEach(use => {
                    const useInfo = {
                        href: use.getAttribute('href'),
                        xlinkHref: use.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
                        x: use.getAttribute('x'),
                        y: use.getAttribute('y'),
                        width: use.getAttribute('width'),
                        height: use.getAttribute('height')
                    };
                    svgInfo.useElements.push(useInfo);
                });
                
                svgList.push(svgInfo);
            });
            
            return svgList;
        });
        
        await browser.close();
        
        console.log(`🔍 Found ${svgData.length} SVGs on the page`);
        
        res.json({
            success: true,
            data: {
                url: testUrl,
                svgCount: svgData.length,
                svgs: svgData,
                timestamp: new Date().toISOString()
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



///////////////////////////////////////////


function getSvgTitleDesc(svgElement) {
    const titleEl = svgElement.querySelector('title');
    const descEl = svgElement.querySelector('desc');
    const title = titleEl ? titleEl.textContent?.trim() : '';
    const desc = descEl ? descEl.textContent?.trim() : '';
    if (title && desc) return `${title} - ${desc}`;
    return title || desc || '';
  }
  
  function sanitizeSvgForPreview(svgSource) {
    // Fixes namespace issues and xlink declarations
    // Essential for cross-browser SVG compatibility
      if (!svgSource || typeof svgSource !== 'string') {
          console.warn('sanitizeSvgForPreview received invalid input:', svgSource);
          return ''; // Return empty string for invalid input
      }
      try {
          // Fix incorrect namespace URLs (both http vs https and with/without www)
          let cleanedSource = svgSource.replace(/xmlns=["']https?:\/\/(www\.)?w3\.org\/2000\/svg["']/g,
                                       'xmlns="http://www.w3.org/2000/svg"');
  
          // --- BEGIN xlink NAMESPACE FIX ---
          // Check if xlink prefix is used but the namespace is NOT declared
          const usesXlink = cleanedSource.includes('xlink:');
          const declaresXlink = cleanedSource.includes('xmlns:xlink');
  
          if (usesXlink && !declaresXlink) {
              debugLog('Detected xlink usage without declaration. Adding xmlns:xlink.');
              // Attempt to add xmlns:xlink to the root <svg> tag
              // This regex is basic and might fail on complex SVG tags, but covers common cases
              cleanedSource = cleanedSource.replace(/<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
          }
          // --- END xlink NAMESPACE FIX ---
  
          // Continue with existing sanitization using the potentially modified source
          const parser = new DOMParser();
          const doc = parser.parseFromString(cleanedSource, 'image/svg+xml');
  
          // Check for parsing errors AFTER attempting the fix
          const errors = doc.querySelectorAll('parsererror');
          if (errors.length > 0) {
              // Log the error with the source *after* the attempted fix
              console.warn('SVG parsing error (after xlink fix attempt):', errors[0].textContent, 'Source:', cleanedSource);
              // Return the original source as a last resort, maybe the browser is more lenient
              return svgSource;
          }
  
          const svg = doc.querySelector('svg');
          if (!svg) {
              console.warn('Could not find SVG element after parsing:', cleanedSource);
              return svgSource; // Fallback
          }
  
          // Ensure main SVG namespace is correct (might have been missed by regex)
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          // Ensure xlink namespace is present if needed (double-check after parsing)
          if (usesXlink && !svg.hasAttribute('xmlns:xlink')) {
               svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
          }
  
          // Basic pass-through for now
          return new XMLSerializer().serializeToString(doc);
  
      } catch (e) {
          console.error('Error sanitizing SVG:', e, 'Original source:', svgSource);
          return svgSource; // Fallback to original source on any exception
      }
  
  }
  
  
  function ensureSvgFixedColor(svgString, fixedColor = '#888888') {
    // Replaces currentColor and adds missing fill/stroke attributes
    // Critical for consistent SVG rendering
    // Helper: Ensure SVG elements have a visible fixed color attribute
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
               // Check fill: Add if missing OR replace if it's 'currentColor' OR if element has CSS classes (likely styled via CSS)
               const currentFill = el.getAttribute('fill');
               const hasClasses = el.getAttribute('class');
               
               // Be more aggressive: add fill if missing, currentColor, or has CSS classes that might provide styling
               if (!currentFill || currentFill.toLowerCase() === 'currentcolor' || (hasClasses && !currentFill)) {
                    el.setAttribute('fill', fixedColor);
                    debugLog(`Added fill="${fixedColor}" to ${el.tagName} element with classes: ${hasClasses || 'none'}`);
               } // Otherwise, leave existing explicit color
  
               // Check stroke: Add if missing OR replace if it's 'currentColor'
               const currentStroke = el.getAttribute('stroke');
               if (!currentStroke || currentStroke.toLowerCase() === 'currentcolor') {
                    // Only add stroke if it likely needs one (e.g., lines, or paths without fill)
                    // Basic heuristic: add stroke if fill is none or missing, or if it's a line/polyline
                    const fillIsNone = currentFill && currentFill.toLowerCase() === 'none';
                    const tagName = el.tagName.toLowerCase();
                    if (fillIsNone || (!currentFill && !hasClasses) || tagName === 'line' || tagName === 'polyline') {
                       el.setAttribute('stroke', fixedColor);
                       debugLog(`Added stroke="${fixedColor}" to ${el.tagName} element`);
                    }
               } // Otherwise, leave existing explicit stroke color
          });
  
          const serializer = new XMLSerializer();
          const result = serializer.serializeToString(svgElement);
          debugLog(`ensureSvgFixedColor processed ${elementsToColor.length} elements, result length: ${result.length}`);
          return result;
      } catch (e) {
          console.error("Error processing SVG for fixed color. Original source:", svgString, e);
          return svgString;
      }
  
  }
  
  function resolveCssVariablesInSvg(svgElement) {
    // Converts CSS variables to inline attributes
    // Makes SVGs self-contained and context-independent
      try {
          const clonedSvg = svgElement.cloneNode(true);
  
          // Select elements that might use CSS variables for fill/stroke in the ORIGINAL element
          const originalElements = svgElement.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon, text, g');
          // Select corresponding elements in the CLONE
          const clonedElements = clonedSvg.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon, text, g');
  
          if (originalElements.length !== clonedElements.length) {
              console.warn('Mismatch between original and cloned SVG elements for CSS var resolution. Skipping.', svgElement);
              return clonedSvg.outerHTML; // Return clone's outerHTML as fallback
          }
  
          originalElements.forEach((origEl, index) => {
              const clonedEl = clonedElements[index];
              if (!clonedEl) return; // Should not happen if lengths match
  
              try {
                  const computedStyle = window.getComputedStyle(origEl);
                  const computedFill = computedStyle.getPropertyValue('fill');
                  const computedStroke = computedStyle.getPropertyValue('stroke');
                  const computedOpacity = computedStyle.getPropertyValue('opacity');
                  const computedFillOpacity = computedStyle.getPropertyValue('fill-opacity');
                  const computedStrokeOpacity = computedStyle.getPropertyValue('stroke-opacity');
  
                  // Apply computed values ONLY if they are not the default/initial ones
                  // or if the original attribute explicitly used 'var('
                  // This prevents overriding meaningful 'none' or specific color values unnecessarily
                  // However, simpler approach: always apply computed style for robustness
  
                  if (computedFill) {
                      clonedEl.setAttribute('fill', computedFill);
                  }
                  if (computedStroke && computedStroke !== 'none') { // Avoid setting stroke="none"
                      clonedEl.setAttribute('stroke', computedStroke);
                  }
  
                  // Also handle opacities which might be needed for effects
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
          // Fallback to original outerHTML if cloning/processing fails
          return svgElement.outerHTML;
      }
  
  }
  
  
  async function fetchAndProcessSvgUse(svgElement) {
    // Processes <use> elements and resolves symbol references
    // Handles both internal and external SVG references
      try {
        // Create a new SVG element
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
  
  ///// END SVG functions (for Links and Buttons part)


        ///////////////////////////////

module.exports = router;
