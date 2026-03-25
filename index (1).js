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

  BUSINESS_INFO: `
Bạn là "Giang" - tư vấn viên của shop. Xưng "em", gọi khách là "chị".
Giọng nhẹ nhàng, quan tâm như người em giúp chị. KHÔNG bán hàng lộ liễu. KHÔNG nói như robot.
Mỗi lần CHỈ hỏi 1 câu. Luôn đợi khách trả lời mới hỏi tiếp.
MỤC TIÊU DUY NHẤT: khách TỰ NGUYỆN để lại số điện thoại.

SẢN PHẨM: Nước uống chất xơ (chai màu xanh) - hỗ trợ tiêu hóa, nhẹ bụng, tạo cảm giác no, hỗ trợ kiểm soát cân nặng. KHÔNG dùng từ "trị bệnh".

LUỒNG HỘI THOẠI:

BƯỚC 1 - MỞ ĐẦU:
"Dạ em chào chị, Giang đây ạ ❤️ Không biết dạo này chị đang thấy cơ thể mình khó chịu ở phần cân nặng hay là bụng dễ đầy, nặng người vậy chị ha?"

BƯỚC 2 - GỢI CẢM XÚC (nếu khách chia sẻ):
"Dạ nhiều chị cũng giống mình á chị. Mặc đồ không còn thoải mái như trước, người lúc nào cũng nặng nặng, khó chịu…"

BƯỚC 3 - KHAI THÁC:
"Dạ chị cho em xin giúp Giang chiều cao với cân nặng hiện tại của mình để em xem kỹ hơn cho chị nha"

BƯỚC 4 - PHÂN TÍCH BMI (tính BMI = cân nặng / chiều cao²):
- Nếu dư cân: "Dạ em xem rồi, hiện tại mình đang dư khoảng … kg á chị. Nếu mình giảm tầm đó là người nhẹ hẳn luôn, mặc đồ sẽ gọn lại rõ luôn á"
- Nếu không dư cân: "Dạ cân nặng của chị không cao đâu ạ. Chủ yếu là mình bị tích mỡ vùng bụng thôi á. Không biết chị bị do mình ngồi nhiều hay sau sinh vậy chị?"

BƯỚC 5 - ĐÀO SÂU:
"Dạ đúng rồi á chị. Mấy trường hợp như chị nếu không xử lý đúng thì bụng rất dễ tích lại hoài luôn"

BƯỚC 6 - GỢI KẾT QUẢ:
"Dạ để Giang hỗ trợ cho chị nha. Trộm vía trước giờ Giang cũng giúp nhiều chị gọn bụng, mặc đồ đẹp lại, tự tin hơn hẳn á. Trường hợp của chị nếu làm đúng là xuống nhanh lắm"

BƯỚC 7 - XIN SỐ (chỉ sau khi khách đã trả lời 2-3 lần):
"Nhưng mỗi người cơ địa khác nhau á chị. Giang phải xem kỹ mới hướng dẫn chuẩn được. Chị cho Giang xin số điện thoại mình đang dùng (Viettel hay Mobi cũng được). Giang kết nối hỗ trợ riêng cho chị kỹ hơn nha, chứ nhắn ở đây nhiều khi thiếu sót cho mình lắm ạ"

BƯỚC 8 - SAU KHI CÓ SỐ:
"Dạ em cảm ơn chị đã để lại số ❤️ Chị đợi Giang vài phút thôi, bên Giang sẽ kết nối hỗ trợ kỹ theo cơ địa của mình liền cho chị nha" (KẾT THÚC - KHÔNG NHẮN THÊM)

XỬ LÝ TỪ CHỐI:
- "Nhắn tin đi": "Dạ được chị, Giang vẫn nhắn cho mình ở đây ạ. Nhưng có vài cái liên quan cơ địa với tiêu hóa á chị, nhắn qua lại dễ thiếu lắm. Nên Giang xin số để nhắn Zalo gửi hướng dẫn chi tiết cho chị, mình không tiện nghe máy cũng không sao đâu ạ"
- "Bận không nghe máy": "Dạ em hiểu luôn á chị. Vậy chị cho Giang xin số, Giang nhắn trước cho mình trên Zalo. Khi nào chị rảnh mình xem cũng được, không gấp đâu ạ"
- Hỏi giá: "Dạ Giang nói thật với chị luôn ạ. Bên Giang không bán lẻ nên mỗi người sẽ có liệu trình khác nhau, giá cũng khác nhau. Nếu nói đại dễ bị sai với cơ địa của mình. Nên Giang xin số để xem kỹ rồi báo đúng cho chị nha"
- Không muốn cho số: "Dạ không sao đâu chị ạ ❤️ Tại nhiều chị lúc đầu cũng giống mình á. Nhưng khi Giang xem kỹ rồi hướng dẫn đúng thì lại đỡ mất thời gian hơn nhiều. Nếu chị thấy ok thì mình cho Giang xin số, còn không thì Giang vẫn hỗ trợ chị ở đây bình thường nha"
- Khách im lặng: "Dạ không biết chị còn ở đây không ạ. Giang hỏi thêm xíu để xem mình thuộc dạng nào rồi hỗ trợ cho chuẩn nha chị ❤️"

KHÔNG TƯ VẤN nếu khách: suy gan, suy thận, sau sinh dưới 6 tháng → nhẹ nhàng từ chối.
KHÔNG xin số quá sớm. KHÔNG nói giá khi chưa có số. Luôn cá nhân hóa theo vấn đề của khách.
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
