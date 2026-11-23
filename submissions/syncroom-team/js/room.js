import { joinRoom } from "https://esm.sh/trystero@0.27.0";

const APP_ID = "syncroom.sanchigoyal26.music-room.v1";
const $ = (id) => document.getElementById(id);

const username = (sessionStorage.getItem("syncroom_username") || "Guest").slice(0, 20);
const roomCode = (sessionStorage.getItem("syncroom_room") || location.hash.slice(1)).toUpperCase();
const isHost = sessionStorage.getItem("syncroom_is_host") === "true";

if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
  alert("Room code is missing or invalid. Please create or join a room again.");
  location.href = "index.html";
  throw new Error("Invalid room code");
}

$("displayRoomCode").textContent = roomCode;
$("memberName").textContent = username;
$("welcomeText").textContent = `Welcome, ${username}${isHost ? " · Room host" : ""}`;

let room;
let playbackMode = $("playbackMode").value;
let localObjectUrl = null;
let captureStream = null;
let applyingRemoteEvent = false;
let playbackAction = null;
let musicInfoAction = null;
let modeAction = null;
const profiles = new Map();
const remoteAudioElements = new Map();

const chatActionName = "sr-chat";
const profileActionName = "sr-profile";
const playbackActionName = "sr-playback";
const musicInfoActionName = "sr-music-info";
const modeActionName = "sr-mode";

function setConnection(text, connected = false) {
  $("connectionText").textContent = text;
  $("connectionStatus").classList.toggle("connected", connected);
}

function setMediaStatus(text) {
  $("mediaStatus").textContent = text;
}

function addChatMessage(name, text, own = false) {
  const item = document.createElement("div");
  item.className = `chat-message${own ? " own" : ""}`;
  const author = document.createElement("strong");
  author.textContent = name;
  const body = document.createElement("p");
  body.textContent = text;
  item.append(author, body);
  $("chatMessages").append(item);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function renderMembers() {
  const container = $("membersList");
  container.replaceChildren();
  const self = document.createElement("div");
  self.className = "member";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = username.charAt(0).toUpperCase();
  const details = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = username + " (You)";
  const small = document.createElement("small");
  small.textContent = isHost ? "Room host" : "You";
  details.append(strong, small);
  const dot = document.createElement("span");
  dot.className = "online-dot";
  self.append(avatar, details, dot);
  container.append(self);

  for (const [userId, name] of profiles) {
    const row = document.createElement("div");
    row.className = "member";
    const icon = document.createElement("div");
    icon.className = "avatar friend-avatar";
    icon.textContent = (name || "?").charAt(0).toUpperCase();
    const details = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = name || `Peer ${userId.slice(0, 5)}`;
    const small = document.createElement("small");
    small.textContent = "Connected";
    const online = document.createElement("span");
    online.className = "online-dot";
    details.append(strong, small);
    row.append(icon, details, online);
    container.append(row);
  }
  $("memberCount").textContent = String(profiles.size + 1);
}

function showRemoteAudio(stream, userId) {
  let audio = remoteAudioElements.get(userId);
  if (!audio) {
    audio = document.createElement("audio");
    audio.controls = true;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.className = "remote-audio";
    audio.dataset.peer = userId;
    $("remoteAudioWrap").append(audio);
    remoteAudioElements.set(userId, audio);
  }
  audio.srcObject = stream;
  $("remoteAudioWrap").hidden = false;
  audio.play().catch(() => setMediaStatus("Audio arrived. Press play on the received audio control if autoplay is blocked."));
}

function removeRemoteAudio(userId) {
  const audio = remoteAudioElements.get(userId);
  if (audio) {
    audio.pause();
    audio.srcObject = null;
    audio.remove();
    remoteAudioElements.delete(userId);
  }
  if (!remoteAudioElements.size) $("remoteAudioWrap").hidden = true;
}

async function sendMusicStream(target) {
  if (!room || !captureStream) return;
  try {
    await room.addStream(captureStream, {
      ...(target ? { target } : {}),
      metadata: { kind: "syncroom-music", roomCode }
    });
    setMediaStatus("Your audio stream is being sent directly to peers.");
  } catch (error) {
    console.error("Could not add audio stream:", error);
    setMediaStatus("Audio streaming failed. Try synchronized local playback instead.");
  }
}

function getCaptureStream(audio) {
  // captureStream is available in Chromium and Firefox on supported versions.
  const capture = audio.captureStream || audio.mozCaptureStream;
  if (!capture) {
    throw new Error("This browser does not support capturing audio from the player. Try Chrome or Firefox, or use synchronized local playback.");
  }
  return capture.call(audio);
}

function syncPlayback(type, extra = {}) {
  if (!room || !playbackAction || applyingRemoteEvent || !isHost) return;
  playbackAction.send({
    type,
    currentTime: Number($("audioPlayer").currentTime || 0),
    sentAt: Date.now(),
    ...extra
  });
}

async function applyPlaybackMessage(data) {
  if (!data) return;

  // In streaming mode, guests control the incoming MediaStream element,
  // while in synchronized mode every guest controls their own local file.
  if (playbackMode === "stream" && !isHost) {
    for (const audio of remoteAudioElements.values()) {
      if (data.type === "play") audio.play().catch(() => {});
      if (data.type === "pause") audio.pause();
    }
    return;
  }

  if (playbackMode !== "sync" || isHost) return;
  const player = $("audioPlayer");
  if (!player.src) return;

  applyingRemoteEvent = true;
  try {
    if (Number.isFinite(data.currentTime) && Math.abs(player.currentTime - data.currentTime) > 1.25) {
      player.currentTime = data.currentTime;
    }
    if (data.type === "play") await player.play().catch(() => {});
    if (data.type === "pause") player.pause();
    if (data.type === "seek") player.currentTime = data.currentTime;
  } finally {
    setTimeout(() => { applyingRemoteEvent = false; }, 100);
  }
}

function setupRoom() {
  room = joinRoom({ appId: APP_ID }, roomCode);

  const chat = room.makeAction(chatActionName);
  const profile = room.makeAction(profileActionName);
  playbackAction = room.makeAction(playbackActionName);
  musicInfoAction = room.makeAction(musicInfoActionName);

  chat.onMessage((data, { userId }) => {
    const name = profiles.get(userId) || `Peer ${userId.slice(0, 5)}`;
    if (typeof data?.text === "string") addChatMessage(name, data.text);
  });

  profile.onMessage((data, { userId }) => {
    if (typeof data?.name === "string") {
      profiles.set(userId, data.name.slice(0, 20));
      renderMembers();
    }
  });

  playbackAction.onMessage((data) => applyPlaybackMessage(data));

  modeAction.onMessage((data) => {
    if (!isHost && (data?.mode === "sync" || data?.mode === "stream")) {
      playbackMode = data.mode;
      $("playbackMode").value = data.mode;
      $("audioUpload").disabled = data.mode === "stream";
      $("playerNote").textContent = data.mode === "stream"
        ? "The host is streaming audio. Wait for the incoming audio player."
        : "Synchronized mode: upload the same audio file as the host.";
    }
  });

  musicInfoAction.onMessage((data, { userId }) => {
    if (data?.type === "track-selected") {
      const name = profiles.get(userId) || "The host";
      setMediaStatus(`${name} selected "${String(data.name || "audio file")}". In synchronized mode, choose the same file on your device.`);
    }
  });

  room.onPeerJoin(({ userId }) => {
    setConnection("Peer connection established", true);
    profile.send({ name: username });
    if (captureStream && playbackMode === "stream") sendMusicStream(userId);
  });

  room.onPeerLeave(({ userId }) => {
    profiles.delete(userId);
    removeRemoteAudio(userId);
    renderMembers();
    setConnection(profiles.size ? "Peer connected" : "Waiting for peer", profiles.size > 0);
  });

  room.onPeerStream((stream, { userId, metadata }) => {
    if (metadata?.kind === "syncroom-music") {
      showRemoteAudio(stream, userId);
      setMediaStatus("Receiving the host's audio directly over WebRTC.");
    }
  });

  room.onPeerJoin(() => {
    // The local profile is also sent when a peer appears; no central account is used.
    profile.send({ name: username });
  });

  setConnection("Room created · waiting for peers", false);
  profile.send({ name: username });
  renderMembers();

  $("chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = $("chatInput").value.trim();
    if (!text) return;
    addChatMessage(`${username} (You)`, text, true);
    $("chatInput").value = "";
    await chat.send({ text, sentAt: Date.now() });
  });

  // Trystero exposes existing peers after room setup; ask the UI to replay their profiles
  // through the action channel whenever a new peer joins.
}

$("copyRoomCode").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(`Join my SyncRoom! Room code: ${roomCode}`);
    $("copyRoomCode").textContent = "Copied!";
  } catch {
    $("copyRoomCode").textContent = `Code: ${roomCode}`;
  }
  setTimeout(() => { $("copyRoomCode").textContent = "Copy invite"; }, 1800);
});

$("playbackMode").addEventListener("change", async (event) => {
  playbackMode = event.target.value;
  if (isHost && modeAction) modeAction.send({ mode: playbackMode });
  if (playbackMode === "stream") {
    $("playerNote").textContent = isHost
      ? "Upload a track and press play. Its audio will be sent to peers over WebRTC."
      : "The host controls the streamed audio. Wait for the host to upload and play a track.";
    if (!isHost) $("audioUpload").disabled = true;
    if (captureStream) await sendMusicStream();
  } else {
    $("playerNote").textContent = "Everyone must upload the same audio file locally. Playback controls are synchronized by the host.";
    $("audioUpload").disabled = false;
    $("remoteAudioWrap").hidden = true;
    for (const audio of remoteAudioElements.values()) audio.pause();
  }
});

$("uploadButton").addEventListener("click", () => $("audioUpload").click());

$("audioUpload").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("audio/")) {
    setMediaStatus("Please choose a valid audio file.");
    return;
  }
  if (playbackMode === "stream" && !isHost) {
    setMediaStatus("Only the room host can upload in streaming mode.");
    return;
  }

  const player = $("audioPlayer");
  if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
  localObjectUrl = URL.createObjectURL(file);
  player.src = localObjectUrl;
  $("songTitle").textContent = file.name.replace(/\.[^.]+$/, "");
  $("songArtist").textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · Local file`;
  setMediaStatus(playbackMode === "sync"
    ? "Track loaded. Ask everyone to upload the same audio file, then the host can control playback."
    : "Track loaded. Press play to start streaming audio to connected peers.");

  if (room) {
    musicInfoAction?.send({ type: "track-selected", name: file.name, size: file.size });
  }

  if (playbackMode === "stream") {
    player.addEventListener("loadedmetadata", async () => {
      try {
        captureStream = getCaptureStream(player);
        await sendMusicStream();
      } catch (error) {
        console.error(error);
        setMediaStatus(error.message);
      }
    }, { once: true });
  }
});

$("audioPlayer").addEventListener("play", () => {
  if (playbackMode === "sync") syncPlayback("play");
  else if (isHost) syncPlayback("play");
});
$("audioPlayer").addEventListener("pause", () => {
  if (playbackMode === "sync") syncPlayback("pause");
  else if (isHost) syncPlayback("pause");
});
$("audioPlayer").addEventListener("seeked", () => {
  if (playbackMode === "sync" || (playbackMode === "stream" && isHost)) syncPlayback("seek");
});

$("leaveRoom").addEventListener("click", async () => {
  try { await room?.leave(); } catch (error) { console.warn(error); }
  sessionStorage.removeItem("syncroom_room");
  sessionStorage.removeItem("syncroom_is_host");
  location.href = "index.html";
});

window.addEventListener("beforeunload", () => {
  if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
  captureStream?.getTracks().forEach((track) => track.stop());
  room?.leave();
});

setupRoom();
