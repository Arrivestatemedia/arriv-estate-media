import { useRef, useCallback, useEffect } from "react";

/**
 * Zoom-style background blur using MediaPipe Selfie Segmentation.
 * Returns a processed canvas stream when blur is enabled, raw stream otherwise.
 */
export function useBackgroundBlur() {
  const segmenterRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const isRunningRef = useRef(false);
  const resultHandlerSetRef = useRef(false);

  const loadMediaPipe = useCallback(async () => {
    if (segmenterRef.current) return segmenterRef.current;

    // Load MediaPipe scripts if not already loaded
    await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");

    const segmenter = new window.SelfieSegmentation({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });
    segmenter.setOptions({ modelSelection: 1 }); // 1 = landscape model (faster)
    await segmenter.initialize();
    segmenterRef.current = segmenter;
    return segmenter;
  }, []);

  /**
   * Start blur processing on a video element.
   * Returns a MediaStream from the output canvas.
   */
  const startBlur = useCallback(async (videoElement, blurAmount = 15) => {
    const segmenter = await loadMediaPipe();

    // Create/reuse offscreen canvas
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    const ctx = canvas.getContext("2d");

    isRunningRef.current = true;
    resultHandlerSetRef.current = false;

    // Set up result handler BEFORE starting frame processing
    if (!resultHandlerSetRef.current) {
      resultHandlerSetRef.current = true;
      segmenter.onResults((results) => {
        if (!isRunningRef.current || !results) return;

        try {
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // 1. Draw the original frame
          if (results.image) {
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
          }

          // 2. Use the segmentation mask: destination-out punch a hole for person
          if (results.segmentationMask) {
            ctx.globalCompositeOperation = "destination-out";
            ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
          }

          ctx.restore();

          // 3. Draw blurred background behind
          if (results.image) {
            ctx.save();
            ctx.filter = `blur(${blurAmount}px)`;
            ctx.globalCompositeOperation = "destination-over";
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }

          // Reset composite
          ctx.globalCompositeOperation = "source-over";
        } catch (err) {
          console.error("Blur rendering error:", err);
        }
      });
    }

    const processFrame = async () => {
      if (!isRunningRef.current) return;

      // Update canvas size if video dimensions changed
      if (canvas.width !== videoElement.videoWidth && videoElement.videoWidth > 0) {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
      }

      try {
        await segmenter.send({ image: videoElement });
      } catch (err) {
        // If segmenter fails a frame, just draw raw
        try {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        } catch (_) {}
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    // Start the frame loop
    animFrameRef.current = requestAnimationFrame(processFrame);

    // Return canvas stream at ~30fps
    return canvas.captureStream(30);
  }, [loadMediaPipe]);

  const stopBlur = useCallback(() => {
    isRunningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopBlur();
  }, [stopBlur]);

  return { startBlur, stopBlur };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      // Wait for it to be ready if already loading
      const check = setInterval(() => {
        if (window.SelfieSegmentation) { clearInterval(check); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}