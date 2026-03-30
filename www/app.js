/**
 * よみとも - 対話画面
 * OpenAI Realtime API を使用した音声対話
 */

// 設定
const WS_URL = 'ws://localhost:8000/ws/realtime';
const SAMPLE_RATE = 24000; // OpenAI Realtime APIの推奨サンプルレート
const CHANNELS = 1; // モノラル
const BITS_PER_SAMPLE = 16; // PCM16

// グローバル変数
let ws = null;
let audioContext = null;
let mediaStream = null;
let audioWorkletNode = null;
let isRecording = false;
let isConnected = false;
let audioBuffer = []; // 音声データを蓄積するバッファ
const MIN_AUDIO_MS = 100; // 最低100ms必要
const OPTIMAL_AUDIO_MS = 200; // 推奨200ms（大きめのチャンク）
const SAMPLES_PER_MS = SAMPLE_RATE / 1000; // 1msあたりのサンプル数（24サンプル/ms）
const MIN_SAMPLES = Math.floor(MIN_AUDIO_MS * SAMPLES_PER_MS); // 最低必要なサンプル数（2400サンプル）
const MIN_BYTES = MIN_SAMPLES * 2; // PCM16なので2バイト/サンプル（4800バイト）
const OPTIMAL_BYTES = Math.floor(OPTIMAL_AUDIO_MS * SAMPLES_PER_MS * 2); // 推奨バイト数（9600バイト）

// DOM要素
const connectionStatus = document.getElementById('connectionStatus');
const statusDot = connectionStatus.querySelector('.status-dot');
const statusText = connectionStatus.querySelector('.status-text');
const characterMessage = document.getElementById('characterMessage');
const micButton = document.getElementById('micButton');
const micStatus = document.getElementById('micStatus');
const logContent = document.getElementById('logContent');

// ログ出力
function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.textContent = `[${timestamp}] ${message}`;
    logContent.appendChild(logItem);
    logContent.scrollTop = logContent.scrollHeight;
    console.log(`[${type}] ${message}`);
}

// WebSocket接続
function connectWebSocket() {
    addLog(`WebSocket接続を開始... (URL: ${WS_URL})`);
    statusText.textContent = '接続中...';
    statusDot.className = 'status-dot';

    try {
        ws = new WebSocket(WS_URL);
        addLog('WebSocketオブジェクト作成成功');
    } catch (error) {
        addLog(`WebSocket作成エラー: ${error.message}`, 'error');
        console.error('WebSocket作成エラー:', error);
        statusText.textContent = '接続エラー';
        statusDot.className = 'status-dot error';
        return;
    }

    ws.onopen = () => {
        addLog('WebSocket接続成功');
        isConnected = true;
        statusText.textContent = '接続済み';
        statusDot.className = 'status-dot connected';
        micButton.disabled = false;
    };

    ws.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            
            // 【デバッグログ】全メッセージのtypeをログ出力
            console.log("📩 WebSocket受信:", message.type);
            
            // 【デバッグログ】response.output_audio.delta の場合は詳細ログ
            if (message.type === "response.output_audio.delta") {
                console.log("🔊 音声データ受信! サイズ:", message.delta?.length || 0);
                console.log("🔊 音声データ詳細:", {
                    type: message.type,
                    delta_length: message.delta?.length || 0,
                    delta_preview: message.delta ? message.delta.substring(0, 50) + "..." : "なし"
                });
            }
            
            handleMessage(message);
        } catch (error) {
            // テキストメッセージの場合
            try {
                const message = JSON.parse(event.data);
                
                // 【デバッグログ】エラー後の再試行でもログ出力
                console.log("📩 WebSocket受信（再試行）:", message.type);
                
                if (message.type === "response.output_audio.delta") {
                    console.log("🔊 音声データ受信! サイズ:", message.delta?.length || 0);
                }
                
                handleMessage(message);
            } catch (e) {
                console.error("❌ メッセージ解析エラー:", e);
                addLog(`メッセージ解析エラー: ${e.message}`, 'error');
            }
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocketエラー詳細:', error);
        addLog(`WebSocketエラー: ${error.message || error}`, 'error');
        addLog(`エラー詳細: ${JSON.stringify(error)}`, 'error');
        statusText.textContent = '接続エラー';
        statusDot.className = 'status-dot error';
    };

    ws.onclose = (event) => {
        addLog(`WebSocket接続が閉じられました (コード: ${event.code}, 理由: ${event.reason || 'なし'})`);
        isConnected = false;
        statusText.textContent = '切断';
        statusDot.className = 'status-dot error';
        micButton.disabled = true;
        
        // 3秒後に再接続を試みる
        setTimeout(() => {
            if (!isConnected) {
                addLog('再接続を試みます...');
                connectWebSocket();
            }
        }, 3000);
    };
}

// メッセージ処理
function handleMessage(message) {
    const type = message.type;
    addLog(`受信: ${type}`);

    switch (type) {
        case 'connection.init':
            addLog('接続初期化完了');
            break;

        case 'session.created':
        case 'session.updated':
            addLog('セッション設定完了');
            if (message.session?.instructions) {
                addLog('桃太郎のプロンプト設定済み');
            }
            break;

        case 'conversation.item.input_audio_transcription.completed':
            // 音声認識完了
            const transcript = message.transcript;
            addLog(`✅ 音声認識成功: ${transcript}`);
            characterMessage.textContent = `あなた: "${transcript}"`;
            break;

        case 'conversation.item.input_audio_transcription.failed':
            // 音声認識失敗
            addLog(`❌ 音声認識失敗: ${message.error?.message || '不明なエラー'}`, 'error');
            addLog(`エラー詳細: ${JSON.stringify(message.error)}`, 'error');
            break;

        case 'response.output_audio_transcript.delta':
        case 'response.output_audio_transcript.done':
            // AIの応答テキスト（GA版）
            const text = message.delta || message.text || '';
            if (text) {
                addLog(`📝 桃太郎の応答テキスト: ${text}`);
                characterMessage.textContent = `桃太郎: "${text}"`;
            }
            break;

        case 'response.output_audio.delta':
            // 音声データ受信（GA版）
            const deltaSize = message.delta ? message.delta.length : 0;
            addLog(`🔊 音声データ受信: ${deltaSize}文字`);
            if (message.delta) {
                addLog(`   📥 Base64データ受信: ${message.delta.substring(0, 50)}...`);
                handleAudioDelta(message.delta);
            } else {
                addLog(`   ⚠️ 警告: deltaが空です`, 'error');
            }
            break;

        case 'response.output_text.delta':
        case 'response.output_text.done':
            // テキスト応答（GA版）
            const textDelta = message.delta || message.text || '';
            if (textDelta) {
                addLog(`📝 桃太郎の応答テキスト: ${textDelta}`);
                characterMessage.textContent = `桃太郎: "${textDelta}"`;
            }
            break;

        case 'response.done':
            addLog('✅ 応答完了');
            // 残りの音声データを再生
            if (audioQueueBuffer.length > 0) {
                addLog(`📦 残りの音声データを再生: ${audioQueueBuffer.length}バイト`);
                const bufferToPlay = new Uint8Array(audioQueueBuffer);
                playAudioChunk(bufferToPlay).catch(err => {
                    addLog(`❌ 残り音声再生エラー: ${err.message}`, 'error');
                    console.error('残り音声再生エラー:', err);
                });
                audioQueueBuffer = [];
            }
            break;

        case 'error':
            addLog(`エラー: ${message.error?.message || '不明なエラー'}`, 'error');
            break;

        default:
            // その他のメッセージはログに記録（全イベントタイプを確認用）
            if (type !== 'ping' && type !== 'pong') {
                addLog(`📨 未処理メッセージ: ${type}`);
                // デバッグ用：メッセージ内容も一部出力
                if (type.startsWith('response.')) {
                    addLog(`   内容: ${JSON.stringify(message).substring(0, 200)}...`);
                }
            }
    }
}

// 音声データ処理
let audioQueue = [];
let isPlaying = false;
let audioQueueBuffer = [];

async function handleAudioDelta(audioBase64) {
    try {
        if (!audioBase64 || audioBase64.length === 0) {
            addLog('⚠️ 空の音声データを受信', 'error');
            return;
        }

        addLog(`🎵 音声データ処理開始: ${audioBase64.length}文字のBase64`);
        console.log("1. 音声データ受信:", audioBase64.length, "文字（Base64）");
        
        // Base64デコード
        const binaryString = atob(audioBase64);
        const audioData = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            audioData[i] = binaryString.charCodeAt(i);
        }
        
        addLog(`📦 デコード完了: ${audioData.length}バイト`);
        console.log("3. デコード後サイズ:", audioData.length, "bytes");
        
        // キューに追加（Uint8Arrayとして保持）
        // スプレッド演算子ではなく、配列として追加
        for (let i = 0; i < audioData.length; i++) {
            audioQueueBuffer.push(audioData[i]);
        }
        addLog(`📊 バッファサイズ: ${audioQueueBuffer.length}バイト`);

        // 一定量たまったら再生（チャンク処理）
        // 100ms分（4800バイト）以上たまったら再生
        if (audioQueueBuffer.length >= MIN_BYTES) {
            addLog(`▶️ 音声再生開始: ${audioQueueBuffer.length}バイト`);
            // Uint8Arrayに変換してから再生関数に渡す
            const bufferToPlay = new Uint8Array(audioQueueBuffer);
            await playAudioChunk(bufferToPlay);
            audioQueueBuffer = [];
        }
    } catch (error) {
        addLog(`❌ 音声処理エラー: ${error.message}`, 'error');
        console.error('音声処理エラー詳細:', error);
        console.error('スタックトレース:', error.stack);
    }
}

async function playAudioChunk(audioData) {
    try {
        // 【デバッグログ1】音声データ受信確認
        console.log("1. 音声データ受信:", audioData.length, "bytes");
        addLog(`🎵 playAudioChunk開始: ${audioData.length}バイト`);

        if (!audioData || audioData.length === 0) {
            addLog('⚠️ 空の音声データを再生しようとしました', 'error');
            return;
        }

        // AudioContextの初期化（ユーザー操作後に初期化）
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE
            });
            addLog(`🎚️ AudioContext作成（再生用）: ${audioContext.sampleRate}Hz`);
        }
        
        // 【デバッグログ2】AudioContext状態確認
        console.log("2. AudioContext状態:", audioContext.state);
        addLog(`🎚️ AudioContext状態: ${audioContext.state}`);
        
        // AudioContextが停止している場合は再開（awaitで待つ）
        if (audioContext.state === 'suspended') {
            addLog(`🎚️ AudioContextが停止中（${audioContext.state}）→ 再開します`);
            try {
                await audioContext.resume();
                addLog('🎚️ AudioContextを再開しました');
                console.log("2-1. AudioContext再開後状態:", audioContext.state);
            } catch (err) {
                addLog(`❌ AudioContext再開エラー: ${err.message}`, 'error');
                console.error('AudioContext再開エラー:', err);
                return;
            }
        }

        // 【デバッグログ3】デコード処理
        // Base64デコードは既にhandleAudioDelta()で行われているので、
        // ここではUint8Arrayとして受け取る
        let uint8Array;
        if (audioData instanceof Uint8Array) {
            uint8Array = audioData;
        } else if (Array.isArray(audioData)) {
            uint8Array = new Uint8Array(audioData);
        } else {
            addLog(`❌ 不正なデータ形式: ${typeof audioData}`, 'error');
            return;
        }
        
        console.log("3. デコード後サイズ:", uint8Array.length, "bytes");
        addLog(`📦 デコード後サイズ: ${uint8Array.length}バイト`);

        // PCM16をFloat32に変換（フルくんの指示通りInt16Arrayを使用）
        // OpenAI Realtime API: PCM16、24kHz、モノラル、リトルエンディアン
        const int16Array = new Int16Array(uint8Array.buffer);
        const float32Array = new Float32Array(int16Array.length);
        
        for (let i = 0; i < int16Array.length; i++) {
            // -1.0 〜 1.0 に正規化
            float32Array[i] = int16Array[i] / 32768.0;
        }

        // 【デバッグログ4】Float32変換後
        console.log("4. Float32変換後:", float32Array.length, "samples");
        addLog(`🎼 PCM16→Float32変換完了: ${float32Array.length}サンプル`);

        // AudioBufferを作成（モノラル、24kHz）
        const audioBuffer = audioContext.createBuffer(
            1, // numberOfChannels: 1（モノラル）
            float32Array.length, // length: サンプル数
            SAMPLE_RATE // sampleRate: 24000
        );
        audioBuffer.getChannelData(0).set(float32Array);

        // 再生
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        // 再生完了時の処理
        source.onended = () => {
            addLog('✅ 音声再生完了');
        };
        
        // エラーハンドリング
        source.onerror = (error) => {
            addLog(`❌ 音声再生エラー: ${error.message}`, 'error');
            console.error('音声再生エラー詳細:', error);
        };
        
        // 【デバッグログ5】再生開始
        console.log("5. 再生開始");
        try {
            source.start(0);
            const durationMs = (float32Array.length / SAMPLE_RATE * 1000).toFixed(1);
            addLog(`🔊 音声再生開始: ${durationMs}ms (${float32Array.length}サンプル)`);
        } catch (startError) {
            addLog(`❌ source.start()エラー: ${startError.message}`, 'error');
            console.error('source.start()エラー詳細:', startError);
        }
        
    } catch (error) {
        addLog(`❌ 音声再生エラー: ${error.message}`, 'error');
        console.error('音声再生エラー詳細:', error);
        console.error('スタックトレース:', error.stack);
    }
}

// マイク入力開始
async function startRecording() {
    try {
        addLog('マイクアクセスをリクエスト...');
        
        // 【重要】ユーザー操作後にAudioContextを初期化（再生用も含む）
        // ブラウザの自動再生ポリシーに対応するため
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE
            });
            addLog(`🎚️ AudioContext作成（ユーザー操作後）: ${audioContext.sampleRate}Hz`);
            // すぐにresumeしてrunning状態にする
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
                addLog(`🎚️ AudioContextをrunning状態にしました`);
            }
        }
        
        // マイクアクセス（idealを使用して柔軟に対応）
        const constraints = {
            audio: {
                sampleRate: { ideal: SAMPLE_RATE },
                channelCount: { ideal: CHANNELS },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // 実際のサンプルレートを確認
        const audioTrack = mediaStream.getAudioTracks()[0];
        const settings = audioTrack.getSettings();
        const actualSampleRate = settings.sampleRate || audioContext?.sampleRate || SAMPLE_RATE;
        
        addLog('マイクアクセス成功');
        addLog(`サンプルレート: ${actualSampleRate}Hz (目標: ${SAMPLE_RATE}Hz)`);
        addLog(`最低必要バッファサイズ: ${MIN_BYTES}バイト (${MIN_AUDIO_MS}ms)`);

        // AudioContextのサンプルレートを確認・調整
        if (audioContext.sampleRate !== actualSampleRate) {
            // サンプルレートが異なる場合は再作成（ただし、通常は同じはず）
            audioContext.close();
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: actualSampleRate
            });
            addLog(`AudioContext再作成: ${audioContext.sampleRate}Hz`);
            // すぐにresume
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
        }

        // MediaStreamAudioSourceNodeを作成
        const source = audioContext.createMediaStreamSource(mediaStream);
        addLog(`MediaStreamSource作成: ${source.context.sampleRate}Hz`);

        // ScriptProcessorNodeで音声データを取得（AudioWorkletの代替）
        const bufferSize = 4096;
        const processor = audioContext.createScriptProcessor(bufferSize, CHANNELS, CHANNELS);
        
        // 音声バッファをクリア
        audioBuffer = [];
        
        processor.onaudioprocess = (event) => {
            if (!isRecording || !isConnected) return;

            const inputData = event.inputBuffer.getChannelData(0);
            
            // Float32をInt16に変換
            const int16Array = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Int16ArrayをUint8Arrayに変換（リトルエンディアンでバイト配列化）
            // Int16Arrayのバッファを直接Uint8Arrayとして扱う
            const uint8Array = new Uint8Array(int16Array.buffer);
            
            // バッファに追加（スプレッド演算子ではなく、配列として追加）
            for (let i = 0; i < uint8Array.length; i++) {
                audioBuffer.push(uint8Array[i]);
            }

            // 推奨200ms分（9600バイト）以上たまったら送信（大きめのチャンク）
            if (audioBuffer.length >= OPTIMAL_BYTES) {
                sendAudioBuffer();
            }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        isRecording = true;
        micButton.classList.add('recording');
        micButton.querySelector('.mic-text').textContent = '話し中...';
        micStatus.textContent = '録音中...';
        addLog('録音開始');
        addLog(`音声バッファサイズ: ${audioBuffer.length} バイト`);

    } catch (error) {
        addLog(`マイクエラー: ${error.message}`, 'error');
        micStatus.textContent = 'マイクアクセスエラー';
        alert('マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。');
    }
}

// 音声バッファを送信
function sendAudioBuffer() {
    if (!ws || ws.readyState !== WebSocket.OPEN || audioBuffer.length === 0) {
        addLog(`⚠️ 送信スキップ: ws=${!!ws}, readyState=${ws?.readyState}, buffer=${audioBuffer.length}`, 'error');
        return;
    }

    try {
        // バッファからデータを取得
        const dataToSend = new Uint8Array(audioBuffer);
        const originalLength = audioBuffer.length;
        audioBuffer = []; // バッファをクリア

        addLog(`📤 音声データ送信準備: ${dataToSend.length}バイト (${dataToSend.length / 2}サンプル)`);
        
        // PCM16形式の確認（2バイト/サンプル）
        if (dataToSend.length % 2 !== 0) {
            addLog(`⚠️ 警告: データサイズが奇数です (${dataToSend.length}バイト)`, 'error');
        }

        // Base64エンコード（より効率的な方法）
        // Uint8Arrayを直接Base64に変換
        let binaryString = '';
        const chunkSize = 8192; // チャンクサイズを制限してメモリ効率化
        for (let i = 0; i < dataToSend.length; i += chunkSize) {
            const chunk = dataToSend.subarray(i, Math.min(i + chunkSize, dataToSend.length));
            binaryString += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binaryString);

        addLog(`📦 Base64エンコード完了: ${base64.length}文字 (元データ: ${dataToSend.length}バイト)`);
        
        // 音声データの長さを計算（サンプル数と時間）
        const sampleCount = dataToSend.length / 2; // PCM16なので2バイト/サンプル
        const audioMs = sampleCount / SAMPLES_PER_MS;
        
        addLog(`🎵 音声データ情報:`);
        addLog(`   - バイト数: ${dataToSend.length}`);
        addLog(`   - サンプル数: ${sampleCount}`);
        addLog(`   - 時間: ${audioMs.toFixed(2)}ms`);
        addLog(`   - サンプルレート: ${SAMPLE_RATE}Hz`);

        // OpenAI Realtime APIに送信
        const message = {
            type: 'input_audio_buffer.append',
            audio: base64
        };
        
        const messageJson = JSON.stringify(message);
        addLog(`📨 送信メッセージサイズ: ${messageJson.length}文字`);
        addLog(`📨 メッセージタイプ: ${message.type}`);
        addLog(`📨 音声データ(Base64)サイズ: ${base64.length}文字`);
        
        ws.send(messageJson);
        addLog(`✅ 音声データ送信完了: ${audioMs.toFixed(1)}ms (${dataToSend.length}バイト)`);
        
    } catch (error) {
        addLog(`❌ 音声バッファ送信エラー: ${error.message}`, 'error');
        console.error('音声バッファ送信エラー詳細:', error);
        console.error('スタックトレース:', error.stack);
    }
}

// マイク入力停止
function stopRecording() {
    if (!isRecording) return;

    isRecording = false;
    micButton.classList.remove('recording');
    micButton.querySelector('.mic-text').textContent = '話す';
    micStatus.textContent = '';

    // 残りの音声データを送信
    if (audioBuffer.length > 0) {
        addLog(`残りの音声データを送信: ${audioBuffer.length}バイト`);
        sendAudioBuffer();
    }

    // マイクストリームを停止
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    // 録音終了処理
    // マイクボタンを離した時に input_audio_buffer.commit を送信
    // これにより、サーバー側で音声入力が完了したことを通知し、AIの応答を生成する
    if (ws && ws.readyState === WebSocket.OPEN) {
        addLog('📤 input_audio_buffer.commit を送信します');
        const commitMessage = {
            type: 'input_audio_buffer.commit'
        };
        ws.send(JSON.stringify(commitMessage));
        addLog('✅ input_audio_buffer.commit を送信しました');
    } else {
        addLog('⚠️ WebSocketが接続されていないため、commitを送信できません', 'error');
    }

    addLog('録音停止');
    audioBuffer = []; // バッファをクリア
}

// イベントリスナー
micButton.addEventListener('mousedown', () => {
    if (!isConnected) return;
    startRecording();
});

micButton.addEventListener('mouseup', () => {
    stopRecording();
});

micButton.addEventListener('mouseleave', () => {
    stopRecording();
});

// タッチイベント（モバイル対応）
micButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!isConnected) return;
    startRecording();
});

micButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopRecording();
});

// 初期化
window.addEventListener('load', () => {
    addLog('アプリケーション起動');
    connectWebSocket();
});

// ページ離脱時にクリーンアップ
window.addEventListener('beforeunload', () => {
    stopRecording();
    if (ws) {
        ws.close();
    }
});

