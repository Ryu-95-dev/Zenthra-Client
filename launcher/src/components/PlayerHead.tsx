import { useEffect, useRef } from 'react';

/** Draws the face (+ hat layer) from an official Minecraft skin texture. */
export function PlayerHead({ skinUrl, name, size = 36 }: { skinUrl: string | null; name: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !skinUrl) return;
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 8, 8);
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
    };
    img.src = skinUrl;
  }, [skinUrl]);

  if (!skinUrl) {
    return (
      <div className="player-head placeholder" style={{ width: size, height: size }} aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return <canvas ref={ref} width={8} height={8} className="player-head" style={{ width: size, height: size }} aria-label={name} />;
}
