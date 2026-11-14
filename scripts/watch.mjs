import { spawn } from 'node:child_process';
const children = [
  spawn('npm', ['exec', '--', 'vite', 'build', '--watch', '--emptyOutDir=false'], { stdio: 'inherit' }),
  spawn('npm', ['exec', '--', 'vite', 'build', '--watch', '--config', 'vite.content.config.mjs'], { stdio: 'inherit' }),
];
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { children.forEach(child => child.kill(signal)); });
