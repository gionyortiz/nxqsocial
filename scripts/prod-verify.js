#!/usr/bin/env node

const { execSync } = require('child_process');

function run(label, command) {
  console.log(`\n=== ${label} ===`);
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    process.stdout.write(output.trim() ? `${output.trim()}\n` : '(no output)\n');
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout).trim() : '';
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    if (stdout) process.stdout.write(`${stdout}\n`);
    if (stderr) process.stderr.write(`${stderr}\n`);
    process.exitCode = 1;
  }
}

console.log('NXQ production verify');
console.log('Target: nxq (ssh config alias)');

run('Readiness', 'ssh nxq "curl -s https://api.nxqsocial.com/api/health/ready"');
run('Health', 'ssh nxq "curl -s https://api.nxqsocial.com/api/health"');
run('Containers', 'ssh nxq "cd /root/nxqsocial && docker-compose -f docker-compose.prod.yml ps"');

if (process.exitCode === 1) {
  console.error('\nOne or more checks failed.');
} else {
  console.log('\nAll checks completed.');
}
