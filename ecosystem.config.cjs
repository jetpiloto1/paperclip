module.exports = {
  apps: [{
    name: "paperclip",
    script: "pnpm",
    args: "paperclipai run --bind lan",
    cwd: "/opt/paperclip",
    interpreter: "/usr/bin/node",

    // Restart behavior
    autorestart: true,
    max_restarts: 10,
    min_uptime: "30s",
    kill_timeout: 10000,

    // Memory management
    max_memory_restart: "1G",

    // Logging
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",

    // Error handling
    max_size: "100M",
    retain: 10,

    // Process
    exec_mode: "fork_mode",
    watch: false,
  }],
};
