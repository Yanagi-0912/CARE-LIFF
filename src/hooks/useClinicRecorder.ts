import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 看診錄音。
 *
 * ## 為什麼先做能力偵測，而且把理由講出來
 *
 * LIFF 跑在 LINE 的內建瀏覽器裡，而內建瀏覽器的麥克風權限跟 Safari／Chrome 不一樣。
 * LINE 官方文件只寫「LIFF 瀏覽器不支援外部瀏覽器支援的某些 Web 技術」，沒有列出
 * getUserMedia 或 MediaRecorder；iOS 的內建瀏覽器過去確實擋過帶 audio 的
 * getUserMedia。所以這件事只能用真的手機驗，程式這邊要做的是**失敗時說得出原因**，
 * 而不是丟一個「錄音失敗」讓人無從查起。
 *
 * `unsupported` 的每一個值都對應一個明確的下一步：
 * - `no-api`：這個瀏覽器根本沒有這組 API，要引導到外部瀏覽器。
 * - `no-mime`：有 MediaRecorder 但沒有我們收得下的格式，是格式協商問題。
 * - `denied`：使用者或系統擋掉權限，要引導去設定開啟。
 * - `insecure`：不是 HTTPS。開發時最常見，上線不會遇到。
 *
 * ## 為什麼錄音存在記憶體而不是邊錄邊傳
 *
 * 醫院訊號差是常態。邊錄邊傳會在收訊不好時掉資料，而看診只有一次、補錄不回來。
 * 整段錄完再傳，最糟的情況是傳不出去、還可以留著等有訊號再試。
 */

export type RecorderUnsupported = 'no-api' | 'no-mime' | 'denied' | 'insecure';
export type RecorderState = 'idle' | 'recording' | 'stopped';

/** 依序試，取第一個這個瀏覽器收得下的。後端接受所有 audio/* 並照 MIME 決定副檔名。 */
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

/**
 * 每段錄音資料的長度。設了這個值，MediaRecorder 才會在錄音途中就把資料交出來；
 * 不設的話全部留在它內部，中途當掉就整段不見。一分鐘是取捨：太短會讓陣列變長，
 * 太長則中斷時損失比較多。
 */
const CHUNK_MS = 60_000;

/** 上限 30 分鐘：開了語者分離之後 Gemini 單檔就是這個上限，錄更長也轉不了。 */
export const MAX_RECORDING_MS = 30 * 60 * 1000;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  // isTypeSupported 全部回 false 時，交給瀏覽器自己挑預設格式再試一次。
  return '';
}

export function detectSupport(): RecorderUnsupported | null {
  if (typeof window === 'undefined') return 'no-api';
  // getUserMedia 只在安全情境下存在，所以這一項要先判，否則會誤報成 no-api。
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'no-api';
  if (typeof MediaRecorder === 'undefined') return 'no-api';
  // 這裡刻意不因為 isTypeSupported 全回 false 就擋下來：有些瀏覽器只是不回答這個
  // 問題，實際上錄得起來。真的建不起來會在 start() 裡被接住，回報成 no-mime。
  return null;
}

export interface ClinicRecorder {
  state: RecorderState;
  /** 不為 null 就代表這台裝置錄不了，值本身說明原因。 */
  unsupported: RecorderUnsupported | null;
  /** 已錄秒數，用來顯示與觸發 30 分鐘上限。 */
  seconds: number;
  /** 錄完的音檔；還沒錄完為 null。 */
  blob: Blob | null;
  mimeType: string;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useClinicRecorder(): ClinicRecorder {
  const [state, setState] = useState<RecorderState>('idle');
  const [unsupported, setUnsupported] = useState<RecorderUnsupported | null>(detectSupport);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  /** 麥克風一定要關掉：不關的話手機狀態列會一直顯示錄音中，使用者會以為還在錄。 */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    releaseStream();
  }, [releaseStream]);

  const start = useCallback(async () => {
    const blocked = detectSupport();
    if (blocked) {
      setUnsupported(blocked);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // 使用者拒絕、系統擋住、或裝置沒有麥克風，對使用者的下一步都是「去開權限」。
      setUnsupported('denied');
      return;
    }

    const type = pickMimeType() ?? '';
    let recorder: MediaRecorder;
    try {
      recorder = type
        ? new MediaRecorder(stream, { mimeType: type })
        : new MediaRecorder(stream);
    } catch {
      // 瀏覽器有 MediaRecorder 卻建不起來，就是格式協商失敗。麥克風要放掉，
      // 否則狀態列會一直顯示錄音中。
      stream.getTracks().forEach((track) => track.stop());
      setUnsupported('no-mime');
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      // 用 recorder 實際採用的格式，不是我們挑的那個：瀏覽器可能換掉。
      const actual = recorder.mimeType || type || 'audio/webm';
      setMimeType(actual);
      setBlob(new Blob(chunksRef.current, { type: actual }));
      setState('stopped');
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    setBlob(null);
    setSeconds(0);
    setState('recording');
    recorder.start(CHUNK_MS);

    timerRef.current = window.setInterval(() => {
      setSeconds((previous) => {
        const next = previous + 1;
        // 超過 Gemini 的單檔上限就自己停，不要讓使用者錄了四十分鐘才發現送不出去。
        if (next * 1000 >= MAX_RECORDING_MS) stop();
        return next;
      });
    }, 1000);
  }, [stop]);

  const reset = useCallback(() => {
    releaseStream();
    recorderRef.current = null;
    chunksRef.current = [];
    setBlob(null);
    setSeconds(0);
    setState('idle');
  }, [releaseStream]);

  // 離開頁面時一定要放掉麥克風，否則錄音會在背景繼續。
  useEffect(() => releaseStream, [releaseStream]);

  return { state, unsupported, seconds, blob, mimeType, start, stop, reset };
}
