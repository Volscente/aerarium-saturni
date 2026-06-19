/** @type {import('@lhci/cli').LHCIConfig} */
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node .next/standalone/server.js',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 30000,
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/tabularium',
        'http://localhost:3000/tabularium/transactions',
        'http://localhost:3000/codex/fundamentals',
      ],
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
}
