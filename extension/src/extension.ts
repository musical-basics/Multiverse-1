import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

let daemonProcess: ChildProcess | null = null;

export function activate() {
    console.log('Multiverse VC activated. Spawning Daemon...');

    // Path targeting the go daemon directory
    const daemonPath = path.join(__dirname, '..', '..', 'daemon');

    // Spawn the go process (uses `go run` for dev scaffolding)
    daemonProcess = spawn('go', ['run', 'main.go'], {
        cwd: daemonPath,
        shell: true,
    });

    daemonProcess.stdout?.on('data', (data) => {
        console.log(`[Daemon]: ${data}`);
    });

    daemonProcess.stderr?.on('data', (data) => {
        console.error(`[Daemon Error]: ${data}`);
    });
}

export function deactivate() {
    if (daemonProcess) {
        console.log('Killing Multiverse Daemon...');
        daemonProcess.kill();
        daemonProcess = null;
    }
}
