const CORS_PROXY = 'https://corsproxy.io/?';

const STATIONS = [
  { name: 'Chillhop Radio', url: 'https://stream.zeno.fm/0r0xa792kwzuv', genre: 'Lo-Fi', bitrate: 128 },
  { name: 'Lofi Hip Hop', url: 'https://streams.illfacto.com/lofi', genre: 'Lo-Fi', bitrate: 128 },
  { name: 'Jazz FM', url: 'https://jazz-am.streamguys1.com/live', genre: 'Jazz', bitrate: 128 },
  { name: 'FIP', url: 'https://icecast.radiofrance.fr/fip-hifi.aac', genre: 'Eclectic', bitrate: 192 },
  { name: 'FIP Jazz', url: 'https://icecast.radiofrance.fr/fipjazz-hifi.aac', genre: 'Jazz', bitrate: 192 },
  { name: 'FIP Groove', url: 'https://icecast.radiofrance.fr/fipgroove-hifi.aac', genre: 'Funk / Soul', bitrate: 128 },
  { name: 'FIP Reggae', url: 'https://icecast.radiofrance.fr/fipreggae-hifi.aac', genre: 'Reggae', bitrate: 128 },
  { name: 'Nova Brazil', url: 'https://icecast.radiofrance.fr/nova-hifi.aac', genre: 'Brazilian', bitrate: 128 },
  { name: 'Mouv Radio', url: 'https://icecast.radiofrance.fr/mouv-hifi.aac', genre: 'Hip-Hop', bitrate: 128 },
  { name: 'BBC Radio 6 Music', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_6music', genre: 'Alternative', bitrate: 128 },
  { name: 'KEXP Seattle', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3', genre: 'Indie / Alt', bitrate: 128 },
  { name: 'SBS Chill', url: 'https://sbs-ice.streamguys1.com/chill-128', genre: 'Chill', bitrate: 128 },
  { name: 'NTS Radio 1', url: 'https://stream-relay-geo.ntslive.net/stream', genre: 'Eclectic', bitrate: 128 },
  { name: 'SomaFM Drone Zone', url: 'https://somafm.com/dronezone130.mp3', genre: 'Ambient', bitrate: 130 },
  { name: 'SomaFM Groove Salad', url: 'https://somafm.com/groovesalad130.mp3', genre: 'Chillout', bitrate: 130 },
  { name: 'SomaFM DEF CON', url: 'https://somafm.com/defcon130.mp3', genre: 'Electronic', bitrate: 130 },
  { name: 'Classic Rock Florida', url: 'https://ais-sa1.streamon.fm/7124_48k.aac', genre: 'Rock', bitrate: 48 },
  { name: 'Radio Parallax', url: 'https://stream.zeno.fm/p7evu5b4khiuv', genre: 'Ambient', bitrate: 128 },
  { name: 'Snazz FM', url: 'https://d3svlz1bsk84o.cloudfront.net/snazzfm.aac', genre: 'Pop / Dance', bitrate: 128 },
  { name: 'Techno Workout', url: 'https://stream.zeno.fm/0x7r5mpn1i8uv', genre: 'Techno', bitrate: 128 },
  { name: 'Futuro House', url: 'https://stream.zeno.fm/1m9fbpuu6mnkv', genre: 'House', bitrate: 128 },
  { name: 'UK Garage', url: 'https://stream.zeno.fm/x5re2d4tmrbuv', genre: 'UK Garage', bitrate: 128 },
];

let currentStation = -1;
let isPlaying = false;
let isRecording = false;
let recordingTimer = null;
let recordingStartTime = null;
let audio = new Audio();
let mediaRecorder = null;
let audioChunks = [];
let searchQuery = '';
let bufferMonitorTimer = null;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let sourceNode = null;
let destNode = null;

const playerBar = document.getElementById('playerBar');
const stationName = document.getElementById('stationName');
const stationGenre = document.getElementById('stationGenre');
const stationIcon = document.getElementById('stationIcon');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const stopIcon = document.getElementById('stopIcon');
const recordBtn = document.getElementById('recordBtn');
const volumeSlider = document.getElementById('volumeSlider');
const recordingBadge = document.getElementById('recordingBadge');
const recordingTime = document.getElementById('recordingTime');
const stationsList = document.getElementById('stationsList');
const recordingsList = document.getElementById('recordingsList');
const emptyRecordings = document.getElementById('emptyRecordings');
const searchInput = document.getElementById('searchInput');
const toast = document.getElementById('toast');
const bufferInfo = document.getElementById('bufferInfo');
const bufferBarFill = document.getElementById('bufferBarFill');
const bufferText = document.getElementById('bufferText');

const TARGET_BUFFER = 60;
const MIN_BUFFER_TO_PLAY = 2;

audio.crossOrigin = 'anonymous';
audio.preload = 'auto';
audio.volume = volumeSlider.value / 100;

audio.addEventListener('playing', () => {
  isPlaying = true;
  updatePlayerUI();
});

audio.addEventListener('pause', () => {
  isPlaying = false;
  updatePlayerUI();
});

audio.addEventListener('waiting', () => {
  bufferBarFill.classList.add('loading');
  bufferText.textContent = 'Буферизация...';
  bufferInfo.classList.add('active');
});

audio.addEventListener('canplay', () => {
  updateBufferInfo();
  bufferBarFill.classList.remove('loading');
});

audio.addEventListener('error', () => {
  if (currentStation >= 0) {
    showToast('Ошибка соединения, пробую прокси...');
    tryNextProxy();
  }
});

function tryNextProxy() {
  if (currentStation < 0) return;
  const s = STATIONS[currentStation];
  if (!s._proxyAttempt) s._proxyAttempt = 0;
  s._proxyAttempt++;

  if (s._proxyAttempt === 1) {
    audio.src = CORS_PROXY + encodeURIComponent(s.url);
  } else if (s._proxyAttempt === 2) {
    audio.src = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(s.url);
  } else {
    showToast('Станция недоступна');
    s._proxyAttempt = 0;
    stopBufferMonitor();
    bufferInfo.classList.remove('active');
    return;
  }
  audio.play().catch(() => {});
}

function updateBufferInfo() {
  if (!isPlaying && currentStation < 0) return;
  const buffered = getBufferedSeconds();
  const pct = Math.min(100, (buffered / TARGET_BUFFER) * 100);
  bufferBarFill.style.width = pct + '%';
  bufferBarFill.classList.remove('loading');
  bufferInfo.classList.add('active');

  if (buffered < MIN_BUFFER_TO_PLAY) {
    bufferText.textContent = `Буфер: ${buffered.toFixed(0)}с — загрузка...`;
    bufferBarFill.classList.add('loading');
  } else if (buffered >= TARGET_BUFFER) {
    bufferText.textContent = `Буфер: ${buffered.toFixed(0)}с — стабильно`;
  } else {
    bufferText.textContent = `Буфер: ${buffered.toFixed(0)}с / ${TARGET_BUFFER}с`;
  }
}

function getBufferedSeconds() {
  if (!audio.buffered.length || !audio.duration) return 0;
  const current = audio.currentTime;
  for (let i = 0; i < audio.buffered.length; i++) {
    if (audio.buffered.start(i) <= current && audio.buffered.end(i) >= current) {
      return audio.buffered.end(i) - current;
    }
  }
  return 0;
}

function startBufferMonitor() {
  stopBufferMonitor();
  bufferMonitorTimer = setInterval(updateBufferInfo, 500);
}

function stopBufferMonitor() {
  if (bufferMonitorTimer) {
    clearInterval(bufferMonitorTimer);
    bufferMonitorTimer = null;
  }
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Panel').classList.add('active');
  });
});

playBtn.addEventListener('click', togglePlay);
recordBtn.addEventListener('click', toggleRecording);
volumeSlider.addEventListener('input', () => {
  audio.volume = volumeSlider.value / 100;
});
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase();
  renderStations();
});

function getFilteredStations() {
  if (!searchQuery) return STATIONS.map((s, i) => ({ ...s, index: i }));
  return STATIONS.map((s, i) => ({ ...s, index: i }))
    .filter(s => s.name.toLowerCase().includes(searchQuery) || s.genre.toLowerCase().includes(searchQuery));
}

function renderStations() {
  const filtered = getFilteredStations();

  stationsList.innerHTML = filtered.map(s => `
    <div class="station-card ${currentStation === s.index ? 'current' : ''}" data-index="${s.index}">
      <div class="station-card-icon">${s.name.substring(0, 2).toUpperCase()}</div>
      <div class="station-card-info">
        <div class="station-card-name">${escapeHtml(s.name)}</div>
        <div class="station-card-genre">${escapeHtml(s.genre || '')} ${s.bitrate ? s.bitrate + ' kbps' : ''}</div>
      </div>
      <div class="station-card-action">
        ${currentStation === s.index && isPlaying
          ? '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 6h12v12H6z"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>'
        }
      </div>
    </div>
  `).join('');

  stationsList.querySelectorAll('.station-card').forEach(card => {
    card.addEventListener('click', () => playStation(parseInt(card.dataset.index)));
  });
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

async function playStation(index) {
  if (isRecording) {
    showToast('Остановите запись перед сменой станции');
    return;
  }

  if (currentStation === index && isPlaying) {
    audio.pause();
    audio.src = '';
    currentStation = -1;
    isPlaying = false;
    stopBufferMonitor();
    bufferInfo.classList.remove('active');
    updatePlayerUI();
    renderStations();
    return;
  }

  stopBufferMonitor();
  bufferBarFill.classList.add('loading');
  bufferText.textContent = 'Подключение...';
  bufferInfo.classList.add('active');

  currentStation = index;
  STATIONS[index]._proxyAttempt = 0;

  try {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    audio.src = STATIONS[index].url;
    audio.load();
    await audio.play();
    playerBar.classList.add('active');
    startBufferMonitor();
    updatePlayerUI();
    renderStations();
  } catch (e) {
    tryNextProxy();
  }
}

function togglePlay() {
  if (currentStation < 0) return;
  if (isPlaying) {
    audio.pause();
    stopBufferMonitor();
  } else {
    audio.play();
    startBufferMonitor();
  }
}

function updatePlayerUI() {
  if (currentStation >= 0) {
    stationName.textContent = STATIONS[currentStation].name;
    stationGenre.textContent = STATIONS[currentStation].genre || '';
    playBtn.disabled = false;
    recordBtn.disabled = false;
  }

  if (isPlaying) {
    playIcon.style.display = 'none';
    stopIcon.style.display = 'block';
    stationIcon.classList.add('playing');
  } else {
    playIcon.style.display = 'block';
    stopIcon.style.display = 'none';
    stationIcon.classList.remove('playing');
  }
}

async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  if (!isPlaying) {
    showToast('Сначала запустите воспроизведение');
    return;
  }

  try {
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    if (!sourceNode) {
      sourceNode = audioCtx.createMediaElementSource(audio);
      destNode = audioCtx.createMediaStreamDestination();
      sourceNode.connect(destNode);
      sourceNode.connect(audioCtx.destination);
    }

    const stream = destNode.stream;
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
    });

    audioChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const stationName_ = STATIONS[currentStation]?.name || 'Unknown';
      await saveRecording(blob, stationName_);
      showToast('Запись сохранена');
      renderRecordings();
    };

    mediaRecorder.start(1000);
    isRecording = true;
    recordingStartTime = Date.now();

    recordingBadge.classList.add('active');
    recordBtn.classList.add('recording');

    recordingTimer = setInterval(updateRecordingTime, 1000);
    showToast('Запись началась');
  } catch (e) {
    showToast('Ошибка записи: ' + e.message);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  clearInterval(recordingTimer);
  recordingBadge.classList.remove('active');
  recordBtn.classList.remove('recording');
  recordingTime.textContent = '00:00';
}

function updateRecordingTime() {
  if (!recordingStartTime) return;
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  recordingTime.textContent = `${m}:${s}`;
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

const DB_NAME = 'RadioRecordings';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecording(blob, station) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).add({
    blob,
    station,
    date: new Date().toISOString(),
    size: blob.size,
    duration: recordingStartTime ? Math.floor((Date.now() - recordingStartTime) / 1000) : 0,
  });
  return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function getRecordings() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).getAll();
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result.reverse());
    req.onerror = () => resolve([]);
  });
}

async function deleteRecording(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise((resolve) => {
    tx.oncomplete = () => {
      showToast('Запись удалена');
      renderRecordings();
      resolve();
    };
  });
}

let currentRecordingAudio = null;

async function playRecording(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).get(id);
  req.onsuccess = async () => {
    const rec = req.result;
    if (!rec) return;

    if (currentRecordingAudio) {
      currentRecordingAudio.pause();
      currentRecordingAudio = null;
    }

    if (isPlaying) {
      audio.pause();
    }

    const url = URL.createObjectURL(rec.blob);
    currentRecordingAudio = new Audio(url);
    currentRecordingAudio.play();
    showToast('Воспроизведение: ' + rec.station);
  };
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

async function renderRecordings() {
  const recordings = await getRecordings();

  if (recordings.length === 0) {
    emptyRecordings.style.display = 'flex';
    recordingsList.querySelectorAll('.recording-card').forEach(c => c.remove());
    return;
  }

  emptyRecordings.style.display = 'none';

  const cardsHtml = recordings.map(rec => `
    <div class="recording-card" data-id="${rec.id}">
      <div class="recording-card-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
      </div>
      <div class="recording-card-info">
        <div class="recording-card-name">${escapeHtml(rec.station)}</div>
        <div class="recording-card-meta">${formatDate(rec.date)} | ${formatDuration(rec.duration)} | ${formatSize(rec.size)}</div>
      </div>
      <div class="recording-card-actions">
        <button class="btn-play-rec" data-id="${rec.id}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="btn-delete" data-id="${rec.id}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  const existingCards = recordingsList.querySelectorAll('.recording-card');
  existingCards.forEach(c => c.remove());
  emptyRecordings.insertAdjacentHTML('afterend', cardsHtml);

  recordingsList.querySelectorAll('.btn-play-rec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playRecording(parseInt(btn.dataset.id));
    });
  });

  recordingsList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRecording(parseInt(btn.dataset.id));
    });
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

renderStations();
renderRecordings();
