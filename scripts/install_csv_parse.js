const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

console.log('Manual CSV Parse Installation Script');
console.log('===================================');

// First, let's try a simple approach - download the package tarball directly
async function downloadPackage() {
    try {
        // Try to use npm view to get package info
        console.log('Getting package info...');
        const packageInfo = execSync('npm view csv-parse --json', { encoding: 'utf8' });
        const info = JSON.parse(packageInfo);
        
        console.log(`Found csv-parse version: ${info.version}`);
        console.log(`Tarball URL: ${info.dist.tarball}`);
        
        // Download the tarball
        const tarballPath = path.join(__dirname, 'csv-parse.tgz');
        console.log(`Downloading to: ${tarballPath}`);
        
        await downloadFile(info.dist.tarball, tarballPath);
        
        // Install from tarball
        console.log('Installing from tarball...');
        execSync(`npm install ${tarballPath}`, { stdio: 'inherit' });
        
        // Clean up
        fs.unlinkSync(tarballPath);
        
        console.log('✅ csv-parse installed successfully!');
        
    } catch (error) {
        console.error('❌ Error with npm approach:', error.message);
        console.log('Trying alternative approach...');
        
        // Alternative: try yarn if available
        try {
            execSync('yarn --version', { stdio: 'ignore' });
            console.log('Found yarn, trying yarn install...');
            execSync('yarn add csv-parse', { stdio: 'inherit' });
            console.log('✅ csv-parse installed with yarn!');
        } catch (yarnError) {
            console.log('Yarn not available, trying direct approach...');
            await directInstall();
        }
    }
}

function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            } else {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            }
        }).on('error', reject);
    });
}

async function directInstall() {
    try {
        console.log('Attempting direct installation...');
        
        // Create a simple csv parser inline
        const csvParserCode = `
// Simple CSV parser to replace csv-parse
function parseCSV(csvText) {
    const lines = [];
    let currentLine = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < csvText.length) {
        const char = csvText[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === '\\n' && !inQuotes) {
            lines.push(currentLine);
            currentLine = '';
            i++;
            continue;
        } else if (char === '\\r' && !inQuotes) {
            // Skip carriage return
            i++;
            continue;
        }
        
        currentLine += char;
        i++;
    }
    
    if (currentLine) {
        lines.push(currentLine);
    }
    
    return lines.map(line => {
        const fields = [];
        let currentField = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(currentField);
                currentField = '';
                i++;
                continue;
            } else {
                currentField += char;
            }
            i++;
        }
        
        if (currentField !== undefined) {
            fields.push(currentField);
        }
        
        return fields;
    });
}

module.exports = { parseCSV };
`;

        // Write the parser to a local file
        const parserPath = path.join(__dirname, 'csv-parser.js');
        fs.writeFileSync(parserPath, csvParserCode);
        
        console.log('✅ Created local CSV parser at:', parserPath);
        console.log('You can now use: const { parseCSV } = require("./csv-parser");');
        
    } catch (error) {
        console.error('❌ Direct installation failed:', error.message);
        console.log('Please try running: npm install csv-parse --force');
    }
}

// Run the installation
downloadPackage().catch(console.error); 