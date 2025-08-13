module.exports = {
  apps: [{
    name: 'dataset-downloader',
    script: 'downloader.js',
    args: process.env.DOWNLOAD_URL || '',
    instances: 1,
    autorestart: false,  // Don't restart after completion
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      DOWNLOAD_DIRECTORY: '/mnt/volume_ams3_01'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
