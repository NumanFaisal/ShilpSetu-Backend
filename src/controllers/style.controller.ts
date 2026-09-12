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
    id: 'smart_contextual',
    name: '✨ Smart AI Craft Studio (Recommended)',
    description: 'Auto-detects your craft (pottery, brass, handloom, wood, jewelry) and renders an authentic matching backdrop.',
    previewColor: '#C26D43',
  },
  {
    id: 'botanical_lifestyle',
    name: '🌿 Lifestyle Studio with Botanical Elements',
    description: 'Warm natural tabletop with soft cream wall, gentle morning window light, and an aesthetic potted green plant in the soft background.',
    previewColor: '#527C44',
  },
  {
    id: 'artisan_workshop',
    name: '🪵 Rustic Artisan Workshop',
    description: 'Warm teakwood workbench with natural wood grain and soft morning daylight. Ideal for handmade pottery, woodcraft, and terracotta.',
    previewColor: '#A67B4B',
  },
  {
    id: 'heritage_courtyard',
    name: '🏛️ Heritage Indian Courtyard',
    description: 'Traditional carved sandstone archway with warm ambient lighting. Accentuates brassware, bronze, and festive temple crafts.',
    previewColor: '#BD8253',
  },
  {
    id: 'luxury_showcase',
    name: '💎 Luxury Marble Showcase',
    description: 'Polished Carrara marble with fine veining and soft editorial spotlight. Perfect for jewelry, silver, and premium decorative items.',
    previewColor: '#E5E3DF',
  },
  {
    id: 'clean_marketplace',
    name: '📦 Clean Marketplace Studio',
    description: 'Clean white cyclorama with soft ambient diffusion and grounded contact reflection. Perfect for Amazon & Flipkart.',
    previewColor: '#F5F6F8',
  },
  {
    id: 'white_studio',
    name: 'White Studio',
    description: 'Clean white cyclorama with soft diffused lighting.',
    previewColor: '#F5F6F8',
  },
  {
    id: 'wooden_surface',
    name: 'Wooden Surface',
    description: 'Warm teak wood tabletop with natural grain.',
    previewColor: '#A67B4B',
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
