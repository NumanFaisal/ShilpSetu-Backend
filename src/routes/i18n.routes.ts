import { Router, type Request, type Response, type NextFunction } from 'express';
import { HttpError } from '../lib/http-error';

const router = Router();

const SUPPORTED_LANGS = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn'] as const;

/** Load a locale JSON at request time (avoids bundling all locales at startup). */
async function loadLocale(lang: string): Promise<Record<string, string>> {
  // dynamic import so only the requested locale is read
  const mod = await import(`../i18n/locales/${lang}.json`);
  return mod.default as Record<string, string>;
}

// GET /api/i18n/:lang — return the full locale for the given language
router.get('/i18n/:lang', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lang = req.params.lang.toLowerCase();
    if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) {
      throw new HttpError(404, `Unsupported language: ${lang}`);
    }
    const locale = await loadLocale(lang);
    res.json({ lang, translations: locale });
  } catch (err) { next(err); }
});

export default router;
