import { describe, expect, it } from 'vitest';
import { detectLanguage, I18n, LANGS } from '../../src/ui/i18n';

describe('detectLanguage', () => {
  it('follows the system language when nothing was saved', () => {
    expect(detectLanguage(['es-ES', 'en-US'], null)).toBe('es');
    expect(detectLanguage(['es-419'], null)).toBe('es');
    expect(detectLanguage(['en-GB', 'es'], null)).toBe('en');
  });

  it('skips unsupported languages and falls back to English', () => {
    expect(detectLanguage(['fr-FR', 'es-MX'], null)).toBe('es');
    expect(detectLanguage(['de-DE', 'ja'], null)).toBe('en');
    expect(detectLanguage([], null)).toBe('en');
  });

  it('prefers the language the player chose before', () => {
    expect(detectLanguage(['es-ES'], 'en')).toBe('en');
    expect(detectLanguage(['en-US'], 'es')).toBe('es');
    expect(detectLanguage(['es-ES'], 'klingon')).toBe('es');
  });
});

describe('I18n', () => {
  it('switches language, cycles through every language and notifies listeners', () => {
    const i18n = new I18n('en');
    let calls = 0;
    i18n.onChange(() => calls++);
    expect(i18n.t.undo).toContain('Undo');
    i18n.set(i18n.next());
    expect(i18n.lang).toBe('es');
    expect(i18n.t.undo).toContain('Deshacer');
    expect(calls).toBe(1);
    i18n.set('es');
    expect(calls).toBe(1);
    expect(i18n.next()).toBe(LANGS[0]);
  });

  it('builds the transformation caption in each language', () => {
    expect(new I18n('en').becomes('k')).toBe('King becomes the Sovereign');
    expect(new I18n('es').becomes('q')).toBe('La dama se convierte en la Dama Radiante');
  });

  it('has every string translated in every language', () => {
    const keysOf = (o: unknown, prefix = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === 'string' ? [`${prefix}${k}`] : keysOf(v, `${prefix}${k}.`),
      );
    const reference = keysOf(new I18n('en').t).sort();
    for (const lang of LANGS) {
      const t = new I18n(lang).t;
      expect(keysOf(t).sort()).toEqual(reference);
      for (const key of keysOf(t)) {
        const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], t);
        expect(value, `${lang}.${key}`).not.toBe('');
      }
    }
  });
});
