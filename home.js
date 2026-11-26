'use strict';

const audioSample = document.getElementById('sample-audio');
const listenButton = document.querySelector('.listen-button');
const listenLabel = document.querySelector('.listen-label');
const audioStatus = document.getElementById('audio-status');

function updateListenButton(isPlaying) {
  listenButton.classList.toggle('is-playing', isPlaying);
  listenLabel.textContent = isPlaying ? '暂停试听' : '中英试听';
  listenButton.setAttribute('aria-label', isPlaying ? '暂停 glacier 试听' : '试听 glacier 的中英文发音');
}

function reportAudioError() {
  audioStatus.textContent = '录音暂时无法播放，请重试。';
  updateListenButton(false);
}

listenButton.addEventListener('click', async () => {
  if (!audioSample.paused) {
    audioSample.pause();
    return;
  }
  audioStatus.textContent = '';
  if (audioSample.error) audioSample.load();
  try {
    await audioSample.play();
  } catch (error) {
    if (error.name !== 'AbortError') reportAudioError();
  }
});

audioSample.addEventListener('play', () => updateListenButton(true));
audioSample.addEventListener('pause', () => updateListenButton(false));
audioSample.addEventListener('ended', () => updateListenButton(false));
audioSample.addEventListener('error', reportAudioError);
audioSample.hidden = true;
listenButton.hidden = false;
