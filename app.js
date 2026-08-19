const STATIONS = [
  { name: 'Europa Plus', url: 'https://stream.euroradio.lv/ep1.mp3', genre: 'Pop' },
  { name: 'Jazz FM', url: 'https://jazz-am.streamguys1.com/live', genre: 'Jazz' },
  { name: 'Classic Rock Florida', url: 'https://ais-sa1.streamon.fm/7124_48k.aac', genre: 'Rock' },
  { name: 'Deep House City', url: 'https://hydra.shoutcast.com/media?genre=deep+house', genre: 'Electronic' },
  { name: 'Radio Record', url: 'https://radiorecord.hostingradio.ru/record.mp3', genre: 'Electronic' },
  { name: 'DFM', url: 'https://dfm.dropcatch.com/DVQAAC6H/best', genre: 'Dance' },
  { name: 'Kiss FM', url: 'https://www.kissfm.ro/kissfm/digital/kissfm.mp3', genre: 'Pop' },
  { name: 'Lofi Hip Hop', url: 'https://streams.illfacto.com/lofi', genre: 'Lo-Fi' },
  { name: 'Chillhop Radio', url: 'https://stream.zeno.fm/0r0xa792kwzuv', genre: 'Chill' },
  { name: 'Classical KUSC', url: 'https://kusc.streamguys1.com/kusc-128k', genre: 'Classical' },
];

let currentStation = -1;
let isPlaying = false;
let isRecording = false;
let recordingTimer = null;
let recordingStartTime = null;
let audio = new Audio();
let mediaRecorder = null;
let audioChunks = [];
let recordedStream = null;
let searchQuery = '';

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

audio.volume = volumeSlider.value / 100;

audio.addEventListener('playing', () => {
  isPlaying = true;
  updatePlayerUI();
});

audio.addEventListener('pause', () => {
  isPlaying = false;
  updatePlayerUI();
});

audio.addEventListener('error', () => {
  showToast('Ошибка воспроизведения');
  isPlaying = false;
  updatePlayerUI();
});

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
        <div class="station-card-name">${s.name}</div>
        <div class="station-card-genre">${s.genre}</div>
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
    updatePlayerUI();
    renderStations();
    return;
  }

  try {
    if (audioCtx.state === 'suspended') await audioCtx.state;

    currentStation = index;
    audio.src = STATIONS[index].url;
    await audio.play();
    playerBar.classList.add('active');
    updatePlayerUI();
    renderStations();
  } catch (e) {
    showToast('Ошибка: ' + e.message);
  }
}

function togglePlay() {
  if (currentStation < 0) return;
  if (isPlaying) {
    audio.pause();
  } else {
    audio.play();
  }
}

function updatePlayerUI() {
  if (currentStation >= 0) {
    stationName.textContent = STATIONS[currentStation].name;
    stationGenre.textContent = STATIONS[currentStation].genre;
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
        <div class="recording-card-name">${rec.station}</div>
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
