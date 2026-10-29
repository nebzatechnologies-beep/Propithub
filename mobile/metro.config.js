const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable .cjs extension so Metro bundler resolves Firebase modular packages
config.resolver.sourceExts.push('cjs');

module.exports = config;
