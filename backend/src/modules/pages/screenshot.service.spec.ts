import { Test } from '@nestjs/testing';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ScreenshotService } from './screenshot.service';

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {
    constructor(private readonly values: Record<string, string> = {}) {}
    get(key: string, fallback?: string) {
      return this.values[key] ?? fallback;
    }
  },
}));
import { ConfigService } from '@nestjs/config';

// Регрессия: клонированная страница должна остаться самостоятельной копией
// после сохранения (§3 задания — раньше ресурсы продолжали грузиться с
// исходного сайта через <base href>). commitClonedAssets() переносит
// временную папку клона (tmp-{cloneId}) под постоянный id страницы — если
// эта логика сломается, сохранённая страница либо потеряет ресурсы, либо
// будет ссылаться на несуществующие файлы.
describe('ScreenshotService — локальное хранение ассетов граббера', () => {
  let storageRoot: string;
  let service: ScreenshotService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'hmitf-assets-test-'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        ScreenshotService,
        { provide: ConfigService, useValue: new ConfigService({ STORAGE_ROOT: storageRoot }) },
      ],
    }).compile();
    service = moduleRef.get(ScreenshotService);
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('переносит временную папку клона под постоянный id страницы', async () => {
    const cloneId = 'clone-abc';
    const tmpDir = join(storageRoot, 'landing-assets', `tmp-${cloneId}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'asset-0.css'), 'body { color: red }');

    await service.commitClonedAssets(cloneId, 'page-1');

    const finalPath = service.assetPath('page-1', 'asset-0.css');
    const content = await readFile(finalPath, 'utf-8');
    expect(content).toBe('body { color: red }');
  });

  it('не падает, если у клона не было ассетов (временной папки не существует)', async () => {
    await expect(service.commitClonedAssets('no-such-clone', 'page-2')).resolves.toBeUndefined();
  });

  it('deleteAssets удаляет всю папку ассетов страницы', async () => {
    const dir = join(storageRoot, 'landing-assets', 'page-3');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'asset-0.png'), 'fake-png-bytes');

    await service.deleteAssets('page-3');

    await expect(readFile(join(dir, 'asset-0.png'))).rejects.toThrow();
  });
});
