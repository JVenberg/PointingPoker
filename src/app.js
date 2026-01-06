import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, getDoc, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Connect to emulator if running locally
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  connectFirestoreEmulator(db, 'localhost', 8080);
}

let odId = localStorage.getItem('odId') || crypto.randomUUID();
localStorage.setItem('odId', odId);

// Theme toggle
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
}
document.getElementById('themeToggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
});

const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const joinView = document.getElementById('joinView');
const roomView = document.getElementById('roomView');
const roomCodeEl = document.getElementById('roomCode');
const participantsEl = document.getElementById('participants');

// Load saved name
nameInput.value = localStorage.getItem('userName') || '';

// Generate room code
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Check URL for room code
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room')?.toUpperCase();
if (urlRoom) {
  document.getElementById('createSection').classList.add('hidden');
  document.getElementById('joinLinkSection').classList.remove('hidden');
  document.getElementById('joiningRoomCode').textContent = urlRoom;
}

// Create room
document.getElementById('createBtn').addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return alert('Please enter your name');
  localStorage.setItem('userName', name);
  const code = generateCode();
  joinRoom(code, name);
});

// Join room
document.getElementById('joinBtn').addEventListener('click', () => {
  const name = nameInput.value.trim();
  const code = roomInput.value.trim().toUpperCase();
  if (!name) return alert('Please enter your name');
  if (!code) return alert('Please enter a room code');
  localStorage.setItem('userName', name);
  joinRoom(code, name);
});

// Join room from link
document.getElementById('joinLinkBtn').addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return;
  localStorage.setItem('userName', name);
  joinRoom(urlRoom, name);
});

let currentRoom = null;
let unsubscribe = null;

async function joinRoom(code, name) {
  currentRoom = code;
  const roomRef = doc(db, 'rooms', code);

  // Get or create room, add participant
  const roomSnap = await getDoc(roomRef);
  const roomData = roomSnap.exists() ? roomSnap.data() : { participants: {}, revealed: false };
  roomData.participants[odId] = { name, vote: null };
  await setDoc(roomRef, roomData);

  // Update URL
  window.history.pushState({}, '', `?room=${code}`);

  // Show room view
  joinView.classList.add('hidden');
  roomView.classList.remove('hidden');
  roomCodeEl.textContent = code;

  // Listen for changes
  unsubscribe = onSnapshot(roomRef, (snapshot) => {
    const data = snapshot.data() || { participants: {}, revealed: false };
    renderParticipants(data.participants || {}, data.revealed);
    updatePointButtons(data.participants?.[odId]?.vote);

    // Update reveal button text
    document.getElementById('revealBtn').textContent = data.revealed ? '[ HIDE ]' : '[ REVEAL ]';
  });
}

function renderParticipants(participants, revealed) {
  const sorted = Object.entries(participants).sort((a, b) => a[1].name.localeCompare(b[1].name));
  participantsEl.innerHTML = sorted.map(([id, p], i) => {
    const voteDisplay = revealed
      ? `<span class="font-bold ${p.vote !== null ? 'text-green-400' : 'text-gray-500'}">${p.vote ?? '-'}</span>`
      : `<span class="${p.vote !== null ? 'text-green-400' : 'text-gray-500'}">${p.vote !== null ? '[ready]' : '[...]'}</span>`;
    const isMe = id === odId ? ' (you)' : '';
    const isLast = i === sorted.length - 1;
    return `<div class="flex justify-between items-center px-4 py-3 ${isLast ? '' : 'mb-2'} bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-green-700">${p.name}${isMe} ${voteDisplay}</div>`;
  }).join('');
}

function updatePointButtons(selectedVote) {
  document.querySelectorAll('.point-btn').forEach(btn => {
    const point = btn.dataset.point;
    const isSelected = String(selectedVote) === point;
    btn.classList.toggle('bg-green-600', isSelected);
    btn.classList.toggle('text-gray-900', isSelected);
    btn.classList.toggle('border-green-400', isSelected);
  });
}

// Point selection
document.querySelectorAll('.point-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!currentRoom) return;
    const point = btn.dataset.point;
    const voteValue = point === '?' ? '?' : parseInt(point);
    await updateDoc(doc(db, 'rooms', currentRoom), {
      [`participants.${odId}.vote`]: voteValue
    });
  });
});

// Reveal/Hide
document.getElementById('revealBtn').addEventListener('click', async () => {
  if (!currentRoom) return;
  const roomRef = doc(db, 'rooms', currentRoom);
  const snapshot = await getDoc(roomRef);
  const currentRevealed = snapshot.data()?.revealed || false;
  await updateDoc(roomRef, { revealed: !currentRevealed });
});

// Reset
document.getElementById('resetBtn').addEventListener('click', async () => {
  if (!currentRoom) return;
  const roomRef = doc(db, 'rooms', currentRoom);
  const snapshot = await getDoc(roomRef);
  const participants = snapshot.data()?.participants || {};
  const updates = { revealed: false };
  Object.keys(participants).forEach(id => {
    updates[`participants.${id}.vote`] = null;
  });
  await updateDoc(roomRef, updates);
});

// Copy link
document.getElementById('copyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href);
  document.getElementById('copyBtn').textContent = '[ copied ]';
  setTimeout(() => document.getElementById('copyBtn').textContent = '[ copy link ]', 2000);
});

// Return to join screen
document.getElementById('titleBtn').addEventListener('click', () => {
  if (unsubscribe) unsubscribe();
  currentRoom = null;
  window.history.pushState({}, '', window.location.pathname);
  roomView.classList.add('hidden');
  joinView.classList.remove('hidden');
  document.getElementById('createSection').classList.remove('hidden');
  document.getElementById('joinLinkSection').classList.add('hidden');
  roomInput.value = '';
});
