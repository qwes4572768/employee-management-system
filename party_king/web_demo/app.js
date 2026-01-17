const bots = [
  {
    id: 'bot_1',
    name: '小璇',
    age: 22,
    region: '台北',
    level: 5,
    tags: ['語音房', '遊戲'],
    bio: '喜歡深夜聊天和派對房，掛機也能升等。',
    greeting: '嗨～一起玩嗎？要不要先來個猜拳？',
  },
  {
    id: 'bot_2',
    name: '阿辰',
    age: 26,
    region: '新北',
    level: 3,
    tags: ['配對', '慢熟'],
    bio: '今天配對次數還有很多，一起聊聊。',
    greeting: '你好！我剛從語音房出來。',
  },
  {
    id: 'bot_3',
    name: '小貝',
    age: 24,
    region: '台中',
    level: 7,
    tags: ['禮物', '派對'],
    bio: '送禮物會加分，派對王就是要熱鬧。',
    greeting: '嘿～你今天想玩什麼？',
  },
  {
    id: 'bot_4',
    name: '林森',
    age: 28,
    region: '高雄',
    level: 9,
    tags: ['房間', '聊天'],
    bio: '正在開房間，想一起掛機升等也可以。',
    greeting: '我在派對房掛機升等，你要來嗎？',
  },
  {
    id: 'bot_5',
    name: '小沐',
    age: 21,
    region: '桃園',
    level: 4,
    tags: ['配對', 'VIP'],
    bio: '有 VIP 可以看到誰喜歡你喔。',
    greeting: '歡迎～我剛看到你喜歡我。',
  },
  {
    id: 'bot_6',
    name: '阿蘭',
    age: 25,
    region: '台南',
    level: 6,
    tags: ['聊天', '語音'],
    bio: '語音房待久會升等，我每天都掛著。',
    greeting: '哈囉～想不想玩個小遊戲？',
  },
];

const state = {
  currentIndex: 0,
  matches: [],
  chats: {},
  activeChatId: null,
  dailyLikeLimit: 20,
  dailyLikeUsed: 0,
  idleActive: false,
  idleSeconds: 0,
  idleTimer: null,
};

const elements = {
  matchCard: document.getElementById('match-card'),
  matchList: document.getElementById('match-list'),
  chatWindow: document.getElementById('chat-window'),
  chatPeer: document.getElementById('chat-peer'),
  chatInput: document.getElementById('chat-input'),
  sendMessage: document.getElementById('send-message'),
  likeBot: document.getElementById('like-bot'),
  skipBot: document.getElementById('skip-bot'),
  refreshBot: document.getElementById('refresh-bot'),
  likesRemaining: document.getElementById('likes-remaining'),
  playerLevel: document.getElementById('player-level'),
  toggleIdle: document.getElementById('toggle-idle'),
  idleTime: document.getElementById('idle-time'),
  toast: document.getElementById('toast'),
};

function renderMatchCard() {
  const bot = bots[state.currentIndex];
  elements.matchCard.innerHTML = `
    <div class="match-avatar">${bot.name.slice(0, 1)}</div>
    <div class="match-name">${bot.name} · ${bot.age}</div>
    <div class="match-meta">${bot.region} · Lv.${bot.level}</div>
    <div class="tag-list">
      ${bot.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
    </div>
    <div>${bot.bio}</div>
  `;
}

function renderLikesRemaining() {
  const remaining = Math.max(
    state.dailyLikeLimit - state.dailyLikeUsed,
    0
  );
  elements.likesRemaining.textContent = remaining;
  elements.likeBot.disabled = remaining === 0;
}

function addMatch(bot) {
  if (!state.matches.find((item) => item.id === bot.id)) {
    state.matches.unshift(bot);
  }
  if (!state.chats[bot.id]) {
    state.chats[bot.id] = [
      { from: 'bot', text: bot.greeting, at: Date.now() },
    ];
  }
  state.activeChatId = bot.id;
}

function renderMatchList() {
  if (state.matches.length === 0) {
    elements.matchList.innerHTML =
      '<span class="hint">尚未配對任何人</span>';
    return;
  }

  elements.matchList.innerHTML = '';
  state.matches.forEach((bot) => {
    const chip = document.createElement('button');
    chip.className = `match-chip ${
      state.activeChatId === bot.id ? 'active' : ''
    }`;
    chip.textContent = bot.name;
    chip.addEventListener('click', () => {
      state.activeChatId = bot.id;
      renderChat();
      renderMatchList();
    });
    elements.matchList.appendChild(chip);
  });
}

function renderChat() {
  elements.chatWindow.innerHTML = '';
  if (!state.activeChatId) {
    elements.chatWindow.innerHTML =
      '<div class="empty">先配對一位假人開始聊天</div>';
    elements.chatPeer.textContent = '尚未配對';
    return;
  }

  const bot = state.matches.find((item) => item.id === state.activeChatId);
  elements.chatPeer.textContent = `${bot.name} · Lv.${bot.level}`;

  const messages = state.chats[state.activeChatId] || [];
  messages.forEach((message) => {
    const bubble = document.createElement('div');
    const typeClass = message.typing ? 'typing' : message.from;
    bubble.className = `message ${typeClass}`;
    bubble.textContent = message.text;
    elements.chatWindow.appendChild(bubble);
  });
  elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
}

function nextBot() {
  state.currentIndex = (state.currentIndex + 1) % bots.length;
  renderMatchCard();
}

function showToast(text) {
  elements.toast.textContent = text;
  elements.toast.classList.add('show');
  setTimeout(() => elements.toast.classList.remove('show'), 1800);
}

function handleLike() {
  if (state.dailyLikeUsed >= state.dailyLikeLimit) {
    showToast('今日喜歡次數已用完');
    return;
  }
  const bot = bots[state.currentIndex];
  state.dailyLikeUsed += 1;
  addMatch(bot);
  renderLikesRemaining();
  renderMatchList();
  renderChat();
  showToast(`配對成功：${bot.name}`);
  nextBot();
}

function handleSkip() {
  nextBot();
}

function botReply(bot, input) {
  const text = input.trim();
  if (!text) return '你要不要再說一次？';

  const rpsWords = ['石頭', '剪刀', '布'];
  if (text.includes('猜拳')) {
    return '好呀！請輸入 石頭 / 剪刀 / 布';
  }
  if (rpsWords.includes(text)) {
    const botChoice = rpsWords[Math.floor(Math.random() * rpsWords.length)];
    if (botChoice === text) {
      return `我出 ${botChoice}，平手！再來一次？`;
    }
    const wins =
      (text === '石頭' && botChoice === '剪刀') ||
      (text === '剪刀' && botChoice === '布') ||
      (text === '布' && botChoice === '石頭');
    return wins
      ? `我出 ${botChoice}，你贏了！好厲害。`
      : `我出 ${botChoice}，這局我贏～`;
  }

  const guessMatch = text.match(/猜\s*([1-5])/);
  if (guessMatch) {
    const guess = Number(guessMatch[1]);
    const number = Math.floor(Math.random() * 5) + 1;
    return guess === number
      ? `你猜 ${guess}，我這次是 ${number}，中獎！`
      : `你猜 ${guess}，我這次是 ${number}，差一點。`;
  }

  if (text.includes('遊戲')) {
    return '我們可以玩猜拳或猜 1~5，小遊戲很適合熱身。';
  }
  if (text.includes('配對')) {
    return '配對成功後就可以聊天，我會常在線。';
  }
  if (text.includes('語音') || text.includes('房間')) {
    return '語音房掛機會升等，你也可以一起掛著。';
  }
  if (text.includes('禮物')) {
    return '送禮物會增加好感度，也能衝榜。';
  }
  if (text.includes('VIP')) {
    return 'VIP 可以看到誰喜歡你，配對上限也會增加。';
  }

  const fallback = [
    '哈哈，聽起來不錯～',
    '今天你想聊哪一種話題？',
    '我剛剛在派對房遇到很多人。',
    '如果你想玩遊戲可以說一聲。',
    '待會要不要一起進語音房？',
  ];
  return fallback[Math.floor(Math.random() * fallback.length)];
}

function sendMessage() {
  if (!state.activeChatId) {
    showToast('先配對一位假人');
    return;
  }
  const text = elements.chatInput.value.trim();
  if (!text) return;
  const messages = state.chats[state.activeChatId];
  messages.push({ from: 'me', text, at: Date.now() });
  elements.chatInput.value = '';
  renderChat();

  const bot = state.matches.find((item) => item.id === state.activeChatId);
  const typingMessage = { from: 'bot', text: '正在輸入...', typing: true };
  messages.push(typingMessage);
  renderChat();
  setTimeout(() => {
    const index = messages.indexOf(typingMessage);
    if (index !== -1) {
      messages.splice(index, 1);
    }
    messages.push({ from: 'bot', text: botReply(bot, text), at: Date.now() });
    renderChat();
  }, 700 + Math.random() * 700);
}

function updateIdle() {
  if (!state.idleActive) return;
  state.idleSeconds += 1;
  const minutes = Math.floor(state.idleSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (state.idleSeconds % 60).toString().padStart(2, '0');
  elements.idleTime.textContent = `${minutes}:${seconds}`;
  const level = 1 + Math.floor(state.idleSeconds / 120);
  elements.playerLevel.textContent = level;
}

function toggleIdle() {
  state.idleActive = !state.idleActive;
  elements.toggleIdle.textContent = state.idleActive
    ? '停止掛機'
    : '開始掛機';
  if (state.idleActive && !state.idleTimer) {
    state.idleTimer = setInterval(updateIdle, 1000);
  }
}

elements.likeBot.addEventListener('click', handleLike);
elements.skipBot.addEventListener('click', handleSkip);
elements.refreshBot.addEventListener('click', handleSkip);
elements.sendMessage.addEventListener('click', sendMessage);
elements.chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    sendMessage();
  }
});
elements.toggleIdle.addEventListener('click', toggleIdle);

renderMatchCard();
renderLikesRemaining();
renderMatchList();
renderChat();
