
const usernameInput = document.getElementById("username");
const roomCodeInput = document.getElementById("roomCode");
const createButton = document.getElementById("createRoom");
const joinButton = document.getElementById("joinRoom");
const message = document.getElementById("message");

function showMessage(text, success = true) {
    message.textContent = text;
    message.style.color = success ? "#86efac" : "#fca5a5";
}

function getUsername() {
    const username = usernameInput.value.trim();

    if (!username) {
        showMessage("Please enter your name first.", false);
        usernameInput.focus();
        return null;
    }

    localStorage.setItem("syncroom_username", username);
    return username;
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// CREATE ROOM
createButton.addEventListener("click", () => {
    const username = getUsername();

    if (!username) return;

    const roomCode = generateRoomCode();

    roomCodeInput.value = roomCode;

    localStorage.setItem("syncroom_room_code", roomCode);

    window.location.href = "room.html";
});

// JOIN ROOM
joinButton.addEventListener("click", () => {
    const username = getUsername();

    if (!username) return;

    const roomCode = roomCodeInput.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
        showMessage(
            "Please enter a valid 6-character room code.",
            false
        );
        return;
    }

    localStorage.setItem("syncroom_room_code", roomCode);

    window.location.href = "room.html";
});

// ENTER KEY SUPPORT
roomCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        joinButton.click();
    }
});
