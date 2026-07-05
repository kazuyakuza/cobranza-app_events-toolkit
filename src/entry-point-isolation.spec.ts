import { existsSync } from 'fs';
import { join } from 'path';
import { expect, describe, it } from '@jest/globals';

describe('main entry isolation from @jest/globals', () => {
  it('dist/index.js exists after build', () => {
    const distIndex = join(process.cwd(), 'dist', 'index.js');
    expect(existsSync(distIndex)).toBe(true);
  });

  it('dist/index.d.ts exists after build', () => {
    const distTypes = join(process.cwd(), 'dist', 'index.d.ts');
    expect(existsSync(distTypes)).toBe(true);
  });

  it('dist/testing/index.js exists after build', () => {
    const distTesting = join(process.cwd(), 'dist', 'testing', 'index.js');
    expect(existsSync(distTesting)).toBe(true);
  });

  it('main entry does not transitively load @jest/globals', () => {
    const distIndex = join(process.cwd(), 'dist', 'index.js');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    delete require.cache[require.resolve(distIndex)];

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mainModule = require(distIndex);
    expect(mainModule).toBeDefined();
    expect(typeof mainModule.EventsToolkitModule).toBe('function');

    const testingKeySep = join('dist', 'testing') + '/';
    const testingKeyWin = join('dist', 'testing') + '\\';
    const isTestingCacheKey = (key: string): boolean => key.includes(testingKeySep) || key.includes(testingKeyWin);

    const testingCacheKey = Object.keys(require.cache).find(isTestingCacheKey);
    expect(testingCacheKey).toBeUndefined();
  });

  it('testing subpath is loadable inside a Jest environment', () => {
    const distTesting = join(process.cwd(), 'dist', 'testing', 'index.js');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const testingModule = require(distTesting);
    expect(testingModule).toBeDefined();
    expect(typeof testingModule.MockProducerService).toBe('function');
    expect(typeof testingModule.expectEventPublished).toBe('function');
  });
});
