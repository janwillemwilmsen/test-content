const express = require('express');
const path = require('path');
const sharp = require('sharp'); // Add Sharp import
const svgsRouter = require('./svgs.js');

const app = express();
const PORT = process.env.PORT || 3300;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the /static directory
app.use('/static', express.static(path.join(__dirname, 'static')));

// Serve the main index.html as the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'static', 'index.html'));
});


// Serve the svg index.html as route
app.get('/svgs', (req, res) => {
    res.sendFile(path.join(__dirname, 'static', 'svgs', 'index.html'));
});



// API routes
app.get('/api/status', (req, res) => {
    res.json({
        status: 'success',
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Website testing endpoint
app.post('/api/test-website', async (req, res) => {
    try {
        const { url, handleCookies = false, cookieSelector = '' } = req.body;
        
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
        
        // Handle cookie consent popups if enabled
        let cookieHandled = false;
        if (handleCookies) {
            cookieHandled = await handleCookieConsent(page, cookieSelector);
        }
        
        const title = await page.title();
        const finalUrl = page.url();


        //////////////////////////////// functions............

        // Helper function to scrape HTML of an element
        async function scrapeElementHtml(elementItem) {
            try {
                const html = await elementItem.evaluate(el => {
                    // Get the outer HTML of the element
                    let outerHtml = el.outerHTML;
                    
                    // If the HTML is too long, truncate it and add an indicator
                    const maxLength = 1000;
                    if (outerHtml.length > maxLength) {
                        outerHtml = outerHtml.substring(0, maxLength) + '... [truncated]';
                    }
                    
                    return outerHtml;
                });
                
                return html;
            } catch (error) {
                console.log('Error scraping element HTML:', error.message);
                return null;
            }
        }

        // Cookie consent handling function
        async function handleCookieConsent(page, customText = '') {
            try {
                // Common cookie consent text patterns
                const commonTexts = [
                    // Accept variations
                    'Accept',
                    'Accept All',
                    'Accept Cookies',
                    'Accept All Cookies',
                    'Accept Selected',
                    'Accept Necessary',
                    
                    // Allow variations
                    'Allow',
                    'Allow All',
                    'Allow Cookies',
                    'Allow All Cookies',
                    'Allow Selected',
                    'Allow Necessary',
                    
                    // Agreement variations
                    'I Accept',
                    'I Agree',
                    'Agree',
                    'Agree to All',
                    'Agree to Cookies',
                    'Agree to All Cookies',
                    
                    // Simple confirmations
                    'OK',
                    'Got it',
                    'Continue',
                    'Proceed',
                    'Confirm',
                    'Yes',
                    'Yes, I agree',
                    'Yes, accept all',
                    
                    // Privacy/GDPR specific
                    'Accept Privacy Policy',
                    'Accept Terms',
                    'Accept Terms and Conditions',
                    'Accept Privacy Settings',
                    'Accept Cookie Policy',
                    
                    // Close/Dismiss variations
                    'Close',
                    'Dismiss',
                    'Close Banner',
                    'Dismiss Banner',
                    'Close Notice',
                    'Dismiss Notice',
                    
                    // European variations
                    'Accepter',
                    'Accepter tout',
                    'Accepter les cookies',
                    'Accepter tous les cookies',
                    'Zustimmen',
                    'Alle akzeptieren',
                    'Cookies akzeptieren',
                    'Alle Cookies akzeptieren',
                    'Aceptar',
                    'Aceptar todo',
                    'Aceptar cookies',
                    'Aceptar todas las cookies'
                ];

                // Add custom text to the beginning if provided
                const textsToTry = customText ? [customText, ...commonTexts] : commonTexts;

                // Wait a bit for any dynamic content to load
                await page.waitForTimeout(5000);

                // Try clicking on text
                for (const text of textsToTry) {
                    try {
                        // Try to find and click text that matches (case insensitive)
                        const textSelector = `text="${text}"`;
                        const element = await page.$(textSelector);
                        
                        if (element) {
                            const isVisible = await element.isVisible();
                            if (isVisible) {
                                console.log(`Found cookie consent text: "${text}"`);
                                
                                // Click the element
                                await element.click();
                                console.log(`Clicked cookie consent text: "${text}"`);
                                
                                // Wait a bit for the popup to disappear
                                await page.waitForTimeout(1000);
                                
                                return true;
                            }
                        }
                        
                        // Also try with case-insensitive matching using XPath
                        const xpathSelector = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${text.toLowerCase()}')]`;
                        const xpathElements = await page.$$(xpathSelector);
                        
                        for (const xpathElement of xpathElements) {
                            try {
                                const isVisible = await xpathElement.isVisible();
                                if (isVisible) {
                                    console.log(`Found cookie consent text via XPath: "${text}"`);
                                    
                                    // Click the element
                                    await xpathElement.click();
                                    console.log(`Clicked cookie consent text via XPath: "${text}"`);
                                    
                                    // Wait a bit for the popup to disappear
                                    await page.waitForTimeout(1000);
                                    
                                    return true;
                                }
                            } catch (clickError) {
                                // Continue to next element if this one fails
                                continue;
                            }
                        }
                        
                    } catch (error) {
                        // Continue to next text if this one fails
                        console.log(`Text "${text}" failed:`, error.message);
                        continue;
                    }
                }

                console.log('No cookie consent text found or handled');
                return false;

            } catch (error) {
                console.error('Error handling cookie consent:', error);
                return false;
            }
        }


        async function countElementId(elementItem, buttonId, ahrefId) {
			// console.log('countElementId called');

			// const elementType = await elementItem.evaluate(e => e.tagName); //// ONLY LINK OR BUTTON element
			 // Evaluate the tag name and the role of the element
			 const { elementType, elementRole } = await elementItem.evaluate(e => ({
				elementType: e.tagName.toLowerCase(), // Get tag name and convert to lower case
				elementRole: e.getAttribute('role') // Get the value of the role attribute
			}));


			// console.log('elementType',elementType)
			const element = elementType.toLowerCase();
			// console.log('element',element)
			// const isButton = element === "button"; /// OLD
			const isButton = elementType === "button" || elementRole === "button";

			// console.log('isButton',isButton)
			
		
			if (isButton) {
				buttonId++;  // Increment buttonId if it's a button
			} else {
				ahrefId++;   // Increment ahrefId if it's an anchor
			}
			const buttonOrLinkId = isButton ? buttonId : ahrefId;
		
			// Include other logic to extract data from the element
			// console.log('buttonOrLinkId, buttonId, ahrefId -->', buttonOrLinkId, buttonId, ahrefId)
			return {buttonOrLinkId, buttonId, ahrefId };
}

async function containsSlots(elementItem) {
	// First, check if there are any slot elements
	const slotCount = await elementItem.$$eval('slot', slots => slots.length);

	// If slots are present, fetch their content
	if (slotCount > 0) {
		// const slotContent = await fetchSlotContent(elementItem);
		console.log('Slot content:');
		return true;  // Slots are present and content is fetched
	}
	return false;  // No slots are present
}
async function fetchSlotContent(elementItem) {
    return await elementItem.evaluate((node) => {
        // Check if the node or its descendants contain a <slot> element
        const containsSlot = node.querySelector('slot') !== null;
        if (!containsSlot) return ''; // If no <slot>, return an empty string

        let allText = '';

        // Function to recursively gather text from nodes
        function collectText(node) {
            let textContent = '';

            // If node is a slot, get its assigned nodes and process them
            if (node.tagName === 'SLOT') {
                const nodes = node.assignedNodes({ flatten: true });
                textContent = nodes.map(child => collectText(child)).join(" ").trim();
            } else if (node.nodeType === Node.TEXT_NODE) {
                // Directly use text content from text nodes
                textContent = node.textContent.trim();
            } else if (node.tagName && node.tagName.toUpperCase() !== 'STYLE') {
                // Exclude <style> elements, but recursively process other child nodes
                textContent = Array.from(node.childNodes).map(child => collectText(child)).join(" ").trim();
            }
            return textContent;
        }

        // Start with the passed node
        allText = collectText(node);
        return allText.trim(); // Ensure to trim the final accumulated text
    });
}
async function HasShadowDOMContent(elementItem) {
    return await elementItem.evaluate((node) => {
        function recursivelyExtractText(node) {
            let text = "";
            if (node.shadowRoot) {
                // Access the shadow root and get text from its children
                text += Array.from(node.shadowRoot.childNodes)
                    .map(child => recursivelyExtractText(child))
                    .join(" ");
            } else if (node.nodeType === Node.TEXT_NODE) {
                // Directly concatenate text from text nodes
                const trimmedText = node.textContent.trim();
                if (trimmedText) {
                    text += trimmedText + " "; // Add a space for separation
                }
            } else if (node.childNodes.length > 0 && node.tagName.toUpperCase() !== 'STYLE') {
                // Recurse through all child nodes
                text += Array.from(node.childNodes)
                    .map(child => recursivelyExtractText(child))
                    .join(" ");
            }
            return text;
        }

        // Get the full text content and collapse multiple spaces into a single space
        return recursivelyExtractText(node).replace(/\s+/g, ' ').trim();
    });
}
	async function extractElementData(elementItem, pageUrl,id) {

			let linkId = id
			
			// const href = await elementItem.getAttribute('href');
			// let linkUrl, isInternal;
			// const elementType = await elementItem.evaluate(e => e.tagName);  ///// OLD
			const { elementType, elementRole } = await elementItem.evaluate(e => ({
				elementType: e.tagName.toLowerCase(), // Get tag name and convert to lower case
				elementRole: e.getAttribute('role') // Get the value of the role attribute
			}));


			const element = elementType.toLowerCase();
			// const isButton = element === "button"; //// OLD before role
			const isButton = elementType === "button" || elementRole === "button";

			 
		
			// if (href && !href.includes('@') && !href.includes(' ')) {
				let linkUrl, isInternal, href
		
				try {
		
					if (element === 'a') {
					
						href = await elementItem.getAttribute('href');
						if (href && !href.includes(' ')) {
							try{
		
								linkUrl = new URL(href, pageUrl).href;
								isInternal = new URL(href, pageUrl).hostname === new URL(pageUrl).hostname;
							}
							catch{
								linkUrl = 'href is missing'
								isInternal = 'N/A'
							}
						} else {
							linkUrl = 'N/A';
							isInternal = 'N/A';
						}
					} else {
						linkUrl = 'on page, button functionality(no URL)';
						isInternal = 'N/A';
					}
				}
				catch {
					linkUrl = 'Failed getting link';
					isInternal = 'N/A';
				}
		
			// linkUrl = href
		
			// const elementType = await elementItem.evaluate(e => e.tagName);
			// const element = elementType.toLowerCase();
			const type = 'linkElement2';
			const relAttribute = await elementItem.getAttribute('rel');
			const target = await elementItem.getAttribute('target');
			const titleAttribute = await elementItem.getAttribute('title');
			const tabindexAttribute = await elementItem.getAttribute('tabindex');
			const isOpeningNewWindow = target === '_blank';
		 
			

			const linkTxt = await elementItem.evaluate((el) => {
				// Use a recursive function to gather only non-SVG and non-STYLE text
				const getTextWithoutSVGAndStyle = (node) => {
					if (node.tagName && (node.tagName.toUpperCase() === 'SVG' || node.tagName.toUpperCase() === 'STYLE')) {
						return ''; // Exclude SVG and STYLE elements
					}
					if (node.nodeType === Node.TEXT_NODE) {
						return node.textContent.trim(); // Include text nodes and trim whitespace
					}
					return Array.from(node.childNodes).map(getTextWithoutSVGAndStyle).join(' '); // Recurse for child nodes
				};
				// return getTextWithoutSVGAndStyle(el).trim(); // Get text and trim whitespace
				return getTextWithoutSVGAndStyle(el).trim().replace(/\s\s+/g, ' ');

			});
			
			// console.log('linkTxt evaluate: ',linkTxt)




			// const linkTxtR = linkTxt.replace(/\s/g, ' ').trim(); /// Creates joinedwords
			let linkTxtR = linkTxt.trim();
			
			// NEW: Add pseudo text
			const pseudoText = await extractPseudoElementText(elementItem);
			if (pseudoText) linkTxtR += ` ${pseudoText}`;

			const hasTabindex = tabindexAttribute !== null;
			const hastitleAttribute = titleAttribute !== null;
			let haslinkTxtR = linkTxtR !== ''; /// later on in code - setting shadowdomcontent and slotcontent to linkTextR - need to update this variable
			const elementAriaLabel = await elementItem.getAttribute('aria-label');
			const elementAriaLabelledBy = await elementItem.getAttribute('aria-labelledby');
			const elementAriaDescribedBy = await elementItem.getAttribute('aria-describedby');
			let hasAriaDataOnElement = false;
			if (elementAriaLabel || elementAriaLabelledBy || elementAriaDescribedBy) {
				hasAriaDataOnElement = true;
			}

			// NEW: Absolute position check
			const isAbsolute = await hasAbsolutePosition(elementItem);

			// NEW: Nested ARIA
			const nestedAria = await findNestedAriaElements(elementItem);

			// NEW: Effective rect
			const effectiveRect = await getEffectiveClickableRect(elementItem);

			// NEW: JS new window
			const opensInNewWindowJs = await checkOpensInNewWindow(elementItem);

			// NEW: Ancestor link
			const ancestorLink = await findAncestorLink(elementItem);

			return {
				type,
				element,
				linkId,
				relAttribute,
				linkTxt: linkTxtR,
				linkUrl,
				isInternal,
				target,
				titleAttribute,
				tabindexAttribute,
				isOpeningNewWindow,
				isButton,
				hasTabindex,
				hastitleAttribute,
				haslinkTxtR,
				hasAriaDataOnElement,
				elementAriaLabel,
				elementAriaLabelledBy,
				elementAriaDescribedBy,
				pseudoText,
				isAbsolute,
				nestedAria,
				effectiveRect,
				opensInNewWindowJs, 
				ancestorLink
			};
		}
async function getContentForAriaAttributes(attributeValue, page) {
if (!attributeValue) return '';

const ids = attributeValue.split(' ').filter(id => id.trim() !== '');
const contents = await Promise.all(ids.map(async id => {
const element = await page.$(`[id='${id}']`);
if (element) {
const text = await element.evaluate(node => node.textContent);
// Replace multiple whitespace characters with a single space
return text.replace(/\s+/g, ' ').trim();
} else {
return `Aria Mismatch for ${id}`;
}
}));

return contents.filter(content => content.trim() !== '').join(' ');
}

async function extractImageData(element) {
    const imgChildElemHandles = await element.$$('img');
    const svgChildElemHandles = await element.$$('svg');
    const hasImageInLink = imgChildElemHandles.length > 0 || svgChildElemHandles.length > 0;
	const isNormalImage = imgChildElemHandles.length > 0
	const imageIsSvg = svgChildElemHandles.length > 0
    return { hasImageInLink, imgChildElemHandles, svgChildElemHandles, isNormalImage, imageIsSvg };
}
async function getAltTextfromImage(imgChildElemHandle) {
    if (!imgChildElemHandle) {
        return 'No image element';
    }
    const altAttribute = await imgChildElemHandle.getAttribute('alt');
    if (altAttribute === null) {
        return 'Alt tag not present(No, alt alt="" or alt="image description")';
    } else if (altAttribute === '') {
        return 'Alt tag present but empty (alt or alt="" - decorative image)';
    } else {
        return `${altAttribute}`;
    }
}
async function getTitleTextfromImage(imgChildElemHandle) {
    return imgChildElemHandle = await imgChildElemHandle.getAttribute('title');
}
async function checkAriaHiddenIsTrue(elementHandle, depth = 0) {
    if (depth > 10) return { hasAriaHiddenTrue: false }; // Stop after 10 levels

    // Fetch the current element's aria-hidden attribute
    const ariaHidden = await elementHandle.evaluate(el => el.getAttribute('aria-hidden')).catch(() => null);
    if (ariaHidden === 'true') {
        return { hasAriaHiddenTrue: true }; // Return true immediately if any element has aria-hidden="true"
    }

    // Fetch the parent element of the current element
    const parentElement = await elementHandle.evaluateHandle(el => el.parentElement).catch(() => null);
    if (!parentElement || !(await parentElement.asElement())) {
        return { hasAriaHiddenTrue: false }; // If no parent or parent is not an element, return false
    }

    // Recursively check the parent element
    return checkAriaHiddenIsTrue(parentElement, depth + 1);
}
async function checkImageRoleForPresentationOrNone(elementHandle) {
    const role = await elementHandle.getAttribute('role');
    return {
        hasRolePresentationOrRoleNone: role === 'presentation' || role === 'none'
    };
}

async function getTitleOrDescFromSvg(svgChildElemHandle) {
    if (!svgChildElemHandle) {
        return '';
    }
    const title = await svgChildElemHandle.$$eval('title', titles => titles.map(t => t.textContent.trim()).join(' '));
    const desc = await svgChildElemHandle.$$eval('desc', descs => descs.map(d => d.textContent.trim()).join(' '));
    const parts = [];
    if (title) parts.push(title);
    if (desc) parts.push(desc);

    return parts.join(' ').trim();
}
async function checkSvgForAriaLabel(svgChildElemHandle) {
	const svfgAriaLabel =  await svgChildElemHandle.getAttribute('aria-label') 
	if (svfgAriaLabel) {
		return svfgAriaLabel
	}
	else {
		return ''
	}
}
async function checkSvgForAriaLabelledBy(svgChildElemHandle, page) {
    if (svgChildElemHandle) {
        const ariaLabelledByAttr = await svgChildElemHandle.getAttribute('aria-labelledby');
        if (ariaLabelledByAttr) {
            const ariaLabelledByIds = ariaLabelledByAttr.split(' ');
            let labelledTexts = [];

            for (const id of ariaLabelledByIds) {
                const labelledElement = await page.$(`#${id}`);
                const textContent = labelledElement ? await labelledElement.evaluate(node => node.textContent) : `Mismatch in ID - content not found for ${id}`;
                labelledTexts.push(textContent);
            }

            return labelledTexts.join(' '); // Joining all texts with space, or you can use '\n' to separate them by line.
        }
    }
    return '';
}

async function checkSvgForAriaDescribedBy(svgChildElemHandle, page) {
    if (svgChildElemHandle) {
        const ariaDescribedByAttr = await svgChildElemHandle.getAttribute('aria-describedby');
        if (ariaDescribedByAttr) {
            const ariaDescribedByIds = ariaDescribedByAttr.split(' ');
            let describedTexts = [];

            for (const id of ariaDescribedByIds) {
                const describedElement = await page.$(`#${id}`);
                const textContent = describedElement ? await describedElement.evaluate(node => node.textContent) : `Mismatch in ID - content not found for ${id}`;
                describedTexts.push(textContent);
            }

            return describedTexts.join(' '); // Joining all texts with space, or you can use '\n' to separate them by line.
        }
    }
    return '';
}

// NEW HELPER: Pseudo-element text extraction (adapted from plugin)
async function extractPseudoElementText(elementItem) {
    return await elementItem.evaluate((el) => {
        const pseudos = ["::before", "::after"];
        let pseudoText = "";
        for (const pseudo of pseudos) {
            const style = window.getComputedStyle(el, pseudo);
            if (style.content && style.content !== "none" && style.content !== '""') {
                let content = style.content.replace(/^["']|["']$/g, '');
                // Convert common symbols to readable text
                // if (content.includes('▶') || content.includes('►')) return 'Play button';
                // if (content.includes('⏯')) return 'Play/Pause button';
                // Add more symbols as needed...
                pseudoText += content + " ";
            }
        }
        return pseudoText.trim();
    });
}

// NEW HELPER: Check for absolute positioning
async function hasAbsolutePosition(elementItem) {
    return await elementItem.evaluate((el) => {
        const style = window.getComputedStyle(el);
        if (style.position === 'absolute') return true;
        const pseudos = ["::before", "::after"];
        for (const pseudo of pseudos) {
            const ps = window.getComputedStyle(el, pseudo);
            if (ps.position === 'absolute' && ps.content !== 'none' && ps.content !== '""') return true;
        }
        return false;
    });
}

// NEW HELPER: Advanced image analysis (backgrounds, previews, figures)
async function advancedExtractImageData(elementItem, page) {
    // Existing image extraction...
    const { hasImageInLink, imgChildElemHandles, svgChildElemHandles, isNormalImage, imageIsSvg } = await extractImageData(elementItem);

    let imageDetails = [];
    
    // Process existing images first
    if (hasImageInLink) {
        let imageId = 0;
        for (const imgElem of imgChildElemHandles) {
            const altText = await getAltTextfromImage(imgElem);
            const titleText = await getTitleTextfromImage(imgElem);
            const { hasAriaHiddenTrue } = await checkAriaHiddenIsTrue(imgElem);
            const { hasRolePresentationOrRoleNone } = await checkImageRoleForPresentationOrNone(imgElem);
            
            // Get the image source URL
            const imageSrc = await imgElem.evaluate(el => el.src);
            
            // Generate preview using Sharp
            const imagePreview = imageSrc ? await generateImagePreview(imageSrc, page) : null;
            
            imageDetails.push({ 
                imageId: imageId++, 
                type: 'img', 
                altText: altText, 
                titleDesc: null,
                ariaLabel: null, 
                ariaLabelledBy: null, 
                ariaDescribedBy: null, 
                titleText: titleText, 
                hasAriaHiddenTrue: hasAriaHiddenTrue, 
                hasRolePresentationOrRoleNone: hasRolePresentationOrRoleNone,
                src: imageSrc, // Add the source URL
                preview: imagePreview // Add the preview
            });
        }
        for (const svgElem of svgChildElemHandles) {
            const titleDesc = await getTitleOrDescFromSvg(svgElem);
            const ariaLabel = await checkSvgForAriaLabel(svgElem);
            const titleText = await getTitleTextfromImage(svgElem);
            const ariaLabelledBy = await checkSvgForAriaLabelledBy(svgElem, page);
            const ariaDescribedBy = await checkSvgForAriaDescribedBy(svgElem, page);
            const { hasAriaHiddenTrue } = await checkAriaHiddenIsTrue(svgElem);
            const { hasRolePresentationOrRoleNone } = await checkImageRoleForPresentationOrNone(svgElem);
            const svgHtml = await svgElem.evaluate(el => el.outerHTML);
            const svgPreview = await generateSvgPreview(svgHtml, page);
            imageDetails.push({ 
                imageId: imageId++, 
                type: 'svg', 
                altText: null,
                titleDesc: titleDesc, 
                ariaLabel: ariaLabel, 
                ariaLabelledBy: ariaLabelledBy, 
                ariaDescribedBy: ariaDescribedBy, 
                titleText: titleText, 
                hasAriaHiddenTrue: hasAriaHiddenTrue, 
                hasRolePresentationOrRoleNone: hasRolePresentationOrRoleNone,
                preview: svgPreview
            });
        }
    }

    // NEW: Add background image check
    const backgroundImage = await elementItem.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.backgroundImage !== 'none' ? style.backgroundImage : null;
    });
    if (backgroundImage) {
        // Extract URL from css url() syntax
        const bgUrlMatch = backgroundImage.match(/url\(["']?([^"']+)["']?\)/);
        const bgUrl = bgUrlMatch ? bgUrlMatch[1] : null;
        if (bgUrl) {
            try {
                // Generate preview using Sharp instead of simple data URI fetch
                const previewSrc = await generateImagePreview(bgUrl, page);
                imageDetails.push({ type: 'background', src: bgUrl, previewSrc });
            } catch (e) {
                console.error('Error processing background image:', e);
                imageDetails.push({ type: 'background', src: bgUrl, previewSrc: null });
            }
        }
    }

    // NEW: Figure/figcaption check
    const figureInfo = await elementItem.evaluate((el) => {
        let current = el;
        while (current) {
            if (current.tagName.toLowerCase() === 'figure') {
                const figcaption = current.querySelector('figcaption');
                return {
                    inFigureElement: true,
                    hasFigcaption: !!figcaption,
                    figcaptionText: figcaption ? figcaption.textContent.trim() : ''
                };
            }
            current = current.parentElement;
        }
        return { inFigureElement: false };
    });

    return { imageDetails, figureInfo, hasImageInLink }; // Merge with existing
}

// NEW HELPER: Nested ARIA scanning
async function findNestedAriaElements(elementItem) {
    return await elementItem.evaluate((el) => {
        const nested = [];
        const descendants = el.querySelectorAll('*');
        descendants.forEach(desc => {
            const ariaLabel = desc.getAttribute('aria-label');
            const ariaLabelledBy = desc.getAttribute('aria-labelledby');
            if (ariaLabel || ariaLabelledBy) {
                nested.push({
                    tag: desc.tagName.toLowerCase(),
                    ariaLabel,
                    ariaLabelledBy
                });
            }
        });
        return nested;
    });
}

// NEW HELPER: Effective clickable rect
async function getEffectiveClickableRect(elementItem) {
    return await elementItem.boundingBox(); // Use Playwright's boundingBox for simplicity
}

// NEW HELPER: JS-based new window check
async function checkOpensInNewWindow(elementItem) {
    const handler = await elementItem.getAttribute('onclick');
    if (handler && handler.includes('window.open')) return true;
    // Recursive child check...
    const children = await elementItem.$$('*');
    for (const child of children) {
        const childHandler = await child.getAttribute('onclick');
        if (childHandler && childHandler.includes('window.open')) return true;
    }
    return false;
}

// NEW HELPER: Ancestor link detection
async function findAncestorLink(elementItem) {
    return await elementItem.evaluate((el) => {
        let current = el.parentElement;
        while (current) {
            if (current.tagName.toLowerCase() === 'a') return current.href;
            current = current.parentElement;
        }
        return null;
    });
}

const { Resvg } = require('@resvg/resvg-js');
const { Buffer } = require('buffer');

async function generateSvgPreview(svgString, page) {
    try {
        // Process SVG in browser context using the analysis functions
        const processedSvg = await page.evaluate((svgStr) => {
            // Import the SVG analysis functions into browser context
            function sanitizeSvgForPreview(svgSource) {
                if (!svgSource || typeof svgSource !== 'string') {
                    console.warn('sanitizeSvgForPreview received invalid input:', svgSource);
                    return '';
                }
                try {
                    let cleanedSource = svgSource.replace(/xmlns=["']https?:\/\/(www\.)?w3\.org\/2000\/svg["']/g, 'xmlns="http://www.w3.org/2000/svg"');
                    
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
                    
                    const elementsToColor = svgElement.querySelectorAll('path, rect, circle, polygon, ellipse, line, polyline');
                    
                    elementsToColor.forEach(el => {
                        const currentFill = el.getAttribute('fill');
                        const hasClasses = el.getAttribute('class');
                        
                        if (!currentFill || currentFill.toLowerCase() === 'currentcolor' || (hasClasses && !currentFill)) {
                            el.setAttribute('fill', fixedColor);
                        }
                        
                        const currentStroke = el.getAttribute('stroke');
                        if (!currentStroke || currentStroke.toLowerCase() === 'currentcolor') {
                            const fillIsNone = currentFill && currentFill.toLowerCase() === 'none';
                            const tagName = el.tagName.toLowerCase();
                            if (fillIsNone || (!currentFill && !hasClasses) || tagName === 'line' || tagName === 'polyline') {
                                el.setAttribute('stroke', fixedColor);
                            }
                        }
                    });
                    
                    return new XMLSerializer().serializeToString(svgElement);
                } catch (e) {
                    console.error("Error processing SVG for fixed color:", e);
                    return svgString;
                }
            }
            
            // Process the SVG using the functions
            const sanitized = sanitizeSvgForPreview(svgStr);
            const withFixedColors = ensureSvgFixedColor(sanitized);
            
            return withFixedColors || sanitized || svgStr;
        }, svgString);
        
        // Render the processed SVG to PNG using resvg
        const resvg = new Resvg(processedSvg, { 
            fitTo: { mode: 'width', value: 200 }
        });
        const pngData = resvg.render();
        const pngBuffer = pngData.asPng();
        
        return `data:image/png;base64,${pngBuffer.toString('base64')}`;
    } catch (err) {
        console.error('SVG preview error:', err);
        try {
            const resvg = new Resvg(svgString, { fitTo: { mode: 'width', value: 200 } });
            const pngData = resvg.render();
            const pngBuffer = pngData.asPng();
            return `data:image/png;base64,${pngBuffer.toString('base64')}`;
        } catch (fallbackErr) {
            console.error('SVG preview fallback error:', fallbackErr);
            return null;
        }
    }
}

async function generateImagePreview(imageUrl, page) {
    try {
        // Fetch the image from the URL
        const imageBuffer = await page.evaluate(async (url) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.status}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                return Array.from(new Uint8Array(arrayBuffer));
            } catch (error) {
                console.error('Error fetching image:', error);
                return null;
            }
        }, imageUrl);

        if (!imageBuffer) {
            console.warn('Failed to fetch image for preview:', imageUrl);
            return null;
        }

        // Convert array to Buffer
        const buffer = Buffer.from(imageBuffer);

        // Use Sharp to create a thumbnail
        const thumbnail = await sharp(buffer)
            .resize(200, 200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })
            .toBuffer();

        // Convert to base64 data URL
        const base64 = thumbnail.toString('base64');
        return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
        console.error('Error generating image preview:', error);
        return null;
    }
}


///// START SVG functions (for Links and Buttons part)

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

        let id = -1

        // Selecting all <a> and <button> elements and logging their outer HTML
        
        let urlHrefsArr = [];
        let buttonId = 0;
        let ahrefId = 0;
        const elements = await page.$$('a, button, [role="link"], [role="button"]');

        for (const elementItem of elements) {
            id++
            let remainingLinks = elements.length - id;

            const elementIds = await countElementId(elementItem, buttonId, ahrefId, page.url());
            const {  buttonOrLinkId, buttonId: updatedButtonId, ahrefId: updatedAhrefId } = elementIds;

            buttonId = updatedButtonId;
            ahrefId = updatedAhrefId;

            const linkcontainsSlot = await containsSlots(elementItem)
            const linkslotContent = await fetchSlotContent(elementItem)

            const linkHasShadowDOM = await elementItem.evaluate(node => !!node.shadowRoot);
            const linkHasShadowDOMContent = await HasShadowDOMContent(elementItem)

            const elementData = await extractElementData(elementItem, page.url(), id);
            let { type, element, linkUrl, linkId,  relAttribute, linkTxt: linkTxtR, isInternal, target, titleAttribute, tabindexAttribute,isOpeningNewWindow, isButton, hasTabindex, hastitleAttribute, haslinkTxtR, hasAriaDataOnElement, elementAriaLabel, elementAriaLabelledBy, elementAriaDescribedBy, pseudoText, isAbsolute, nestedAria, effectiveRect, opensInNewWindowJs, ancestorLink } = elementData;

            // On the element
            const elementAriaLabelledByText = await getContentForAriaAttributes(elementAriaLabelledBy, page);
            const elementAriaDescribedByText = await getContentForAriaAttributes(elementAriaDescribedBy, page);

            const hasOuterAriaData = false
            const outerAriaContent = false 
            
            // If Image is in Link - use advanced extraction
            const { imageDetails, figureInfo, hasImageInLink } = await advancedExtractImageData(elementItem, page);

            // Trim contents to remove any extraneous whitespace
            const trimmedSlotContent = linkslotContent.trim();
            const trimmedShadowContent = linkHasShadowDOMContent.trim();

            // Initialize an array to collect valid text pieces
            let contents = [];
  
            // If linkTxt is non-empty, add it to contents array
            if (linkTxtR) {
                contents.push(linkTxtR);
            }
  
            // Check if slot content is non-empty and distinct from linkTxt
            if (trimmedSlotContent.trim() && trimmedSlotContent.trim() !== linkTxtR.trim) {
                console.log('Push trimmedSlotContent')
                contents.push(trimmedSlotContent);
            }
  
            // Check if shadow DOM content is non-empty, distinct from linkTxt, and not a duplicate of slot content
            if (trimmedShadowContent.trim() && trimmedShadowContent.trim() !== linkTxtR.trim() && trimmedShadowContent.trim() !== trimmedSlotContent.trim()) {
                console.log('Push trimmedShadowContent')
                contents.push(trimmedShadowContent);
            }
  
            // Join all valid, non-duplicate contents with a space or any other delimiter as needed
            if(trimmedSlotContent || trimmedShadowContent){
                linkTxtR = contents.join(" "); 
            }

            haslinkTxtR = linkTxtR !== '';

            // Scrape the HTML of the element
            const elementHtml = await scrapeElementHtml(elementItem);
            
            urlHrefsArr.push({ 
                linkHasShadowDOMContent,
                linkHasShadowDOM,
                linkslotContent, 
                linkcontainsSlot, 
                type,
                element,
                linkId,
                buttonOrLinkId, 
                relAttribute,
                haslinkTxtR,
                linkTxt: linkTxtR,
                linkUrl,
                isInternal,
                opensInNewWindowJs,
                isOpeningNewWindow,
                target,
                hastitleAttribute,
                titleAttribute,
                hasTabindex,
                tabindexAttribute,
                isButton,
                hasAriaDataOnElement,
                elementAriaLabel,
                elementAriaLabelledByText,
                elementAriaDescribedByText,
                hasOuterAriaData,
                outerAriaContent,
                hasImageInLink,
                imageDetails,
                pseudoText,
                isAbsolute,
                nestedAria,
                effectiveRect,
                ancestorLink,
                figureInfo,
                elementHtml
            });
        }

        ///////////////////////////////
        
        await browser.close();
        
        res.json({
            success: true,
            data: {
                originalUrl: url,
                finalUrl: finalUrl,
                title: title,
                timestamp: new Date().toISOString(),
                cookieHandled: cookieHandled,
                urlHrefsArr: urlHrefsArr
            }
        });
        
    } catch (error) {
        console.error('Error testing website:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to test website'
        });
    }
});

// Mount the SVGs router
app.use('/api/svgs', svgsRouter);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Static files served from: ${path.join(__dirname, 'static')}`);
}); 