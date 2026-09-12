import type { Request, Response, NextFunction } from 'express';
import { createSeamlessStudioBackdrop } from '../modules/image/processing/studio';

/**
 * Preview size — small enough to be fast, large enough to show texture detail.
 */
const PREVIEW_SIZE = 400;

/**
 * Style metadata for the frontend to display labels and descriptions.
 */
const STYLES = [
  {
    id: 'white_studio',
    name: 'White Studio',
    description: 'Clean white cyclorama with soft diffused lighting. Perfect for Amazon, Flipkart, and general e-commerce.',
    previewColor: '#F5F6F8',
  },
  {
    id: 'wooden_surface',
    name: 'Wooden Surface',
    description: 'Warm teak wood tabletop with natural grain and soft directional lighting. Ideal for handmade and artisan products.',
    previewColor: '#A67B4B',
  },
  {
    id: 'marble_surface',
    name: 'Marble Surface',
    description: 'Luxurious Carrara marble with subtle gray veining and polished sheen. Great for jewelry, cosmetics, and premium products.',
    previewColor: '#E5E3DF',
  },
  {
    id: 'luxury',
    name: 'Luxury Dark',
    description: 'Dark editorial studio backdrop with golden rim lighting. Perfect for high-end and luxury product photography.',
    previewColor: '#1E222A',
  },
] as const;

let cachedStyles: any = null;

export class StyleController {
  /**
   * GET /api/studio-styles
   * Returns all available studio styles with preview images.
   */
  async listStyles(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (cachedStyles) {
        res.json({ styles: cachedStyles });
        return;
      }

      const styles = await Promise.all(
        STYLES.map(async (style) => {
          const previewBuffer = await createSeamlessStudioBackdrop(
            style.id,
            PREVIEW_SIZE,
            PREVIEW_SIZE
          );

          return {
            id: style.id,
            name: style.name,
            description: style.description,
            previewColor: style.previewColor,
            // Base64-encoded JPEG preview for the frontend to display directly
            preview: `data:image/jpeg;base64,${previewBuffer.toString('base64')}`,
          };
        })
      );

      cachedStyles = styles;
      res.json({ styles });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/studio-styles/:styleId/preview
   * Returns a single style preview as a JPEG image.
   */
  async getPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const styleId = req.params.styleId;
      const validStyle = STYLES.find((s) => s.id === styleId);

      if (!validStyle) {
        res.status(404).json({
          error: `Unknown style "${styleId}". Valid styles: ${STYLES.map((s) => s.id).join(', ')}`,
        });
        return;
      }

      const size = Math.min(800, Math.max(200, Number(req.query.size) || PREVIEW_SIZE));
      const previewBuffer = await createSeamlessStudioBackdrop(validStyle.id, size, size);

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.send(previewBuffer);
    } catch (err) {
      next(err);
    }
  }
}

export const styleController = new StyleController();
