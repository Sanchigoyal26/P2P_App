
const roomCode = localStorage.getItem("syncroom_room_code");
const username = localStorage.getItem("syncroom_username");

document.getElementById("displayRoomCode").textContent =
    roomCode || "------";

document.getElementById("memberName").textContent =
    username || "You";

// Upload music
const audioUpload = document.getElementById("audioUpload");
const audioPlayer = document.getElementById("audioPlayer");

document.getElementById("uploadButton").addEventListener("click", () => {
    audioUpload.click();
});

audioUpload.addEventListener("change", () => {
    const file = audioUpload.files[0];

    if (!file) return;

    if (!file.type.startsWith("audio/")) {
        alert("Please select an audio file.");
        return;
    }

    const fileURL = URL.createObjectURL(file);

    audioPlayer.src = fileURL;

    document.getElementById("songTitle").textContent =
        file.name.replace(/\.[^/.]+$/, "");

    document.getElementById("songArtist").textContent =
        "Uploaded from your device";
});

// Local chat preview
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

chatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = chatInput.value.trim();

    if (!text) return;

    const welcome = chatMessages.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    const message = document.createElement("div");
    message.className = "chat-message";

    const sender = document.createElement("strong");
    sender.textContent = username || "You";

    const content = document.createElement("span");
    content.textContent = text;

    message.append(sender, content);
    chatMessages.appendChild(message);

    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatInput.value = "";
});

// Leave room
document.getElementById("leaveRoom").addEventListener("click", () => {
    window.location.href = "index.html";
});
