import { app } from '../backend/src/index';
import { validateNovel, type BlastReport, type ChatResponse, type Novel } from '../shared/index';

process.env.ALLOW_MUTATIONS = 'true';

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

async function runCheck(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, detail });
    console.error(`[FAIL] ${name}: ${detail}`);
  }
}

async function main() {
  console.log(`Starting self-contained Brainfly smoke checks...\n`);

  // Ensure backend is reachable; if not, spin up a self-contained server
  let localServer: ReturnType<typeof Bun.serve> | null = null;
  try {
    const probe = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (!probe || !probe.ok) {
      localServer = Bun.serve({ port: 3001, fetch: app.fetch });
      console.log(`Launched self-contained server at ${BASE_URL}\n`);
    } else {
      console.log(`Connected to existing server at ${BASE_URL}\n`);
    }
  } catch {
    localServer = Bun.serve({ port: 3001, fetch: app.fetch });
    console.log(`Launched self-contained server at ${BASE_URL}\n`);
  }

  try {
    // Step 0: Ensure active story is The Rabbit and the Turtle
    const switchRes = await fetch(`${BASE_URL}/api/switch-novel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novelId: 'the-great-woodland-race' }),
    });
    if (!switchRes.ok) {
      throw new Error(`Failed to switch to the-great-woodland-race: HTTP ${switchRes.status}`);
    }

    // Check 1: Health endpoint
    await runCheck('GET /api/health returns { ok: true }', async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as { ok: boolean };
      if (!data.ok) {
        throw new Error(`Expected { ok: true }, got ${JSON.stringify(data)}`);
      }
    });

    // Check 2: Novel validity via validateNovel (The Rabbit and the Turtle)
    await runCheck('GET /api/novel is valid via validateNovel (The Rabbit and the Turtle)', async () => {
      const res = await fetch(`${BASE_URL}/api/novel`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const novel = (await res.json()) as Novel;
      const errors = validateNovel(novel);
      if (errors.length > 0) {
        throw new Error(`validateNovel failed with errors: ${JSON.stringify(errors)}`);
      }
      if (novel.title !== 'The Rabbit and the Turtle') {
        throw new Error(`Expected title "The Rabbit and the Turtle", got "${novel.title}"`);
      }
      if (novel.author !== 'Aesop') {
        throw new Error(`Expected author "Aesop", got "${novel.author}"`);
      }
    });

    // Check 3: Blast radius for f3 on Rabbit & Turtle affects chapters [2, 3, 4, 5]
    await runCheck('POST /api/blast-radius for f3 affects chapters [2, 3, 4, 5]', async () => {
      const res = await fetch(`${BASE_URL}/api/blast-radius`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: 'f3',
          patch: { subject: 'tortoise' },
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const report = (await res.json()) as BlastReport;
      const chapters = report.summary.chaptersAffected.slice().sort((a, b) => a - b);
      const expected = [2, 3, 4, 5];
      const matches =
        chapters.length === expected.length &&
        chapters.every((val, idx) => val === expected[idx]);

      if (!matches) {
        throw new Error(
          `Expected chapters [2, 3, 4, 5], got ${JSON.stringify(report.summary.chaptersAffected)}`
        );
      }
    });

    // Check 4: Chat fence refusal at chapter 2 for the golden trophy
    await runCheck('POST /api/chat fence refusal at chapter 2 for the Golden Trophy', async () => {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: 'tortoise',
          upToChapter: 2,
          message: 'Do you know about the golden trophy?',
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const chatRes = (await res.json()) as ChatResponse;
      if (!chatRes.refused) {
        throw new Error(
          `Expected refused: true for golden trophy at chapter 2, got ${JSON.stringify(chatRes)}`
        );
      }
    });

    // Check 5: Reset restores original novel
    await runCheck('POST /api/reset restores the original novel', async () => {
      const res = await fetch(`${BASE_URL}/api/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: 'the-great-woodland-race' }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as { novel: Novel };
      const errors = validateNovel(data.novel);
      if (errors.length > 0) {
        throw new Error(`Restored novel invalid: ${JSON.stringify(errors)}`);
      }
      if (data.novel.title !== 'The Rabbit and the Turtle') {
        throw new Error(`Expected title "The Rabbit and the Turtle", got "${data.novel.title}"`);
      }
    });

    console.log('\n--- Smoke Test Summary ---');
    const allPassed = results.every((r) => r.passed);
    const passedCount = results.filter((r) => r.passed).length;
    console.log(`Total Checks: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);

    if (!allPassed) {
      console.error('\nSmoke checks FAILED.');
      process.exit(1);
    } else {
      console.log('\nAll smoke checks PASSED.');
      process.exit(0);
    }
  } finally {
    localServer?.stop(true);
  }
}

main().catch((err) => {
  console.error('Fatal smoke test runner error:', err);
  process.exit(1);
});
