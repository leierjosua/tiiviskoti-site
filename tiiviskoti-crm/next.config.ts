import type { NextConfig } from 'next';

const config: NextConfig = {
  // postgres.js on natiivi Node-kirjasto: se ei saa päätyä selainbundleen
  // eikä Edge-runtimeen.
  serverExternalPackages: ['postgres'],
};

export default config;
