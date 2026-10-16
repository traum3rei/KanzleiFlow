export const TEST_DATABASE_URL = 'postgresql://kf_test:kf_test_local_only@127.0.0.1:55439/kanzleiflow_test';
export function assertTestDatabase(url) {
  if (url !== TEST_DATABASE_URL) throw new Error('Refusing database access: only the disposable local test database is permitted.');
}
