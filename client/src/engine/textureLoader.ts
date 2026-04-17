// 1×1 magenta fallback — visible in-game so missing textures are obvious.
function createFallbackTexture(device: GPUDevice): GPUTexture {
  const texture = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.writeTexture(
    { texture },
    new Uint8Array([255, 0, 255, 255]),
    { bytesPerRow: 4 },
    [1, 1],
  );
  return texture;
}

export async function loadTextureBitmap(device: GPUDevice, url: string): Promise<GPUTexture> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const texture = device.createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture, premultipliedAlpha: true },
      [bitmap.width, bitmap.height],
    );

    bitmap.close();
    return texture;
  } catch (err) {
    console.error(`[textureLoader] Failed to load ${url}:`, err);
    return createFallbackTexture(device);
  }
}

export async function loadTexture(device: GPUDevice, url: string): Promise<GPUTexture> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Image load failed for ${url}`));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2d context for texture decode');
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const texture = device.createTexture({
      size: [img.width, img.height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.writeTexture(
      { texture },
      imageData.data,
      { bytesPerRow: img.width * 4 },
      [img.width, img.height],
    );

    return texture;
  } catch (err) {
    console.error(`[textureLoader] Failed to load ${url}:`, err);
    return createFallbackTexture(device);
  }
}
