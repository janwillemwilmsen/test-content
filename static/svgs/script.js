// New Folder Script
console.log('New folder script loaded!');

// Test function that can be called from the HTML
function testFunction() {
    const output = document.getElementById('output');
    const timestamp = new Date().toLocaleString();
    
    output.innerHTML = `
        <h3>Test Function Executed</h3>
        <p><strong>Timestamp:</strong> ${timestamp}</p>
        <p><strong>User Agent:</strong> ${navigator.userAgent}</p>
        <p><strong>Window Size:</strong> ${window.innerWidth} x ${window.innerHeight}</p>
        <p><strong>Current URL:</strong> ${window.location.href}</p>
    `;
    
    console.log('Test function executed at:', timestamp);
}

// Clear output function
function clearOutput() {
    const output = document.getElementById('output');
    output.innerHTML = '<p>Output cleared...</p>';
    console.log('Output cleared');
}

// Add some utility functions
function getCurrentTime() {
    return new Date().toLocaleTimeString();
}

function logMessage(message) {
    console.log(`[${getCurrentTime()}] ${message}`);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    logMessage('Page loaded successfully');
    
    // Add a welcome message to the output
    const output = document.getElementById('output');
    output.innerHTML = `
        <h3>Welcome!</h3>
        <p>This page is ready for testing. Click the "Test Function" button to see some information.</p>
        <p><strong>Page loaded at:</strong> ${getCurrentTime()}</p>
    `;
});

// Export functions for potential use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testFunction,
        clearOutput,
        getCurrentTime,
        logMessage
    };
} 