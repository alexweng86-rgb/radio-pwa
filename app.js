var CORS_PROXY = 'https://corsproxy.io/?';

var STATIONS = [
  { name: 'Pirate Station', url: 'https://radiorecord.hostingradio.ru/ps96.aacp', genre: 'DnB / Radio Record', bitrate: 96, icon: 'https://the-radio.ru/ava/2016/02/359_the_radio_ru_nbkcvbx.webp', gradient: ['#1a0a2e', '#0f3460'] },
  { name: "D'n'B Hits", url: 'https://radiorecord.hostingradio.ru/drumhits96.aacp', genre: 'DnB / Radio Record', bitrate: 96, icon: 'https://the-radio.ru/ava/2018/08/869_the_radio_ru_i2adata.webp', gradient: ['#2d1b69', '#ff006e'] },
  { name: 'Neurofunk', url: 'https://radiorecord.hostingradio.ru/neurofunk96.aacp', genre: 'DnB Neurofunk / Radio Record', bitrate: 96, icon: 'https://the-radio.ru/ava/2018/06/2825_the_radio_ru_tytm5wt.webp', gradient: ['#0d0221', '#0ff0b3'] },
  { name: 'Darkside', url: 'https://radiorecord.hostingradio.ru/darkside96.aacp', genre: 'DnB Darkside / Radio Record', bitrate: 96, icon: 'https://the-radio.ru/ava/2018/06/2821_the_radio_ru_qx8ysms.webp', gradient: ['#1a0000', '#ff1a1a'] },
  { name: 'DNB FM', url: 'https://air.dnbfm.ru/listen/player/play', genre: 'DnB / Liquid', bitrate: 128, icon: 'https://dnbfm.ru/static/icons/production/favicon-32x32.png', gradient: ['#001219', '#005f73'] },
  { name: 'BedlamDnB', url: 'https://c11.radioboss.fm:8318/stream', genre: 'DnB', bitrate: 128, gradient: ['#1b0a2e', '#6b21a8'] },
  { name: 'SomaFM Fluid', url: 'https://ice1.somafm.com/fluid-128-mp3', genre: 'Liquid DnB / Future Soul', bitrate: 128, icon: 'https://somafm.com/logos/120/fluid120.jpg', gradient: ['#0c0a2e', '#4361ee'] },
  { name: 'Sky Plus DnB', url: 'https://edge03.cdn.bitflip.ee:8888/NRJdnb', genre: 'DnB / Dance', bitrate: 256, gradient: ['#0a1628', '#00b4d8'] },
  { name: 'DnB & EDM', url: 'https://edmdnb.com:448/radio/8000/radio.mp3', genre: 'DnB / EDM', bitrate: 128, icon: 'https://edmdnb.com/images/favicon.ico', gradient: ['#1a0a00', '#ff6600'] }
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
  bufferText.textContent = '\u0411\u0443\u0444\u0435\u0440\u0438\u0437\u0430\u0446\u0438\u044f...';
  bufferInfo.classList.add('active');
});

audio.addEventListener('canplay', function() {
  bufferBarFill.classList.remove('loading');
  updateBufferInfo();
});

audio.addEventListener('error', function() {
  if (currentStation >= 0) {
    showToast('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u044f, \u043f\u0440\u043e\u0431\u0443\u044e \u043f\u0440\u043e\u043a\u0441\u0438...');
    tryNextProxy();
  }
});

function tryNextProxy() {
  if (currentStation < 0) return;
  var s = STATIONS[currentStation];
  if (!s._proxyAttempt) s._proxyAttempt = 0;
  s._proxyAttempt++;

  if (s._proxyAttempt === 1) {
    audio.src = CORS_PROXY + encodeURIComponent(s.url);
  } else {
    showToast('\u0421\u0442\u0430\u043d\u0446\u0438\u044f \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430');
    s._proxyAttempt = 0;
    stopBufferMonitor();
    bufferInfo.classList.remove('active');
    return;
  }
  audio.play().catch(function() {});
}

var connectTimeout = null;

function clearConnectTimeout() {
  if (connectTimeout) {
    clearTimeout(connectTimeout);
    connectTimeout = null;
  }
}

function updateBufferInfo() {
  if (!isPlaying && currentStation < 0) return;
  var buffered = getBufferedSeconds();
  var pct = Math.min(100, (buffered / TARGET_BUFFER) * 100);
  bufferBarFill.style.width = pct + '%';
  bufferBarFill.classList.remove('loading');
  bufferInfo.classList.add('active');

  if (buffered < MIN_BUFFER_TO_PLAY) {
    bufferText.textContent = '\u0411\u0443\u0444\u0435\u0440: ' + buffered.toFixed(0) + '\u0441 \u2014 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0430...';
    bufferBarFill.classList.add('loading');
  } else if (buffered >= TARGET_BUFFER) {
    bufferText.textContent = '\u0411\u0443\u0444\u0435\u0440: ' + buffered.toFixed(0) + '\u0441 \u2014 \u0441\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u043e';
  } else {
    bufferText.textContent = '\u0411\u0443\u0444\u0435\u0440: ' + buffered.toFixed(0) + '\u0441 / ' + TARGET_BUFFER + '\u0441';
  }
}

function getBufferedSeconds() {
  if (!audio.buffered.length || !audio.duration || !isFinite(audio.duration)) return 0;
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
    npTrack.textContent = '\u2014';
    return;
  }

  pollMetadata(metaEndpoints);
}

function pollMetadata(endpoints) {
  function doPoll() {
    if (currentStation < 0) { stopMetadataReader(); return; }
    for (var i = 0; i < endpoints.length; i++) {
      (function(url) {
        fetch(url).then(function(resp) {
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
      updateNowPlaying(artist ? artist + ' \u2014 ' + title : title);
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
  if (!track || track === '\u2014') {
    npTrack.textContent = '\u2014';
  } else {
    npTrack.textContent = track;
    npTrack.title = track;
  }
}

function stopMetadataReader() {
  if (metadataTimer) {
    clearInterval(metadataTimer);
    metadataTimer = null;
  }
  nowPlaying.classList.remove('active');
  npTrack.textContent = '\u2014';
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
  var html = '<div class="reorder-hint">\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0437\u0430 \u2261 \u0434\u043b\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043f\u043e\u0440\u044f\u0434\u043a\u0430</div>';

  for (var i = 0; i < filtered.length; i++) {
    var s = filtered[i].station;
    var idx = filtered[i].index;
    var isCurrent = currentStation === idx;
    var iconContent = s.icon
      ? '<img src="' + escapeHtml(s.icon) + '" alt="' + escapeHtml(s.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'"><span style="display:none">' + s.name.substring(0, 2).toUpperCase() + '</span>'
      : s.name.substring(0, 2).toUpperCase();
    var genreText = escapeHtml(s.genre || '');
    var bitrateText = s.bitrate ? s.bitrate + ' kbps' : '';
    var playSvg = (isCurrent && isPlaying)
      ? '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M6 6h12v12H6z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>';

    var cardStyle = s.gradient ? ' style="background:linear-gradient(135deg,' + s.gradient[0] + ',' + s.gradient[1] + ');border-color:' + s.gradient[1] + '40"' : '';

    html += '<div class="station-card' + (isCurrent ? ' current' : '') + '" data-index="' + idx + '"' + cardStyle + '>'
      + '<div class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg></div>'
      + '<div class="station-card-icon">' + iconContent + '</div>'
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
    showToast('\u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0435 \u0437\u0430\u043f\u0438\u0441\u044c \u043f\u0435\u0440\u0435\u0434 \u0441\u043c\u0435\u043d\u043e\u0439 \u0441\u0442\u0430\u043d\u0446\u0438\u0438');
    return;
  }

  if (currentRecordingAudio) {
    currentRecordingAudio.pause();
    currentRecordingAudio.src = '';
    currentRecordingAudio = null;
    currentRecordingId = null;
  }

  if (currentStation === index && isPlaying) {
    audio.pause();
    audio.src = '';
    currentStation = -1;
    isPlaying = false;
    clearConnectTimeout();
    stopBufferMonitor();
    stopMetadataReader();
    bufferInfo.classList.remove('active');
    updatePlayerUI();
    renderStations();
    return;
  }

  stopBufferMonitor();
  clearConnectTimeout();
  bufferBarFill.classList.add('loading');
  bufferText.textContent = '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435...';
  bufferInfo.classList.add('active');

  currentStation = index;
  STATIONS[index]._proxyAttempt = 0;

  if (currentRecordingAudio) {
    currentRecordingAudio.pause();
    currentRecordingAudio.src = '';
    currentRecordingAudio = null;
  }

  audio.pause();
  audio.src = STATIONS[index].url;
  audio.load();

  connectTimeout = setTimeout(function() {
    if (!isPlaying && currentStation === index) {
      tryNextProxy();
    }
  }, 8000);

  var playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.then(function() {
      clearConnectTimeout();
      playerBar.classList.add('active');
      startBufferMonitor();
      startMetadataReader();
      updatePlayerUI();
      renderStations();
    }).catch(function() {
      clearConnectTimeout();
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
  if (currentRecordingAudio && !currentRecordingAudio.paused) {
    currentRecordingAudio.pause();
    playerBar.classList.add('active');
    playIcon.style.display = 'block';
    stopIcon.style.display = 'none';
    stationIcon.classList.remove('playing');
    return;
  }
  if (currentRecordingAudio && currentRecordingAudio.paused) {
    currentRecordingAudio.play();
    playIcon.style.display = 'none';
    stopIcon.style.display = 'block';
    stationIcon.classList.add('playing');
    return;
  }
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
  if (currentRecordingAudio) return;

  if (currentStation >= 0) {
    stationName.textContent = STATIONS[currentStation].name;
    stationGenre.textContent = STATIONS[currentStation].genre || '';
    playBtn.disabled = false;
    recordBtn.disabled = false;

    var s = STATIONS[currentStation];
    if (s.gradient) {
      playerBar.style.background = 'linear-gradient(135deg, ' + s.gradient[0] + ', ' + s.gradient[1] + ')';
      playerBar.style.borderColor = s.gradient[1] + '40';
    } else {
      playerBar.style.background = '';
      playerBar.style.borderColor = '';
    }

    if (s.icon) {
      stationIcon.innerHTML = '<img src="' + escapeHtml(s.icon) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" style="display:none"><path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7zm0 2c2.76 0 5 2.24 5 5 0 1.64-.79 3.1-2 4.05V16H8v-2.95C6.79 12.1 6 10.64 6 9c0-2.76 2.24-5 5-5zm-1 7.5c-.83 0-1.5-.67-1.5-1.5S10.17 8.5 11 8.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm2 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM9 20v1c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9z"/></svg>';
    } else {
      stationIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7zm0 2c2.76 0 5 2.24 5 5 0 1.64-.79 3.1-2 4.05V16H8v-2.95C6.79 12.1 6 10.64 6 9c0-2.76 2.24-5 5-5zm-1 7.5c-.83 0-1.5-.67-1.5-1.5S10.17 8.5 11 8.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm2 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM9 20v1c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9z"/></svg>';
    }
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

var recDestNode = null;
var recSourceNode = null;
var recHiddenAudio = null;

function startRecording() {
  if (!isPlaying) {
    showToast('\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u0435');
    return;
  }

  try {
    var ctx = ensureAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    recHiddenAudio = new Audio(audio.src);
    recHiddenAudio.crossOrigin = 'anonymous';
    recSourceNode = ctx.createMediaElementSource(recHiddenAudio);
    recDestNode = ctx.createMediaStreamDestination();
    recSourceNode.connect(recDestNode);
    recHiddenAudio.play().catch(function() {});

    var mimeType = '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      mimeType = 'audio/webm';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      mimeType = 'audio/ogg;codecs=opus';
    }
    mediaRecorder = new MediaRecorder(recDestNode.stream, mimeType ? { mimeType: mimeType } : undefined);

    audioChunks = [];
    mediaRecorder.ondataavailable = function(e) {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = function() {
      var blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      var sName = currentStation >= 0 ? STATIONS[currentStation].name : 'Unknown';
      saveRecording(blob, sName).then(function() {
        showToast('\u0417\u0430\u043f\u0438\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430');
        renderRecordings();
      });
    };

    mediaRecorder.start(1000);
    isRecording = true;
    recordingStartTime = Date.now();

    recordingBadge.classList.add('active');
    recordBtn.classList.add('recording');
    recordingTimer = setInterval(updateRecordingTime, 1000);
    showToast('\u0417\u0430\u043f\u0438\u0441\u044c \u043d\u0430\u0447\u0430\u043b\u0430\u0441\u044c');
  } catch (e) {
    showToast('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0438\u0441\u0438: ' + e.message);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (recHiddenAudio) {
    try { recHiddenAudio.pause(); recHiddenAudio.src = ''; } catch (_) {}
    recHiddenAudio = null;
  }
  if (recSourceNode && recDestNode) {
    try { recSourceNode.disconnect(); } catch (_) {}
    recSourceNode = null;
    recDestNode = null;
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
  if (dirHandle) {
    return saveRecordingToDir(blob, station);
  }
  return saveRecordingToDB(blob, station);
}

function saveRecordingToDir(blob, station) {
  return dirHandle.getFileHandle('radio-' + Date.now() + '.webm', { create: true }).then(function(fh) {
    return fh.createWritable();
  }).then(function(writable) {
    return writable.write(blob).then(function() {
      return writable.close();
    });
  }).catch(function(e) {
    console.warn('Folder save failed, falling back to DB:', e);
    showToast('\u041f\u0430\u043f\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430, \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u0432 \u043f\u0430\u043c\u044f\u0442\u044c');
    return saveRecordingToDB(blob, station);
  });
}

function saveRecordingToDB(blob, station) {
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

function downloadRecording(id) {
  openDB().then(function(db) {
    var tx = db.transaction('recordings', 'readonly');
    var req = tx.objectStore('recordings').get(id);
    req.onsuccess = function() {
      var rec = req.result;
      if (!rec) return;
      var url = URL.createObjectURL(rec.blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'radio-' + rec.station.replace(/[^a-zA-Z0-9]/g, '_') + '-' + rec.date.replace(/[:.]/g, '-') + '.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  });
}

function deleteRecording(id) {
  return openDB().then(function(db) {
    var tx = db.transaction('recordings', 'readwrite');
    tx.objectStore('recordings').delete(id);
    return new Promise(function(resolve) {
      tx.oncomplete = function() {
        showToast('\u0417\u0430\u043f\u0438\u0441\u044c \u0443\u0434\u0430\u043b\u0435\u043d\u0430');
        renderRecordings();
        resolve();
      };
    });
  });
}

var currentRecordingAudio = null;
var currentRecordingId = null;

function playRecording(id) {
  if (currentRecordingAudio && currentRecordingId === id) {
    if (currentRecordingAudio.paused) {
      currentRecordingAudio.play();
      playIcon.style.display = 'none';
      stopIcon.style.display = 'block';
      stationIcon.classList.add('playing');
      showToast('\u0412\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u0435');
    } else {
      currentRecordingAudio.pause();
      playIcon.style.display = 'block';
      stopIcon.style.display = 'none';
      stationIcon.classList.remove('playing');
      showToast('\u041f\u0430\u0443\u0437\u0430');
    }
    return;
  }

  openDB().then(function(db) {
    var tx = db.transaction('recordings', 'readonly');
    var req = tx.objectStore('recordings').get(id);
    req.onsuccess = function() {
      var rec = req.result;
      if (!rec) return;

      if (currentRecordingAudio) {
        currentRecordingAudio.pause();
        currentRecordingAudio.src = '';
        currentRecordingAudio = null;
        currentRecordingId = null;
      }

      if (isPlaying) {
        audio.pause();
        audio.src = '';
        isPlaying = false;
        currentStation = -1;
        stopBufferMonitor();
        stopMetadataReader();
        bufferInfo.classList.remove('active');
        updatePlayerUI();
        renderStations();
      }

      var url = URL.createObjectURL(rec.blob);
      currentRecordingAudio = new Audio(url);
      currentRecordingAudio.volume = volumeSlider.value / 100;
      currentRecordingId = id;
      currentRecordingAudio.play();

      stationName.textContent = rec.station + ' \u2014 \u0417\u0430\u043f\u0438\u0441\u044c';
      stationGenre.textContent = formatDate(rec.date) + ' | ' + formatDuration(rec.duration);
      stationIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>';
      playBtn.disabled = false;
      recordBtn.disabled = true;
      playerBar.classList.add('active');
      playIcon.style.display = 'none';
      stopIcon.style.display = 'block';
      stationIcon.classList.add('playing');
      bufferInfo.classList.remove('active');
      nowPlaying.classList.remove('active');

      var recStation = STATIONS.find(function(st) { return st.name === rec.station; });
      if (recStation && recStation.gradient) {
        playerBar.style.background = 'linear-gradient(135deg, ' + recStation.gradient[0] + ', ' + recStation.gradient[1] + ')';
        playerBar.style.borderColor = recStation.gradient[1] + '40';
      } else {
        playerBar.style.background = '';
        playerBar.style.borderColor = '';
      }

      currentRecordingAudio.addEventListener('ended', function() {
        URL.revokeObjectURL(url);
        currentRecordingAudio = null;
        currentRecordingId = null;
        playIcon.style.display = 'block';
        stopIcon.style.display = 'none';
        stationIcon.classList.remove('playing');
        playerBar.style.background = '';
        playerBar.style.borderColor = '';
      });

      showToast('\u0412\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u0435: ' + rec.station);
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
        + '<button class="btn-download-rec" data-id="' + rec.id + '" title="\u0421\u043a\u0430\u0447\u0430\u0442\u044c \u0444\u0430\u0439\u043b"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></button>'
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

    var dlBtns = recordingsList.querySelectorAll('.btn-download-rec');
    for (var dl = 0; dl < dlBtns.length; dl++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          downloadRecording(parseInt(btn.dataset.id));
        });
      })(dlBtns[dl]);
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
searchInput.addEventListener('input', function(e) {
  searchQuery = e.target.value.toLowerCase();
  renderStations();
});

localStorage.removeItem('stationOrder');
renderStations();
renderRecordings();

var settingsOverlay = document.getElementById('settingsOverlay');
var settingsBtn = document.getElementById('settingsBtn');
var settingsClose = document.getElementById('settingsClose');
var settingsChooseFolder = document.getElementById('settingsChooseFolder');
var settingsResetFolder = document.getElementById('settingsResetFolder');
var settingsPath = document.getElementById('settingsPath');
var settingsVolume = document.getElementById('settingsVolume');
var dirHandle = null;

function loadSettings() {
  var saved = localStorage.getItem('radioSettings');
  if (!saved) return;
  try {
    var s = JSON.parse(saved);
    if (s.volume !== undefined) {
      audio.volume = s.volume / 100;
      volumeSlider.value = s.volume;
    }
  } catch (_) {}
}

function saveSettingsObj(obj) {
  localStorage.setItem('radioSettings', JSON.stringify(obj));
}

function getSettingsObj() {
  try { return JSON.parse(localStorage.getItem('radioSettings') || '{}'); }
  catch (_) { return {}; }
}

function updatePathDisplay() {
  if (dirHandle) {
    settingsPath.textContent = '\u041f\u0430\u043f\u043a\u0430: ' + dirHandle.name;
  } else {
    settingsPath.textContent = '\u0422\u0435\u043a\u0443\u0449\u0430\u044f: IndexedDB (\u0432\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u0435\u0435 \u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435)';
  }
}

settingsBtn.addEventListener('click', function() {
  settingsOverlay.classList.add('active');
  updatePathDisplay();
});

settingsClose.addEventListener('click', function() {
  settingsOverlay.classList.remove('active');
});

settingsOverlay.addEventListener('click', function(e) {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.remove('active');
  }
});

settingsChooseFolder.addEventListener('click', function() {
  if (!('showDirectoryPicker' in window)) {
    showToast('\u0412\u0430\u0448 \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u043d\u0435 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0432\u044b\u0431\u043e\u0440 \u043f\u0430\u043f\u043a\u0438');
    return;
  }
  window.showDirectoryPicker({ mode: 'readwrite' }).then(function(handle) {
    dirHandle = handle;
    updatePathDisplay();
    showToast('\u041f\u0430\u043f\u043a\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u0430: ' + handle.name);
  }).catch(function() {});
});

settingsResetFolder.addEventListener('click', function() {
  dirHandle = null;
  updatePathDisplay();
  showToast('\u041f\u0430\u043f\u043a\u0430 \u0441\u0431\u0440\u043e\u0448\u0435\u043d\u0430');
});

settingsVolume.addEventListener('input', function() {
  audio.volume = settingsVolume.value / 100;
  if (currentRecordingAudio) currentRecordingAudio.volume = settingsVolume.value / 100;
  volumeSlider.value = settingsVolume.value;
  var s = getSettingsObj();
  s.volume = parseInt(settingsVolume.value);
  saveSettingsObj(s);
});

volumeSlider.addEventListener('input', function() {
  audio.volume = volumeSlider.value / 100;
  if (currentRecordingAudio) currentRecordingAudio.volume = volumeSlider.value / 100;
  settingsVolume.value = volumeSlider.value;
  var s = getSettingsObj();
  s.volume = parseInt(volumeSlider.value);
  saveSettingsObj(s);
});

loadSettings();
settingsVolume.value = volumeSlider.value;
