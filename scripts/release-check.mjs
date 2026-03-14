import { spawn } from 'node:child_process';

const commandSets = {
  base: [
    ['npm', ['test']],
    ['npm', ['run', 'test:coverage']],
    ['npm', ['run', 'build']],
    ['npm', ['run', 'test:e2e:smoke']],
    ['npm', ['audit', '--omit=dev', '--audit-level=high']]
  ],
  full: [
    ['npm', ['test']],
    ['npm', ['run', 'test:coverage']],
    ['npm', ['run', 'build']],
    ['npm', ['run', 'test:e2e:full']],
    ['npm', ['audit', '--omit=dev', '--audit-level=high']]
  ]
};

const mode = process.argv[2] === 'full' ? 'full' : 'base';

for (const [command, args] of commandSets[mode]) {
  await run(command, args);
}

console.log(`Release check (${mode}) completed successfully.`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}
