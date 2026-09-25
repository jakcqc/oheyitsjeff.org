/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import { preprocessImage } from './preprocess.js';
import { convertToSVG } from './converters.js';

self.onmessage = ({ data: { source, options } }) => {
  try {
    const start = performance.now();
    self.postMessage({ type: 'progress', message: 'Preparing image and color palette…' });
    const prepared = preprocessImage(source, options);
    self.postMessage({ type: 'progress', message: 'Building SVG geometry…' });
    const result = convertToSVG(prepared, options);
    self.postMessage({ type: 'result', result, prepared, elapsed: performance.now() - start },
      [prepared.data.buffer, prepared.indices.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'Conversion failed.' });
  }
};
