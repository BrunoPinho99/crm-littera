import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      SUPABASE_URL: 'https://dummy.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://dummy.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key',
      APP_URL: 'http://localhost:3000',
      BREVO_API_KEY: 'xkeysib-dummy-test-key',
      UNSUBSCRIBE_SECRET: 'dummy-secret-32-bytes-minimum-length',
      CRON_SECRET: 'dummy-cron-secret',
      CALCOM_WEBHOOK_SECRET: 'dummy-calcom-secret',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts', 'src/actions/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'server-only': path.resolve(import.meta.dirname, './tests/mocks/server-only.ts'),
    },
  },
});
