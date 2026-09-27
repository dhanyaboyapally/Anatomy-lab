export async function requestSpeech(text: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Unable to generate speech.");
  }

  if (!response.body) {
    throw new Error("The voice response did not include an audio stream.");
  }

  return response.body;
}

export async function createSpeechPlayback(stream: ReadableStream<Uint8Array>) {
  if (typeof window === "undefined" || !window.MediaSource || !MediaSource.isTypeSupported("audio/mpeg")) {
    throw new Error("This browser cannot stream the voice response.");
  }

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const audio = new Audio(objectUrl);
  const reader = stream.getReader();
  let stopped = false;
  let streamFinished = false;
  let sourceBuffer: SourceBuffer | null = null;
  const pendingChunks: ArrayBuffer[] = [];

  const sourceOpened = new Promise<void>((resolve, reject) => {
    mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
    mediaSource.addEventListener("error", () => reject(new Error("Unable to open the voice stream.")), { once: true });
  });
  await sourceOpened;

  if (stopped) throw new Error("Voice playback was stopped.");
  sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");

  const appendNext = () => {
    if (!sourceBuffer || sourceBuffer.updating || pendingChunks.length === 0) {
      if (sourceBuffer && !sourceBuffer.updating && streamFinished && mediaSource.readyState === "open") {
        mediaSource.endOfStream();
      }
      return;
    }
    sourceBuffer.appendBuffer(pendingChunks.shift() as ArrayBuffer);
  };

  sourceBuffer.addEventListener("updateend", appendNext);

  const pump = async () => {
    try {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          pendingChunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
          appendNext();
        }
      }
      streamFinished = true;
      appendNext();
    } catch {
      if (!stopped && mediaSource.readyState === "open") mediaSource.endOfStream("network");
    }
  };

  void pump();

  return {
    audio,
    stop: () => {
      stopped = true;
      void reader.cancel();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      if (mediaSource.readyState === "open") mediaSource.endOfStream();
    },
  };
}
