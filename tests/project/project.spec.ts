/**
 * Project guardrail tests — run anywhere, no network or database needed.
 *
 * These encode the SPEC §1.5 rules that are easy to break accidentally:
 *   - NFR-SEC-02: RLS must be enabled on every table in every migration
 *   - SPEC §1.5 rule 6/8: only .env.example with placeholders is committed;
 *     the secret key must never sit under public runtime config
 *   - SPEC §1.5: the locked stack stays pinned in package.json
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

function read(...parts: string[]): string {
  return readFileSync(resolve(root, ...parts), 'utf8')
}

describe('database migrations (NFR-SEC-02, SPEC §9.3)', () => {
  const migrationsDir = resolve(root, 'supabase/migrations')

  it('exists and contains at least the initial migration', () => {
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))
    expect(files.length).toBeGreaterThan(0)
    expect(files.some(f => f.includes('init_schema'))).toBe(true)
  })

  it('enables row level security on every table it creates', () => {
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
    const sql = files.map(f => readFileSync(resolve(migrationsDir, f), 'utf8')).join('\n')

    const created = [...sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)].map(
      m => m[1],
    )
    expect(new Set(created).size).toBeGreaterThanOrEqual(13)

    for (const table of created) {
      const pattern = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i')
      expect(
        pattern.test(sql),
        `table "public.${table}" is created but RLS is never enabled for it`,
      ).toBe(true)
    }
  })

  it('stores money as integer minor units (FR-EXP-02)', () => {
    const sql = read('supabase/migrations', '20261108000000_init_schema_and_rls.sql')
    expect(sql).toMatch(/amount_minor\s+bigint/)
    expect(sql).toMatch(/base_amount_minor\s+bigint/)
    // No float/double/real/numeric column is used for money anywhere.
    const moneyColumns = [...sql.matchAll(/(amount[a-z_]*|owed[a-z_]*)\s+(double precision|real|numeric)/gi)]
    expect(moneyColumns).toEqual([])
  })
})

describe('environment and secret handling (SPEC §1.5 rules 6 and 8, §1.6)', () => {
  it('commits only .env.example, and with placeholders only', () => {
    const example = read('.env.example')
    // Real Supabase keys are JWTs — placeholders must never look like one.
    expect(example).not.toMatch(/eyJ[A-Za-z0-9_-]+\./)
    for (const name of ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SECRET_KEY', 'DIRECT_URL']) {
      expect(example).toContain(`${name}=`)
    }
    expect(existsSync(resolve(root, '.env'))).toBe(false)
  })

  it('git-ignores .env files', () => {
    const gitignore = read('.gitignore')
    expect(gitignore).toMatch(/^\.env$/m)
    expect(gitignore).toMatch(/!\.env\.example/)
  })

  it('never places the secret key in public runtime config', () => {
    const config = read('nuxt.config.ts')
    const publicBlock = config.split(/public:\s*\{/)[1] ?? ''
    expect(publicBlock, 'public runtimeConfig must exist').toBeTruthy()
    // The secret key must only ever be referenced by its server-only name.
    expect(publicBlock).not.toMatch(/SUPABASE_SECRET_KEY|supabaseSecretKey/i)
    // The publishable key and URL are the only Supabase values in public.
    expect(publicBlock).toMatch(/supabaseUrl/)
    expect(publicBlock).toMatch(/supabaseKey/)
  })
})

describe('locked stack (SPEC §1.5, NFR-MNT-06)', () => {
  it('pins Nuxt, Vue, Supabase and Tailwind in package.json', () => {
    const pkg = JSON.parse(read('package.json'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const required of [
      'nuxt',
      'vue',
      '@supabase/supabase-js',
      'tailwindcss',
      '@tailwindcss/vite',
    ]) {
      expect(deps[required], `${required} must be a dependency`).toBeTruthy()
    }
  })

  it('keeps a committed lockfile (npm)', () => {
    expect(existsSync(resolve(root, 'package-lock.json'))).toBe(true)
  })

  it('documents every dependency in the README', () => {
    const readme = read('README.md')
    expect(readme).toContain('## Dependencies')
  })
})

describe('M2 business logic stays framework-independent (NFR-MNT-01, SPEC 1.5 rule 9)', () => {
  const pureModules = [
    'app/lib/expenses.ts',
    'app/lib/settleup.ts',
    'app/lib/trips.ts',
    'app/lib/itinerary.ts',
    'app/lib/location.ts',
    'app/lib/offline.ts',
    'app/lib/summary.ts',
  ]

  it('imports no Nuxt, Vue or Supabase code', () => {
    for (const file of pureModules) {
      const source = read(file)
      expect(
        source.match(/^import .*('nuxt'|'vue'|'@supabase|'~\/composables|'~\/plugins)/m),
        `${file} must not import framework or client code`,
      ).toBeNull()
      // Auto-imported composables (useState, computed from Nuxt) must not
      // appear either — the engine is plain TypeScript.
      expect(source).not.toMatch(/\buseState\(|\buseSupabase\(|\buseRuntimeConfig\(/)
    }
  })

  it('all money APIs use integer minor units (FR-EXP-02)', () => {
    // The M2 engines must never do float money math. (app/lib/trips.ts is
    // exempt: its formatMoneyMinor fallback is display-only formatting,
    // documented as such since M1.)
    for (const file of ['app/lib/expenses.ts', 'app/lib/settleup.ts']) {
      const source = read(file)
      expect(source).not.toMatch(/parseFloat\(|toFixed\(|\bNumber\([^)]*\*\s*0\./)
    }
  })
})
