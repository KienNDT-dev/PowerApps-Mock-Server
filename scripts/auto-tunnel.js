const { spawn } = require("child_process");

const tunnels = [
  {
    name: "Serveo",
    cmd: "ssh",
    args: [
      "-o",
      "StrictHostKeyChecking=no",
      "-R",
      "80:localhost:5000",
      "serveo.net",
    ],
  },
  {
    name: "Localhost.run",
    cmd: "ssh",
    args: [
      "-o",
      "StrictHostKeyChecking=no",
      "-R",
      "80:localhost:5000",
      "ssh.localhost.run",
    ],
  },
  {
    name: "LocalTunnel",
    cmd: "npx",
    args: ["localtunnel", "--port", "5000", "--subdomain", "powerapp-lof"],
  },
  {
    name: "Pinggy",
    cmd: "ssh",
    args: [
      "-p",
      "443",
      "-R",
      "0:localhost:5000",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ServerAliveInterval=30",
      "a.pinggy.io",
    ],
  },
];

function startTunnel(tunnel) {
  console.log(`🔄 Starting ${tunnel.name}...`);

  const process = spawn(tunnel.cmd, tunnel.args);
  let hasUrl = false;

  process.stdout.on("data", (data) => {
    const text = data.toString();
    console.log(text.trim());

    // Look for HTTPS URLs
    const urlMatch = text.match(/https:\/\/[^\s]+/);
    if (urlMatch && !hasUrl) {
      hasUrl = true;
      console.log(`\n✅ ${tunnel.name} Tunnel Active: ${urlMatch[0]}`);
      console.log(
        `📝 Power Automate URL: ${urlMatch[0]}/contractor-auth/login`
      );
      console.log(`\n🔄 Tunnel running... Press Ctrl+C to stop\n`);
    }
  });

  process.stderr.on("data", (data) => {
    const text = data.toString();
    console.log(text.trim());

    // Check stderr for URLs too
    const urlMatch = text.match(/https:\/\/[^\s]+/);
    if (urlMatch && !hasUrl) {
      hasUrl = true;
      console.log(`\n✅ ${tunnel.name} Tunnel Active: ${urlMatch[0]}`);
      console.log(
        `📝 Power Automate URL: ${urlMatch[0]}/contractor-auth/login`
      );
      console.log(`\n🔄 Tunnel running... Press Ctrl+C to stop\n`);
    }
  });

  process.on("close", (code) => {
    console.log(`\n❌ ${tunnel.name} tunnel closed (code: ${code})`);
    if (!hasUrl) {
      tryNextTunnel();
    }
  });

  process.on("error", (err) => {
    console.log(`❌ ${tunnel.name} error: ${err.message}`);
    tryNextTunnel();
  });

  // Return process so we can manage it
  return process;
}

let currentTunnelIndex = 0;
let currentProcess = null;

function tryNextTunnel() {
  if (currentTunnelIndex >= tunnels.length) {
    console.log("❌ All tunnel options exhausted. Try manual commands:");
    console.log("   npm run tunnel:serveo");
    console.log("   npm run tunnel:localhost");
    console.log("   npm run tunnel:localtunnel");
    return;
  }

  const tunnel = tunnels[currentTunnelIndex];
  currentTunnelIndex++;

  console.log(
    `\n🌐 Trying tunnel ${currentTunnelIndex}/${tunnels.length}: ${tunnel.name}`
  );
  currentProcess = startTunnel(tunnel);
}

function shutdown() {
  console.log("\n🛑 Shutting down tunnel...");
  if (currentProcess) {
    currentProcess.kill("SIGTERM");

    // Force kill after 3 seconds
    setTimeout(() => {
      if (currentProcess) {
        currentProcess.kill("SIGKILL");
      }
    }, 3000);
  }
  process.exit(0);
}

// Handle Ctrl+C
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("🌐 Auto-detecting best tunnel for HTTPS...");
console.log("💡 Make sure your Node.js server is running on port 5000\n");

// Start trying tunnels
tryNextTunnel();
