import fs from 'fs';
import path from 'path';

const figmaData = JSON.parse(fs.readFileSync('scripts/figma_full_audit.json', 'utf8'));

const screenFileMap = {
  '3:21': 'AuthGatewayScreen.tsx',
  '3:56': 'OwnerDashboardScreen.tsx',
  '3:155': 'PropertyPortfolioScreen.tsx',
  '3:235': 'TenantRosterScreen.tsx',
  '3:314': 'LeasingHubScreen.tsx',
  '3:382': 'VacatesMoveoutScreen.tsx',
  '3:466': 'FinancialLedgerScreen.tsx',
  '3:539': 'OwnerMaintenanceDispatchScreen.tsx',
  '3:600': 'AccountSettingsScreen.tsx',
  '3:946': 'TenantDashboardScreen.tsx',
  '3:1041': 'TenantLeaseScreen.tsx',
  '3:1131': 'TenantPaymentsScreen.tsx',
  '3:1219': 'TenantMaintenanceScreen.tsx',
  '3:1298': 'ManagerOperationsScreen.tsx',
  '3:1373': 'ManagerRepairDispatchScreen.tsx',
  '3:1454': 'StaffJobQueueScreen.tsx',
  '3:1529': 'StaffEarningsScreen.tsx',
  '9:12': 'OwnerMessagesScreen.tsx',
  '9:120': 'OwnerTeamManagersScreen.tsx',
  '9:208': 'OwnerDisputesReviewsScreen.tsx',
  '9:309': 'OwnerHelpdeskScreen.tsx',
  '9:384': 'OwnerPlanSubscriptionScreen.tsx',
  '9:483': 'TenantLandlordReviewsScreen.tsx',
  '9:579': 'ManagerPropertiesScreen.tsx',
  '9:661': 'ManagerLeaseDocumentsScreen.tsx',
  '9:759': 'StaffRatingsScreen.tsx',
};

console.log('=== VERIFYING ALL 26 FIGMA SCREENS AGAINST CODEBASE ===\n');

let totalScreens = 0;
let totalTexts = 0;
let matchedTexts = 0;
let screenReports = [];

figmaData.forEach(screen => {
  const fileName = screenFileMap[screen.id];
  totalScreens++;
  if (!fileName) {
    console.error(`[MISSING MAPPING] Frame ${screen.id} (${screen.name}) has no file mapping!`);
    return;
  }

  const filePath = path.join('mobile', 'src', 'screens', fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`[FILE NOT FOUND] ${filePath}`);
    return;
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');

  // Filter out status bar texts like 9:41
  const significantTexts = screen.allTexts
    .map(t => t.text)
    .filter(t => t !== '9:41' && t.length > 1);

  const missing = [];
  const found = [];

  significantTexts.forEach(txt => {
    totalTexts++;
    // Normalize spaces and search
    const cleanTxt = txt.replace(/\s+/g, ' ');
    if (fileContent.includes(cleanTxt) || fileContent.toLowerCase().includes(cleanTxt.toLowerCase())) {
      matchedTexts++;
      found.push(cleanTxt);
    } else {
      missing.push(cleanTxt);
    }
  });

  const percent = Math.round((found.length / significantTexts.length) * 100);
  screenReports.push({
    index: screen.index,
    id: screen.id,
    name: screen.name,
    file: fileName,
    totalCount: significantTexts.length,
    foundCount: found.length,
    missingCount: missing.length,
    percent,
    missing
  });
});

screenReports.forEach(r => {
  console.log(`[Screen ${r.index.toString().padStart(2, ' ')} / 26] ${r.name.padEnd(26, ' ')} -> ${r.file.padEnd(34, ' ')} Match: ${r.percent}% (${r.foundCount}/${r.totalCount})`);
  if (r.missing.length > 0) {
    console.log(`   Missing text snippets:`, r.missing);
  }
});

console.log(`\nOverall Text Accuracy: ${matchedTexts} / ${totalTexts} (${Math.round((matchedTexts / totalTexts) * 100)}%)`);
fs.writeFileSync('scripts/figma_verification_report.json', JSON.stringify(screenReports, null, 2));
