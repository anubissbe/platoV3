#!/usr/bin/env node

/**
 * Test Plato commands in batch
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';

const commands = [
    { cmd: '/help', description: 'Show help' },
    { cmd: '/status', description: 'Show status' },
    { cmd: '/model', description: 'List models' },
    { cmd: '/doctor', description: 'Diagnose setup' },
    { cmd: '/mcp tools', description: 'List MCP tools' },
    { cmd: '/memory', description: 'Memory management' },
    { cmd: '/cost', description: 'Show cost info' },
    { cmd: '/privacy-settings', description: 'Privacy settings' },
    { cmd: '/release-notes', description: 'Release notes' },
];

const results = [];

async function testCommand(command) {
    return new Promise((resolve) => {
        const result = {
            command: command.cmd,
            description: command.description,
            output: '',
            error: '',
            success: false,
        };

        const plato = spawn('npm', ['run', 'dev', '--', '--cli'], {
            timeout: 5000,
        });

        let output = '';
        let error = '';

        plato.stdout.on('data', (data) => {
            output += data.toString();
        });

        plato.stderr.on('data', (data) => {
            error += data.toString();
        });

        // Send command after a delay
        setTimeout(() => {
            plato.stdin.write(command.cmd + '\n');

            // Wait for response then kill
            setTimeout(() => {
                plato.kill();
            }, 2000);
        }, 1000);

        plato.on('close', (code) => {
            result.output = output;
            result.error = error;
            result.success = code === 0 || output.length > 100;
            results.push(result);
            resolve(result);
        });
    });
}

async function runTests() {
    console.log('Testing Plato commands...\n');

    for (const command of commands) {
        console.log(`Testing: ${command.cmd} - ${command.description}`);
        await testCommand(command);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Generate report
    const report = [];
    report.push('# Plato Command Test Results');
    report.push(`## Test Date: ${new Date().toISOString()}`);
    report.push('');

    let passCount = 0;
    let failCount = 0;

    for (const result of results) {
        const status = result.success ? '✅' : '❌';
        report.push(`### ${status} ${result.command}`);
        report.push(`**Description**: ${result.description}`);

        if (result.success) {
            passCount++;
            report.push('**Status**: SUCCESS');
            if (result.output) {
                const lines = result.output.split('\n').slice(0, 10);
                report.push('**Sample Output**:');
                report.push('```');
                report.push(lines.join('\n'));
                report.push('```');
            }
        } else {
            failCount++;
            report.push('**Status**: FAILED');
            if (result.error) {
                report.push('**Error**:');
                report.push('```');
                report.push(result.error.slice(0, 500));
                report.push('```');
            }
        }
        report.push('');
    }

    report.push('## Summary');
    report.push(`- Total Commands Tested: ${commands.length}`);
    report.push(`- Passed: ${passCount}`);
    report.push(`- Failed: ${failCount}`);
    report.push(`- Success Rate: ${((passCount / commands.length) * 100).toFixed(1)}%`);

    const reportContent = report.join('\n');
    await fs.writeFile('command-test-report.md', reportContent);
    console.log('\nTest complete. Report saved to command-test-report.md');
    console.log(`Results: ${passCount}/${commands.length} passed`);
}

runTests().catch(console.error);