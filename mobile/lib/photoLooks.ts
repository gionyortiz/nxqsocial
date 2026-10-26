export type PhotoLook = 'original' | 'warm' | 'cool' | 'vivid' | 'mono' | 'glow';
export const PHOTO_LOOKS: { id: PhotoLook; label: string; color: string }[] = [
  { id: 'original', label: 'Original', color: '#9ba4af' },
  { id: 'warm', label: 'Golden', color: '#dc9e68' },
  { id: 'cool', label: 'Cool', color: '#7ca6d4' },
  { id: 'vivid', label: 'Vivid', color: '#bc79cc' },
  { id: 'mono', label: 'Mono', color: '#777777' },
  { id: 'glow', label: 'Soft Glow', color: '#dea4b9' },
];

// Self-contained so the same pixel transform runs in the device-local canvas and tests.
// Soft Glow gently blends neighboring pixels across the image; it does not reshape faces.
export function applyPhotoLook(data: Uint8ClampedArray, width: number, height: number, look: PhotoLook) {
  if (look === 'original') return;
  const source = look === 'glow' ? new Uint8ClampedArray(data) : data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = source[i], g = source[i + 1], b = source[i + 2];
      if (look === 'mono') {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        data[i] = data[i + 1] = data[i + 2] = gray;
      } else if (look === 'warm') {
        data[i] = r * 1.04 + 8; data[i + 1] = g * 1.01 + 2; data[i + 2] = b * 0.93;
      } else if (look === 'cool') {
        data[i] = r * 0.95; data[i + 1] = g * 1.02 + 2; data[i + 2] = b * 1.05 + 8;
      } else if (look === 'vivid') {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        for (let c = 0; c < 3; c++) data[i + c] = (gray + (source[i + c] - gray) * 1.2 - 128) * 1.06 + 128;
      } else if (look === 'glow') {
        const left = (y * width + Math.max(0, x - 2)) * 4;
        const right = (y * width + Math.min(width - 1, x + 2)) * 4;
        const up = (Math.max(0, y - 2) * width + x) * 4;
        const down = (Math.min(height - 1, y + 2) * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const softened = source[i + c] * 0.72 + (source[left + c] + source[right + c] + source[up + c] + source[down + c]) * 0.07;
          data[i + c] = softened * 0.98 + 7;
        }
      }
    }
  }
}

export function photoLookHtml(base64: string, look: PhotoLook) {
  if (!/^[A-Za-z0-9+/=]+$/.test(base64) || !PHOTO_LOOKS.some((item) => item.id === look)) throw new Error('Invalid photo input');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'"></head><body><canvas id="photo"></canvas><script>
    const send = value => window.ReactNativeWebView.postMessage(JSON.stringify(value));
    const image = new Image();
    image.onerror = () => send({error:true});
    image.onload = () => { try {
      const canvas = document.getElementById('photo'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      (${PHOTO_LOOK_PROCESSOR})(pixels.data, canvas.width, canvas.height, ${JSON.stringify(look)});
      context.putImageData(pixels, 0, 0);
      send({image:canvas.toDataURL('image/jpeg',0.9),width:canvas.width,height:canvas.height});
    } catch { send({error:true}); } };
    image.src = 'data:image/jpeg;base64,${base64}';
  </script></body></html>`;
}

// Literal source is required: Hermes bytecode does not preserve Function.toString().
export const PHOTO_LOOK_PROCESSOR = String.raw`function(data, width, height, look) {
  if (look === 'original') return;
  const source = look === 'glow' ? new Uint8ClampedArray(data) : data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = source[i], g = source[i + 1], b = source[i + 2];
      if (look === 'mono') {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        data[i] = data[i + 1] = data[i + 2] = gray;
      } else if (look === 'warm') {
        data[i] = r * 1.04 + 8; data[i + 1] = g * 1.01 + 2; data[i + 2] = b * 0.93;
      } else if (look === 'cool') {
        data[i] = r * 0.95; data[i + 1] = g * 1.02 + 2; data[i + 2] = b * 1.05 + 8;
      } else if (look === 'vivid') {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        for (let c = 0; c < 3; c++) data[i + c] = (gray + (source[i + c] - gray) * 1.2 - 128) * 1.06 + 128;
      } else if (look === 'glow') {
        const left = (y * width + Math.max(0, x - 2)) * 4;
        const right = (y * width + Math.min(width - 1, x + 2)) * 4;
        const up = (Math.max(0, y - 2) * width + x) * 4;
        const down = (Math.min(height - 1, y + 2) * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const softened = source[i + c] * 0.72 + (source[left + c] + source[right + c] + source[up + c] + source[down + c]) * 0.07;
          data[i + c] = softened * 0.98 + 7;
        }
      }
    }
  }
}`;
