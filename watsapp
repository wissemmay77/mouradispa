const axios = require('axios');

const WHATSAPP_PROVIDER = process.env.WHATSAPP_PROVIDER || 'mock';
const WHATSAPP_BASE_URL = process.env.WHATSAPP_BASE_URL || 'https://graph.facebook.com/v19.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN || '';

async function sendViaMetaCloudApi(to, text) {
  const url = `${WHATSAPP_BASE_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };
  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
}

async function sendMock(to, text) {
  console.log(`[WhatsApp MOCK] -> ${to}: ${text}`);
  return { success: true, mock: true };
}

async function sendMessage(to, text) {
  if (!to) {
    return { success: false, reason: 'missing_phone' };
  }
  if (WHATSAPP_PROVIDER === 'meta_cloud_api') {
    return sendViaMetaCloudApi(to, text);
  }
  return sendMock(to, text);
}

function parseIncomingMessage(webhookBody) {
  try {
    const entry = webhookBody.entry && webhookBody.entry[0];
    const change = entry && entry.changes && entry.changes[0] && entry.changes[0].value;
    const message = change && change.messages && change.messages[0];
    if (!message) return null;
    return {
      from: message.from,
      text: message.text ? message.text.body : '',
      timestamp: message.timestamp,
      contactName: change.contacts && change.contacts[0] ? change.contacts[0].profile.name : null,
      raw: message,
    };
  } catch (err) {
    return null;
  }
}

async function analyzeReplyWithAI(parsedMessage) {
  return {
    implemented: false,
    message: parsedMessage,
  };
}

module.exports = {
  sendMessage,
  parseIncomingMessage,
  analyzeReplyWithAI,
};
