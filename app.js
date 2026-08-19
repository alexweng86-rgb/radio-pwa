var CORS_PROXY = 'https://corsproxy.io/?';
var CORS_PROXY2 = 'https://api.allorigins.win/raw?url=';

var STATIONS = [
  { name: 'Radio Paradise', url: 'http://stream.radioparadise.com/mp3-192', genre: 'Eclectic', bitrate: 192 },
  { name: 'KEXP Seattle', url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3', genre: 'Indie / Alt', bitrate: 128 },
  { name: 'SomaFM Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3', genre: 'Chillout', bitrate: 128 },
  { name: 'SomaFM Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3', genre: 'Ambient', bitrate: 128 },
  { name: 'SomaFM DEF CON', url: 'https://ice1.somafm.com/defcon-128-mp3', genre: 'Electronic', bitrate: 128 },
  { name: 'SomaFM Lush', url: 'https://ice1.somafm.com/lush-128-mp3', genre: 'Downtempo', bitrate: 128 },
  { name: 'SomaFM Metal Detector', url: 'https://ice1.somafm.com/metal-128-mp3', genre: 'Metal', bitrate: 128 },
  { name: 'SomaFM The InSound', url: 'https://ice1.somafm.com/insound-128-mp3', genre: 'Indie', bitrate: 128 },
  { name: 'SomaFM 70s', url: 'https://ice1.somafm.com/seventies-128-mp3', genre: '70s', bitrate: 128 },
  { name: 'Lofi Radio', url: 'https://play.streamafrica.net/lofiradio', genre: 'Lo-Fi', bitrate: 128 },
  { name: 'RadioBoss', url: 'https://c14.radioboss.fm:8124/stream', genre: 'Pop / Dance', bitrate: 128 }
];

var currentStation = -1;
var isPlaying = false;
var isRecording = false;
var recordingTimer = null;
var recordingStartTime = null;
var audio = new Audio();
var mediaRecorder = null;
var audioChunks = [];
var searchQuery = '';
var bufferMonitorTimer = null;
var audioCtx = null;
var sourceNode = null;
var destNode = null;
var metadataAbort = null;
var metadataTimer = null;
var TARGET_BUFFER = 60;
var MIN_BUFFER_TO_PLAY = 2;

var playerBar = document.getElementById('playerBar');
var stationName = document.getElementById('stationName');
var stationGenre = document.getElementById('stationGenre');
var stationIcon = document.getElementById('stationIcon');
var playBtn = document.getElementById('playBtn');
var playIcon = document.getElementById('playIcon');
var stopIcon = document.getElementById('stopIcon');
var recordBtn = document.getElementById('recordBtn');
var volumeSlider = document.getElementById('volumeSlider');
var recordingBadge = document.getElementById('recordingBadge');
var recordingTime = document.getElementById('recordingTime');
var stationsList = document.getElementById('stationsList');
var recordingsList = document.getElementById('recordingsList');
var emptyRecordings = document.getElementById('emptyRecordings');
var searchInput = document.getElementById('searchInput');
var toastEl = document.getElementById('toast');
var bufferInfo = document.getElementById('bufferInfo');
var bufferBarFill = document.getElementById('bufferBarFill');
var bufferText = document.getElementById('bufferText');
var nowPlaying = document.getElementById('nowPlaying');
var npTrack = document.getElementById('npTrack');
var reorderBtn = document.getElementById('reorderBtn');
var stationsPanel = document.getElementById('stationsPanel');

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function getProxiedUrl(url) {
  return CORS_PROXY + encodeURIComponent(url);
}

function getProxiedUrl2(url) {
  return CORS_PROXY2 + encodeURIComponent(url);
}

function escapeHtml(text) {
  var d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(function() { toastEl.classList.remove('show'); }, 2500);
}

audio.preload = 'auto';
audio.volume = volumeSlider.value / 100;

audio.addEventListener('playing', function() {
  isPlaying = true;
  updatePlayerUI();
});

audio.addEventListener('pause', function() {
  isPlaying = false;
  updatePlayerUI();
});

audio.addEventListener('waiting', function() {
  bufferBarFill.classList.add('loading');
  bufferText.textContent = 'Буферизация...';
  bufferInfo.classList.add('active');
});

audio.addEventListener('canplay', function() {
  updateBufferInfo();
  bufferBarFill.classList.remove('loading');
});

audio.addEventListener('error', function() {
  if (currentStation >= 0) {
    showToast('Ошибка соединения, пробую прокси...');
    tryNextProxy();
  }
});

function tryNextProxy() {
  if (currentStation < 0) return;
  var s = STATIONS[currentStation];
  if (!s._proxyAttempt) s._proxyAttempt = 0;
  s._proxyAttempt++;

  if (s._proxyAttempt === 1) {
    audio.src = getProxiedUrl2(s.url);
  } else if (s._proxyAttempt === 2) {
    audio.src = s.url;
  } else {
    showToast('Станция недоступна');
    s._proxyAttempt = 0;
    stopBufferMonitor();
    bufferInfo.classList.remove('active');
    return;
  }
  audio.play().catch(function() {});
}

function updateBufferInfo() {
  if (!isPlaying && currentStation < 0) return;
  var buffered = getBufferedSeconds();
  var pct = Math.min(100, (buffered / TARGET_BUFFER) * 100);
  bufferBarFill.style.width = pct + '%';
  bufferBarFill.classList.remove('loading');
  bufferInfo.classList.add('active');

  if (buffered < MIN_BUFFER_TO_PLAY) {
    bufferText.textContent = 'Буфер: ' + buffered.toFixed(0) + 'с — загрузка...';
    bufferBarFill.classList.add('loading');
  } else if (buffered >= TARGET_BUFFER) {
    bufferText.textContent = 'Буфер: ' + buffered.toFixed(0) + 'с — стабильно';
  } else {
    bufferText.textContent = 'Буфер: ' + buffered.toFixed(0) + 'с / ' + TARGET_BUFFER + 'с';
  }
}

function getBufferedSeconds() {
  if (!audio.buffered.length || !audio.duration) return 0;
  var current = audio.currentTime;
  for (var i = 0; i < audio.buffered.length; i++) {
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

function startMetadataReader() {
  stopMetadataReader();
  if (currentStation < 0) return;

  var url = STATIONS[currentStation].url;
  var proxiedUrl = getProxiedUrl(url);

  metadataAbort = new AbortController();

  fetch(proxiedUrl, {
    signal: metadataAbort.signal,
    headers: { 'icy-metadata': '1' }
  }).then(function(resp) {
    var icyMetaInt = parseInt(resp.headers.get('icy-metaint'));
    if (!icyMetaInt) {
      tryAltMetadata();
      return;
    }

    var reader = resp.body.getReader();
    var bytesUntilMeta = icyMetaInt;

    function readChunk() {
      return reader.read().then(function(result) {
        if (result.done) return;
        var value = result.value;
        if (!value) return;

        var pos = 0;
        while (pos < value.length) {
          var remaining = Math.min(bytesUntilMeta, value.length - pos);
          pos += remaining;
          bytesUntilMeta -= remaining;

          if (bytesUntilMeta === 0) {
            if (pos < value.length) {
              var metaLen = value[pos] * 16;
              pos++;
              if (metaLen > 0 && pos + metaLen <= value.length) {
                var metaStr = new TextDecoder('utf-8').decode(value.slice(pos, pos + metaLen)).trim();
                var titleMatch = metaStr.match(/StreamTitle='([^']*)'/);
                if (titleMatch && titleMatch[1]) {
                  updateNowPlaying(titleMatch[1]);
                }
              }
              pos += metaLen;
            }
            bytesUntilMeta = icyMetaInt;
          }
        }
        return readChunk();
      });
    }
    return readChunk();
  }).catch(function() {
    tryAltMetadata();
  });
}

function tryAltMetadata() {
  if (currentStation < 0) return;
  var name = STATIONS[currentStation].name;
  var metaEndpoints = [];

  if (name.indexOf('KEXP') >= 0) {
    metaEndpoints.push('https://api.kexp.org/v2/playlist/?format=json');
  }
  if (name.indexOf('SomaFM') >= 0) {
    var channel = name.replace('SomaFM ', '').toLowerCase().replace(/\s+/g, '');
    metaEndpoints.push('https://somafm.com/pls/' + channel + '.xml');
  }

  if (metaEndpoints.length === 0) {
    nowPlaying.classList.add('active');
    npTrack.textContent = '—';
    return;
  }

  pollMetadata(metaEndpoints);
}

function pollMetadata(endpoints) {
  function doPoll() {
    for (var i = 0; i < endpoints.length; i++) {
      (function(url) {
        fetch(getProxiedUrl(url)).then(function(resp) {
          return resp.text();
        }).then(function(text) {
          parseMetadataResponse(url, text);
        }).catch(function() {});
      })(endpoints[i]);
      break;
    }
  }

  doPoll();
  metadataTimer = setInterval(doPoll, 8000);
}

function parseMetadataResponse(url, text) {
  try {
    var data = JSON.parse(text);
    if (data.results && data.results.length > 0) {
      var track = data.results[0];
      var artist = track.artist || '';
      var title = track.song || track.title || '';
      updateNowPlaying(artist ? artist + ' — ' + title : title);
      return;
    }
  } catch (_) {}

  if (text.indexOf('<title>') >= 0) {
    var match = text.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/);
    if (!match) {
      var m2 = text.match(/<title>([^<]+)<\/title>/);
      if (m2 && m2[1] && m2[1].indexOf('SomaFM') < 0 && m2[1].indexOf('PLS') < 0) {
        updateNowPlaying(m2[1]);
      }
    } else {
      updateNowPlaying(match[1]);
    }
  }
}

function updateNowPlaying(track) {
  nowPlaying.classList.add('active');
  if (!track || track === '—') {
    npTrack.textContent = '—';
  } else {
    npTrack.textContent = track;
    npTrack.title = track;
  }
}

function stopMetadataReader() {
  if (metadataAbort) {
    metadataAbort.abort();
    metadataAbort = null;
  }
  if (metadataTimer) {
    clearInterval(metadataTimer);
    metadataTimer = null;
  }
  nowPlaying.classList.remove('active');
  npTrack.textContent = '—';
}

function getFilteredStations() {
  if (!searchQuery) return STATIONS.map(function(s, i) { return { station: s, index: i }; });
  return STATIONS.map(function(s, i) { return { station: s, index: i }; })
    .filter(function(item) {
      return item.station.name.toLowerCase().indexOf(searchQuery) >= 0 ||
        (item.station.genre && item.station.genre.toLowerCase().indexOf(searchQuery) >= 0);
    });
}

function renderStations() {
  var filtered = getFilteredStations();
  var html = '<div class="reorder-hint">Перетащите за \u2261 для изменения порядка</div>';

  for (var i = 0; i < filtered.length; i++) {
    var s = filtered[i].station;
    var idx = filtered[i].index;
    var isCurrent = currentStation === idx;
    var iconText = s.name.substring(0, 2).toUpperCase();
    var genreText = escapeHtml(s.genre || '');
    var bitrateText = s.bitrate ? s.bitrate + ' kbps' : '';
    var playSvg = (isCurrent && isPlaying)
      ? '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 6h12v12H6z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>';

    html += '<div class="station-card' + (isCurrent ? ' current' : '') + '" data-index="' + idx + '">'
      + '<div class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg></div>'
      + '<div class="station-card-icon">' + iconText + '</div>'
      + '<div class="station-card-info">'
      + '<div class="station-card-name">' + escapeHtml(s.name) + '</div>'
      + '<div class="station-card-genre">' + genreText + ' ' + bitrateText + '</div>'
      + '</div>'
      + '<div class="station-card-action">' + playSvg + '</div>'
      + '</div>';
  }

  stationsList.innerHTML = html;

  var cards = stationsList.querySelectorAll('.station-card');
  for (var j = 0; j < cards.length; j++) {
    (function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.drag-handle')) return;
        playStation(parseInt(card.dataset.index));
      });
    })(cards[j]);
  }

  setupDragAndDrop();
}

function playStation(index) {
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
    stopMetadataReader();
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

  var ctx = ensureAudioCtx();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  audio.src = getProxiedUrl(STATIONS[index].url);
  audio.load();

  var playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.then(function() {
      playerBar.classList.add('active');
      startBufferMonitor();
      startMetadataReader();
      updatePlayerUI();
      renderStations();
    }).catch(function() {
      tryNextProxy();
    });
  } else {
    playerBar.classList.add('active');
    startBufferMonitor();
    startMetadataReader();
    updatePlayerUI();
    renderStations();
  }
}

function togglePlay() {
  if (currentStation < 0) return;
  if (isPlaying) {
    audio.pause();
    stopBufferMonitor();
  } else {
    audio.play().catch(function() {});
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

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (!isPlaying) {
    showToast('Сначала запустите воспроизведение');
    return;
  }

  try {
    var ctx = ensureAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    if (!sourceNode) {
      var originalUrl = STATIONS[currentStation].url;
      var proxyUrl = getProxiedUrl(originalUrl);
      audio.crossOrigin = 'anonymous';
      audio.src = proxyUrl;
      audio.load();
      audio.play().catch(function() {});

      sourceNode = ctx.createMediaElementSource(audio);
      destNode = ctx.createMediaStreamDestination();
      sourceNode.connect(destNode);
      sourceNode.connect(ctx.destination);
    }

    var stream = destNode.stream;
    var mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    }
    mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });

    audioChunks = [];
    mediaRecorder.ondataavailable = function(e) {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = function() {
      var blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      var sName = currentStation >= 0 ? STATIONS[currentStation].name : 'Unknown';
      saveRecording(blob, sName).then(function() {
        showToast('Запись сохранена');
        renderRecordings();
      });
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
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
  recordingBadge.classList.remove('active');
  recordBtn.classList.remove('recording');
  recordingTime.textContent = '00:00';
}

function updateRecordingTime() {
  if (!recordingStartTime) return;
  var elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  var m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  var s = (elapsed % 60).toString().padStart(2, '0');
  recordingTime.textContent = m + ':' + s;
}

function openDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('RadioRecordings', 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function saveRecording(blob, station) {
  return openDB().then(function(db) {
    var tx = db.transaction('recordings', 'readwrite');
    tx.objectStore('recordings').add({
      blob: blob,
      station: station,
      date: new Date().toISOString(),
      size: blob.size,
      duration: recordingStartTime ? Math.floor((Date.now() - recordingStartTime) / 1000) : 0
    });
    return new Promise(function(resolve) { tx.oncomplete = resolve; });
  });
}

function getRecordings() {
  return openDB().then(function(db) {
    var tx = db.transaction('recordings', 'readonly');
    var req = tx.objectStore('recordings').getAll();
    return new Promise(function(resolve) {
      req.onsuccess = function() { resolve(req.result.reverse()); };
      req.onerror = function() { resolve([]); };
    });
  });
}

function deleteRecording(id) {
  return openDB().then(function(db) {
    var tx = db.transaction('recordings', 'readwrite');
    tx.objectStore('recordings').delete(id);
    return new Promise(function(resolve) {
      tx.oncomplete = function() {
        showToast('Запись удалена');
        renderRecordings();
        resolve();
      };
    });
  });
}

var currentRecordingAudio = null;

function playRecording(id) {
  openDB().then(function(db) {
    var tx = db.transaction('recordings', 'readonly');
    var req = tx.objectStore('recordings').get(id);
    req.onsuccess = function() {
      var rec = req.result;
      if (!rec) return;

      if (currentRecordingAudio) {
        currentRecordingAudio.pause();
        currentRecordingAudio = null;
      }

      if (isPlaying) audio.pause();

      var url = URL.createObjectURL(rec.blob);
      currentRecordingAudio = new Audio(url);
      currentRecordingAudio.play();
      showToast('Воспроизведение: ' + rec.station);
    };
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDuration(seconds) {
  var m = Math.floor(seconds / 60).toString().padStart(2, '0');
  var s = (seconds % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

function formatDate(iso) {
  var d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function renderRecordings() {
  getRecordings().then(function(recordings) {
    if (recordings.length === 0) {
      emptyRecordings.style.display = 'flex';
      var existing = recordingsList.querySelectorAll('.recording-card');
      for (var k = 0; k < existing.length; k++) existing[k].remove();
      return;
    }

    emptyRecordings.style.display = 'none';
    var existing2 = recordingsList.querySelectorAll('.recording-card');
    for (var k2 = 0; k2 < existing2.length; k2++) existing2[k2].remove();

    var cardsHtml = '';
    for (var i = 0; i < recordings.length; i++) {
      var rec = recordings[i];
      cardsHtml += '<div class="recording-card" data-id="' + rec.id + '">'
        + '<div class="recording-card-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg></div>'
        + '<div class="recording-card-info">'
        + '<div class="recording-card-name">' + escapeHtml(rec.station) + '</div>'
        + '<div class="recording-card-meta">' + formatDate(rec.date) + ' | ' + formatDuration(rec.duration) + ' | ' + formatSize(rec.size) + '</div>'
        + '</div>'
        + '<div class="recording-card-actions">'
        + '<button class="btn-play-rec" data-id="' + rec.id + '"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg></button>'
        + '<button class="btn-delete" data-id="' + rec.id + '"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>'
        + '</div></div>';
    }

    emptyRecordings.insertAdjacentHTML('afterend', cardsHtml);

    var playBtns = recordingsList.querySelectorAll('.btn-play-rec');
    for (var p = 0; p < playBtns.length; p++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          playRecording(parseInt(btn.dataset.id));
        });
      })(playBtns[p]);
    }

    var delBtns = recordingsList.querySelectorAll('.btn-delete');
    for (var d = 0; d < delBtns.length; d++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          deleteRecording(parseInt(btn.dataset.id));
        });
      })(delBtns[d]);
    }
  });
}

var reorderMode = false;

reorderBtn.addEventListener('click', function() {
  reorderMode = !reorderMode;
  reorderBtn.classList.toggle('active', reorderMode);
  stationsPanel.classList.toggle('reorder-mode', reorderMode);
  renderStations();
});

function saveStationOrder() {
  var order = STATIONS.map(function(s) { return s.url; });
  localStorage.setItem('stationOrder', JSON.stringify(order));
}

function loadStationOrder() {
  var saved = localStorage.getItem('stationOrder');
  if (!saved) return;
  try {
    var order = JSON.parse(saved);
    var map = {};
    STATIONS.forEach(function(s, i) { map[s.url] = i; });
    var reordered = [];
    order.forEach(function(url) {
      if (map[url] !== undefined) reordered.push(STATIONS[map[url]]);
    });
    STATIONS.forEach(function(s) {
      var found = false;
      for (var i = 0; i < reordered.length; i++) {
        if (reordered[i].url === s.url) { found = true; break; }
      }
      if (!found) reordered.push(s);
    });
    STATIONS.length = 0;
    reordered.forEach(function(s) { STATIONS.push(s); });
  } catch (_) {}
}

var dragSrcIndex = null;

function setupDragAndDrop() {
  var cards = stationsList.querySelectorAll('.station-card');
  for (var c = 0; c < cards.length; c++) {
    (function(card) {
      var handle = card.querySelector('.drag-handle');
      if (!handle) return;

      handle.addEventListener('mousedown', function(e) {
        dragSrcIndex = parseInt(card.dataset.index);
        card.classList.add('dragging');
        e.preventDefault();

        function onMove(ev) {
          var target = document.elementFromPoint(ev.clientX, ev.clientY);
          var targetCard = target ? target.closest('.station-card') : null;
          for (var i = 0; i < cards.length; i++) cards[i].classList.remove('drag-over');
          if (targetCard && parseInt(targetCard.dataset.index) !== dragSrcIndex) {
            targetCard.classList.add('drag-over');
          }
        }

        function onUp(ev) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          var target = document.elementFromPoint(ev.clientX, ev.clientY);
          var targetCard = target ? target.closest('.station-card') : null;
          for (var i = 0; i < cards.length; i++) {
            cards[i].classList.remove('dragging');
            cards[i].classList.remove('drag-over');
          }

          if (targetCard) {
            var targetIndex = parseInt(targetCard.dataset.index);
            if (dragSrcIndex !== null && dragSrcIndex !== targetIndex) {
              var item = STATIONS.splice(dragSrcIndex, 1)[0];
              STATIONS.splice(targetIndex, 0, item);
              if (currentStation === dragSrcIndex) currentStation = targetIndex;
              else if (dragSrcIndex < currentStation && targetIndex >= currentStation) currentStation--;
              else if (dragSrcIndex > currentStation && targetIndex <= currentStation) currentStation++;
              saveStationOrder();
              renderStations();
            }
          }
          dragSrcIndex = null;
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    })(cards[c]);
  }
}

document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Panel').classList.add('active');
  });
});

playBtn.addEventListener('click', togglePlay);
recordBtn.addEventListener('click', toggleRecording);
volumeSlider.addEventListener('input', function() {
  audio.volume = volumeSlider.value / 100;
});
searchInput.addEventListener('input', function(e) {
  searchQuery = e.target.value.toLowerCase();
  renderStations();
});

loadStationOrder();
renderStations();
renderRecordings();
