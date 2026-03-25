const express = require("express");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());

// ==========================================
// ⚙️  CẤU HÌNH - Thay bằng thông tin của bạn
// ==========================================
const CONFIG = {
  VERIFY_TOKEN: "my_secret_verify_token_2024",  // Tự đặt, dùng khi verify webhook
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN || "YOUR_PAGE_ACCESS_TOKEN",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "YOUR_ANTHROPIC_API_KEY",

  // Thông tin về sản phẩm/dịch vụ của bạn - Chỉnh lại cho phù hợp
  BUSINESS_INFO: `
    Bạn là trợ lý tư vấn của [TÊN CỬA HÀNG].
    Sản phẩm/dịch vụ: [MÔ TẢ SẢN PHẨM]
    Giờ làm việc: 8:00 - 22:00
    Hotline: [SỐ ĐIỆN THOẠI]
    Địa chỉ: [ĐỊA CHỈ]
    
    Hướng dẫn:
    - Trả lời thân thiện, nhiệt tình bằng tiếng Việt
    - Tư vấn sản phẩm phù hợp với nhu cầu khách
    - Nếu không biết, hướng dẫn khách nhắn tin để được hỗ trợ trực tiếp
    - Kết thúc bằng câu hỏi để tiếp tục tư vấn
  `
};

const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });

// Lưu lịch sử hội thoại (in-memory, dùng Redis/DB cho production)
const conversationHistory = new Map();

// ==========================================
// 🔗 WEBHOOK VERIFICATION
// ==========================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed");
    res.sendStatus(403);
  }
});

// ==========================================
// 📨 NHẬN TIN NHẮN TỪ MESSENGER
// ==========================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Phản hồi ngay cho Facebook

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
// 🤖 XỬ LÝ TIN NHẮN VỚI CLAUDE AI
// ==========================================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const messageText = event.message.text;

  if (!messageText) return;

  console.log(`📩 Tin nhắn từ ${senderId}: ${messageText}`);

  // Gửi "đang gõ..." cho UX tốt hơn
  await sendTypingIndicator(senderId, true);

  try {
    // Lấy lịch sử hội thoại
    if (!conversationHistory.has(senderId)) {
      conversationHistory.set(senderId, []);
    }
    const history = conversationHistory.get(senderId);

    // Thêm tin nhắn mới vào lịch sử
    history.push({ role: "user", content: messageText });

    // Giới hạn lịch sử 6 lượt để tiết kiệm token
    if (history.length > 12) history.splice(0, 2);

    // Gọi Claude AI
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: CONFIG.BUSINESS_INFO,
      messages: history,
    });

    const replyText = response.content[0].text;

    // Lưu phản hồi vào lịch sử
    history.push({ role: "assistant", content: replyText });

    // Gửi phản hồi về Messenger
    await sendMessage(senderId, replyText);
    console.log(`✉️  Đã trả lời: ${replyText.substring(0, 50)}...`);

  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    await sendMessage(senderId, "Xin lỗi, mình đang gặp sự cố. Bạn vui lòng thử lại sau nhé! 🙏");
  } finally {
    await sendTypingIndicator(senderId, false);
  }
}

// ==========================================
// 📤 GỬI TIN NHẮN QUA MESSENGER API
// ==========================================
async function sendMessage(recipientId, text) {
  // Chia nhỏ tin nhắn nếu quá dài (Messenger giới hạn 2000 ký tự)
  const chunks = splitMessage(text, 1900);

  for (const chunk of chunks) {
    await axios.post(
      `https://graph.facebook.com/v19.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: chunk },
        messaging_type: "RESPONSE",
      },
      {
        params: { access_token: CONFIG.PAGE_ACCESS_TOKEN },
        headers: { "Content-Type": "application/json" },
      }
    );
    if (chunks.length > 1) await sleep(500); // Delay giữa các chunk
  }
}

async function sendTypingIndicator(recipientId, isTyping) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages`,
    {
      recipient: { id: recipientId },
      sender_action: isTyping ? "typing_on" : "typing_off",
    },
    { params: { access_token: CONFIG.PAGE_ACCESS_TOKEN } }
  ).catch(() => {}); // Bỏ qua lỗi typing indicator
}

function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLength));
    i += maxLength;
  }
  return chunks;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// 🚀 KHỞI ĐỘNG SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại port ${PORT}`);
  console.log(`🔗 Webhook URL: https://YOUR_DOMAIN/webhook`);
});
