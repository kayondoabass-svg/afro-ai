/**
 * React hook for handling SSE voice streaming responses.
 * Converts audio blob to base64 and sends as JSON to match server expectations.
 */
import { useCallback, useRef } from "react";
import { useAudioPlayback } from "./useAudioPlayback";

interface StreamCallbacks {
  onUserTranscript?: (text: string) => void;
  onTranscript?: (text: string, full: string) => void;
  onComplete?: (transcript: string) => void;
  onError?: (error: Error) => void;
}

export function useVoiceStream(callbacks: StreamCallbacks = {}) {
  const playback = useAudioPlayback();
  // A retry of the same recording/endpoint reuses its key, including after an
  // ambiguous network failure. A new recording gets a new durable request key.
  const requestKeys = useRef(new WeakMap<Blob, Map<string, string>>());

  const streamVoiceResponse = useCallback(
    async (url: string, audioBlob: Blob) => {
      if (!audioBlob.size || audioBlob.size > 5 * 1024 * 1024) throw new Error("Audio must be non-empty and at most 5 MB.");
      const voiceUrl = url.replace(/\/api\/conversations\/(\d+)\/messages(?=$|\?)/, "/api/voice-conversations/$1/messages");
      let keys = requestKeys.current.get(audioBlob);
      if (!keys) { keys = new Map(); requestKeys.current.set(audioBlob, keys); }
      let idempotencyKey = keys.get(voiceUrl);
      if (!idempotencyKey) { idempotencyKey = crypto.randomUUID(); keys.set(voiceUrl, idempotencyKey); }
      await playback.init();
      playback.clear();

      // Convert blob to base64 for JSON body (server expects express.json())
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onerror = () => reject(new Error("Unable to read audio."));
        fileReader.onload = () => {
          const result = fileReader.result as string;
          resolve(result.split(",")[1]); // Remove data URL prefix
        };
        fileReader.readAsDataURL(audioBlob);
      });

      const response = await fetch(voiceUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64Audio, idempotencyKey }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Voice request failed");
      }

      const streamReader = response.body?.getReader();
      if (!streamReader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullTranscript = "";

      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(line.slice(6));

            switch (event.type) {
              case "user_transcript":
                callbacks.onUserTranscript?.(event.data);
                break;
              case "transcript":
                fullTranscript += event.data;
                callbacks.onTranscript?.(event.data, fullTranscript);
                break;
              case "audio":
                playback.pushAudio(event.data);
                break;
              case "done":
                playback.signalComplete();
                callbacks.onComplete?.(fullTranscript);
                break;
              case "error":
                throw new Error(event.error);
            }
          } catch (e) {
            if (!(e instanceof SyntaxError)) {
              callbacks.onError?.(e as Error);
            }
          }
        }
      }
    },
    [playback, callbacks]
  );

  return { streamVoiceResponse, playbackState: playback.state };
}
