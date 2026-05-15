module.exports = {
  apps: [{
    name: 'em-box-server',
    script: 'dist/index.js',
    cwd: './server',
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
    },
    // Graceful shutdown
    kill_timeout: 10000,
    listen_timeout: 10000,
    // Logging
    error_file: './logs/server-error.log',
    out_file: './logs/server-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    restart_delay: 4000,
  }],
};
