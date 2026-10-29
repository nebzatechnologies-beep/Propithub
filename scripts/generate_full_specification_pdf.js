import path from 'path';
import { fileURLToPath } from 'url';
import { PDFBuilder } from './pdf_engine.js';
import { renderPart1 } from './sections_part1.js';
import { renderPart2 } from './sections_part2.js';
import { renderPart3 } from './sections_part3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('Starting full specification PDF compilation...');

  const builder = new PDFBuilder({
    marginLeft: 42,
    marginRight: 42,
    marginTop: 54,
    marginBottom: 54,
  });

  // 1. Cover Page
  builder.renderCoverPage({
    title: 'PROPITHUB PLATFORM\nUNIFIED MOBILE APPLICATION',
    subtitle: 'Comprehensive Product Architecture, Business Logic Inventory, Role Permissions & UX Design System Specification',
    documentType: 'Formal Product Architecture & Mobile UX Specification',
    version: '2.4.0-PROD',
    date: 'September 2026',
    author: 'Principal Product Architect & Systems Analyst Team',
    targetRoles: ['Property Owner', 'Tenant Resident', 'Delegated Property Manager', 'Maintenance Staff'],
    excludedRoles: ['Superadmin (Web Management Portal Only)'],
  });

  // 2. Render Part 1 (Sections 1 - 8)
  console.log('Rendering Sections 1 - 8...');
  renderPart1(builder);

  // 3. Render Part 2 (Sections 9 - 16)
  console.log('Rendering Sections 9 - 16...');
  renderPart2(builder);

  // 4. Render Part 3 (Sections 17 - 26)
  console.log('Rendering Sections 17 - 26...');
  renderPart3(builder);

  // 5. Save Output PDF
  const outputPath = path.resolve(__dirname, '..', 'Propithub_Unified_Mobile_App_Specification.pdf');
  console.log(`Finalizing and writing PDF to ${outputPath}...`);
  builder.save(outputPath);
  console.log('PDF generation complete!');
}

main().catch((err) => {
  console.error('Error generating specification PDF:', err);
  process.exit(1);
});
