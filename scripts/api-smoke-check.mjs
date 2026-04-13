const DEFAULT_API_BASE = process.env.MARKKET_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.markket.place';
const DEFAULT_DISPLAY_BASE = process.env.MARKKET_DISPLAY_BASE_URL || 'https://markket.place';
const AUTH_TOKEN = process.env.MARKKET_BEARER_TOKEN || '';
const MARKKET_USER_ID = process.env.MARKKET_USER_ID || '';

const apiBase = DEFAULT_API_BASE.replace(/\/$/, '');
const displayBase = DEFAULT_DISPLAY_BASE.replace(/\/$/, '');

function pad(label, value) {
  return `${label.padEnd(28)} ${value}`;
}

async function runCheck(name, url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, options);
    const elapsed = Date.now() - started;
    const ok = response.ok;
    const status = String(response.status);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${pad(name, status)} ${elapsed}ms`);
    if (!ok) {
      const body = (await response.text()).slice(0, 180).replace(/\s+/g, ' ').trim();
      if (body) {
        console.log(`      ${body}`);
      }
    }
    return ok;
  } catch (error) {
    const elapsed = Date.now() - started;
    const message = error instanceof Error ? error.message : 'Unknown network error';
    console.log(`FAIL ${pad(name, 'NETWORK')} ${elapsed}ms`);
    console.log(`      ${message}`);
    return false;
  }
}

async function main() {
  console.log('Markket API smoke check');
  console.log(`API base: ${apiBase}`);
  console.log(`Display base: ${displayBase}`);

  const checks = [];

  checks.push(
    runCheck(
      'stores list (public)',
      `${apiBase}/api/stores?pagination[page]=1&pagination[pageSize]=1`
    )
  );

  checks.push(
    runCheck(
      'articles list (public)',
      `${apiBase}/api/articles?pagination[page]=1&pagination[pageSize]=1`
    )
  );

  if (AUTH_TOKEN) {
    const authHeaders = {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      ...(MARKKET_USER_ID ? { 'markket-user-id': MARKKET_USER_ID } : {}),
    };

    checks.push(runCheck('users/me (direct auth)', `${apiBase}/api/users/me`, { headers: authHeaders }));

    checks.push(
      runCheck(
        'proxy users/me',
        `${displayBase}/api/markket?path=/api/users/me`,
        { headers: authHeaders }
      )
    );
  } else {
    console.log('INFO no MARKKET_BEARER_TOKEN set; skipping auth checks.');
  }

  const results = await Promise.all(checks);
  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.log(`Done with ${failed} failing check(s).`);
    process.exit(1);
  }

  console.log('Done. All checks passed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown script error';
  console.error(`Smoke check failed: ${message}`);
  process.exit(1);
});
