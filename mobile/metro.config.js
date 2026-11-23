const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable .cjs extension so Metro bundler resolves Firebase modular packages
config.resolver.sourceExts.push('cjs');

// Demo / simulator build: swap Firebase for the in-memory stand-in (no network, no real data).
if (process.env.EXPO_PUBLIC_DEMO_BACKEND === '1') {
  const demo = (name) => path.join(__dirname, 'src/demo/firebase', name + '.ts');
  const aliases = {
    'firebase/app': demo('app'),
    'firebase/auth': demo('auth'),
    '@firebase/auth': demo('auth'),
    'firebase/firestore': demo('firestore'),
    'firebase/storage': demo('storage'),
    'firebase/functions': demo('functions'),
  };
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (aliases[moduleName]) return { type: 'sourceFile', filePath: aliases[moduleName] };
    return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
