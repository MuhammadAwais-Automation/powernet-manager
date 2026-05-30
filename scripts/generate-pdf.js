const puppeteer = require('puppeteer');
const path = require('path');

async function generatePDF() {
  console.log('Starting PDF generation using Puppeteer...');
  
  // Launch browser in headless mode with explicit executablePath
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Users\\Ethical Byte\\.cache\\puppeteer\\chrome\\win64-149.0.7827.22\\chrome-win64\\chrome.exe'
  });
  
  const page = await browser.newPage();
  
  // Resolve path to the local HTML file
  const htmlPath = 'C:\\Users\\Ethical Byte\\.gemini\\antigravity\\brain\\4b2d7c21-ed98-48b8-86a3-932c6e0f7696\\web_portal_documentation.html';
  const fileUrl = `file://${htmlPath.replace(/\\/g, '/')}`;
  
  console.log(`Loading documentation from: ${fileUrl}`);
  
  // Load the page
  await page.goto(fileUrl, {
    waitUntil: 'networkidle0' // Wait until all resources (including Mermaid.js, fonts, and stylesheets) are loaded
  });

  // Give Mermaid.js an extra second to render the SVG diagrams
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Determine path for final PDF file
  const pdfPath = 'C:\\Users\\Ethical Byte\\.gemini\\antigravity\\brain\\4b2d7c21-ed98-48b8-86a3-932c6e0f7696\\PowerNet_Web_Portal_Documentation.pdf';

  console.log('Generating A4 print-perfect PDF...');
  
  // Trigger print-to-pdf API
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true, // Crucial to render alert backgrounds, tables, and colors
    margin: {
      top: '15mm',
      bottom: '15mm',
      left: '15mm',
      right: '15mm'
    },
    displayHeaderFooter: false
  });

  console.log(`\nSuccess! Your gorgeous PDF is ready at:\n${pdfPath}\n`);
  
  await browser.close();
}

generatePDF().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
