const express = require("express");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// ⚙️ CẤU HÌNH
// ==========================================
const CONFIG = {
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "my_secret_verify_token_2024",
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN || "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || "admin123",
  DASHBOARD_SECRET: process.env.DASHBOARD_SECRET || "chatpage_secret_2024",
};

const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });

// ==========================================
// 💾 IN-MEMORY DATABASE
// ==========================================
const DB = {
  // Kịch bản bot
  script: {
    flowSteps: [
      { id: 1, name: "Mở đầu", text: 'Dạ em chào chị, Giang đây ạ ❤️ Không biết dạo này chị thấy khó chịu ở phần cân nặng hay bụng dễ đầy, nặng người vậy chị ha?', media: [] },
      { id: 2, name: "Gợi cảm xúc", text: "Dạ nhiều chị cũng giống mình á. Mặc đồ không còn thoải mái như trước, người lúc nào cũng nặng nặng…", media: [] },
      { id: 3, name: "Khai thác BMI", text: "Dạ chị cho em xin chiều cao với cân nặng hiện tại để em xem kỹ hơn cho chị nha", media: [] },
      { id: 4, name: "Phân tích & gợi kết quả", text: "Dạ em xem rồi, trường hợp của chị nếu làm đúng là xuống nhanh lắm á ❤️", media: [] },
      { id: 5, name: "Xin số điện thoại", text: "Chị cho Giang xin số điện thoại (Viettel hay Mobi cũng được) để kết nối hỗ trợ riêng nha ❤️", media: [] },
      { id: 6, name: "Sau khi có số", text: "Dạ em cảm ơn chị đã để lại số ❤️ Chị đợi Giang vài phút, bên Giang kết nối liền nha", media: [] },
    ],
    excSteps: [
      { id: 1, name: "Hỏi giá", keywords: "giá, bao nhiêu, tiền, phí", text: "Dạ bên Giang không bán lẻ nên mỗi người liệu trình khác nhau. Giang cần xem cơ địa trước mới báo đúng được ạ", media: [], resumeId: 5 },
      { id: 2, name: "Xem sản phẩm", keywords: "sản phẩm, trông như thế nào, cho xem, hình", text: "Dạ đây là sản phẩm bên Giang chị ơi ❤️", media: [], resumeId: 3 },
      { id: 3, name: "Không tiện nghe máy", keywords: "bận, không nghe, không tiện, zalo", text: "Dạ em hiểu á chị. Chị cho Giang xin số, Giang nhắn Zalo trước, khi nào rảnh xem cũng được ạ", media: [], resumeId: 5 },
      { id: 4, name: "Không muốn cho số", keywords: "không cho, không muốn, ngại, thôi", text: "Dạ không sao đâu chị ạ ❤️ Giang vẫn hỗ trợ chị ở đây bình thường nha", media: [], resumeId: 4 },
    ],
    aiRules: `- Luôn xưng "em", gọi khách là "chị"
- Giữ giọng nhẹ nhàng, thân thiện, không robot
- Dù trả lời gì cũng kéo về mục tiêu chốt số điện thoại
- Không nói giá khi chưa có số điện thoại
- Không tư vấn: suy gan, suy thận, sau sinh dưới 6 tháng
- Không bao giờ nói "tôi là AI" hoặc "tôi không biết"`,
  },

  // Cài đặt tốc độ
  speed: {
    readDelayMin: 1000,
    readDelayMax: 2500,
    typingSpeed: 3,
    betweenMessages: 1200,
    model: "claude-haiku-4-5-20251001",
  },

  // Thống kê
  stats: {
    totalMessages: 0,
    totalCustomers: new Set(),
    phonesCollected: [],
    dailyMessages: {},
    apiCost: 0,
  },

  // Lịch sử hội thoại
  conversations: new Map(),
  mediaSent: new Map(),

  // Sessions dashboard
  sessions: new Set(),
};

// Build BUSINESS_INFO từ script
function buildBusinessInfo() {
  let info = `${DB.script.aiRules}\n\n`;

  info += `LUỒNG HỘI THOẠI CHỦ ĐẠO:\n`;
  DB.script.flowSteps.forEach((s, i) => {
    info += `BƯỚC ${i + 1} - ${s.name.toUpperCase()}: "${s.text}"\n`;
    if (s.media.length > 0) {
      info += `→ Gửi kèm media: ${s.media.map(m => m.name).join(", ")}\n`;
    }
  });

  info += `\nNGOẠI LỆ (xử lý ngay khi phát hiện từ khóa):\n`;
  DB.script.excSteps.forEach((s, i) => {
    info += `NGOẠI LỆ ${i + 1} - ${s.name}: Khi khách nói về [${s.keywords}] → Phản hồi: "${s.text}"\n`;
    const resumeStep = DB.script.flowSteps.find(f => f.id === s.resumeId);
    if (resumeStep) info += `→ Sau đó tiếp tục: ${resumeStep.name}\n`;
  });

  info += `\nSẢN PHẨM: Nước uống chất xơ - hỗ trợ tiêu hóa, nhẹ bụng, kiểm soát cân nặng. KHÔNG dùng từ "trị bệnh".`;
  info += `\nKHI NÀO GỬI MEDIA: Nếu bước hiện tại có media đính kèm → thêm [SEND_MEDIA] vào cuối tin nhắn.`;

  return info;
}

// Typing delay
function calcTypingDelay(text) {
  const speedMap = [0.02, 0.05, 0.08, 0.12, 0.18];
  const cpm = speedMap[DB.speed.typingSpeed - 1] || 0.08;
  return Math.min(Math.max(text.length / cpm, 2000), 8000);
}
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==========================================
// 🔐 AUTH MIDDLEWARE
// ==========================================
function authMiddleware(req, res, next) {
  const token = req.headers["x-dashboard-token"];
  if (!token || !DB.sessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ==========================================
// 🔐 AUTH ROUTES
// ==========================================
app.post("/api/auth/login", (req, res) => {
  const { password } = req.body;
  if (password !== CONFIG.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: "Sai mật khẩu" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  DB.sessions.add(token);
  setTimeout(() => DB.sessions.delete(token), 24 * 60 * 60 * 1000); // 24h
  res.json({ token, ok: true });
});

app.post("/api/auth/logout", authMiddleware, (req, res) => {
  DB.sessions.delete(req.headers["x-dashboard-token"]);
  res.json({ ok: true });
});

// ==========================================
// 📊 STATS API
// ==========================================
app.get("/api/stats", authMiddleware, (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const dailyMsgs = DB.stats.dailyMessages[today] || 0;
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    last7.push({ date: key, label: ["CN","T2","T3","T4","T5","T6","T7"][d.getDay()], count: DB.stats.dailyMessages[key] || 0 });
  }
  res.json({
    todayMessages: dailyMsgs,
    totalCustomers: DB.stats.totalCustomers.size,
    phonesCollected: DB.stats.phonesCollected.length,
    apiCost: DB.stats.apiCost.toFixed(4),
    last7Days: last7,
  });
});

// ==========================================
// 💬 CONVERSATIONS API
// ==========================================
app.get("/api/conversations", authMiddleware, (req, res) => {
  const convs = [];
  DB.conversations.forEach((msgs, senderId) => {
    const lastMsg = msgs[msgs.length - 1];
    convs.push({
      senderId,
      lastMessage: lastMsg?.content || "",
      lastRole: lastMsg?.role || "user",
      msgCount: msgs.length,
      timestamp: lastMsg?.timestamp || Date.now(),
    });
  });
  convs.sort((a, b) => b.timestamp - a.timestamp);
  res.json(convs.slice(0, 50));
});

app.get("/api/conversations/:senderId", authMiddleware, (req, res) => {
  const msgs = DB.conversations.get(req.params.senderId) || [];
  res.json(msgs);
});

// ==========================================
// ✍️ SCRIPT API
// ==========================================
app.get("/api/script", authMiddleware, (req, res) => {
  res.json(DB.script);
});

app.post("/api/script", authMiddleware, (req, res) => {
  const { flowSteps, excSteps, aiRules } = req.body;
  if (flowSteps) DB.script.flowSteps = flowSteps;
  if (excSteps) DB.script.excSteps = excSteps;
  if (aiRules) DB.script.aiRules = aiRules;
  res.json({ ok: true, message: "Đã cập nhật kịch bản!" });
});

// ==========================================
// ⚙️ SETTINGS API
// ==========================================
app.get("/api/settings", authMiddleware, (req, res) => {
  res.json(DB.speed);
});

app.post("/api/settings", authMiddleware, (req, res) => {
  Object.assign(DB.speed, req.body);
  res.json({ ok: true });
});

// ==========================================
// 🔗 WEBHOOK VERIFICATION
// ==========================================
app.get("/webhook", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ==========================================
// 📨 NHẬN TIN NHẮN TỪ MESSENGER
// ==========================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== "page") return;
  for (const entry of body.entry) {
    for (const event of entry.messaging) {
      if (event.message && !event.message.is_echo) {
        await handleMessage(event);
      }
    }
  }
});

// ==========================================
// 🤖 XỬ LÝ TIN NHẮN
// ==========================================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const messageText = event.message.text;
  if (!messageText) return;

  console.log(`📩 ${senderId}: ${messageText}`);

  // Track stats
  const today = new Date().toISOString().split("T")[0];
  DB.stats.dailyMessages[today] = (DB.stats.dailyMessages[today] || 0) + 1;
  DB.stats.totalMessages++;
  DB.stats.totalCustomers.add(senderId);

  // Detect phone number
  const phoneRegex = /(\+84|0)(3[2-9]|5[6-9]|7[06-9]|8[0-9]|9[0-9])[0-9]{7}/g;
  if (phoneRegex.test(messageText)) {
    if (!DB.stats.phonesCollected.includes(messageText.match(phoneRegex)[0])) {
      DB.stats.phonesCollected.push(messageText.match(phoneRegex)[0]);
      console.log(`📞 SĐT mới: ${messageText.match(phoneRegex)[0]}`);
    }
  }

  try {
    if (!DB.conversations.has(senderId)) {
      DB.conversations.set(senderId, []);
      DB.mediaSent.set(senderId, new Set());
    }
    const history = DB.conversations.get(senderId);
    const sent = DB.mediaSent.get(senderId);

    // Save message with timestamp
    const userMsg = { role: "user", content: messageText, timestamp: Date.now() };
    history.push(userMsg);
    if (history.length > 20) history.splice(0, 2);

    // Read delay
    await sleep(randomBetween(DB.speed.readDelayMin, DB.speed.readDelayMax));
    await sendTypingIndicator(senderId, true);

    // Call AI
    const businessInfo = buildBusinessInfo();
    const [response] = await Promise.all([
      anthropic.messages.create({
        model: DB.speed.model,
        max_tokens: 300,
        system: businessInfo,
        messages: history.map(m => ({ role: m.role, content: m.content })),
      }),
      sleep(1000),
    ]);

    let replyText = response.content[0].text;
    const mediaActions = [];

    // Cost tracking (approximate)
    DB.stats.apiCost += (response.usage?.input_tokens || 0) * 0.00000025 + (response.usage?.output_tokens || 0) * 0.00000125;

    // Check for media tags
    if (replyText.includes("[SEND_MEDIA]")) {
      replyText = replyText.replace("[SEND_MEDIA]", "").trim();
      // Find matching step media
      for (const step of [...DB.script.flowSteps, ...DB.script.excSteps]) {
        if (step.media && step.media.length > 0 && !sent.has(`step_${step.id}`)) {
          mediaActions.push(...step.media.map(m => ({ ...m, stepId: step.id })));
          sent.add(`step_${step.id}`);
          break;
        }
      }
    }

    // Save bot reply
    history.push({ role: "assistant", content: replyText, timestamp: Date.now() });

    // Typing time
    const typingTime = calcTypingDelay(replyText);
    await sleep(typingTime);
    await sendTypingIndicator(senderId, false);
    await sleep(200);

    if (replyText) await sendMessage(senderId, replyText);

    // Send media
    for (const media of mediaActions) {
      await sleep(DB.speed.betweenMessages);
      await sendTypingIndicator(senderId, true);
      await sleep(randomBetween(800, 1500));
      await sendTypingIndicator(senderId, false);
      if (media.type === "image") await sendImage(senderId, media.url);
      else if (media.type === "video") await sendVideo(senderId, media.url);
    }

  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    await sendTypingIndicator(senderId, false);
    await sendMessage(senderId, "Xin lỗi, mình đang gặp sự cố. Bạn vui lòng thử lại sau nhé! 🙏");
  }
}

// ==========================================
// 📤 GỬI TIN NHẮN
// ==========================================
async function sendMessage(recipientId, text) {
  const chunks = text.length <= 1900 ? [text] : text.match(/.{1,1900}/g);
  for (let i = 0; i < chunks.length; i++) {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages`,
      { recipient: { id: recipientId }, message: { text: chunks[i] }, messaging_type: "RESPONSE" },
      { params: { access_token: CONFIG.PAGE_ACCESS_TOKEN } }
    );
    if (i < chunks.length - 1) await sleep(DB.speed.betweenMessages);
  }
}

async function sendImage(recipientId, imageUrl) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages`,
      { recipient: { id: recipientId }, message: { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } }, messaging_type: "RESPONSE" },
      { params: { access_token: CONFIG.PAGE_ACCESS_TOKEN } }
    );
  } catch (e) { console.error("❌ Lỗi gửi ảnh:", e.message); }
}

async function sendVideo(recipientId, videoUrl) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages`,
      { recipient: { id: recipientId }, message: { attachment: { type: "video", payload: { url: videoUrl, is_reusable: true } } }, messaging_type: "RESPONSE" },
      { params: { access_token: CONFIG.PAGE_ACCESS_TOKEN } }
    );
  } catch (e) { console.error("❌ Lỗi gửi video:", e.message); }
}

async function sendTypingIndicator(recipientId, isTyping) {
  await axios.post(`https://graph.facebook.com/v19.0/me/messages`,
    { recipient: { id: recipientId }, sender_action: isTyping ? "typing_on" : "typing_off" },
    { params: { access_token: CONFIG.PAGE_ACCESS_TOKEN } }
  ).catch(() => {});
}

// ==========================================
// 🚀 START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 ChatPage Server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook`);
});
