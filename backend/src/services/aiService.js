import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const normalizePriority = (value) => {
  const v = String(value || '').toLowerCase();
  if (v.includes('high')) return 'High';
  if (v.includes('medium')) return 'Medium';
  return 'Low';
};

export const classifyComplaint = async (description) => {
  if (!genAI) {
    return { priority: 'Medium', source: 'fallback' };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `Analyze this lab complaint and return only one word: Low, Medium, or High. Complaint: ${description}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  return { priority: normalizePriority(text), source: 'gemini' };
};
