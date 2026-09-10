import sharp from 'sharp';

export interface FormattedOutputs {
  square1x1: {
    buffer: Buffer;
    width: number;
    height: number;
    format: string;
  };
  portrait4x5: {
    buffer: Buffer;
    width: number;
    height: number;
    format: string;
  };
  landscape16x9: {
    buffer: Buffer;
    width: number;
    height: number;
    format: string;
  };
}

/**
 * Generates e-commerce ready output formats:
 * - 1:1 Square (2000 x 2000)
 * - 4:5 Portrait (2000 x 2500)
 * - 16:9 Landscape (2400 x 1350)
 */
export async function generateOutputFormats(
  masterImageBuffer: Buffer,
  options: { format?: 'jpeg' | 'webp'; quality?: number } = {}
): Promise<FormattedOutputs> {
  const format = options.format || 'jpeg';
  const quality = options.quality || 85;

  // Process 1:1 Square (1200x1200)
  const squarePipeline = sharp(masterImageBuffer)
    .resize(1200, 1200, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
  const squareBuffer =
    format === 'webp'
      ? await squarePipeline.webp({ quality }).toBuffer()
      : await squarePipeline.jpeg({ quality }).toBuffer();

  // Process 4:5 Portrait (1200x1500)
  const portraitPipeline = sharp(masterImageBuffer)
    .resize(1200, 1500, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
  const portraitBuffer =
    format === 'webp'
      ? await portraitPipeline.webp({ quality }).toBuffer()
      : await portraitPipeline.jpeg({ quality }).toBuffer();

  // Process 16:9 Landscape (1600x900)
  const landscapePipeline = sharp(masterImageBuffer)
    .resize(1600, 900, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
  const landscapeBuffer =
    format === 'webp'
      ? await landscapePipeline.webp({ quality }).toBuffer()
      : await landscapePipeline.jpeg({ quality }).toBuffer();

  return {
    square1x1: {
      buffer: squareBuffer,
      width: 1200,
      height: 1200,
      format,
    },
    portrait4x5: {
      buffer: portraitBuffer,
      width: 1200,
      height: 1500,
      format,
    },
    landscape16x9: {
      buffer: landscapeBuffer,
      width: 1600,
      height: 900,
      format,
    },
  };
}
