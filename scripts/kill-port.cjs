#!/usr/bin/env node

'use strict';

const { spawnSync } = require('child_process');

const DEFAULT_PORT = 5173;

function showHelp() {
  console.log(`Usage: node scripts/kill-port.cjs [port|--port <port>]\n\n` +
    `Attempts to terminate any process listening on the specified port.\n` +
    `Defaults to port ${DEFAULT_PORT}.`);
}

function parsePort(args) {
  let port = DEFAULT_PORT;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }

    if (arg === '--') {
      continue;
    }

    if (arg.startsWith('--port=')) {
      port = coercePort(arg.split('=')[1]);
      continue;
    }

    if (arg === '--port') {
      if (i + 1 >= args.length) {
        fail('Missing value for --port option.');
      }
      port = coercePort(args[i + 1]);
      i += 1;
      continue;
    }

    if (!arg.startsWith('-')) {
      port = coercePort(arg);
      continue;
    }

    fail(`Unknown option: ${arg}`);
  }

  return port;
}

function coercePort(value) {
  if (!value) {
    fail('Port value is required.');
  }
  const normalized = String(value).trim().replace(/^:/, '');
  const port = Number.parseInt(normalized, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail(`Invalid port: ${value}`);
  }
  return port;
}

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function gracefulExit(message) {
  console.warn(message);
  console.warn('Skipping port termination.');
  process.exit(0);
}

function commandExists(cmd) {
  const isWindows = process.platform === 'win32';
  const checkCmd = isWindows ? 'where' : 'command';
  const args = isWindows ? [cmd] : ['-v', cmd];
  const result = spawnSync(checkCmd, args, { stdio: 'ignore' });
  if (result.error) {
    return false;
  }
  return result.status === 0;
}

function killOnUnix(port) {
  if (!commandExists('lsof')) {
    gracefulExit('Required command "lsof" not found. Please install it to enable automatic cleanup.');
  }

  console.log(`Checking for listeners on port ${port} using lsof...`);
  const lookup = spawnSync('lsof', ['-t', `-i:${port}`], { encoding: 'utf8' });

  if (lookup.error && lookup.error.code === 'ENOENT') {
    gracefulExit('lsof command not available.');
  }

  const rawOutput = (lookup.stdout || '').trim();

  if (!rawOutput) {
    console.log(`No process is currently listening on port ${port}.`);
    return;
  }

  const pids = Array.from(new Set(rawOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)));

  if (pids.length === 0) {
    console.log(`No process is currently listening on port ${port}.`);
    return;
  }

  console.log(`Found ${pids.length} process${pids.length === 1 ? '' : 'es'} on port ${port}: ${pids.join(', ')}.`);
  const failures = [];
  pids.forEach((pid) => {
    const numericPid = Number.parseInt(pid, 10);
    if (!Number.isInteger(numericPid)) {
      console.warn(`Skipping non-numeric PID value: ${pid}`);
      return;
    }

    try {
      process.kill(numericPid, 'SIGTERM');
      console.log(`Sent SIGTERM to PID ${numericPid}.`);
    } catch (err) {
      if (err.code === 'ESRCH') {
        console.log(`Process ${numericPid} is no longer running.`);
        return;
      }

      console.warn(`Failed to terminate PID ${numericPid} with SIGTERM (${err.message}). Trying SIGKILL...`);
      try {
        process.kill(numericPid, 'SIGKILL');
        console.log(`Sent SIGKILL to PID ${numericPid}.`);
      } catch (err2) {
        failures.push({ pid: numericPid, error: err2 });
        console.error(`Unable to kill PID ${numericPid}: ${err2.message}`);
      }
    }
  });

  if (failures.length > 0) {
    fail(`Failed to terminate ${failures.length} process${failures.length === 1 ? '' : 'es'}. See messages above.`);
  }

  console.log(`Port ${port} should now be free.`);
}

function killOnWindows(port) {
  if (!commandExists('netstat')) {
    gracefulExit('Required command "netstat" not found. It is typically included with Windows.');
  }
  if (!commandExists('taskkill')) {
    gracefulExit('Required command "taskkill" not found. It is typically included with Windows.');
  }

  console.log(`Checking for listeners on port ${port} using netstat...`);
  const lookup = spawnSync('cmd.exe', ['/c', `netstat -ano | findstr :${port}`], { encoding: 'utf8' });

  if (lookup.error) {
    fail(`Failed to run netstat: ${lookup.error.message}`);
  }

  const lines = (lookup.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const pids = Array.from(new Set(lines.map((line) => {
    const parts = line.split(/\s+/);
    return parts[parts.length - 1];
  }).filter(Boolean)));

  if (pids.length === 0) {
    console.log(`No process is currently listening on port ${port}.`);
    return;
  }

  console.log(`Found ${pids.length} process${pids.length === 1 ? '' : 'es'} on port ${port}: ${pids.join(', ')}.`);
  const failures = [];

  pids.forEach((pid) => {
    const numericPid = Number.parseInt(pid, 10);
    if (!Number.isInteger(numericPid)) {
      console.warn(`Skipping non-numeric PID value: ${pid}`);
      return;
    }

    const result = spawnSync('taskkill', ['/PID', String(numericPid), '/F']);
    if (result.error) {
      failures.push({ pid: numericPid, error: result.error });
      console.error(`Unable to kill PID ${numericPid}: ${result.error.message}`);
      return;
    }

    if (result.status !== 0) {
      failures.push({ pid: numericPid, error: new Error(`taskkill exited with code ${result.status}`) });
      const stderr = (result.stderr || '').toString().trim();
      if (stderr) {
        console.error(stderr);
      }
      console.error(`taskkill failed for PID ${numericPid} (exit code ${result.status}).`);
      return;
    }

    console.log(`Terminated PID ${numericPid}.`);
  });

  if (failures.length > 0) {
    fail(`Failed to terminate ${failures.length} process${failures.length === 1 ? '' : 'es'}. See messages above.`);
  }

  console.log(`Port ${port} should now be free.`);
}

function main() {
  const port = parsePort(process.argv.slice(2));
  console.log(`Ensuring port ${port} is free...`);

  if (process.platform === 'win32') {
    killOnWindows(port);
  } else {
    killOnUnix(port);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
