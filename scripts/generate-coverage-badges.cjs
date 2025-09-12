#!/usr/bin/env node
/**
 * Generate coverage badges from Jest coverage summary
 */

const fs = require('fs');
const path = require('path');

/**
 * Get badge color based on coverage percentage
 * @param {number} coverage - Coverage percentage (0-100)
 * @returns {string} Badge color
 */
function getBadgeColor(coverage) {
  if (coverage >= 90) return 'brightgreen';
  if (coverage >= 80) return 'green';
  if (coverage >= 70) return 'yellow';
  if (coverage >= 60) return 'orange';
  return 'red';
}

/**
 * Generate badge URL
 * @param {string} label - Badge label
 * @param {string} message - Badge message
 * @param {string} color - Badge color
 * @returns {string} Badge URL
 */
function generateBadgeUrl(label, message, color) {
  return `https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(message)}-${color}`;
}

/**
 * Main function to generate coverage badges
 */
function main() {
  try {
    const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
    
    if (!fs.existsSync(coveragePath)) {
      console.error('❌ Coverage summary not found. Run tests with coverage first.');
      console.error('   Run: npm run test:coverage:comprehensive');
      process.exit(1);
    }

    const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    const totals = coverageData.total;

    // Generate badge information
    const badges = {
      lines: {
        percentage: totals.lines.pct,
        color: getBadgeColor(totals.lines.pct),
        url: generateBadgeUrl('Coverage-Lines', `${totals.lines.pct}%`, getBadgeColor(totals.lines.pct))
      },
      statements: {
        percentage: totals.statements.pct,
        color: getBadgeColor(totals.statements.pct),
        url: generateBadgeUrl('Coverage-Statements', `${totals.statements.pct}%`, getBadgeColor(totals.statements.pct))
      },
      functions: {
        percentage: totals.functions.pct,
        color: getBadgeColor(totals.functions.pct),
        url: generateBadgeUrl('Coverage-Functions', `${totals.functions.pct}%`, getBadgeColor(totals.functions.pct))
      },
      branches: {
        percentage: totals.branches.pct,
        color: getBadgeColor(totals.branches.pct),
        url: generateBadgeUrl('Coverage-Branches', `${totals.branches.pct}%`, getBadgeColor(totals.branches.pct))
      }
    };

    // Calculate overall coverage
    const overall = Math.round(
      (totals.lines.pct + totals.statements.pct + totals.functions.pct + totals.branches.pct) / 4
    );
    badges.overall = {
      percentage: overall,
      color: getBadgeColor(overall),
      url: generateBadgeUrl('Coverage-Overall', `${overall}%`, getBadgeColor(overall))
    };

    // Output badges in different formats
    console.log('\n📊 Coverage Badge URLs:');
    console.log('========================');
    
    Object.entries(badges).forEach(([type, badge]) => {
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      console.log(`${typeLabel.padEnd(12)}: ${badge.url}`);
    });

    // Generate markdown badges
    console.log('\n📝 Markdown Format:');
    console.log('===================');
    Object.entries(badges).forEach(([type, badge]) => {
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      console.log(`![${typeLabel} Coverage](${badge.url})`);
    });

    // Generate README format
    console.log('\n📄 README.md Format:');
    console.log('====================');
    console.log('## Coverage Status');
    console.log('');
    Object.entries(badges).forEach(([type, badge]) => {
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      console.log(`[![${typeLabel} Coverage](${badge.url})](./coverage/lcov-report/index.html)`);
    });

    // Save badge data for programmatic use
    const badgeDataPath = path.join(process.cwd(), 'coverage', 'badge-data.json');
    fs.writeFileSync(badgeDataPath, JSON.stringify(badges, null, 2));
    console.log(`\n💾 Badge data saved to: ${badgeDataPath}`);

    // Coverage summary
    console.log('\n📈 Coverage Summary:');
    console.log('===================');
    console.log(`Overall:    ${overall}% ${getBadgeColor(overall)}`);
    console.log(`Lines:      ${totals.lines.pct}% (${totals.lines.covered}/${totals.lines.total})`);
    console.log(`Statements: ${totals.statements.pct}% (${totals.statements.covered}/${totals.statements.total})`);
    console.log(`Functions:  ${totals.functions.pct}% (${totals.functions.covered}/${totals.functions.total})`);
    console.log(`Branches:   ${totals.branches.pct}% (${totals.branches.covered}/${totals.branches.total})`);

    // Threshold check
    const thresholds = { lines: 80, statements: 80, functions: 80, branches: 80, overall: 80 };
    const failedThresholds = [];
    
    Object.entries(badges).forEach(([type, badge]) => {
      if (badge.percentage < thresholds[type]) {
        failedThresholds.push(`${type}: ${badge.percentage}% < ${thresholds[type]}%`);
      }
    });

    if (failedThresholds.length > 0) {
      console.log('\n⚠️  Coverage Thresholds Not Met:');
      failedThresholds.forEach(failure => console.log(`   ${failure}`));
      process.exit(1);
    } else {
      console.log('\n✅ All coverage thresholds met!');
    }

  } catch (error) {
    console.error('❌ Error generating coverage badges:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, getBadgeColor, generateBadgeUrl };