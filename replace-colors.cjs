const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

const replacements = {
  // Orange primary and hovers -> Navy 700 & Navy 800
  '#E27D5F': '#1a4bc4',
  '#C15C3D': '#0c2b7a',
  '#FFF8F3': '#f8fafc', // Light bg
  '#FDECE4': '#e0f2fe', // Lighter hover/border
  '#6E3C2F': '#0f172a', // Dark text

  // Purple primary 1 -> Navy 700 & Navy 800
  '#8B5CF8': '#1a4bc4',
  '#7b4ce2': '#0c2b7a',
  '#F3E8FF': '#e0f2fe', // Lighter purple -> light blue
  '#E9D5FF': '#bae6fd',
  '#6B21A8': '#1e3a8a',
  
  // Purple primary 2 (AI) -> Cyan 400 & dark cyan
  '#7150ED': '#22d3ee',
  '#5D3FCD': '#0891b2',
  '#F3F0FF': '#cffafe', // Light cyan bg
  '#E0D4FF': '#a5f3fc',
  '#5E3CC8': '#0891b2',

  // Dark background -> Navy 800 & Navy 700
  '#160B39': '#0c2b7a',
  '#1A192B': '#0c2b7a',
  '#2A293E': '#1a4bc4',
  '#21164E': '#1a4bc4',
  '#3E2B88': '#1e3a8a',
  
  // Sidebar colors
  '#2E1812': '#0c2b7a',
  '#1A0C08': '#05122e', // darker navy
  '#3D261D': '#1a4bc4',
  '#4A3228': '#1e3a8a',
  '#E0D5D1': '#e2e8f0', // light text
  '#C1A8A0': '#cbd5e1'  // gray text
};

function readDirRecursive(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(readDirRecursive(filePath));
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.css')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = readDirRecursive(directoryPath);
files.forEach((file) => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  for (const [oldColor, newColor] of Object.entries(replacements)) {
    // Replace hex codes case-insensitively
    const regex = new RegExp(oldColor, 'gi');
    content = content.replace(regex, newColor);
  }
  
  // Also add fonts
  if (file.endsWith('index.css')) {
    content = `@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Noto Sans SC", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Orbitron", ui-sans-serif, system-ui, sans-serif;
}
`;
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});

console.log('Colors replaced successfully!');
