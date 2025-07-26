const express = require('express');
const path = require('path');

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
                hasRolePresentationOrRoleNone: hasRolePresentationOrRoleNone 
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
                hasRolePresentationOrRoleNone: hasRolePresentationOrRoleNone 
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
                // Generate preview (simple data URI fetch)
                const previewSrc = await page.evaluate(async (url) => {
                    try {
                        const response = await fetch(url);
                        const blob = await response.blob();
                        return new Promise(resolve => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                    } catch (e) {
                        return null;
                    }
                }, bgUrl);
                imageDetails.push({ type: 'background', src: bgUrl, previewSrc });
            } catch (e) {
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


        ////////////////////////////////


        let id = -1

        // Selecting all <a> and <button> elements and logging their outer HTML
        
        
        let urlHrefsArr = [];
        let buttonId = 0;
        let ahrefId = 0;
        const elements = await page.$$('a, button, [role="link"], [role="button"]');



/// add src for img
/// add selector - check all upper elements. To much processing. Not for now...
// for (let i = 0; i < urlHrefs.length; i++) {
for (const elementItem of elements) {
	id++
	let remainingLinks = elements.length - id;

	///// // sendMessageToClient(clientId, `Testing links and buttons ${id}..`);
	///// sendMessageToClient(clientId, `Testing links/buttons ${id}/${elements.length}. ${remainingLinks} left to test.`);

	// console.log('TEST', pageUrl )
	// console.log('TEST', id, buttonId, ahrefId, page.url() )
	const elementIds = await countElementId(elementItem, buttonId, ahrefId, page.url());
	// console.log('eIds', elementIds)
	const {  buttonOrLinkId, buttonId: updatedButtonId, ahrefId: updatedAhrefId } = elementIds;

	buttonId = updatedButtonId;
	ahrefId = updatedAhrefId;

	const linkcontainsSlot = await containsSlots(elementItem)
	const linkslotContent = await fetchSlotContent(elementItem)


	// const linkHasShadowDOM = await HasShadowDOM(elementItem)
	const linkHasShadowDOM = await elementItem.evaluate(node => !!node.shadowRoot);
	//// Fuck this ShadowDom do not even know if it has impact. Notice: function above checks if the element has Shadow, not if it is contained in Shadow. Need to investigate........
	// console.log('linkHasShadowDOM -------------------------------------------------------------', linkHasShadowDOM)
	const linkHasShadowDOMContent = await HasShadowDOMContent(elementItem)

	const elementData = await extractElementData(elementItem, page.url(), id);
	let { type, element, linkUrl, linkId,  relAttribute, linkTxt: linkTxtR, isInternal, target, titleAttribute, tabindexAttribute,isOpeningNewWindow, isButton, hasTabindex, hastitleAttribute, haslinkTxtR, hasAriaDataOnElement, elementAriaLabel, elementAriaLabelledBy, elementAriaDescribedBy, pseudoText, isAbsolute, nestedAria, effectiveRect, opensInNewWindowJs, ancestorLink } = elementData;

	// On the element
	const elementAriaLabelledByText = await getContentForAriaAttributes(elementAriaLabelledBy, page);
	const elementAriaDescribedByText = await getContentForAriaAttributes(elementAriaDescribedBy, page);

	// aria outside the element ///// ---> This was from when I thought aria-* on surrounding elements had impact and were important. Guess they are not. So setting to empty string..
	// const outerAriaData = await findAncestorWithAriaAttributes(elementItem);
	// const { outerAriaContent, hasOuterAriaData } = await processAriaAttributes(outerAriaData, page);
	const hasOuterAriaData = false /// might be better with false..............
	const outerAriaContent = false 
	
	// console.log('outerAriaData', outerAriaData)
	// console.log('Aria-*', outerAriaContent, hasOuterAriaData)

	// console.log(elementData);
	// const dataString2 = JSON.stringify({ elementData /* other data */ }) + '\n' ;
	// fs.appendFileSync('z-test-file.txt', dataString2);
	// If Image is in Link - use advanced extraction
	const { imageDetails, figureInfo, hasImageInLink } = await advancedExtractImageData(elementItem, page);

	// console.log('---------------------')

	  // Trim contents to remove any extraneous whitespace
	  const trimmedSlotContent = linkslotContent.trim();
	  const trimmedShadowContent = linkHasShadowDOMContent.trim();
  


	//   console.log('linkTxtR pre:', linkTxtR)
	//   console.log('trimmedSlotContent:', trimmedSlotContent)
	//   console.log('trimmedShadowContent:', trimmedShadowContent)

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
	//   console.log('linkTxtR post:', linkTxtR)

	//   console.log('---------------------')

	// LOGGIN
	// if(hasImageInLink === true){
	// console.log({ linkTxt ,element, linkUrl, hasImageInLink, isNormalImage, imageIsSvg, altText, /* other data */ });
	// }
	
	// if (hasImageInLink === true) {
		// const dataString = JSON.stringify({ linkTxt, element, linkUrl, hasImageInLink, isNormalImage, imageIsSvg, imageDetails  /* other data */ }) + '\n' ;
		// const dataString = JSON.stringify({ linkTxt, element, linkUrl, hasImageInLink, isNormalImage, elementAriaLabel, elementAriaLabelledByText, elementAriaDescribedByText  /* other data */ }) + '\n' ;
		
		 
		// const dataString = JSON.stringify({ linkTxt, element, linkUrl, hasImageInLink, isNormalImage, elementAriaLabel, elementAriaLabelledByText, elementAriaDescribedByText, outerAriaContent, hasOuterAriaData, imageDetails  /* other data */ }) + '\n' ;
		// urlHrefsArr.push({  type,element,linkId,buttonOrLinkId, relAttribute,linkTxt: linkTxtR,linkUrl,isInternal,target,titleAttribute,tabindexAttribute,isOpeningNewWindow, isButton, hasTabindex, hastitleAttribute, haslinkTxtR, hasAriaDataOnElement,	elementAriaLabel, elementAriaLabelledByText, elementAriaDescribedByText, hasOuterAriaData, outerAriaContent,hasImageInLink, imageDetails  /* other data */ })
		urlHrefsArr.push({ 
			linkHasShadowDOMContent, //// the inner content of elements inside shadowdom
			linkHasShadowDOM, //// elementItem.evaluate(node => !!node.shadowRoot)
			linkslotContent, 
			linkcontainsSlot, 
			type,
			element,
			linkId,
			buttonOrLinkId, 
			relAttribute, /// the value of the rel attribute
			haslinkTxtR, /// if link or button has text, shadowdom or slot content
			linkTxt: linkTxtR,
			linkUrl, /// The href attribute
			isInternal, /// If the link is internal or external (hostname = hostname)
			opensInNewWindowJs, // Check for javascript open in new window.
			isOpeningNewWindow,  // Check for target="_blank"
			target, /// Get the value if link has target attribute
			hastitleAttribute, /// if title = !null
			titleAttribute,  //// the title attribute value.
			hasTabindex,  /// if tabIndex = !null 
			tabindexAttribute, /// the value of the tabindex attribute 
			isButton,  /// if the element type or role is button
			hasAriaDataOnElement,	 /// if the element has aria-* attributes -> think need to check if they are on the element or on the surrounding or inner elements.
			elementAriaLabel,  //// aria label value
			elementAriaLabelledByText,   //// aria labelled by value
			elementAriaDescribedByText,  //// aria described by value
			hasOuterAriaData,  /// set to false - is it important?
			outerAriaContent,  /// set to false - is it important?
			hasImageInLink, /// if there is an element with img or svg tag inside the link
			imageDetails, /// check and returns image details/svg details and background image details
			pseudoText,  //// The css pseudo-element text overwrites the linktextR value???
			isAbsolute, /// if the element is absolutely positioned - think because of kitchen sink links. absolute inside element that is relative.  used in the Chrome plugin, to 
			nestedAria,
			effectiveRect,
			ancestorLink,
			figureInfo  /* other data */ })

	
	
	
		// fs.appendFileSync('z-test-file.txt',  dataString  );
	// }



}  // End Main For Loop





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

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Static files served from: ${path.join(__dirname, 'static')}`);
}); 